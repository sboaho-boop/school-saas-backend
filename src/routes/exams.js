const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const exams = await prisma.exam.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' } });
  res.json(exams);
});

router.get('/:id', async (req, res) => {
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
  if (!exam) return res.status(404).json({ error: 'Not found' });
  res.json(exam);
});

router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { classId, subjectId, title, description, duration, passScore, dueDate } = req.body;
  if (!classId || !title || !duration || !dueDate) return res.status(400).json({ error: 'Missing required fields' });
  const exam = await prisma.exam.create({ data: { schoolId: req.schoolId, classId, subjectId, title, description: description || '', duration: parseInt(duration), passScore: parseFloat(passScore || 0), dueDate, createdBy: req.user.id } });
  res.status(201).json(exam);
});

router.put('/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const exam = await prisma.exam.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: req.body });
  res.json(exam);
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.question.deleteMany({ where: { examId: req.params.id, schoolId: req.schoolId } });
  await prisma.examSubmission.deleteMany({ where: { examId: req.params.id, schoolId: req.schoolId } });
  await prisma.exam.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
  res.json({ ok: true });
});

router.post('/:id/questions', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { type, questionText, options, correctAnswer, points } = req.body;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const q = await prisma.question.create({ data: { examId: req.params.id, schoolId: req.schoolId, type: type || 'mcq', questionText, options: JSON.stringify(options || []), correctAnswer: correctAnswer || '', points: parseFloat(points || 1) } });
  const allQ = await prisma.question.findMany({ where: { examId: req.params.id } });
  const totalPoints = allQ.reduce((s, q) => s + q.points, 0);
  await prisma.exam.update({ where: { id: req.params.id }, data: { totalPoints } });
  res.status(201).json(q);
});

router.post('/:id/submit', async (req, res) => {
  const { answers } = req.body;
  const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const existing = await prisma.examSubmission.findUnique({ where: { examId_studentId: { examId: req.params.id, studentId: req.user.id } } });
  if (existing) return res.status(400).json({ error: 'Already submitted' });
  const parsed = JSON.parse(answers || '{}');
  let score = 0;
  for (const q of exam.questions) {
    const userAns = parsed[q.id];
    if (q.type === 'mcq' && userAns === q.correctAnswer) score += q.points;
  }
  const sub = await prisma.examSubmission.create({ data: { examId: req.params.id, studentId: req.user.id, schoolId: req.schoolId, answers, score, graded: true } });
  res.status(201).json(sub);
});

router.get('/:id/submissions', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const subs = await prisma.examSubmission.findMany({ where: { examId: req.params.id, schoolId: req.schoolId }, include: { student: { select: { firstName: true, lastName: true } } } });
  res.json(subs);
});

module.exports = router;
