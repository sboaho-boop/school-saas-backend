const { Router } = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');
const { authenticate } = require('../middleware/auth');
const { SYSTEM_PROMPT, generateAIReply, checkAILimit } = require('../lib/ai');

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
        grades: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { subject: { select: { name: true } } },
        },
      },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    // Get class teacher
    const classGroup = await prisma.academicClass.findFirst({
      where: { id: student.classId, schoolId: student.schoolId },
      select: { teacher: true },
    });
    // Attendance stats
    const totalDays = student.attendanceRecs.length;
    const presentDays = student.attendanceRecs.filter(a => a.status === 'present').length;
    const absentDays = student.attendanceRecs.filter(a => a.status === 'absent').length;
    const lateDays = student.attendanceRecs.filter(a => a.status === 'late').length;
    // Grade stats
    const avgScore = student.grades.length > 0
      ? Math.round(student.grades.reduce((s, g) => s + g.score, 0) / student.grades.length)
      : null;
    res.json({
      name: `${student.firstName} ${student.lastName}`,
      className: student.className,
      indexNumber: student.indexNumber,
      photoUrl: student.photoUrl,
      classTeacher: classGroup?.teacher || null,
      wallet: student.wallet ? { balance: student.wallet.balance, totalSpent: student.wallet.totalSpent, frozen: student.wallet.frozen } : null,
      transactions: student.wallet?.transactions || [],
      attendance: student.attendanceRecs,
      attendanceStats: { total: totalDays, present: presentDays, absent: absentDays, late: lateDays },
      grades: student.grades.map(g => ({
        id: g.id,
        score: g.score,
        grade: g.grade,
        components: g.components,
        remarks: g.remarks,
        subjectName: g.subject?.name || 'Unknown',
      })),
      avgScore,
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

// ─── Student AI Tutor ──────────────────────────────────────

router.post('/ai/chat', authenticateStudent, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const limit = await checkAILimit(req.schoolId);
    if (!limit.allowed) {
      return res.status(403).json({
        error: `AI tutor limit reached (${limit.used}/${limit.limit} today). Your school needs to upgrade to use more.`,
        limit,
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      select: { firstName: true, className: true, classId: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const studentContext = `Student info: ${student.firstName}, Class: ${student.className || 'Unknown'}`;

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${studentContext}` },
      ...(history || []).slice(-20),
      { role: 'user', content: message },
    ];

    const reply = await generateAIReply(messages, req.schoolId);
    if (!reply) return res.status(503).json({ error: 'AI tutor not configured yet. Contact your school administrator.' });

    await prisma.aIConversation.create({
      data: {
        schoolId: req.schoolId,
        userId: req.studentId,
        userMessage: message,
        aiResponse: reply,
      },
    }).catch(() => {});

    res.json({ reply, remaining: limit.remaining });
  } catch (err) {
    console.error('Student AI chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI service unavailable' });
  }
});

router.get('/ai/history', authenticateStudent, async (req, res) => {
  try {
    const conversations = await prisma.aIConversation.findMany({
      where: { schoolId: req.schoolId, userId: req.studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(conversations);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
