const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendSmsPost, sendBatchSms, sendPersonalizedBatch, checkMessageStatus } = require('../lib/sms');

const router = Router();

router.post('/send', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { to, content, from } = req.body;
    if (!to || !content) return res.status(400).json({ error: 'to and content required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await sendSmsPost({
      to,
      content,
      from: from || school.smsSenderId || 'EDUPLATFORM',
      credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('SMS send error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/batch', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { recipients, content, from } = req.body;
    if (!recipients || !recipients.length || !content) return res.status(400).json({ error: 'recipients array and content required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await sendBatchSms({
      recipients,
      content,
      from: from || school.smsSenderId || 'EDUPLATFORM',
      credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('SMS batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personalized', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { personalizedRecipients, from } = req.body;
    if (!personalizedRecipients || !personalizedRecipients.length) {
      return res.status(400).json({ error: 'personalizedRecipients array required' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await sendPersonalizedBatch({
      personalizedRecipients,
      from: from || school.smsSenderId || 'EDUPLATFORM',
      credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('SMS personalized error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await checkMessageStatus({
      messageId: id,
      credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('SMS status error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
