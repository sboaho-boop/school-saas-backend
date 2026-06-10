const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/messages', async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { OR: [{ fromId: req.user.id }, { toId: req.user.id }] },
    include: { sender: { select: { id: true, name: true, email: true } }, receiver: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(messages);
});

router.post('/messages', async (req, res) => {
  try {
    const msg = await prisma.message.create({
      data: { subject: req.body.subject, body: req.body.body, fromId: req.user.id, toId: req.body.toId },
      include: { sender: { select: { id: true, name: true, email: true } }, receiver: { select: { id: true, name: true, email: true } } },
    });
    res.status(201).json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/messages/:id/read', async (req, res) => {
  try {
    const msg = await prisma.message.update({ where: { id: req.params.id }, data: { read: true } });
    res.json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/announcements', async (req, res) => {
  const announcements = await prisma.announcement.findMany({
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(announcements);
});

router.post('/announcements', async (req, res) => {
  try {
    const ann = await prisma.announcement.create({
      data: { title: req.body.title, body: req.body.body, authorId: req.user.id, priority: req.body.priority || 'normal' },
      include: { author: { select: { id: true, name: true } } },
    });
    res.status(201).json(ann);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
