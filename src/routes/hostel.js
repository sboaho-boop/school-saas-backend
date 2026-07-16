const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/hostels', async (req, res) => {
  const hostels = await prisma.hostel.findMany({ where: { schoolId: req.schoolId }, include: { rooms: { include: { allocations: { where: { status: 'active' }, include: { student: { select: { firstName: true, lastName: true } } } } } } } });
  res.json(hostels);
});

router.post('/hostels', requireRole('headteacher', 'admin'), async (req, res) => {
  const { name, gender, warden, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const hostel = await prisma.hostel.create({ data: { schoolId: req.schoolId, name, gender: gender || 'mixed', warden: warden || '', capacity: parseInt(capacity || 0) } });
  res.status(201).json(hostel);
});

router.post('/rooms', requireRole('headteacher', 'admin'), async (req, res) => {
  const { hostelId, roomNumber, capacity, gender } = req.body;
  if (!hostelId || !roomNumber) return res.status(400).json({ error: 'hostelId and roomNumber required' });
  const room = await prisma.room.create({ data: { schoolId: req.schoolId, hostelId, roomNumber, capacity: parseInt(capacity || 0), gender: gender || 'mixed' } });
  res.status(201).json(room);
});

router.post('/allocate', requireRole('headteacher', 'admin'), async (req, res) => {
  const { roomId, studentId, bedNumber, startDate } = req.body;
  if (!roomId || !studentId || !startDate) return res.status(400).json({ error: 'roomId, studentId, startDate required' });
  const active = await prisma.bedAllocation.findFirst({ where: { studentId, status: 'active' } });
  if (active) return res.status(400).json({ error: 'Student already has an active bed allocation' });
  const room = await prisma.room.findFirst({ where: { id: roomId, schoolId: req.schoolId } });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const currentCount = await prisma.bedAllocation.count({ where: { roomId, status: 'active' } });
  if (currentCount >= room.capacity) return res.status(400).json({ error: 'Room is full' });
  const alloc = await prisma.bedAllocation.create({ data: { schoolId: req.schoolId, roomId, studentId, bedNumber: bedNumber || '', startDate, status: 'active' } });
  res.status(201).json(alloc);
});

router.post('/deallocate/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.bedAllocation.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: { status: 'ended', endDate: new Date().toISOString().split('T')[0] } });
  res.json({ ok: true });
});

module.exports = router;
