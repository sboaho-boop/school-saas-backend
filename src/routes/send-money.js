const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendMoney, checkSendMoneyStatus } = require('../lib/hubtel-send-money');

const router = Router();

router.post('/send', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { recipientName, recipientMsisdn, recipientPhone, customerEmail, channel, amount, description } = req.body;
    const phone = recipientMsisdn || recipientPhone;
    if (!phone || !amount || amount <= 0 || !channel) {
      return res.status(400).json({ error: 'recipientPhone, amount, and channel required' });
    }
    if (!['mtn-gh', 'vodafone-gh', 'tigo-gh'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be: mtn-gh, vodafone-gh, or tigo-gh' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (!school.hubtelDisbursementAccount) return res.status(400).json({ error: 'Disbursement account not configured' });

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    const clientReference = `SM-${crypto.randomBytes(8).toString('hex').slice(0, 24)}`;

    const result = await sendMoney({
      recipientName: recipientName || '',
      recipientMsisdn: msisdn,
      customerEmail: customerEmail || '',
      channel,
      amount,
      description: description || `Send money to ${msisdn}`,
      clientReference,
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:4000'}/api/send-money/hubtel-webhook`,
      schoolCredentials: school,
    });

    if (result.ResponseCode !== '0001') {
      return res.status(400).json({ error: result.Data?.Description || result.Message || 'Send money failed', code: result.ResponseCode });
    }

    res.json({
      message: 'Send money initiated',
      clientReference,
      transactionId: result.Data?.TransactionId,
      amount,
      recipient: msisdn,
    });
  } catch (err) {
    console.error('Send money error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:clientReference', authenticate, async (req, res) => {
  try {
    const { clientReference } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await checkSendMoneyStatus({ clientReference, schoolCredentials: school });
    res.json(result);
  } catch (err) {
    console.error('Send money status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Send money webhook received:', JSON.stringify(req.body));
    const { ResponseCode, Data } = req.body;

    if (ResponseCode === '0000') {
      console.log(`Send money success: ${Data?.ClientReference} — GHS ${Data?.Amount} to ${Data?.RecipientName} — Txn: ${Data?.TransactionId}`);
    } else {
      console.log(`Send money failed: ${Data?.ClientReference} — Code: ${ResponseCode} — ${Data?.Description}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Send money webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
