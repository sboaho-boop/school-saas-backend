const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { createInvoice, verifyInvoice, cancelInvoice, INTERVALS } = require('../lib/hubtel-recurring-invoice');

const router = Router();

router.get('/intervals', (req, res) => {
  res.json(INTERVALS);
});

router.post('/create', authenticate, async (req, res) => {
  try {
    const { studentId, phone, channel, amount, description, paymentInterval, startTime, invoiceEndDate } = req.body;
    if (!phone || !amount || !paymentInterval) {
      return res.status(400).json({ error: 'Phone, amount, and paymentInterval required' });
    }
    if (!['mtn-gh', 'vodafone-gh'].includes(channel)) {
      return res.status(400).json({ error: 'Channel must be: mtn-gh or vodafone-gh' });
    }
    if (!INTERVALS.includes(paymentInterval)) {
      return res.status(400).json({ error: `paymentInterval must be one of: ${INTERVALS.join(', ')}` });
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const now = new Date();
    const endDate = invoiceEndDate
      ? new Date(invoiceEndDate)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    let studentName = 'Customer';
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
      if (student) studentName = `${student.firstName} ${student.lastName}`;
    }

    const result = await createInvoice({
      orderDate: now.toISOString().replace(/\.\d{3}Z$/, ''),
      invoiceEndDate: endDate.toISOString().replace(/\.\d{3}Z$/, ''),
      description: description || `EDUPLATFORM recurring payment for ${studentName}`,
      startTime: startTime || '10:00',
      paymentInterval,
      customerMobileNumber: msisdn,
      customerName: studentName,
      channel,
      recurringAmount: amount,
      totalAmount: amount,
      initialAmount: amount,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/recurring-invoice/hubtel-webhook`,
      schoolCredentials: school,
    });

    if (result.responseCode !== '0001') {
      return res.status(400).json({ error: result.message || 'Invoice creation failed', code: result.responseCode });
    }

    const invoice = await prisma.recurringInvoice.create({
      data: {
        schoolId: req.schoolId,
        studentId: studentId || null,
        phone: msisdn,
        channel,
        recurringInvoiceId: result.data?.recurringInvoiceId,
        requestId: result.data?.requestId,
        description: description || `EDUPLATFORM recurring payment for ${studentName}`,
        paymentInterval,
        recurringAmount: amount,
        initialAmount: amount,
        startTime: startTime || '10:00',
        orderDate: now.toISOString().replace(/\.\d{3}Z$/, ''),
        invoiceEndDate: endDate.toISOString().replace(/\.\d{3}Z$/, ''),
        status: 'PENDING',
      },
    });

    res.json({
      message: 'OTP sent. Please verify to activate recurring payments.',
      recurringInvoiceId: result.data?.recurringInvoiceId,
      requestId: result.data?.requestId,
      otpPrefix: result.data?.otpPrefix,
      invoiceId: invoice.id,
    });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify', authenticate, async (req, res) => {
  try {
    const { recurringInvoiceId, requestId, otpCode } = req.body;
    if (!recurringInvoiceId || !requestId || !otpCode) {
      return res.status(400).json({ error: 'recurringInvoiceId, requestId, and otpCode required' });
    }

    const result = await verifyInvoice({ recurringInvoiceId, requestId, otpCode });

    if (result.responseCode !== '0001') {
      return res.status(400).json({ error: result.message || 'Verification failed', code: result.responseCode });
    }

    await prisma.recurringInvoice.updateMany({
      where: { recurringInvoiceId },
      data: { status: 'ACTIVE' },
    });

    res.json({ message: 'Recurring invoice activated. Payments will be debited automatically.', recurringInvoiceId: result.data?.recurringInvoiceId });
  } catch (err) {
    console.error('Verify invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/cancel/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.recurringInvoice.findFirst({ where: { id, schoolId: req.schoolId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.recurringInvoiceId) return res.status(400).json({ error: 'No Hubtel invoice ID' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const result = await cancelInvoice({ recurringInvoiceId: invoice.recurringInvoiceId, schoolCredentials: school });

    if (result.responseCode !== '0000') {
      return res.status(400).json({ error: result.message || 'Cancellation failed', code: result.responseCode });
    }

    await prisma.recurringInvoice.update({ where: { id }, data: { status: 'CANCELLED' } });
    res.json({ message: 'Recurring invoice cancelled' });
  } catch (err) {
    console.error('Cancel invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', authenticate, async (req, res) => {
  try {
    const invoices = await prisma.recurringInvoice.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Recurring invoice webhook:', JSON.stringify(req.body));
    const data = req.body.Data || req.body;
    const ResponseCode = data.ResponseCode;
    const RecurringInvoiceId = data.RecurringInvoiceId;

    if (RecurringInvoiceId) {
      if (ResponseCode === '0000' || ResponseCode === '0001') {
        await prisma.recurringInvoice.updateMany({
          where: { recurringInvoiceId: RecurringInvoiceId },
          data: { status: 'ACTIVE' },
        });
      } else if (ResponseCode === '0005') {
        await prisma.recurringInvoice.updateMany({
          where: { recurringInvoiceId: RecurringInvoiceId },
          data: { status: 'CANCELLED' },
        });
      } else if (ResponseCode === '2001') {
        await prisma.recurringInvoice.updateMany({
          where: { recurringInvoiceId: RecurringInvoiceId },
          data: { status: 'FAILED' },
        });
      }
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Recurring invoice webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
