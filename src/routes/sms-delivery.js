const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkMessageStatus } = require('../lib/sms');

const router = Router();
router.use(authenticate);

router.get('/status/:messageId', async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await checkMessageStatus({
      messageId: req.params.messageId,
      credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
    });

    if (result.data) {
      const statusMap = { '200': 'delivered', '202': 'sent', '204': 'failed' };
      const hubtelStatus = String(result.data.status || result.data.Status || '');
      const mappedStatus = statusMap[hubtelStatus] || hubtelStatus || 'unknown';

      await prisma.messageDelivery.updateMany({
        where: { messageId: req.params.messageId, schoolId: req.schoolId },
        data: {
          status: mappedStatus,
          ...(mappedStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
          ...(mappedStatus === 'failed' ? { failureReason: result.data.errorMessage || 'Delivery failed' } : {}),
        },
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/deliveries', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const where = { schoolId: req.schoolId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.channel) where.channel = req.query.channel;

    const [deliveries, total] = await Promise.all([
      prisma.messageDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.messageDelivery.count({ where }),
    ]);

    const stats = await prisma.messageDelivery.groupBy({
      by: ['status'],
      where: { schoolId: req.schoolId },
      _count: true,
    });

    res.json({ deliveries, total, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/batch-status', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !messageIds.length) return res.status(400).json({ error: 'messageIds required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const results = [];
    for (const messageId of messageIds.slice(0, 20)) {
      try {
        const result = await checkMessageStatus({
          messageId,
          credentials: { hubtelSmsClientId: school.hubtelSmsClientId, hubtelSmsClientSecret: school.hubtelSmsClientSecret },
        });
        results.push({ messageId, status: result });
      } catch {
        results.push({ messageId, error: 'Failed to check status' });
      }
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
