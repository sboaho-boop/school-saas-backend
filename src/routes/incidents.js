const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { status, type } = req.query;
  const where = { schoolId: req.schoolId };
  if (status) where.status = status;
  if (type) where.type = type;
  const items = await prisma.incident.findMany({ where, include: { student: { select: { firstName: true, lastName: true, className: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(items);
});

router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { studentId, type, description, location, date, action } = req.body;
  if (!studentId || !type || !description) return res.status(400).json({ error: 'studentId, type, description required' });
  const item = await prisma.incident.create({ data: { schoolId: req.schoolId, studentId, reportedBy: req.user.id, type, description, location: location || '', date: date || new Date().toISOString().split('T')[0], action: action || 'warning' } });
  res.status(201).json(item);
});

router.put('/:id/resolve', requireRole('headteacher', 'admin'), async (req, res) => {
  const item = await prisma.incident.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: { status: 'resolved', resolvedAt: new Date(), resolvedBy: req.user.id } });
  res.json(item);
});

module.exports = router;
