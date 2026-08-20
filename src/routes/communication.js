const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const where = { schoolId: req.schoolId, OR: [{ fromId: req.user.id }, { toId: req.user.id }] };
    if (search) {
      where.OR = [
        { fromId: req.user.id },
        { toId: req.user.id },
      ];
      where.AND = [
        { OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ] },
      ];
    }
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: { sender: { select: { id: true, name: true, email: true, role: true } }, receiver: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);
    res.json({ messages, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/unread-count', async (req, res) => {
  try {
    const count = await prisma.message.count({
      where: { schoolId: req.schoolId, toId: req.user.id, read: false },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const { toId, subject, body } = req.body;
    if (!toId || !body) return res.status(400).json({ error: 'toId and body are required' });
    const recipient = await prisma.user.findFirst({ where: { id: toId, schoolId: req.schoolId } });
    if (!recipient) return res.status(404).json({ error: 'Recipient not found in this school' });
    const msg = await prisma.message.create({
      data: { subject: subject || '', body, fromId: req.user.id, toId, schoolId: req.schoolId },
      include: { sender: { select: { id: true, name: true, email: true, role: true } }, receiver: { select: { id: true, name: true, email: true, role: true } } },
    });
    res.status(201).json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/messages/:id/read', async (req, res) => {
  try {
    const msg = await prisma.message.updateMany({
      where: { id: req.params.id, toId: req.user.id, schoolId: req.schoolId },
      data: { read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await prisma.message.deleteMany({
      where: { id: req.params.id, schoolId: req.schoolId, OR: [{ fromId: req.user.id }, { toId: req.user.id }] },
    });
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    const where = { schoolId: req.schoolId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.announcement.count({ where }),
    ]);
    res.json({ announcements, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { title, body, priority, audience, audienceFilter } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
    const ann = await prisma.announcement.create({
      data: {
        title,
        body,
        authorId: req.user.id,
        priority: priority || 'normal',
        schoolId: req.schoolId,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    res.status(201).json(ann);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/announcements/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.announcement.deleteMany({
      where: { id: req.params.id, schoolId: req.schoolId },
    });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/scheduled', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const messages = await prisma.scheduledMessage.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scheduled', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { title, body, audience, audienceFilter, channels, scheduledAt } = req.body;
    if (!title || !body || !audience || !scheduledAt) {
      return res.status(400).json({ error: 'title, body, audience, scheduledAt required' });
    }
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' });
    }
    const message = await prisma.scheduledMessage.create({
      data: {
        schoolId: req.schoolId,
        title,
        body,
        audience,
        audienceFilter: JSON.stringify(audienceFilter || {}),
        channels: JSON.stringify(channels || ['in_app']),
        scheduledAt: scheduledDate,
        createdById: req.user.id,
      },
    });
    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/scheduled/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.scheduledMessage.deleteMany({
      where: { id: req.params.id, schoolId: req.schoolId, status: 'pending' },
    });
    res.json({ message: 'Scheduled message cancelled' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
