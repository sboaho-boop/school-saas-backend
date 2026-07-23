const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { initiateRefund } = require('../lib/hubtel-refund');

const router = Router();

router.post('/:orderId', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { callbackUrl } = req.body;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const webhookBase = process.env.BACKEND_URL || 'http://localhost:4000';
    const finalCallbackUrl = callbackUrl || `${webhookBase}/api/refund/hubtel-webhook`;

    const result = await initiateRefund({
      orderId,
      accountNumber: school.hubtelMerchantAccount,
      callbackUrl: finalCallbackUrl,
      credentials: {
        clientId: school.hubtelClientId,
        clientSecret: school.hubtelClientSecret,
      },
    });

    if (result?.responseCode === '0001') {
      res.json({ message: 'Refund pending — awaiting callback', orderId, status: 'pending' });
    } else if (result?.responseCode === '3000') {
      res.status(404).json({ error: 'Order not found', orderId });
    } else if (result?.responseCode === '4509') {
      res.status(400).json({ error: 'Order not eligible for refund', orderId });
    } else if (result?.responseCode === '4515') {
      res.status(409).json({ error: 'Refund already in progress', orderId, status: 'processing' });
    } else if (result?.responseCode === '4000') {
      res.status(400).json({ error: 'Cannot refund — amount is less than GHS 1', orderId });
    } else {
      res.status(400).json({ error: result?.message || 'Refund failed', orderId });
    }
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Refund webhook received:', JSON.stringify(req.body));
    const { responseCode, message, data } = req.body;

    if (responseCode === '0000') {
      console.log(`Refund successful: Order ${data?.orderId} — GHS ${data?.amount} — Txn ID: ${data?.externalTransactionId}`);
    } else {
      console.log(`Refund failed: Order ${data?.orderId} — Code: ${responseCode} — ${message}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Refund webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
