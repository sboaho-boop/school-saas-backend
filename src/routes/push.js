const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { ensureVapidKeys } = require('../lib/web-push');

const router = Router();

router.get('/vapid-public-key', (req, res) => {
  const keys = ensureVapidKeys();
  res.json({ publicKey: keys.publicKey });
});

router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { endpoint, keys: subKeys } = req.body;
    if (!endpoint || !subKeys || !subKeys.auth || !subKeys.p256dh) {
      return res.status(400).json({ error: 'Missing subscription data' });
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { auth: subKeys.auth, p256dh: subKeys.p256dh, userId: req.user.id, schoolId: req.schoolId },
      create: { endpoint, auth: subKeys.auth, p256dh: subKeys.p256dh, userId: req.user.id, schoolId: req.schoolId },
    });
    res.json({ message: 'Subscribed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    }
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
