const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.post('/consent', authenticate, async (req, res) => {
  try {
    const { type, version } = req.body;
    const consent = await prisma.privacyConsent.create({
      data: {
        userId: req.user.id,
        schoolId: req.schoolId,
        type: type || 'privacy_policy',
        version: version || '1.0',
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      },
    });
    res.status(201).json({ message: 'Consent recorded', consent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const schoolId = req.schoolId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const consents = await prisma.privacyConsent.findMany({ where: { userId } });
    const notifications = await prisma.notification.findMany({ where: { userId } });
    const auditLogs = await prisma.auditLog.findMany({ where: { schoolId, userId } });

    res.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        createdAt: user.createdAt,
      },
      consents,
      notifications,
      auditLogs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/data', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.pushSubscription.deleteMany({ where: { userId } });
    await prisma.privacyConsent.deleteMany({ where: { userId } });

    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@eduplatform.com`,
        name: 'Deleted User',
        password: '',
        phone: '',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        isVerified: false,
        verificationCode: null,
        verificationExpiry: null,
        smsPreferences: '{}',
      },
    });

    res.json({ message: 'Your data has been anonymized. You have been logged out.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
