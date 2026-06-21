const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = Router();
router.use(authenticate);

router.get('/classes', async (req, res) => {
  const classes = await prisma.academicClass.findMany({
    where: { schoolId: req.schoolId },
    include: { subjects: true },
    orderBy: { name: 'asc' },
  });
  res.json(classes);
});

router.post('/classes', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const cls = await prisma.academicClass.create({ data: { ...req.body, schoolId: req.schoolId } });
    await logAudit(req, 'create', 'class', cls.id, { name: cls.name });
    res.status(201).json(cls);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/classes/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const cls = await prisma.academicClass.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!cls) return res.status(404).json({ error: 'Not found' });
    await prisma.subject.deleteMany({ where: { classId: req.params.id } });
    await prisma.academicClass.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'class', req.params.id, { name: cls.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subjects', async (req, res) => {
  const subjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { name: 'asc' },
  });
  res.json(subjects);
});

router.post('/subjects', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const subject = await prisma.subject.create({ data: { ...req.body, schoolId: req.schoolId } });
    await logAudit(req, 'create', 'subject', subject.id, { name: subject.name });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/subjects/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const subject = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!subject) return res.status(404).json({ error: 'Not found' });
    await prisma.subject.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'subject', req.params.id, { name: subject.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/terms', async (req, res) => {
  const terms = await prisma.term.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { isActive: 'desc' },
  });
  res.json(terms);
});

router.post('/terms', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const term = await prisma.term.create({ data: { ...req.body, schoolId: req.schoolId } });
    res.status(201).json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/terms/:id/activate', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.term.updateMany({ where: { schoolId: req.schoolId, isActive: true }, data: { isActive: false } });
    const term = await prisma.term.update({ where: { id: req.params.id }, data: { isActive: true } });
    res.json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
