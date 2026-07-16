const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/slots', async (req, res) => {
  const slots = await prisma.conferenceSlot.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { date: 'asc' },
    include: { teacher: { select: { id: true, name: true, email: true } }, bookings: { include: { student: { select: { id: true, name: true, className: true } } } } }
  });
  res.json(slots);
});

router.get('/my-slots', async (req, res) => {
  const slots = await prisma.conferenceSlot.findMany({
    where: { schoolId: req.schoolId, teacherId: req.user.id },
    orderBy: { date: 'asc' },
    include: { bookings: { include: { student: { select: { id: true, name: true, className: true } } } } }
  });
  res.json(slots);
});

router.post('/slots', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { date, startTime, endTime, maxParents } = req.body;
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, endTime required' });
  const slot = await prisma.conferenceSlot.create({ data: { schoolId: req.schoolId, teacherId: req.user.id, date, startTime, endTime, maxParents: parseInt(maxParents || 5) } });
  res.status(201).json(slot);
});

router.post('/slots/:id/book', async (req, res) => {
  const slot = await prisma.conferenceSlot.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (slot.bookedCount >= slot.maxParents) return res.status(400).json({ error: 'Slot is full' });
  const booking = await prisma.conferenceBooking.create({ data: { slotId: req.params.id, studentId: req.body.studentId, schoolId: req.schoolId, parentEmail: req.body.parentEmail, notes: req.body.notes || '' } });
  await prisma.conferenceSlot.update({ where: { id: req.params.id }, data: { bookedCount: { increment: 1 } } });
  res.status(201).json(booking);
});

module.exports = router;
