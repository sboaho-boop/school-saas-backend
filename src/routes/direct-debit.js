const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { preapprovalInitiate, preapprovalVerifyOtp, preapprovalStatus, preapprovalCancel, directDebitCharge, DIRECT_DEBIT_CHANNELS } = require('../lib/hubtel-direct-debit');

const router = Router();

router.post('/preapproval/initiate', authenticate, async (req, res) => {
  try {
    const { studentId, phone, channel } = req.body;
    if (!phone || !channel) return res.status(400).json({ error: 'Phone and channel required' });
    if (!['mtn-gh', 'vodafone-gh'].includes(channel)) {
      return res.status(400).json({ error: 'Channel must be: mtn-gh or vodafone-gh' });
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const clientReferenceId = `DD-${crypto.randomBytes(8).toString('hex').slice(0, 24)}`;

    const result = await preapprovalInitiate({
      phone: msisdn,
      channel,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/direct-debit/preapproval-webhook`,
      clientReferenceId,
      schoolCredentials: school,
    });

    if (result.responseCode !== '2000') {
      return res.status(400).json({ error: result.message || 'Preapproval failed', code: result.responseCode });
    }

    await prisma.directDebitPreapproval.upsert({
      where: { schoolId_phone: { schoolId: req.schoolId, phone: msisdn } },
      update: {
        studentId: studentId || null,
        channel,
        hubtelPreApprovalId: result.data?.hubtelPreApprovalId,
        clientReferenceId,
        verificationType: result.data?.verificationType,
        preapprovalStatus: 'PENDING',
      },
      create: {
        schoolId: req.schoolId,
        studentId: studentId || null,
        phone: msisdn,
        channel,
        hubtelPreApprovalId: result.data?.hubtelPreApprovalId,
        clientReferenceId,
        verificationType: result.data?.verificationType,
        preapprovalStatus: 'PENDING',
      },
    });

    res.json({
      message: result.data?.verificationType === 'USSD'
        ? 'USSD prompt sent. Please approve on your phone.'
        : 'OTP sent. Please verify with the code.',
      verificationType: result.data?.verificationType,
      otpPrefix: result.data?.otpPrefix,
      hubtelPreApprovalId: result.data?.hubtelPreApprovalId,
      clientReferenceId,
    });
  } catch (err) {
    console.error('Preapproval initiate error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/preapproval/verify-otp', authenticate, async (req, res) => {
  try {
    const { phone, hubtelPreApprovalId, clientReferenceId, otpCode } = req.body;
    if (!phone || !hubtelPreApprovalId || !clientReferenceId || !otpCode) {
      return res.status(400).json({ error: 'All fields required: phone, hubtelPreApprovalId, clientReferenceId, otpCode' });
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await preapprovalVerifyOtp({
      phone: msisdn,
      hubtelPreApprovalId,
      clientReferenceId,
      otpCode,
      schoolCredentials: school,
    });

    if (result.responseCode !== '2000') {
      return res.status(400).json({ error: result.message || 'OTP verification failed', code: result.responseCode });
    }

    await prisma.directDebitPreapproval.updateMany({
      where: { schoolId: req.schoolId, clientReferenceId },
      data: { preapprovalStatus: 'PENDING' },
    });

    res.json({ message: 'OTP verified. Awaiting final preapproval status.', preapprovalStatus: result.data?.preapprovalStatus });
  } catch (err) {
    console.error('Preapproval verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/preapproval/status/:clientReferenceId', authenticate, async (req, res) => {
  try {
    const { clientReferenceId } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await preapprovalStatus({ clientReferenceId, schoolCredentials: school });

    if (result.data?.preapprovalStatus) {
      await prisma.directDebitPreapproval.updateMany({
        where: { schoolId: req.schoolId, clientReferenceId },
        data: { preapprovalStatus: result.data.preapprovalStatus },
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Preapproval status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/preapproval/cancel/:phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.params;
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await preapprovalCancel({ phone: msisdn, schoolCredentials: school });

    if (result.responseCode === '2000') {
      await prisma.directDebitPreapproval.updateMany({
        where: { schoolId: req.schoolId, phone: msisdn },
        data: { preapprovalStatus: 'CANCELLED' },
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Preapproval cancel error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/preapprovals', authenticate, async (req, res) => {
  try {
    const preapprovals = await prisma.directDebitPreapproval.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(preapprovals);
  } catch (err) {
    console.error('List preapprovals error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/charge', authenticate, async (req, res) => {
  try {
    const { studentId, phone, amount, description } = req.body;
    if (!phone || !amount || amount <= 0) return res.status(400).json({ error: 'Phone and valid amount required' });

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const preapproval = await prisma.directDebitPreapproval.findFirst({
      where: { schoolId: req.schoolId, phone: msisdn, preapprovalStatus: 'APPROVED' },
    });
    if (!preapproval) {
      return res.status(400).json({ error: 'No approved preapproval for this number. Complete preapproval first.' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    let studentName = 'Customer';
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
      if (student) studentName = `${student.firstName} ${student.lastName}`;
    }

    const reference = `DDC-${msisdn.slice(-4)}-${Date.now().toString(36).slice(-8)}`;

    const result = await directDebitCharge({
      customerName: studentName,
      customerMsisdn: msisdn,
      channel: preapproval.channel,
      amount,
      description: description || `Direct debit for ${studentName}`,
      clientReference: reference,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/wallet/hubtel-webhook`,
      schoolCredentials: school,
    });

    if (result.ResponseCode !== '0001') {
      return res.status(400).json({ error: result.Message || 'Charge failed', code: result.ResponseCode });
    }

    res.json({ message: 'Direct debit initiated', reference, transactionId: result.Data?.TransactionId });
  } catch (err) {
    console.error('Direct debit charge error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/preapproval-webhook', async (req, res) => {
  try {
    console.log('Direct Debit preapproval webhook:', JSON.stringify(req.body));
    const { CustomerMsisdn, PreapprovalStatus, HubtelPreapprovalId, ClientReferenceId } = req.body;

    if (ClientReferenceId) {
      const updated = await prisma.directDebitPreapproval.updateMany({
        where: { clientReferenceId: ClientReferenceId },
        data: {
          preapprovalStatus: PreapprovalStatus || 'UNKNOWN',
          hubtelPreApprovalId: HubtelPreapprovalId || undefined,
        },
      });
      console.log(`Preapproval ${ClientReferenceId}: ${PreapprovalStatus} (updated ${updated.count} records)`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Preapproval webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
