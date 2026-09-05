const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { triggerNotification, NOTIFICATION_TYPES, getStudentGuardians } = require('../lib/notification-engine');
const { COMPONENT_NAMES, parseWeights, getGradeConfig, saveGradeConfig, componentMax, calcTotal } = require('../lib/gradebook-config');

const COMPONENT_LABELS = { classExercise: 'Class Exercise', homework: 'Homework', quiz: 'Quiz', midterm: 'Mid-Term', exam: 'Exam' };

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

// GET /api/marks/config — current gradebook weight configuration
router.get('/config', async (req, res) => {
  try {
    const cfg = await getGradeConfig(req.schoolId);
    res.json({ weights: cfg.weights, hasConfig: cfg.hasConfig, componentLabels: COMPONENT_LABELS });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/marks/config — save gradebook weight configuration (must total 100)
router.put('/config', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { weights } = req.body;
    if (!weights || typeof weights !== 'object') return res.status(400).json({ error: 'weights object required' });
    const rawSum = COMPONENT_NAMES.reduce((s, n) => s + (parseFloat(weights[n]) || 0), 0);
    if (Math.round(rawSum) !== 100) return res.status(400).json({ error: 'Weights must total 100' });
    const saved = await saveGradeConfig(req.schoolId, weights);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function parseClasses(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {} }
  return [];
}

// GET /api/marks?classId=&subjectId=&termId=
router.get('/', async (req, res) => {
  const { classId, subjectId, termId } = req.query;
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
    if (req.staff && req.staff.staffType === 'teaching') {
      const classes = parseClasses(req.staff.assignedClasses);
      if (classes.length > 0) {
        const found = await prisma.academicClass.findMany({ where: { name: { in: classes }, schoolId: req.schoolId } });
        if (found.length > 0 && !found.find(c => c.id === classId)) return res.status(403).json({ error: 'Not your assigned class' });
      } else return res.status(403).json({ error: 'No classes assigned' });
    }

    const { weights } = await getGradeConfig(req.schoolId);

    if (components && typeof components === 'object') {
      const c = {};
      COMPONENT_NAMES.forEach(n => { c[n] = Math.min(parseFloat(components[n]) || 0, componentMax(weights, n)); });
      components = JSON.stringify(c);
      score = calcTotal(components, weights);
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

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    const term = await prisma.term.findFirst({ where: { id: termId, schoolId: req.schoolId } });
    if (student && term) {
      const guardians = await getStudentGuardians(req.schoolId, studentId);
      if (guardians.length > 0) {
        const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId: req.schoolId } });
        triggerNotification(req.schoolId, NOTIFICATION_TYPES.RESULT_PUBLISHED, {
          title: `New grade published for ${student.firstName}`,
          message: `${subject ? subject.name : 'Subject'}: ${grade} (${score}/${term.name})`,
          recipients: guardians,
        }).catch(() => {});
      }
    }

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
    const { weights } = await getGradeConfig(req.schoolId);
    for (const g of grades) {
      const termId = g.termId || activeTermId;
      if (!termId) continue;

      let components = g.components;
      let score = g.score;
      if (components && typeof components === 'object') {
        const c = {};
        COMPONENT_NAMES.forEach(n => { c[n] = Math.min(parseFloat(components[n]) || 0, componentMax(weights, n)); });
        components = JSON.stringify(c);
        score = calcTotal(components, weights);
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
