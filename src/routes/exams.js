const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { gradeAnswer, buildPaper, AUTO_GRADED, parseOptions } = require('../lib/exam-engine');

const router = Router();
router.use(authenticate);

// GET / — list all exams for the school
router.get('/', async (req, res) => {
  const exams = await prisma.exam.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questions: true } } } });
  res.json(exams);
});

// GET /:id — exam with questions (staff view, includes correctAnswer)
router.get('/:id', async (req, res) => {
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: { orderBy: { order: 'asc' } } } });
  if (!exam) return res.status(404).json({ error: 'Not found' });
  const mapped = exam.questions.map((q) => ({ ...q, options: parseOptions(q.options) }));
  res.json({ ...exam, questions: mapped });
});

// POST / — create exam
router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { classId, subjectId, title, description, duration, passScore, dueDate, shuffleQuestions, allowRetake } = req.body;
  if (!classId || !title || !duration || !dueDate) return res.status(400).json({ error: 'Missing required fields' });
  const exam = await prisma.exam.create({
    data: {
      schoolId: req.schoolId,
      classId,
      subjectId: subjectId || '',
      title,
      description: description || '',
      duration: parseInt(duration),
      passScore: parseFloat(passScore || 0),
      dueDate,
      createdBy: req.user.id,
      shuffleQuestions: !!shuffleQuestions,
      allowRetake: !!allowRetake,
    },
  });
  res.status(201).json(exam);
});

// PUT /:id — update exam meta (title, date, duration, shuffle, retake, etc.)
router.put('/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const allowed = ['title', 'description', 'duration', 'dueDate', 'passScore', 'subjectId', 'shuffleQuestions', 'allowRetake'];
  const data = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined && req.body[k] !== null) data[k] = k === 'duration' ? parseInt(req.body[k]) : k === 'passScore' ? parseFloat(req.body[k]) : req.body[k]; });
  const exam = await prisma.exam.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data });
  res.json(exam);
});

// DELETE /:id
router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.examSubmission.deleteMany({ where: { examId: req.params.id, schoolId: req.schoolId } });
  await prisma.question.deleteMany({ where: { examId: req.params.id, schoolId: req.schoolId } });
  await prisma.exam.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
  res.json({ ok: true });
});

// POST /:id/questions — add a question
router.post('/:id/questions', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { type, questionText, options, correctAnswer, points, order, shuffleGroup } = req.body;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const q = await prisma.question.create({
    data: {
      examId: req.params.id,
      schoolId: req.schoolId,
      type: type || 'mcq',
      questionText,
      options: JSON.stringify(options && options.length ? options : (type === 'truefalse' ? ['True', 'False'] : [])),
      correctAnswer: correctAnswer || '',
      points: parseFloat(points || 1),
      order: parseInt(order) || 0,
      shuffleGroup: parseInt(shuffleGroup) || 1,
    },
  });
  await refreshTotalPoints(req.params.id);
  res.status(201).json(q);
});

// PUT /:id/questions/:qid — edit a question
router.put('/:id/questions/:qid', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { type, questionText, options, correctAnswer, points, order, shuffleGroup } = req.body;
  const q = await prisma.question.findFirst({ where: { id: req.params.qid, examId: req.params.id, schoolId: req.schoolId } });
  if (!q) return res.status(404).json({ error: 'Question not found' });
  const updated = await prisma.question.update({
    where: { id: q.id },
    data: {
      type: type || q.type,
      questionText: questionText !== undefined ? questionText : q.questionText,
      options: options !== undefined ? JSON.stringify(options && options.length ? options : (type === 'truefalse' ? ['True', 'False'] : [])) : q.options,
      correctAnswer: correctAnswer !== undefined ? correctAnswer : q.correctAnswer,
      points: points !== undefined ? parseFloat(points) : q.points,
      order: order !== undefined ? parseInt(order) : q.order,
      shuffleGroup: shuffleGroup !== undefined ? parseInt(shuffleGroup) : q.shuffleGroup,
    },
  });
  await refreshTotalPoints(req.params.id);
  res.json(updated);
});

// DELETE /:id/questions/:qid
router.delete('/:id/questions/:qid', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  await prisma.question.deleteMany({ where: { id: req.params.qid, examId: req.params.id, schoolId: req.schoolId } });
  await refreshTotalPoints(req.params.id);
  res.json({ ok: true });
});

async function refreshTotalPoints(examId) {
  const allQ = await prisma.question.findMany({ where: { examId } });
  const total = allQ.reduce((s, q) => s + q.points, 0);
  await prisma.exam.update({ where: { id: examId }, data: { totalPoints: total } });
}

