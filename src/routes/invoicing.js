const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { createSimpleInvoice, createRepeatInvoice, checkInvoiceStatus } = require('../lib/hubtel-invoicing');

const router = Router();

router.post('/simple', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { studentId, phone, email, name, items, discounts, fees, taxes, note, dueDate } = req.body;
    if (!phone || !items || !items.length) return res.status(400).json({ error: 'phone and items required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const invoiceNumber = `INV-${Date.now().toString(36).slice(-10).toUpperCase()}`;
    const finalDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const result = await createSimpleInvoice({
      invoiceNumber,
      dueDate: finalDueDate,
      createdBy: req.user.name || req.user.email || 'Admin',
      customerName: name || '',
      customerPhoneNumber: phone,
      customerEmail: email || '',
      note: note || `Invoice from ${school.name || 'EDUPLATFORM'}`,
      items,
      discounts,
      fees,
      appliedTaxes: taxes,
      schoolCredentials: school,
    });

    if (result.code !== 201) {
      return res.status(400).json({ error: result.message || 'Invoice creation failed', code: result.code });
    }

    res.json({
      message: 'Invoice created',
      invoiceNumber,
      invoiceId: result.data?.invoiceId,
      paymentUrl: result.data?.paymentUrl,
    });
  } catch (err) {
    console.error('Simple invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/repeat', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { studentId, phone, email, name, items, discounts, fees, taxes, note, dueDate, frequency, autoDebit } = req.body;
    if (!phone || !items || !items.length || !frequency) {
      return res.status(400).json({ error: 'phone, items, and frequency required' });
    }
    if (!['Daily', 'Weekly', 'Monthly', 'Yearly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be: Daily, Weekly, Monthly, or Yearly' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const invoiceNumber = `INV-${Date.now().toString(36).slice(-10).toUpperCase()}`;
    const finalDueDate = dueDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const result = await createRepeatInvoice({
      invoiceNumber,
      dueDate: finalDueDate,
      createdBy: req.user.name || req.user.email || 'Admin',
      customerName: name || '',
      customerPhoneNumber: phone,
      customerEmail: email || '',
      note: note || `Repeat invoice from ${school.name || 'EDUPLATFORM'}`,
      items,
      frequency,
      shouldBeAutoDebited: autoDebit || false,
      discounts,
      fees,
      appliedTaxes: taxes,
      schoolCredentials: school,
    });

    if (result.code !== 201) {
      return res.status(400).json({ error: result.message || 'Invoice creation failed', code: result.code });
    }

    res.json({
      message: 'Repeat invoice created',
      invoiceNumber,
      invoiceId: result.data?.invoiceId,
      paymentUrl: result.data?.paymentUrl,
      frequency,
      autoDebit: autoDebit || false,
    });
  } catch (err) {
    console.error('Repeat invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:invoiceId', authenticate, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await checkInvoiceStatus({ invoiceId, schoolCredentials: school });
    res.json(result);
  } catch (err) {
    console.error('Invoice status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Invoicing webhook received:', JSON.stringify(req.body));
    const { Status, ResponseCode, Data } = req.body;
    const InvoiceId = Data?.InvoiceId;
    const AmountPaid = Data?.AmountPaid;
    const PaymentMethod = Data?.PaymentMethod;
    const ReceiptNumber = Data?.ReceiptNumber;

    if (ResponseCode === '0000') {
      console.log(`Invoice paid: ${InvoiceId} — GHS ${AmountPaid} via ${PaymentMethod} — Receipt: ${ReceiptNumber}`);
    } else {
      console.log(`Invoice failed: ${InvoiceId} — ResponseCode: ${ResponseCode}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Invoicing webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
