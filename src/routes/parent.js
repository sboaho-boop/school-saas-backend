const { Router } = require('express');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const students = await prisma.student.findMany({ where: { parentEmail: email } });
    if (students.length === 0) return res.status(404).json({ error: 'No students found for this email' });
    const token = signToken({ id: 'parent', email, role: 'parent' });
    res.json({ token, students: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, className: s.className })) });
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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/children', authenticateParent, async (req, res) => {
  const students = await prisma.student.findMany({
    where: { parentEmail: req.parentEmail },
    include: { wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
  });
  res.json(students);
});

router.get('/children/:id', authenticateParent, async (req, res) => {
  const student = await prisma.student.findFirst({
    where: { id: req.params.id, parentEmail: req.parentEmail },
    include: {
      wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } } },
      attendanceRecs: { orderBy: { date: 'desc' }, take: 30 },
      grades: { include: { student: true }, orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

router.post('/wallet/top-up', authenticateParent, async (req, res) => {
  try {
    const { studentId, amount } = req.body;
    if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });
    const student = await prisma.student.findFirst({ where: { id: studentId, parentEmail: req.parentEmail } });
    if (!student) return res.status(403).json({ error: 'Not your child' });
    let wallet = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (!wallet) {
      wallet = await prisma.studentWallet.create({ data: { studentId, studentName: `${student.firstName} ${student.lastName}` } });
    }
    const updated = await prisma.studentWallet.update({ where: { studentId }, data: { balance: { increment: amount } } });
    await prisma.transaction.create({ data: { walletId: wallet.id, type: 'topup', amount, balanceAfter: updated.balance, method: 'mobile_money', service: 'wallet_topup' } });
    res.json({ balance: updated.balance, message: `GHS ${amount} added successfully` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
