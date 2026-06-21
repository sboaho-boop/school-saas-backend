const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const COMPONENT_NAMES = ['classExercise', 'homework', 'quiz', 'midterm', 'exam'];
const COMPONENT_LABELS = { classExercise: 'Class Exercise', homework: 'Homework', quiz: 'Quiz', midterm: 'Mid-Term', exam: 'Exam' };
const COMPONENT_MAX = { classExercise: 10, homework: 10, quiz: 30, midterm: 20, exam: 30 };

function calcTotal(components) {
  const c = typeof components === 'string' ? JSON.parse(components || '{}') : (components || {});
  return COMPONENT_NAMES.reduce((sum, name) => sum + (parseFloat(c[name]) || 0), 0);
}

function scoreToGrade(total) {
  if (total >= 80) return 'A';
  if (total >= 70) return 'B';
  if (total >= 60) return 'C';
  if (total >= 50) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}

const router = Router();
router.use(authenticate);

// GET /api/marks?classId=&subjectId=&termId=
router.get('/', async (req, res) => {
  const { classId, subjectId, termId } = req.query;
  const where = { schoolId: req.schoolId };
  if (classId) where.classId = classId;
  else if (req.staff && req.staff.staffType === 'teaching' && req.staff.assignedClass) {
    const cls = await prisma.academicClass.findFirst({ where: { name: req.staff.assignedClass, schoolId: req.schoolId } });
    if (cls) where.classId = cls.id;
    else return res.json([]);
  }
  if (subjectId) where.subjectId = subjectId;
  if (termId) where.termId = termId;
  const grades = await prisma.grade.findMany({ where, orderBy: [{ studentId: 'asc' }] });
  res.json(grades);
});

// POST /api/marks — single grade upsert with components
router.post('/', async (req, res) => {
  try {
    let { studentId, subjectId, classId, termId, score, components, remarks } = req.body;
    if (!studentId || !subjectId || !classId || (!score && score !== 0 && !components)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!termId) {
      const active = await prisma.term.findFirst({ where: { schoolId: req.schoolId, isActive: true } });
      if (active) termId = active.id;
      else return res.status(400).json({ error: 'No active term found' });
    }
    if (req.staff && req.staff.staffType === 'teaching' && req.staff.assignedClass) {
      const cls = await prisma.academicClass.findFirst({ where: { name: req.staff.assignedClass, schoolId: req.schoolId } });
      if (cls && classId !== cls.id) return res.status(403).json({ error: 'Not your assigned class' });
    }

    if (components && typeof components === 'object') {
      const c = {};
      COMPONENT_NAMES.forEach(n => { c[n] = Math.min(parseFloat(components[n]) || 0, COMPONENT_MAX[n]); });
      components = JSON.stringify(c);
      score = calcTotal(components);
    } else {
      components = JSON.stringify({});
      score = parseFloat(score) || 0;
    }

    const grade = scoreToGrade(score);
    const data = { studentId, subjectId, classId, termId, score, grade, components, remarks: remarks || '', schoolId: req.schoolId };

    const existing = await prisma.grade.findFirst({ where: { studentId, subjectId, termId, schoolId: req.schoolId } });
    if (existing) {
      const updated = await prisma.grade.update({ where: { id: existing.id }, data });
      return res.json(updated);
    }
    const created = await prisma.grade.create({ data });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/marks/batch — batch upsert
router.post('/batch', async (req, res) => {
  try {
    const { grades } = req.body;
    let activeTermId = null;
    if (grades.some(g => !g.termId)) {
      const active = await prisma.term.findFirst({ where: { schoolId: req.schoolId, isActive: true } });
      if (active) activeTermId = active.id;
      else return res.status(400).json({ error: 'No active term found' });
    }
    const results = [];
    for (const g of grades) {
      const termId = g.termId || activeTermId;
      if (!termId) continue;

      let components = g.components;
      let score = g.score;
      if (components && typeof components === 'object') {
        const c = {};
        COMPONENT_NAMES.forEach(n => { c[n] = Math.min(parseFloat(components[n]) || 0, COMPONENT_MAX[n]); });
        components = JSON.stringify(c);
        score = calcTotal(components);
      } else {
        components = JSON.stringify({});
        score = parseFloat(score) || 0;
      }

      const grade = scoreToGrade(score);
      const data = { ...g, termId, components, score, grade, schoolId: req.schoolId };
      const existing = await prisma.grade.findFirst({ where: { studentId: g.studentId, subjectId: g.subjectId, termId, schoolId: req.schoolId } });
      if (existing) {
        results.push(await prisma.grade.update({ where: { id: existing.id }, data }));
      } else {
        results.push(await prisma.grade.create({ data }));
      }
    }
    res.status(201).json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/marks/report-card/:studentId/:termId
router.get('/report-card/:studentId/:termId', async (req, res) => {
  try {
    const { studentId, termId } = req.params;
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId: req.schoolId } });
    if (!term) return res.status(404).json({ error: 'Term not found' });

    const grades = await prisma.grade.findMany({
      where: { studentId, termId, schoolId: req.schoolId },
      orderBy: { score: 'desc' },
    });

    // Get all subjects for this class
    const subjects = await prisma.subject.findMany({ where: { classId: student.classId, schoolId: req.schoolId } });

    // Build subject-scores map
    const subjectGrades = {};
    grades.forEach(g => { subjectGrades[g.subjectId] = g; });

    const subjectScores = subjects.map(sub => {
      const g = subjectGrades[sub.id];
      let components = {};
      if (g && g.components) {
        try { components = JSON.parse(typeof g.components === 'string' ? g.components : '{}'); } catch { components = {}; }
      }
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        subjectCode: sub.code,
        score: g ? g.score : 0,
        grade: g ? g.grade : '',
        components,
        remarks: g ? g.remarks : '',
      };
    });

    // Calculate totals
    const totalScore = subjectScores.reduce((sum, s) => sum + s.score, 0);
    const totalSubjects = subjectScores.length;
    const average = totalSubjects > 0 ? totalScore / totalSubjects : 0;
    const overallGrade = scoreToGrade(average);

    res.json({
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, className: student.className },
      term: { name: term.name, academicYear: term.academicYear },
      subjects: subjectScores,
      totalScore,
      totalSubjects,
      average,
      overallGrade,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/marks/rankings/:classId/:termId
router.get('/rankings/:classId/:termId', async (req, res) => {
  try {
    const { classId, termId } = req.params;
    const students = await prisma.student.findMany({ where: { classId, schoolId: req.schoolId } });
    const subjects = await prisma.subject.findMany({ where: { classId, schoolId: req.schoolId } });

    const rankings = [];
    for (const student of students) {
      const grades = await prisma.grade.findMany({ where: { studentId: student.id, termId, schoolId: req.schoolId } });
      const totalScore = grades.reduce((sum, g) => sum + g.score, 0);
      const average = subjects.length > 0 ? totalScore / subjects.length : 0;
      rankings.push({ studentId: student.id, studentName: `${student.firstName} ${student.lastName}`, totalScore, average, subjectsCount: subjects.length });
    }

    // Sort by total score descending, assign positions
    rankings.sort((a, b) => b.totalScore - a.totalScore);
    rankings.forEach((r, i) => { r.position = i + 1; });

    res.json(rankings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
