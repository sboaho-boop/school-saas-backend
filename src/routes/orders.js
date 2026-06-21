const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const orders = await prisma.cardOrder.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

router.get('/all', requireRole('headteacher', 'admin'), async (req, res) => {
  const orders = await prisma.cardOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(orders);
});

router.post('/', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentIds, notes } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student required' });
    }
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId: req.schoolId },
    });
    if (students.length === 0) return res.status(404).json({ error: 'No valid students found' });
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const order = await prisma.cardOrder.create({
      data: {
        schoolId: req.schoolId,
        schoolName: school?.name || 'Unknown School',
        studentIds: JSON.stringify(studentIds),
        quantity: studentIds.length,
        notes: notes || '',
      },
    });
    await logAudit(req, 'create', 'cardorder', order.id, { quantity: studentIds.length });
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/status', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'approved', 'printing', 'shipped', 'delivered'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const order = await prisma.cardOrder.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const updated = await prisma.cardOrder.update({ where: { id: req.params.id }, data: { status } });
    await logAudit(req, 'update-status', 'cardorder', order.id, { status });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const order = await prisma.cardOrder.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Can only delete pending orders' });
    await prisma.cardOrder.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'cardorder', order.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
