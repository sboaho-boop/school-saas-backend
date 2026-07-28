const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

function parseClasses(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {} }
  return [];
}

router.get('/', async (req, res) => {
  const { classId, className, date } = req.query;
  const where = { schoolId: req.schoolId };
  if (classId) where.classId = classId;
  else if (req.staff && req.staff.staffType === 'teaching') {
    const classes = parseClasses(req.staff.assignedClasses);
    if (classes.length > 0) {
      const found = await prisma.academicClass.findMany({ where: { name: { in: classes }, schoolId: req.schoolId } });
      if (found.length > 0) where.classId = { in: found.map(c => c.id) };
      else return res.json([]);
    }
  }
  if (className) where.className = className;
  if (date) where.date = date;
  const records = await prisma.attendance.findMany({ where, orderBy: [{ date: 'desc' }, { studentName: 'asc' }] });
  res.json(records);
});

router.post('/', async (req, res) => {
  try {
    const { studentId, studentName, classId, className, date, status } = req.body;
    const existing = await prisma.attendance.findFirst({ where: { studentId, date, schoolId: req.schoolId } });
    if (existing) {
      const updated = await prisma.attendance.update({ where: { id: existing.id }, data: { status } });
      return res.json(updated);
    }
    const record = await prisma.attendance.create({
      data: { studentId, studentName, classId, className, date, status, schoolId: req.schoolId },
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { records } = req.body;
    const results = [];
    for (const r of records) {
      const existing = await prisma.attendance.findFirst({ where: { studentId: r.studentId, date: r.date, schoolId: req.schoolId } });
      if (existing) {
        const updated = await prisma.attendance.update({ where: { id: existing.id }, data: { status: r.status } });
        results.push(updated);
      } else {
        const created = await prisma.attendance.create({ data: { ...r, schoolId: req.schoolId } });
        results.push(created);
      }
    }
    res.status(201).json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
