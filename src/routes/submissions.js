const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { verifyToken } = require('../lib/jwt');

const router = Router();

function authEither(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(header.split(' ')[1]);
    if (payload.role === 'student') {
      req.studentId = payload.id;
      req.schoolId = payload.schoolId;
      req.isStudent = true;
      return next();
    }
    req.user = { id: payload.id, ...payload };
    req.schoolId = payload.schoolId;
    req.isStudent = false;
    if (payload.staffType) req.staff = { staffType: payload.staffType };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(authEither);

router.post('/', async (req, res) => {
  try {
    if (!req.isStudent) return res.status(403).json({ error: 'Only students can submit' });
    const { assignmentId, content, fileUrl } = req.body;
    if (!assignmentId) return res.status(400).json({ error: 'assignmentId required' });
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, schoolId: req.schoolId } });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    const existing = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: req.studentId } } });
    if (existing) {
      const updated = await prisma.submission.update({ where: { id: existing.id }, data: { content, fileUrl, status: 'submitted', submittedAt: new Date() } });
      return res.json(updated);
    }
    const submission = await prisma.submission.create({
      data: { assignmentId, studentId: req.studentId, content, fileUrl, schoolId: req.schoolId },
    });
    res.status(201).json(submission);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/grade', async (req, res) => {
  try {
    if (req.isStudent) return res.status(403).json({ error: 'Only staff can grade' });
    const { grade, feedback } = req.body;
    if (grade === undefined) return res.status(400).json({ error: 'grade required' });
    const submission = await prisma.submission.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { grade: parseFloat(grade), feedback, status: 'graded', gradedBy: req.user?.id || null, gradedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
