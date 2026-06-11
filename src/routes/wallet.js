const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const wallets = await prisma.studentWallet.findMany({ include: { student: true }, orderBy: { createdAt: 'desc' } });
  res.json(wallets);
});

router.get('/:studentId', async (req, res) => {
  const wallet = await prisma.studentWallet.findUnique({ where: { studentId: req.params.studentId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } } });
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  res.json(wallet);
});

router.post('/create', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, cardUid } = req.body;
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const existing = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (existing) return res.status(400).json({ error: 'Wallet already exists' });
    const wallet = await prisma.studentWallet.create({
      data: { studentId, studentName: `${student.firstName} ${student.lastName}`, cardUid: cardUid || null },
    });
    await logAudit(req, 'create', 'wallet', wallet.id, { studentId });
    res.status(201).json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/top-up', requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { studentId, amount, method } = req.body;
    if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const wallet = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { balance: { increment: amount } },
    });
    const tx = await prisma.transaction.create({
      data: { walletId: wallet.id, type: 'topup', amount, balanceAfter: updated.balance, method: method || 'cash', service: 'topup' },
    });
    res.json({ wallet: updated, transaction: tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tap', async (req, res) => {
  try {
    const { cardUid, service, amount, terminalId } = req.body;
    if (!cardUid) return res.status(400).json({ error: 'cardUid required' });
    const wallet = await prisma.studentWallet.findFirst({ where: { cardUid } });
    if (!wallet) return res.status(404).json({ error: 'Card not linked to any wallet' });
    if (wallet.frozen) return res.status(403).json({ error: 'Card is frozen' });

    const student = await prisma.student.findUnique({ where: { id: wallet.studentId } });

    if (service === 'attendance') {
      const today = new Date().toISOString().split('T')[0];
      const existing = await prisma.attendance.findFirst({ where: { studentId: wallet.studentId, date: today } });
      if (existing) {
        const updated = await prisma.attendance.update({ where: { id: existing.id }, data: { status: 'present' } });
        return res.json({ message: 'Attendance marked', student: wallet.studentName, attendance: updated });
      }
      const attendance = await prisma.attendance.create({
        data: { studentId: wallet.studentId, studentName: wallet.studentName, classId: student?.classId || '', className: student?.className || '', date: today, status: 'present' },
      });
      return res.json({ message: 'Attendance marked', student: wallet.studentName, attendance });
    }

    if (service === 'payment' || amount) {
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount required for payment' });
      if (wallet.balance < amount) return res.status(403).json({ error: 'Insufficient balance', balance: wallet.balance });

      const updated = await prisma.studentWallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount }, totalSpent: { increment: amount } },
      });
      const tx = await prisma.transaction.create({
        data: { walletId: wallet.id, type: 'payment', amount: -amount, balanceAfter: updated.balance, method: 'card', service: service || 'payment', terminalId: terminalId || '' },
      });
      return res.json({ message: 'Payment successful', student: wallet.studentName, balance: updated.balance, transaction: tx });
    }

    res.json({ message: 'Card scanned', student: wallet.studentName, balance: wallet.balance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/freeze/:studentId', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const wallet = await prisma.studentWallet.update({
      where: { studentId: req.params.studentId },
      data: { frozen: true },
    });
    await logAudit(req, 'freeze', 'wallet', wallet.id);
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/unfreeze/:studentId', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const wallet = await prisma.studentWallet.update({
      where: { studentId: req.params.studentId },
      data: { frozen: false },
    });
    await logAudit(req, 'unfreeze', 'wallet', wallet.id);
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/link-card', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, cardUid } = req.body;
    if (!studentId || !cardUid) return res.status(400).json({ error: 'studentId and cardUid required' });
    const existing = await prisma.studentWallet.findFirst({ where: { cardUid } });
    if (existing && existing.studentId !== studentId) return res.status(400).json({ error: 'Card already linked to another student' });
    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      create: { studentId, studentName: '', cardUid },
      update: { cardUid },
    });
    await logAudit(req, 'link-card', 'wallet', wallet.id, { studentId, cardUid });
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/transactions/:studentId', async (req, res) => {
  const wallet = await prisma.studentWallet.findUnique({ where: { studentId: req.params.studentId } });
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  const transactions = await prisma.transaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(transactions);
});

module.exports = router;
