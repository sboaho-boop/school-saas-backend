const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { sendFeeReceipt } = require('../lib/sms');
const { triggerNotification, NOTIFICATION_TYPES, getStudentGuardians } = require('../lib/notification-engine');

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

    if (student) {
      const guardians = await getStudentGuardians(req.schoolId, record.studentId);
      if (guardians.length > 0) {
        triggerNotification(req.schoolId, NOTIFICATION_TYPES.FEE_PAYMENT_RECEIVED, {
          title: `Fee payment received for ${record.studentName}`,
          message: `Payment of GHS ${payment} received. Outstanding balance: GHS ${newBalance}.`,
          recipients: guardians,
          smsMessage: `Fee payment of GHS ${payment} received for ${student.firstName}. Outstanding balance: GHS ${newBalance}. Thank you.`,
        }).catch(() => {});
      }
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
