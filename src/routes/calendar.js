const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const events = await prisma.calendarEvent.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { date: 'asc' }
  });
  res.json(events);
});

router.post('/', async (req, res) => {
  const { title, description, date, endDate, time, endTime, type, color, allDay } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });
  const event = await prisma.calendarEvent.create({
    data: { schoolId: req.schoolId, title, description: description || '', date, endDate, time, endTime, type: type || 'event', color: color || '#3b82f6', allDay: allDay || false, createdBy: req.user.id }
  });
  res.status(201).json(event);
});

router.put('/:id', async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  const event = await prisma.calendarEvent.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(event);
});

router.delete('/:id', async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  await prisma.calendarEvent.delete({ where: { id: req.params.id } });
  res.json({ message: 'Event deleted' });
});

module.exports = router;
