const { Router } = require('express');
const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { sendAttendanceAlert, sendLowBalanceAlert } = require('../lib/sms');

const router = Router();
router.use(authenticate);

const tapTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tapTokens) {
    if (now - data.createdAt > 180000) tapTokens.delete(token);
  }
}, 60000);

router.get('/', async (req, res) => {
  const wallets = await prisma.studentWallet.findMany({
    where: { schoolId: req.schoolId },
    include: { student: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(wallets);
});

router.get('/:studentId', async (req, res) => {
  const wallet = await prisma.studentWallet.findFirst({
    where: { studentId: req.params.studentId, schoolId: req.schoolId },
    include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  res.json(wallet);
});

router.post('/create', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, cardUid } = req.body;
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const existing = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (existing) return res.status(400).json({ error: 'Wallet already exists' });
    const wallet = await prisma.studentWallet.create({
      data: { studentId, studentName: `${student.firstName} ${student.lastName}`, cardUid: cardUid || null, schoolId: req.schoolId },
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
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId, schoolId: req.schoolId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { balance: { increment: amount } },
    });
    const tx = await prisma.transaction.create({
      data: { walletId: wallet.id, type: 'topup', amount, balanceAfter: updated.balance, method: method || 'cash', service: 'topup', schoolId: req.schoolId },
    });
    res.json({ wallet: updated, transaction: tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function findWalletByUid(uid, schoolId) {
  if (!uid) return null;
  return prisma.studentWallet.findFirst({
    where: {
      schoolId,
      OR: [{ cardUid: uid }, { wristbandUid: uid }],
    },
  });
}

async function resetDailySpend(wallet) {
  const today = new Date().toISOString().split('T')[0];
  if (wallet.lastSpentReset !== today) {
    return prisma.studentWallet.update({
      where: { id: wallet.id },
      data: { todaySpent: 0, lastSpentReset: today },
    });
  }
  return wallet;
}

router.post('/tap', async (req, res) => {
  try {
    const { uid, service, amount, terminalId } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required (card or wristband)' });

    const wallet = await findWalletByUid(uid, req.schoolId);
    if (!wallet) return res.status(404).json({ error: 'Card/wristband not linked to any wallet' });
    if (wallet.frozen) return res.status(403).json({ error: 'Card is frozen' });

    const student = await prisma.student.findUnique({ where: { id: wallet.studentId } });

    if (service === 'attendance') {
      const today = new Date().toISOString().split('T')[0];
      const existing = await prisma.attendance.findFirst({ where: { studentId: wallet.studentId, date: today } });
      let attendance;
      if (existing) {
        attendance = await prisma.attendance.update({ where: { id: existing.id }, data: { status: 'present' } });
      } else {
        attendance = await prisma.attendance.create({
          data: { studentId: wallet.studentId, studentName: wallet.studentName, classId: student?.classId || '', className: student?.className || '', date: today, status: 'present', schoolId: wallet.schoolId },
        });
      }
      if (student && student.parentPhone) {
        sendAttendanceAlert(student.parentPhone, wallet.studentName, 'present').catch(() => {});
      }
      return res.json({ message: 'Attendance marked', student: wallet.studentName, attendance });
    }

    if (amount) {
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount required for payment' });
      if (wallet.balance < amount) return res.status(403).json({ error: 'Insufficient balance', balance: wallet.balance });

      const fresh = await resetDailySpend(wallet);
      if (fresh.dailyLimit > 0 && fresh.todaySpent + amount > fresh.dailyLimit) {
        return res.status(403).json({ error: 'Daily limit exceeded', limit: fresh.dailyLimit, todaySpent: fresh.todaySpent });
      }

      const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
      const threshold = school?.pinThreshold || 20;

      if (wallet.transactionPin && amount >= threshold) {
        const tapToken = crypto.randomBytes(16).toString('hex');
        tapTokens.set(tapToken, {
          walletId: wallet.id,
          amount,
          service: service || 'payment',
          terminalId: terminalId || '',
          studentName: wallet.studentName,
          schoolId: wallet.schoolId,
          createdAt: Date.now(),
          attempts: 0,
        });
        return res.json({ pinRequired: true, tapToken, message: 'PIN required for this transaction' });
      }

      const updated = await prisma.studentWallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount }, totalSpent: { increment: amount }, todaySpent: { increment: amount } },
      });
      const tx = await prisma.transaction.create({
        data: { walletId: wallet.id, type: 'payment', amount: -amount, balanceAfter: updated.balance, method: 'card', service: service || 'payment', terminalId: terminalId || '', schoolId: wallet.schoolId },
      });
      if (updated.balance < 5 && student && student.parentPhone) {
        sendLowBalanceAlert(student.parentPhone, wallet.studentName, updated.balance).catch(() => {});
      }
      return res.json({ message: 'Payment successful', student: wallet.studentName, balance: updated.balance, transaction: tx });
    }

    res.json({ message: 'Card/wristband scanned', student: wallet.studentName, balance: wallet.balance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tap/confirm', async (req, res) => {
  try {
    const { tapToken, pin } = req.body;
    if (!tapToken || !pin) return res.status(400).json({ error: 'tapToken and pin required' });

    const data = tapTokens.get(tapToken);
    if (!data) return res.status(400).json({ error: 'Invalid or expired tap token' });

    data.attempts++;
    if (data.attempts > 5) {
      tapTokens.delete(tapToken);
      const wallet = await prisma.studentWallet.findUnique({ where: { id: data.walletId } });
      if (wallet) await prisma.studentWallet.update({ where: { id: data.walletId }, data: { frozen: true } });
      return res.status(403).json({ error: 'Too many failed PIN attempts — wallet frozen' });
    }

    const wallet = await prisma.studentWallet.findUnique({ where: { id: data.walletId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.frozen) return res.status(403).json({ error: 'Wallet is frozen' });
    if (!wallet.transactionPin) return res.status(400).json({ error: 'No PIN set on this wallet' });

    const valid = await bcrypt.compare(pin, wallet.transactionPin);
    if (!valid) return res.status(403).json({ error: 'Incorrect PIN', attemptsRemaining: 5 - data.attempts });

    tapTokens.delete(tapToken);

    if (wallet.balance < data.amount) return res.status(403).json({ error: 'Insufficient balance', balance: wallet.balance });

    const fresh = await resetDailySpend(wallet);
    if (fresh.dailyLimit > 0 && fresh.todaySpent + data.amount > fresh.dailyLimit) {
      return res.status(403).json({ error: 'Daily limit exceeded', limit: fresh.dailyLimit, todaySpent: fresh.todaySpent });
    }

    const updated = await prisma.studentWallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: data.amount }, totalSpent: { increment: data.amount }, todaySpent: { increment: data.amount } },
    });
    const tx = await prisma.transaction.create({
      data: { walletId: wallet.id, type: 'payment', amount: -data.amount, balanceAfter: updated.balance, method: 'card', service: data.service || 'payment', terminalId: data.terminalId || '', schoolId: data.schoolId },
    });
    const student = await prisma.student.findUnique({ where: { id: wallet.studentId } });
    if (updated.balance < 5 && student && student.parentPhone) {
      sendLowBalanceAlert(student.parentPhone, wallet.studentName, updated.balance).catch(() => {});
    }
    res.json({ message: 'Payment successful', student: wallet.studentName, balance: updated.balance, transaction: tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/freeze/:studentId', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId: req.params.studentId, schoolId: req.schoolId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { studentId: req.params.studentId },
      data: { frozen: true },
    });
    await logAudit(req, 'freeze', 'wallet', wallet.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/unfreeze/:studentId', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId: req.params.studentId, schoolId: req.schoolId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { studentId: req.params.studentId },
      data: { frozen: false },
    });
    await logAudit(req, 'unfreeze', 'wallet', wallet.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/generate-card', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const chars = '0123456789ABCDEF';
    let cardUid;
    let attempts = 0;
    do {
      cardUid = 'EDU-';
      for (let i = 0; i < 8; i++) cardUid += chars[Math.floor(Math.random() * chars.length)];
      attempts++;
    } while (await prisma.studentWallet.findFirst({ where: { cardUid } }) && attempts < 50);

    if (attempts >= 50) return res.status(500).json({ error: 'Failed to generate unique card UID' });

    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      create: { studentId, studentName: `${student.firstName} ${student.lastName}`, cardUid, schoolId: req.schoolId },
      update: { cardUid },
    });
    await logAudit(req, 'generate-card', 'wallet', wallet.id, { studentId, cardUid });
    res.json({ cardUid, wallet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/link-card', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, cardUid } = req.body;
    if (!studentId || !cardUid) return res.status(400).json({ error: 'studentId and cardUid required' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const existing = await prisma.studentWallet.findFirst({ where: { cardUid } });
    if (existing && existing.studentId !== studentId) return res.status(400).json({ error: 'Card already linked to another student' });
    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      create: { studentId, studentName: `${student.firstName} ${student.lastName}`, cardUid, schoolId: req.schoolId },
      update: { cardUid },
    });
    await logAudit(req, 'link-card', 'wallet', wallet.id, { studentId, cardUid });
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/transactions/:studentId', async (req, res) => {
  const wallet = await prisma.studentWallet.findFirst({ where: { studentId: req.params.studentId, schoolId: req.schoolId } });
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  const transactions = await prisma.transaction.findMany({
    where: { walletId: wallet.id, schoolId: req.schoolId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(transactions);
});

router.get('/zpl/:studentId', async (req, res) => {
  try {
    const { generateCardZpl } = require('../lib/zpl');
    const wallet = await prisma.studentWallet.findFirst({
      where: { studentId: req.params.studentId, schoolId: req.schoolId },
      include: { student: true },
    });
    if (!wallet || !wallet.cardUid) return res.status(404).json({ error: 'No card found' });
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const zpl = generateCardZpl({
      schoolName: school?.name || 'EduPlatform',
      studentName: wallet.studentName,
      cardUid: wallet.cardUid,
    });
    res.set('Content-Type', 'application/x-zpl');
    res.set('Content-Disposition', `attachment; filename="${wallet.cardUid}.zpl"`);
    res.send(zpl);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/zpl-bulk', async (req, res) => {
  try {
    const { generateBatchZpl } = require('../lib/zpl');
    const wallets = await prisma.studentWallet.findMany({
      where: { schoolId: req.schoolId, cardUid: { not: null } },
      include: { student: true },
    });
    if (wallets.length === 0) return res.status(404).json({ error: 'No cards to export' });
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const cards = wallets.map((w) => ({
      schoolName: school?.name || 'EduPlatform',
      studentName: w.studentName,
      cardUid: w.cardUid,
    }));
    const zpl = generateBatchZpl(cards);
    res.set('Content-Type', 'application/x-zpl');
    res.set('Content-Disposition', 'attachment; filename="all-cards.zpl"');
    res.send(zpl);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/link-wristband', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, wristbandUid } = req.body;
    if (!studentId || !wristbandUid) return res.status(400).json({ error: 'studentId and wristbandUid required' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const existing = await prisma.studentWallet.findFirst({ where: { wristbandUid } });
    if (existing && existing.studentId !== studentId) return res.status(400).json({ error: 'Wristband already linked to another student' });
    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      create: { studentId, studentName: `${student.firstName} ${student.lastName}`, wristbandUid, schoolId: req.schoolId },
      update: { wristbandUid },
    });
    await logAudit(req, 'link-wristband', 'wallet', wallet.id, { studentId, wristbandUid });
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/pin', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, pin } = req.body;
    if (!studentId || !pin) return res.status(400).json({ error: 'studentId and pin required' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId, schoolId: req.schoolId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const hashed = await bcrypt.hash(pin, 10);
    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { transactionPin: hashed },
    });
    await logAudit(req, 'set-pin', 'wallet', wallet.id);
    res.json({ message: 'PIN set successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/daily-limit', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { studentId, dailyLimit } = req.body;
    if (!studentId || dailyLimit === undefined) return res.status(400).json({ error: 'studentId and dailyLimit required' });
    if (dailyLimit < 0) return res.status(400).json({ error: 'dailyLimit must be 0 or positive' });
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId, schoolId: req.schoolId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { dailyLimit },
    });
    await logAudit(req, 'set-daily-limit', 'wallet', wallet.id, { dailyLimit });
    res.json({ message: 'Daily limit updated', dailyLimit: updated.dailyLimit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
