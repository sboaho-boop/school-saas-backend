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
      grades: { include: { student: true }, orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
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
