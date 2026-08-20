const prisma = require('./prisma');
const { sendPushNotification } = require('./web-push');
const { sendSmsPost } = require('./sms');

const NOTIFICATION_TYPES = {
  STUDENT_ABSENT: 'student_absent',
  STUDENT_LATE: 'student_late',
  FEE_PAYMENT_RECEIVED: 'fee_payment_received',
  FEE_PAYMENT_OVERDUE: 'fee_payment_overdue',
  RESULT_PUBLISHED: 'result_published',
  ASSIGNMENT_POSTED: 'assignment_posted',
  ANNOUNCEMENT_CREATED: 'announcement_created',
  EVENT_REMINDER: 'event_reminder',
  NEW_MESSAGE: 'new_message',
  REPORT_CARD_AVAILABLE: 'report_card_available',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
  INCIDENT_REPORTED: 'incident_reported',
  SUBSCRIPTION_CHANGED: 'subscription_changed',
  LOW_WALLET_BALANCE: 'low_wallet_balance',
  SUBMISSION_GRADED: 'submission_graded',
  EXAM_PUBLISHED: 'exam_published',
};

const DEFAULT_PREFERENCES = {
  [NOTIFICATION_TYPES.STUDENT_ABSENT]: { inApp: true, push: true, sms: true, email: false, mandatory: true },
  [NOTIFICATION_TYPES.STUDENT_LATE]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.FEE_PAYMENT_RECEIVED]: { inApp: true, push: true, sms: true, email: false, mandatory: false },
  [NOTIFICATION_TYPES.FEE_PAYMENT_OVERDUE]: { inApp: true, push: true, sms: true, email: false, mandatory: true },
  [NOTIFICATION_TYPES.RESULT_PUBLISHED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.ASSIGNMENT_POSTED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.ANNOUNCEMENT_CREATED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.EVENT_REMINDER]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.NEW_MESSAGE]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.REPORT_CARD_AVAILABLE]: { inApp: true, push: true, sms: true, email: false, mandatory: false },
  [NOTIFICATION_TYPES.TASK_ASSIGNED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.TASK_COMPLETED]: { inApp: true, push: false, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.INCIDENT_REPORTED]: { inApp: true, push: true, sms: true, email: false, mandatory: true },
  [NOTIFICATION_TYPES.SUBSCRIPTION_CHANGED]: { inApp: true, push: false, sms: true, email: false, mandatory: false },
  [NOTIFICATION_TYPES.LOW_WALLET_BALANCE]: { inApp: true, push: true, sms: true, email: false, mandatory: false },
  [NOTIFICATION_TYPES.SUBMISSION_GRADED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
  [NOTIFICATION_TYPES.EXAM_PUBLISHED]: { inApp: true, push: true, sms: false, email: false, mandatory: false },
};

async function getPreferences(schoolId, userId, type) {
  const pref = await prisma.notificationPreference.findUnique({
    where: { schoolId_userId_type: { schoolId, userId, type } },
  });
  if (pref) return pref;
  return DEFAULT_PREFERENCES[type] || { inApp: true, push: true, sms: false, email: false, mandatory: false };
}

async function createInAppNotification(schoolId, userId, type, title, message) {
  return prisma.notification.create({
    data: { schoolId, userId, type, title, message },
  });
}

async function sendPushToUser(schoolId, userId, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId, schoolId } });
  for (const sub of subs) {
    sendPushNotification(sub, payload).catch(() => {});
  }
}

async function sendSmsToUser(schoolId, userId, message) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.phone) return;
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return;
  await sendSmsPost({
    to: user.phone,
    content: message,
    from: school.smsSenderId || 'EDUPLATFORM',
    credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
  }).catch(() => {});
}

async function createDeliveryRecord(data) {
  return prisma.messageDelivery.create({ data });
}

async function triggerNotification(schoolId, type, { title, message, recipients = [], smsMessage, data = {} }) {
  if (!NOTIFICATION_TYPES[type]) {
    console.warn(`[notification-engine] Unknown notification type: ${type}`);
    return;
  }

  const results = [];

  for (const userId of recipients) {
    try {
      const prefs = await getPreferences(schoolId, userId, type);

      if (prefs.inApp) {
        const notif = await createInAppNotification(schoolId, userId, type, title, message);
        results.push({ userId, channel: 'in_app', status: 'created', notificationId: notif.id });
      }

      if (prefs.push) {
        sendPushToUser(schoolId, userId, { title, message, type, id: Date.now().toString() });
        results.push({ userId, channel: 'push', status: 'sent' });
      }

      if (prefs.sms && smsMessage) {
        sendSmsToUser(schoolId, userId, smsMessage).catch(() => {});
        results.push({ userId, channel: 'sms', status: 'queued' });
      }
    } catch (err) {
      console.error(`[notification-engine] Error for user ${userId}:`, err.message);
      results.push({ userId, channel: 'unknown', status: 'failed', error: err.message });
    }
  }

  return results;
}

async function getStudentGuardians(schoolId, studentId) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || !student.parentEmail) return [];

  const parentUser = await prisma.user.findFirst({
    where: { schoolId, email: student.parentEmail },
  });
  return parentUser ? [parentUser.id] : [];
}

async function getClassStudentGuardians(schoolId, classId) {
  const students = await prisma.student.findMany({ where: { schoolId, classId } });
  const guardianIds = [];
  for (const student of students) {
    if (student.parentEmail) {
      const parentUser = await prisma.user.findFirst({
        where: { schoolId, email: student.parentEmail },
      });
      if (parentUser) guardianIds.push(parentUser.id);
    }
  }
  return [...new Set(guardianIds)];
}

async function getAllUsersByRole(schoolId, role) {
  const users = await prisma.user.findMany({ where: { schoolId, role } });
  return users.map(u => u.id);
}

module.exports = {
  NOTIFICATION_TYPES,
  triggerNotification,
  getStudentGuardians,
  getClassStudentGuardians,
  getAllUsersByRole,
  getPreferences,
  createInAppNotification,
  sendPushToUser,
  sendSmsToUser,
};
