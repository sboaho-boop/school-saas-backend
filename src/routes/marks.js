const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireStaffType } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { classId, subjectId, termId } = req.query;
  const where = {};
  if (classId) where.classId = classId;
  else if (req.staff && req.staff.staffType === 'teaching' && req.staff.assignedClass) {
    const cls = await prisma.academicClass.findFirst({ where: { name: req.staff.assignedClass } });
    if (cls) where.classId = cls.id;
    else return res.json([]);
  }
  if (subjectId) where.subjectId = subjectId;
  if (termId) where.termId = termId;
  const grades = await prisma.grade.findMany({ where, orderBy: [{ studentId: 'asc' }] });
  res.json(grades);
});

router.post('/', async (req, res) => {
  try {
    const { studentId, subjectId, classId, termId, score, grade: letterGrade } = req.body;
    if (!studentId || !subjectId || !classId || !termId || score === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (req.staff && req.staff.staffType === 'teaching') {
      if (req.staff.assignedClass) {
        const cls = await prisma.academicClass.findFirst({ where: { name: req.staff.assignedClass } });
        if (cls && classId !== cls.id) {
          return res.status(403).json({ error: 'You can only enter marks for your assigned class' });
        }
      }
    }
    const existing = await prisma.grade.findFirst({ where: { studentId, subjectId, termId } });
    if (existing) {
      const grade = await prisma.grade.update({ where: { id: existing.id }, data: req.body });
      return res.json(grade);
    }
    const grade = await prisma.grade.create({ data: req.body });
    res.status(201).json(grade);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { grades } = req.body;
    const results = [];
    for (const g of grades) {
      const existing = await prisma.grade.findFirst({ where: { studentId: g.studentId, subjectId: g.subjectId, termId: g.termId } });
      if (existing) {
        const updated = await prisma.grade.update({ where: { id: existing.id }, data: g });
        results.push(updated);
      } else {
        const created = await prisma.grade.create({ data: g });
        results.push(created);
      }
    }
    res.status(201).json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
