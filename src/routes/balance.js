const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getCollectionBalance,
  getDisbursementBalance,
  transferToDisbursement,
  getTransferStatus,
} = require('../lib/hubtel-balance');

const router = Router();

router.get('/collection', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await getCollectionBalance({
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelClientId, clientSecret: school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Collection balance error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/disbursement', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (!school.hubtelDisbursementAccount) return res.status(400).json({ error: 'Disbursement account not configured' });

    const result = await getDisbursementBalance({
      accountNumber: school.hubtelDisbursementAccount,
      credentials: { clientId: school.hubtelClientId, clientSecret: school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Disbursement balance error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/transfer', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (!school.hubtelDisbursementAccount) return res.status(400).json({ error: 'Disbursement account not configured' });

    const clientReference = 'TXF-' + crypto.randomBytes(8).toString('hex');
    const webhookBase = process.env.BACKEND_URL || 'http://localhost:4000';

    const result = await transferToDisbursement({
      accountNumber: school.hubtelMerchantAccount,
      amount,
      destinationAccountNumber: school.hubtelDisbursementAccount,
      description: description || `Transfer to disbursement — ${school.name}`,
      clientReference,
      callbackUrl: `${webhookBase}/api/balance/hubtel-webhook`,
      credentials: { clientId: school.hubtelClientId, clientSecret: school.hubtelClientSecret },
    });

    res.json({ message: 'Transfer initiated', clientReference, result });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/transfer-status/:clientReference', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { clientReference } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await getTransferStatus({
      accountNumber: school.hubtelMerchantAccount,
      clientReference,
      credentials: { clientId: school.hubtelClientId, clientSecret: school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Transfer status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Balance transfer webhook received:', JSON.stringify(req.body));
    const { ResponseCode, Data } = req.body;

    if (ResponseCode === '0000') {
      console.log(`Transfer success: ${Data?.ClientReference} — GHS ${Data?.Amount} to ${Data?.RecipientName}`);
    } else {
      console.log(`Transfer failed: ${Data?.ClientReference} — ${req.body.Message}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Balance webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
