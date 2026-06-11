const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimit');
const { logAudit } = require('../middleware/audit');

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

router.post('/', requireRole('headteacher', 'admin'), checkPlanLimit('staff'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.assignedSubjects) data.assignedSubjects = JSON.stringify(data.assignedSubjects);
    const member = await prisma.staff.create({ data });
    await logAudit(req, 'create', 'staff', member.id, { name: member.name });
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
    await logAudit(req, 'update', 'staff', member.id, { updates: Object.keys(req.body) });
    res.json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const member = await prisma.staff.findUnique({ where: { id: req.params.id } });
    await prisma.staff.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'staff', req.params.id, { name: member ? member.name : '' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
