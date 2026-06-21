const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { sendFeeReceipt } = require('../lib/sms');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const records = await prisma.feeRecord.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { dueDate: 'asc' },
  });
  res.json(records);
});

router.post('/', async (req, res) => {
  try {
    const { studentId, studentName, amount, dueDate } = req.body;
    const record = await prisma.feeRecord.create({
      data: { studentId, studentName, amount: parseFloat(amount), balance: parseFloat(amount), dueDate, status: 'unpaid', schoolId: req.schoolId },
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/pay', async (req, res) => {
  try {
    const record = await prisma.feeRecord.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!record) return res.status(404).json({ error: 'Not found' });
    const payment = parseFloat(req.body.amount);
    const newPaid = record.paid + payment;
    const newBalance = record.amount - newPaid;
    const status = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : record.status;
    const updated = await prisma.feeRecord.update({
      where: { id: req.params.id },
      data: { paid: newPaid, balance: newBalance, status },
    });

    const student = await prisma.student.findFirst({ where: { id: record.studentId, schoolId: req.schoolId } });
    if (student && student.parentPhone) {
      sendFeeReceipt(student.parentPhone, student.firstName, payment, newBalance).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const record = await prisma.feeRecord.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!record) return res.status(404).json({ error: 'Not found' });
    await prisma.feeRecord.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
