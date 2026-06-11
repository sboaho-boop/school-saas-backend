const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const staff = await prisma.staff.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(staff);
});

router.get('/:id', async (req, res) => {
  const member = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json(member);
});

router.post('/', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.assignedSubjects) data.assignedSubjects = JSON.stringify(data.assignedSubjects);
    const member = await prisma.staff.create({ data });
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.assignedSubjects) data.assignedSubjects = JSON.stringify(data.assignedSubjects);
    const member = await prisma.staff.update({ where: { id: req.params.id }, data });
    res.json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.staff.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
