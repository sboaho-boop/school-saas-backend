const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const where = { schoolId: req.schoolId };
    if (req.query.classId) where.classId = req.query.classId;
    if (req.staff?.assignedClass && !req.query.classId) where.classId = req.staff.assignedClass;
    const slots = await prisma.timetableSlot.findMany({
      where,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json(slots);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const { classId, dayOfWeek, startTime, endTime, subjectId, staffId, room } = req.body;
    if (classId === undefined || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'classId, dayOfWeek, startTime, endTime required' });
    }
    const slot = await prisma.timetableSlot.create({
      data: { classId, dayOfWeek: parseInt(dayOfWeek), startTime, endTime, subjectId, staffId, room, schoolId: req.schoolId },
    });
    res.status(201).json(slot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const slot = await prisma.timetableSlot.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: req.body });
    res.json(slot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    await prisma.timetableSlot.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
