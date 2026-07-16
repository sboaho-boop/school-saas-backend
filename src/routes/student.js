const { Router } = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');
const { authenticate } = require('../middleware/auth');

const router = Router();

function authenticateStudent(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(header.split(' ')[1]);
    if (payload.role !== 'student') return res.status(403).json({ error: 'Not a student token' });
    req.studentId = payload.id;
    req.schoolId = payload.schoolId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/login', async (req, res) => {
  try {
    const { indexNumber, password } = req.body;
    if (!indexNumber || !password) return res.status(400).json({ error: 'Index number and password required' });
    const student = await prisma.student.findFirst({ where: { indexNumber } });
    if (!student) return res.status(404).json({ error: 'Student not found with this index number' });
    if (!student.password) return res.status(401).json({ error: 'Password not set. Ask your parent to set a password from their dashboard.' });
    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(401).json({ error: 'Invalid password' });
    const token = signToken({ id: student.id, indexNumber, role: 'student', schoolId: student.schoolId });
    res.json({ token, student: { id: student.id, name: `${student.firstName} ${student.lastName}`, className: student.className, indexNumber: student.indexNumber } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/dashboard', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      include: {
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        attendanceRecs: { orderBy: { date: 'desc' }, take: 30 },
        grades: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({
      name: `${student.firstName} ${student.lastName}`,
      className: student.className,
      wallet: student.wallet ? { balance: student.wallet.balance, totalSpent: student.wallet.totalSpent, frozen: student.wallet.frozen } : null,
      transactions: student.wallet?.transactions || [],
      attendance: student.attendanceRecs,
      grades: student.grades,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/reports', authenticateStudent, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const report = await prisma.studentReport.create({
      data: { studentId: req.studentId, schoolId: req.schoolId, title, content },
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports', authenticateStudent, async (req, res) => {
  try {
    const reports = await prisma.studentReport.findMany({
      where: { studentId: req.studentId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/all-reports', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!['headteacher', 'admin'].includes(user?.role || '')) return res.status(403).json({ error: 'Only admin and headteacher can view all reports' });
    const reports = await prisma.studentReport.findMany({
      where: { schoolId: req.schoolId },
      include: { student: { select: { firstName: true, lastName: true, className: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/set-password', authenticate, async (req, res) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password) return res.status(400).json({ error: 'studentId and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const hashed = await bcrypt.hash(password, 10);
    await prisma.student.update({ where: { id: studentId }, data: { password: hashed } });
    res.json({ message: 'Student password set' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/assignments', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const assignments = await prisma.assignment.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: { createdAt: 'desc' },
      include: {
        submissions: { where: { studentId: req.studentId }, select: { id: true, status: true, grade: true, feedback: true, content: true, submittedAt: true } },
      },
    });
    res.json(assignments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/timetable', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    res.json(slots);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
