const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendToBank, BANK_CODES } = require('../lib/hubtel-send-to-bank');

const router = Router();

router.get('/banks', (req, res) => {
  res.json(Object.entries(BANK_CODES).map(([name, code]) => ({ name, code })));
});

router.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { studentId, amount, bankAccountNumber, bankAccountName, bankCode, bankName, phone } = req.body;
    if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });
    if (amount < 1) return res.status(400).json({ error: 'Minimum withdrawal is GHS 1' });
    if (!bankAccountNumber) return res.status(400).json({ error: 'Bank account number required' });
    if (!bankCode) return res.status(400).json({ error: 'Bank code required' });

    const student = await prisma.student.findFirst({ where: { id: studentId, parentEmail: req.user.email, schoolId: req.schoolId } });
    if (!student) return res.status(403).json({ error: 'Not your child' });

    const wallet = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.frozen) return res.status(400).json({ error: 'Wallet is frozen' });
    if (wallet.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `WDR-${studentId.slice(0, 8)}-${Date.now().toString(36).slice(-6)}`;

    const result = await sendToBank({
      amount,
      bankAccountNumber,
      bankAccountName: bankAccountName || '',
      bankCode,
      bankName: bankName || '',
      recipientPhoneNumber: phone || '',
      description: `Wallet withdrawal for ${student.firstName} ${student.lastName}`,
      clientReference: reference,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/send-to-bank/hubtel-webhook`,
      schoolCredentials: school,
    });

    if (result.ResponseCode !== '0001') {
      return res.status(400).json({ error: result.Data?.Description || 'Withdrawal failed', code: result.ResponseCode });
    }

    await prisma.studentWallet.update({
      where: { studentId },
      data: { balance: { decrement: amount } },
    });

    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'withdrawal',
        amount: -amount,
        balanceAfter: wallet.balance - amount,
        method: 'bank_transfer',
        service: 'send_to_bank',
        reference,
        schoolId: req.schoolId,
      },
    });

    res.json({ message: 'Withdrawal initiated. You will receive the funds shortly.', reference, transactionId: result.Data?.TransactionId });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay-staff', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { staffId, amount, description } = req.body;
    if (!staffId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });

    const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId: req.schoolId } });
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    if (!staff.bankAccountNumber) return res.status(400).json({ error: 'Staff has no bank account on file' });
    if (!staff.bankCode) return res.status(400).json({ error: 'Staff has no bank code on file' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `SAL-${staffId.slice(0, 8)}-${Date.now().toString(36).slice(-6)}`;

    const result = await sendToBank({
      amount,
      bankAccountNumber: staff.bankAccountNumber,
      bankAccountName: staff.bankAccountName || staff.name,
      bankCode: staff.bankCode,
      bankName: staff.bankName || '',
      description: description || `Salary payment for ${staff.name}`,
      clientReference: reference,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/send-to-bank/hubtel-webhook`,
      schoolCredentials: school,
    });

    if (result.ResponseCode !== '0001') {
      return res.status(400).json({ error: result.Data?.Description || 'Payment failed', code: result.ResponseCode });
    }

    res.json({ message: 'Payment initiated', reference, transactionId: result.Data?.TransactionId });
  } catch (err) {
    console.error('Staff payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-pay-staff', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { payments, description } = req.body;
    if (!Array.isArray(payments) || payments.length === 0) return res.status(400).json({ error: 'No payments provided' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const results = [];

    for (const p of payments) {
      const staff = await prisma.staff.findFirst({ where: { id: p.staffId, schoolId: req.schoolId } });
      if (!staff || !staff.bankAccountNumber || !staff.bankCode) {
        results.push({ staffId: p.staffId, success: false, error: 'Staff not found or no bank details' });
        continue;
      }
      const reference = `SAL-${staff.id.slice(0, 8)}-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(-3)}`;
      try {
        const result = await sendToBank({
          amount: p.amount,
          bankAccountNumber: staff.bankAccountNumber,
          bankAccountName: staff.bankAccountName || staff.name,
          bankCode: staff.bankCode,
          bankName: staff.bankName || '',
          description: description || `Salary payment for ${staff.name}`,
          clientReference: reference,
          callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/send-to-bank/hubtel-webhook`,
          schoolCredentials: school,
        });
        results.push({ staffId: staff.id, name: staff.name, success: result.ResponseCode === '0001', reference, transactionId: result.Data?.TransactionId });
      } catch (err) {
        results.push({ staffId: staff.id, name: staff.name, success: false, error: err.message });
      }
    }

    res.json({ results, total: payments.length, successful: results.filter(r => r.success).length });
  } catch (err) {
    console.error('Bulk payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Send-To-Bank webhook received:', JSON.stringify(req.body));
    const data = req.body.Data || req.body;
    const ClientReference = data.ClientReference;
    const ResponseCode = data.ResponseCode;
    if (!ClientReference) return res.status(400).json({ error: 'Missing ClientReference' });

    if (ResponseCode === '0000') {
      console.log(`Send-To-Bank success: ${ClientReference} — ${data.Amount} to ${data.RecipientName}`);
    } else {
      console.log(`Send-To-Bank failed: ${ClientReference} — ResponseCode: ${ResponseCode} — ${data.Data?.Description}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Send-To-Bank webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
