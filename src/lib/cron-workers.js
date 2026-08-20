const prisma = require('../lib/prisma');
const { resolveAudience } = require('../lib/audience-resolver');
const { triggerNotification, NOTIFICATION_TYPES } = require('../lib/notification-engine');
const { sendSmsPost, sendBatchSms } = require('../lib/sms');

const POLL_INTERVAL = 60 * 1000;

let running = false;

async function processScheduledMessages() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const pending = await prisma.scheduledMessage.findMany({
      where: { status: 'pending', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });

    for (const msg of pending) {
      try {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'processing' },
        });

        const recipientIds = await resolveAudience(msg.schoolId, msg.audience, JSON.parse(msg.audienceFilter || '{}'));
        const channels = JSON.parse(msg.channels || '["in_app"]');

        if (channels.includes('in_app') || channels.includes('push')) {
          await triggerNotification(msg.schoolId, NOTIFICATION_TYPES.ANNOUNCEMENT_CREATED, {
            title: msg.title,
            message: msg.body,
            recipients: recipientIds,
          });
        }

        if (channels.includes('sms')) {
          const school = await prisma.school.findUnique({ where: { id: msg.schoolId } });
          if (school && school.hubtelSmsClientId) {
            const users = await prisma.user.findMany({
              where: { id: { in: recipientIds } },
              select: { phone: true },
            });
            const phones = users.map(u => u.phone).filter(Boolean);
            if (phones.length > 0) {
              await sendBatchSms({
                recipients: phones,
                content: `${msg.title}\n\n${msg.body}`,
                from: school.smsSenderId || 'EDUPLATFORM',
                credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
              });
            }
          }
        }

        if (channels.includes('email')) {
          const { sendEmail } = require('../lib/email');
          const users = await prisma.user.findMany({
            where: { id: { in: recipientIds } },
            select: { email: true, name: true },
          });
          for (const user of users) {
            if (user.email) {
              sendEmail(user.email, msg.title, `
                <h2>${msg.title}</h2>
                <p>${msg.body}</p>
                <br><p style="color:#666;font-size:12px;">EDUPLATFORM Software Services</p>
              `).catch(() => {});
            }
          }
        }

        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'sent', sentAt: new Date() },
        });

        console.log(`[scheduler] Processed scheduled message: ${msg.id} (${recipientIds.length} recipients)`);
      } catch (err) {
        console.error(`[scheduler] Error processing message ${msg.id}:`, err.message);
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'failed' },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[scheduler] Error:', err.message);
  } finally {
    running = false;
  }
}

async function checkOverdueFees() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const overdueRecords = await prisma.feeRecord.findMany({
      where: { status: { in: ['unpaid', 'partial'] }, dueDate: { lt: today } },
    });

    for (const record of overdueRecords) {
      const student = await prisma.student.findFirst({
        where: { id: record.studentId, schoolId: record.schoolId },
      });
      if (!student || !student.parentEmail) continue;

      const parentUser = await prisma.user.findFirst({
        where: { schoolId: record.schoolId, email: student.parentEmail },
      });
      if (!parentUser) continue;

      const lastNotified = await prisma.notification.findFirst({
        where: {
          userId: parentUser.id,
          schoolId: record.schoolId,
          type: NOTIFICATION_TYPES.FEE_PAYMENT_OVERDUE,
          message: { contains: record.studentName },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      if (lastNotified) continue;

      await triggerNotification(record.schoolId, NOTIFICATION_TYPES.FEE_PAYMENT_OVERDUE, {
        title: `Fee overdue: ${record.studentName}`,
        message: `Outstanding balance of GHS ${record.balance} was due on ${record.dueDate}.`,
        recipients: [parentUser.id],
        smsMessage: `Fee reminder: ${record.studentName} has an overdue balance of GHS ${record.balance}. Please pay immediately.`,
      });
    }
  } catch (err) {
    console.error('[overdue-fees] Error:', err.message);
  }
}

async function cleanupStalePushSubscriptions() {
  try {
    const { sendPushNotification } = require('../web-push');
    const subs = await prisma.pushSubscription.findMany({ take: 50 });
    for (const sub of subs) {
      try {
        const result = await sendPushNotification(sub, { title: 'test', body: 'test' });
        if (result && (result.statusCode === 404 || result.statusCode === 410)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
          console.log(`[push-cleanup] Removed stale subscription: ${sub.id}`);
        }
      } catch {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[push-cleanup] Error:', err.message);
  }
}

function startCronWorkers() {
  console.log('[cron] Starting scheduled message processor...');
  setInterval(processScheduledMessages, POLL_INTERVAL);
  processScheduledMessages();

  console.log('[cron] Starting overdue fee checker (every hour)...');
  setInterval(checkOverdueFees, 60 * 60 * 1000);
  checkOverdueFees();

  console.log('[cron] Starting push subscription cleanup (every 6 hours)...');
  setInterval(cleanupStalePushSubscriptions, 6 * 60 * 60 * 1000);

  console.log('[cron] All workers started.');
}

module.exports = { startCronWorkers, processScheduledMessages, checkOverdueFees, cleanupStalePushSubscriptions };
