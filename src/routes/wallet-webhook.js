const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Wallet webhook received:', JSON.stringify(req.body));
    const data = req.body.Data || req.body;
    const ClientReference = data.ClientReference || data.OrderId;
    const Status = data.Status || data.Message;
    const ResponseCode = data.ResponseCode;
    if (!ClientReference) return res.status(400).json({ error: 'Missing ClientReference' });
    if (!ClientReference.startsWith('WL-')) return res.json({ message: 'Not a wallet top-up' });
    if (ResponseCode !== '0000' && Status !== 'Success' && Status !== 'success') {
      return res.json({ message: 'Payment not successful', ResponseCode, Status });
    }
    const parts = ClientReference.split('-');
    const studentId = parts[1];
    if (!studentId) return res.status(400).json({ error: 'Invalid reference format' });
    let wallet = await prisma.studentWallet.findUnique({ where: { studentId } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (wallet.pendingTopupRef !== ClientReference) return res.json({ message: 'Reference mismatch, already processed' });

    let amount = wallet.pendingTopupAmount || 0;
    if (data.Amount !== undefined && data.Amount !== null) {
      amount = data.AmountAfterCharges !== undefined ? data.AmountAfterCharges : data.Amount;
    }

    const updated = await prisma.studentWallet.update({
      where: { studentId },
      data: { balance: { increment: amount }, pendingTopupRef: null, pendingTopupAmount: null },
    });
    await prisma.transaction.create({
      data: { walletId: wallet.id, type: 'topup', amount, balanceAfter: updated.balance, method: 'mobile_money', service: 'wallet_topup', reference: ClientReference, schoolId: wallet.schoolId },
    });
    res.json({ message: 'Wallet credited', balance: updated.balance });
  } catch (err) {
    console.error('Wallet webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
