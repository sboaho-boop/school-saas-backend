const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const items = await prisma.inventoryItem.findMany({ where: { schoolId: req.schoolId }, include: { assignments: true }, orderBy: { name: 'asc' } });
  res.json(items);
});

router.post('/', requireRole('headteacher', 'admin'), async (req, res) => {
  const { name, category, quantity, condition, location, purchaseDate, purchasePrice } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const q = parseInt(quantity || 0);
  const item = await prisma.inventoryItem.create({ data: { schoolId: req.schoolId, name, category: category || '', quantity: q, condition: condition || 'good', location: location || '', purchaseDate: purchaseDate || null, purchasePrice: parseFloat(purchasePrice || 0) } });
  res.status(201).json(item);
});

router.put('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.inventoryItem.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: req.body });
  res.json({ ok: true });
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.inventoryAssignment.deleteMany({ where: { itemId: req.params.id, schoolId: req.schoolId } });
  await prisma.inventoryItem.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
  res.json({ ok: true });
});

router.post('/:id/assign', requireRole('headteacher', 'admin'), async (req, res) => {
  const { assignedTo, assignedType, assignedDate, notes } = req.body;
  if (!assignedTo || !assignedDate) return res.status(400).json({ error: 'assignedTo and assignedDate required' });
  const item = await prisma.inventoryItem.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!item || item.quantity < 1) return res.status(400).json({ error: 'Item unavailable' });
  const assign = await prisma.inventoryAssignment.create({ data: { itemId: req.params.id, schoolId: req.schoolId, assignedTo, assignedType: assignedType || 'staff', assignedById: req.user.id, assignedDate, notes: notes || '' } });
  await prisma.inventoryItem.update({ where: { id: req.params.id }, data: { quantity: { decrement: 1 }, status: 'assigned' } });
  res.status(201).json(assign);
});

router.post('/assignments/:id/return', requireRole('headteacher', 'admin'), async (req, res) => {
  const assign = await prisma.inventoryAssignment.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!assign) return res.status(404).json({ error: 'Assignment not found' });
  await prisma.inventoryAssignment.update({ where: { id: req.params.id }, data: { returnDate: new Date().toISOString().split('T')[0], notes: req.body.notes || '' } });
  await prisma.inventoryItem.update({ where: { id: assign.itemId }, data: { quantity: { increment: 1 } } });
  res.json({ ok: true });
});

module.exports = router;
