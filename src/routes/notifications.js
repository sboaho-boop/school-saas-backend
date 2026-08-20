const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { sendPushNotification } = require('../lib/web-push');

const router = Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id, schoolId: req.schoolId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: { userId: req.user.id, schoolId: req.schoolId } }),
    ]);
    res.json({ notifications, total, unreadCount: await prisma.notification.count({ where: { userId: req.user.id, schoolId: req.schoolId, read: false } }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, schoolId: req.schoolId, read: false } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/read-all', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, schoolId: req.schoolId, read: false },
      data: { read: true },
    });
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function createNotification(userId, schoolId, type, title, message) {
  const notification = await prisma.notification.create({
    data: { userId, schoolId, type, title, message },
  });
  const subs = await prisma.pushSubscription.findMany({ where: { userId, schoolId } });
  for (const sub of subs) {
    sendPushNotification(sub, { title, message, type, id: notification.id }).catch(() => {});
  }
  return notification;
}

module.exports = router;
module.exports.createNotification = createNotification;