// GET /:id/submissions — submissions for staff (with student + answer detail)
router.get('/:id/submissions', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const subs = await prisma.examSubmission.findMany({
    where: { examId: req.params.id, schoolId: req.schoolId },
    orderBy: { submittedAt: 'desc' },
    include: { student: { select: { firstName: true, lastName: true, indexNumber: true } } },
  });
  const questions = exam.questions.map((q) => ({
    id: q.id,
    type: q.type,
    questionText: q.questionText,
    options: parseOptions(q.options),
    correctAnswer: q.correctAnswer,
    points: q.points,
    order: q.order,
  }));
  res.json({
    exam: { id: exam.id, title: exam.title, passScore: exam.passScore },
    questions,
    submissions: subs.map((s) => ({
      id: s.id,
      status: s.status,
      answers: s.answers,
      gradedAnswers: s.gradedAnswers,
      score: s.score,
      totalScore: s.totalScore,
      grade: s.grade,
      graded: s.graded,
      student: s.student,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
    })),
  });
});

// PUT /:id/submissions/:subId/grade — staff grades theory answers (manual)
router.put('/:id/submissions/:subId/grade', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const sub = await prisma.examSubmission.findFirst({ where: { id: req.params.subId, examId: req.params.id, schoolId: req.schoolId } });
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const manual = req.body.answers || {};           // { qid: { points, feedback } }
  const feedback = typeof req.body.feedback === 'string' ? req.body.feedback : sub.feedback;
  const baseScore = parseFloat(sub.score) || 0;

  const parsedAnswers = JSON.parse(sub.answers || '{}');
  const graded = JSON.parse(sub.gradedAnswers || '{}');

  let manualScore = 0;
  for (const q of exam.questions) {
    if (AUTO_GRADED.includes(q.type)) continue; // only theory is manually graded
    const m = manual[q.id];
    if (m && m.points !== undefined) {
      const p = Math.max(0, Math.min(parseFloat(q.points) || 1, parseFloat(m.points) || 0));
      graded[q.id] = { points: p, feedback: m.feedback || '' };
      manualScore += p;
    }
  }

  const totalScore = parseFloat(exam.questions.reduce((s, q) => s + q.points, 0)) || 0;
  const finalScore = Math.round((baseScore + manualScore) * 100) / 100;
  const pct = totalScore > 0 ? (finalScore / totalScore) * 100 : 0;
  const grade = pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : pct >= 40 ? 'E' : 'F';

  await prisma.examSubmission.update({
    where: { id: sub.id },
    data: {
      gradedAnswers: JSON.stringify(graded),
      score: finalScore,
      totalScore,
      grade,
      graded: true,
      gradedBy: req.user.id,
      status: 'graded',
      feedback,
    },
  });
  res.json({ ok: true, score: finalScore, totalScore, grade });
});

// GET /:id/analytics — per-question class performance
router.get('/:id/analytics', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const subs = await prisma.examSubmission.findMany({ where: { examId: req.params.id, schoolId: req.schoolId, status: { in: ['submitted', 'graded'] } } });

  const perQuestion = exam.questions.map((q) => {
    let attempted = 0;
    let correctCount = 0;
    let pointsEarned = 0;
    let possible = 0;
    for (const s of subs) {
      const ans = JSON.parse(s.answers || '{}')[q.id];
      const graded = JSON.parse(s.gradedAnswers || '{}')[q.id];
      if (ans !== undefined && ans !== null && ans !== '') attempted++;
      possible += q.points;
      if (AUTO_GRADED.includes(q.type)) {
        const r = gradeAnswer(q, ans);
        if (r.correct) correctCount++;
        pointsEarned += r.correct ? q.points : 0;
      } else {
        const pts = graded ? (parseFloat(graded.points) || 0) : 0;
        pointsEarned += pts;
        if (pts > 0) correctCount++;
      }
    }
    return {
      id: q.id,
      type: q.type,
      questionText: q.questionText,
      points: q.points,
      attempted,
      correctCount,
      accuracy: attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0,
      averagePoints: subs.length > 0 ? Math.round((pointsEarned / subs.length) * 100) / 100 : 0,
    };
  });

  const scores = subs.map((s) => parseFloat(s.score) || 0);
  const average = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
  const max = scores.length > 0 ? Math.max(...scores) : 0;
  const min = scores.length > 0 ? Math.min(...scores) : 0;
  const passCount = subs.filter((s) => {
    const total = parseFloat(exam.totalPoints) || s.totalScore || 1;
    const pct = parseFloat(s.score) || 0;
    const pctScore = total > 0 ? (pct / total) * 100 : 0;
    return exam.passScore > 0 ? pctScore >= exam.passScore : pctScore >= 50;
  }).length;

  res.json({
    examId: exam.id,
    totalSubmissions: subs.length,
    average,
    max,
    min,
    passCount,
    passRate: subs.length ? Math.round((passCount / subs.length) * 100) : 0,
    perQuestion,
  });
});

module.exports = router;