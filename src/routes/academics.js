const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/classes', async (req, res) => {
  const classes = await prisma.academicClass.findMany({ include: { subjects: true }, orderBy: { name: 'asc' } });
  res.json(classes);
});

router.post('/classes', async (req, res) => {
  try {
    const cls = await prisma.academicClass.create({ data: req.body });
    res.status(201).json(cls);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await prisma.subject.deleteMany({ where: { classId: req.params.id } });
    await prisma.academicClass.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subjects', async (req, res) => {
  const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
  res.json(subjects);
});

router.post('/subjects', async (req, res) => {
  try {
    const subject = await prisma.subject.create({ data: req.body });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/terms', async (req, res) => {
  const terms = await prisma.term.findMany({ orderBy: { isActive: 'desc' } });
  res.json(terms);
});

router.post('/terms', async (req, res) => {
  try {
    const term = await prisma.term.create({ data: req.body });
    res.status(201).json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/terms/:id/activate', async (req, res) => {
  try {
    await prisma.term.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const term = await prisma.term.update({ where: { id: req.params.id }, data: { isActive: true } });
    res.json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
