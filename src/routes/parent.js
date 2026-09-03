const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');
const { createCheckout } = require('../lib/hubtel-payment');
const { directReceiveMoney } = require('../lib/hubtel-direct-receive');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const students = await prisma.student.findMany({ where: { parentEmail: email } });
    if (students.length === 0) return res.status(404).json({ error: 'No students found for this email' });

    const studentWithPassword = students.find((s) => s.parentPassword);
    if (studentWithPassword) {
      if (!password) return res.status(400).json({ error: 'Password required' });
      const match = await bcrypt.compare(password, studentWithPassword.parentPassword);
      if (!match) return res.status(401).json({ error: 'Invalid password' });
    }

    const token = signToken({ id: 'parent', email, role: 'parent', schoolId: students[0].schoolId });
    res.json({ token, students: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, className: s.className })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/set-password', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const students = await prisma.student.findMany({ where: { parentEmail: email } });
    if (students.length === 0) return res.status(404).json({ error: 'No students found for this email' });
    const hashed = await bcrypt.hash(password, 10);
    for (const s of students) {
      await prisma.student.update({ where: { id: s.id }, data: { parentPassword: hashed } });
    }
    res.json({ message: 'Parent password set successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function authenticateParent(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(header.split(' ')[1]);
    if (payload.role !== 'parent') return res.status(403).json({ error: 'Not a parent token' });
    req.parentEmail = payload.email;
    req.schoolId = payload.schoolId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/children', authenticateParent, async (req, res) => {
  const students = await prisma.student.findMany({
    where: { parentEmail: req.parentEmail, schoolId: req.schoolId },
    include: { wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
  });
  res.json(students);
});

router.get('/children/:id', authenticateParent, async (req, res) => {
  const student = await prisma.student.findFirst({
    where: { id: req.params.id, parentEmail: req.parentEmail, schoolId: req.schoolId },
    include: {
      wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } } },
      attendanceRecs: { orderBy: { date: 'desc' }, take: 30 },
      grades: { include: { student: true, subject: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

const ownedStudent = async (req) => {
  return prisma.student.findFirst({
    where: { id: req.params.id, parentEmail: req.parentEmail, schoolId: req.schoolId },
    select: { id: true, classId: true, firstName: true, lastName: true, className: true },
  });
};

router.get('/children/:id/exams', authenticateParent, async (req, res) => {
  try {
    const student = await ownedStudent(req);
    if (!student) return res.status(403).json({ error: 'Not your child' });
    if (!student.classId) return res.json([]);
    const exams = await prisma.exam.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: { dueDate: 'asc' },
      select: { id: true, title: true, subjectId: true, duration: true, totalPoints: true, dueDate: true },
    });
    const subjectIds = [...new Set(exams.map((e) => e.subjectId))];
    const subjects = subjectIds.length
      ? await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId: req.schoolId }, select: { id: true, name: true } })
      : [];
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.id] = s.name; });
    res.json(exams.map((e) => ({
      id: e.id,
      title: e.title,
      subjectName: subjectMap[e.subjectId] || 'General',
      duration: e.duration,
      totalPoints: e.totalPoints,
      dueDate: e.dueDate,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/children/:id/report-card', authenticateParent, async (req, res) => {
  try {
    const student = await ownedStudent(req);
    if (!student) return res.status(403).json({ error: 'Not your child' });

    const term = req.query.termId
      ? await prisma.term.findFirst({ where: { id: String(req.query.termId), schoolId: req.schoolId } })
      : await prisma.term.findFirst({ where: { schoolId: req.schoolId, isActive: true } })
        || await prisma.term.findFirst({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });

    if (!term) {
      return res.json({ student: { firstName: student.firstName, lastName: student.lastName, className: student.className }, term: null, subjects: [], totalScore: 0, totalSubjects: 0, average: 0, overallGrade: '', noTerm: true });
    }

    const grades = await prisma.grade.findMany({
      where: { studentId: student.id, termId: term.id, schoolId: req.schoolId },
      orderBy: { score: 'desc' },
    });

    const subjects = student.classId
      ? await prisma.subject.findMany({ where: { classId: student.classId, schoolId: req.schoolId }, orderBy: { name: 'asc' } })
      : [];

    const subjectGrades = {};
    grades.forEach((g) => { subjectGrades[g.subjectId] = g; });

    const subjectScores = subjects.map((sub) => {
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

    const totalScore = subjectScores.reduce((sum, s) => sum + s.score, 0);
    const totalSubjects = subjectScores.length;
    const average = totalSubjects > 0 ? Math.round((totalScore / totalSubjects) * 100) / 100 : 0;
    const overallGrade = totalSubjects > 0 ? ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E', 'F'][Math.max(0, Math.min(9, Math.floor((100 - average) / 10)))] : '';

    res.json({
      student: { firstName: student.firstName, lastName: student.lastName, className: student.className },
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

router.get('/children/:id/meetings', authenticateParent, async (req, res) => {
  try {
    const student = await ownedStudent(req);
    if (!student) return res.status(403).json({ error: 'Not your child' });
    if (!student.classId) return res.json([]);
    const now = new Date();
    const meetings = await prisma.classMeeting.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: [{ meetingDate: 'asc' }, { startTime: 'asc' }],
      include: { class: { select: { id: true, name: true } } },
    });
    const enriched = meetings.map((m) => {
      let isLive = false;
      if (m.status === 'live') isLive = true;
      if (m.status === 'scheduled' && m.endTime) {
        const start = new Date(`${m.meetingDate}T${m.startTime}`);
        const end = new Date(`${m.meetingDate}T${m.endTime}`);
        isLive = now >= start && now <= end;
      }
      return { ...m, isUpcoming: m.meetingDate >= now.toISOString().slice(0, 10) || isLive, isLive };
    });
    res.json(enriched);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/wallet/initiate-topup', authenticateParent, async (req, res) => {
  try {
    const { studentId, amount, phone, channel } = req.body;
    if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });
    if (amount < 1) return res.status(400).json({ error: 'Minimum top-up is GHS 1' });
    if (amount > 5000) return res.status(400).json({ error: 'Maximum top-up is GHS 5,000' });
    if (!phone) return res.status(400).json({ error: 'Phone number required for mobile money payment' });
    if (!channel || !['mtn-gh', 'vodafone-gh', 'tigo-gh'].includes(channel)) {
      return res.status(400).json({ error: 'Channel required: mtn-gh, vodafone-gh, or tigo-gh' });
    }
    const student = await prisma.student.findFirst({ where: { id: studentId, parentEmail: req.parentEmail, schoolId: req.schoolId } });
    if (!student) return res.status(403).json({ error: 'Not your child' });
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `WL-${studentId.slice(0, 8)}-${Date.now().toString(36).slice(-6)}`;
    const amountFloat = parseFloat(amount);
    const result = await directReceiveMoney({
      customerName: req.parentEmail,
      customerMsisdn: phone,
      customerEmail: req.parentEmail,
      channel,
      amount: amountFloat,
      description: `Top up wallet for ${student.firstName} ${student.lastName}`,
      clientReference: reference,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/wallet/hubtel-webhook`,
      schoolCredentials: school,
    });
    if (result.ResponseCode !== '0001') {
      return res.status(400).json({ error: result.Message || 'Payment initiation failed', code: result.ResponseCode });
    }
    await prisma.studentWallet.upsert({
      where: { studentId },
      update: { pendingTopupRef: reference, pendingTopupAmount: amount },
      create: { studentId, studentName: `${student.firstName} ${student.lastName}`, schoolId: req.schoolId, pendingTopupRef: reference, pendingTopupAmount: amount },
    });
    res.json({ message: 'Payment prompt sent to your phone. Approve to complete.', reference, transactionId: result.Data?.TransactionId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/wallet/settings/:studentId', authenticateParent, async (req, res) => {
  try {
    const student = await prisma.student.findFirst({
      where: { id: req.params.studentId, parentEmail: req.parentEmail, schoolId: req.schoolId },
      include: { wallet: true },
    });
    if (!student) return res.status(403).json({ error: 'Not your child' });
    if (!student.wallet) return res.status(404).json({ error: 'No wallet found' });
    const { transactionPin, ...safe } = student.wallet;
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/wallet/pin', authenticateParent, async (req, res) => {
  try {
    const { studentId, pin } = req.body;
    if (!studentId || !pin) return res.status(400).json({ error: 'studentId and pin required' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    const student = await prisma.student.findFirst({ where: { id: studentId, parentEmail: req.parentEmail, schoolId: req.schoolId } });
    if (!student) return res.status(403).json({ error: 'Not your child' });
    const hashed = await bcrypt.hash(pin, 10);
    await prisma.studentWallet.update({
      where: { studentId },
      data: { transactionPin: hashed },
    });
    res.json({ message: 'PIN set successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/wallet/daily-limit', authenticateParent, async (req, res) => {
  try {
    const { studentId, dailyLimit } = req.body;
    if (!studentId || dailyLimit === undefined) return res.status(400).json({ error: 'studentId and dailyLimit required' });
    if (dailyLimit < 0) return res.status(400).json({ error: 'dailyLimit must be 0 or positive' });
    const student = await prisma.student.findFirst({ where: { id: studentId, parentEmail: req.parentEmail, schoolId: req.schoolId } });
    if (!student) return res.status(403).json({ error: 'Not your child' });
    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { dailyLimit },
    });
    res.json({ message: 'Daily limit updated', dailyLimit: updated.dailyLimit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
