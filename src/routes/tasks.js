const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const tasks = await prisma.task.findMany({
    include: { comments: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tasks);
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body, assignedBy: req.user.id };
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    const task = await prisma.task.create({ data, include: { comments: true } });
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    const task = await prisma.task.update({ where: { id: req.params.id }, data, include: { comments: true } });
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.taskComment.deleteMany({ where: { taskId: req.params.id } });
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const comment = await prisma.taskComment.create({
      data: { taskId: req.params.id, userId: req.user.id, userName: req.user.name, content: req.body.content },
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
