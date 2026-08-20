const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: { schoolId: req.schoolId, userId: req.user.id },
    });
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { type, inApp, push, email, sms } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });

    const existing = await prisma.notificationPreference.findUnique({
      where: { schoolId_userId_type: { schoolId: req.schoolId, userId: req.user.id, type } },
    });

    if (existing) {
      if (existing.mandatory) {
        return res.status(400).json({ error: 'This notification is mandatory and cannot be modified' });
      }
      await prisma.notificationPreference.update({
        where: { id: existing.id },
        data: { inApp, push, email, sms },
      });
    } else {
      await prisma.notificationPreference.create({
        data: {
          schoolId: req.schoolId,
          userId: req.user.id,
          type,
          inApp: inApp !== undefined ? inApp : true,
          push: push !== undefined ? push : true,
          email: email || false,
          sms: sms || false,
        },
      });
    }

    res.json({ message: 'Preferences updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/school', async (req, res) => {
  try {
    if (!['headteacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const prefs = await prisma.notificationPreference.findMany({
      where: { schoolId: req.schoolId },
    });
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
