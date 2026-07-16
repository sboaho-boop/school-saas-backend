const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const campaigns = await prisma.campaign.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' } });
  res.json(campaigns);
});

router.post('/', requireRole('headteacher', 'admin'), async (req, res) => {
  const { title, message, type, recipientType, recipientFilter } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  const campaign = await prisma.campaign.create({ data: { schoolId: req.schoolId, title, message, type: type || 'sms', recipientType: recipientType || 'all_parents', recipientFilter: JSON.stringify(recipientFilter || {}) } });
  res.status(201).json(campaign);
});

module.exports = router;
