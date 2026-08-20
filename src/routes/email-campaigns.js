const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../lib/email');
const { resolveAudience } = require('../lib/audience-resolver');

const router = Router();
router.use(authenticate);
router.use(requireRole('headteacher', 'admin', 'accountant'));

router.post('/send', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body required' });
    const result = await sendEmail(to, subject, body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaign', async (req, res) => {
  try {
    const { subject, body, audience, audienceFilter, title } = req.body;
    if (!subject || !body || !audience) return res.status(400).json({ error: 'subject, body, audience required' });

    const recipientIds = await resolveAudience(req.schoolId, audience, audienceFilter || {});
    if (recipientIds.length === 0) return res.status(400).json({ error: 'No recipients found' });

    const users = await prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, email: true, name: true },
    });

    const emailUsers = users.filter(u => u.email);
    if (emailUsers.length === 0) return res.status(400).json({ error: 'No users with email addresses found' });

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const user of emailUsers) {
      try {
        const personalizedBody = body
          .replace(/\{\{name\}\}/g, user.name || '')
          .replace(/\{\{student_name\}\}/g, '')
          .replace(/\{\{parent_name\}\}/g, user.name || '')
          .replace(/\{\{school_name\}\}/g, req.schoolId);

        const result = await sendEmail(user.email, subject, personalizedBody);
        if (result.success) sentCount++;
        else failedCount++;
      } catch {
        failedCount++;
        errors.push(user.email);
      }
    }

    await prisma.campaign.create({
      data: {
        schoolId: req.schoolId,
        title: title || `Email: ${subject}`,
        message: body.substring(0, 500),
        type: 'email',
        recipientType: audience,
        recipientFilter: JSON.stringify(audienceFilter || {}),
        sentCount,
      },
    });

    res.json({
      success: true,
      sentCount,
      failedCount,
      total: emailUsers.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { schoolId: req.schoolId, type: 'email' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
