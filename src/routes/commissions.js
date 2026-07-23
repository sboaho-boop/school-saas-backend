const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { SERVICE_IDS, commissionQuery, commissionPayment } = require('../lib/hubtel-commission');

const router = Router();

router.get('/services', (req, res) => {
  res.json({
    airtime: [
      { id: 'MTN_AIRTIME', name: 'MTN Airtime', maxAmount: 100 },
      { id: 'TELECEL_AIRTIME', name: 'Telecel Airtime', maxAmount: 100 },
      { id: 'AT_AIRTIME', name: 'AirtelTigo Airtime', maxAmount: 100 },
    ],
    data: [
      { id: 'MTN_DATA', name: 'MTN Data Bundles', queryRequired: true },
      { id: 'TELECEL_DATA', name: 'Telecel Data Bundles', queryRequired: true },
      { id: 'AT_DATA', name: 'AirtelTigo Data Bundles', queryRequired: true },
    ],
    tv: [
      { id: 'DSTV', name: 'DSTV', queryRequired: true },
      { id: 'GOTV', name: 'GOtv', queryRequired: true },
      { id: 'STARTIMES', name: 'StarTimes TV', queryRequired: true },
    ],
    utility: [
      { id: 'ECG', name: 'ECG (Prepaid & PostPaid)', queryRequired: true },
      { id: 'GHANA_WATER', name: 'Ghana Water', queryRequired: true },
    ],
    broadband: [
      { id: 'TELECEL_BROADBAND', name: 'Telecel Broadband', queryRequired: true },
    ],
  });
});

router.get('/query/:service', authenticate, async (req, res) => {
  try {
    const { service } = req.params;
    const { destination } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination query param required' });

    const serviceId = SERVICE_IDS[service];
    if (!serviceId) return res.status(400).json({ error: 'Invalid service', validServices: Object.keys(SERVICE_IDS) });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await commissionQuery({ serviceId, destination, schoolCredentials: school });
    res.json(result);
  } catch (err) {
    console.error('Commission query error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/airtime', authenticate, async (req, res) => {
  try {
    const { destination, amount, service } = req.body;
    if (!destination || !amount) return res.status(400).json({ error: 'destination and amount required' });
    if (amount > 100) return res.status(400).json({ error: 'Maximum airtime is GHS 100' });

    const serviceKey = service || 'MTN_AIRTIME';
    const serviceId = SERVICE_IDS[serviceKey];
    if (!serviceId) return res.status(400).json({ error: 'Invalid service' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `AIR-${Date.now().toString(36).slice(-10)}`;

    const result = await commissionPayment({
      serviceId, destination, amount, clientReference: reference,
      description: `Airtime ${serviceKey} for ${destination}`,
      schoolCredentials: school,
    });

    res.json({ reference, result });
  } catch (err) {
    console.error('Airtime error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/data', authenticate, async (req, res) => {
  try {
    const { destination, amount, bundle, service } = req.body;
    if (!destination || !amount || !bundle) return res.status(400).json({ error: 'destination, amount, and bundle required' });

    const serviceKey = service || 'MTN_DATA';
    const serviceId = SERVICE_IDS[serviceKey];
    if (!serviceId) return res.status(400).json({ error: 'Invalid service' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `DAT-${Date.now().toString(36).slice(-10)}`;

    const result = await commissionPayment({
      serviceId, destination, amount, clientReference: reference,
      description: `Data bundle ${serviceKey} for ${destination}`,
      extradata: { bundle },
      schoolCredentials: school,
    });

    res.json({ reference, result });
  } catch (err) {
    console.error('Data bundle error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/tv', authenticate, async (req, res) => {
  try {
    const { destination, amount, service } = req.body;
    if (!destination || !amount) return res.status(400).json({ error: 'destination and amount required' });

    const serviceKey = service || 'DSTV';
    const serviceId = SERVICE_IDS[serviceKey];
    if (!serviceId) return res.status(400).json({ error: 'Invalid service' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `TV-${Date.now().toString(36).slice(-10)}`;

    const result = await commissionPayment({
      serviceId, destination, amount, clientReference: reference,
      description: `${serviceKey} payment for ${destination}`,
      schoolCredentials: school,
    });

    res.json({ reference, result });
  } catch (err) {
    console.error('TV payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/utility', authenticate, async (req, res) => {
  try {
    const { destination, amount, service, meterNumber, email, sessionId } = req.body;
    if (!destination || !amount) return res.status(400).json({ error: 'destination and amount required' });

    const serviceKey = service || 'ECG';
    const serviceId = SERVICE_IDS[serviceKey];
    if (!serviceId) return res.status(400).json({ error: 'Invalid service' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `UTL-${Date.now().toString(36).slice(-10)}`;

    let extradata = undefined;
    if (serviceKey === 'ECG' && meterNumber) {
      extradata = { bundle: meterNumber };
    } else if (serviceKey === 'GHANA_WATER' && meterNumber && email && sessionId) {
      extradata = { bundle: meterNumber, Email: email, SessionId: sessionId };
    }

    const result = await commissionPayment({
      serviceId, destination, amount, clientReference: reference,
      description: `${serviceKey} payment for ${destination}`,
      extradata,
      schoolCredentials: school,
    });

    res.json({ reference, result });
  } catch (err) {
    console.error('Utility payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/broadband', authenticate, async (req, res) => {
  try {
    const { destination, amount, broadbandNumber } = req.body;
    if (!destination || !amount || !broadbandNumber) {
      return res.status(400).json({ error: 'destination, amount, and broadbandNumber required' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = `BB-${Date.now().toString(36).slice(-10)}`;

    const result = await commissionPayment({
      serviceId: SERVICE_IDS.TELECEL_BROADBAND, destination, amount, clientReference: reference,
      description: `Broadband payment for ${destination}`,
      extradata: { bundle: broadbandNumber },
      schoolCredentials: school,
    });

    res.json({ reference, result });
  } catch (err) {
    console.error('Broadband payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Commission webhook received:', JSON.stringify(req.body));
    const data = req.body.Data || req.body;
    const ResponseCode = data.ResponseCode;
    const ClientReference = data.ClientReference;
    const commission = data.Meta?.Commission;

    if (ResponseCode === '0000') {
      console.log(`Commission success: ${ClientReference} — Amount: ${data.Amount} — Commission: ${commission}`);
    } else {
      console.log(`Commission failed: ${ClientReference} — ResponseCode: ${ResponseCode}`);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Commission webhook error:', err);
    res.status(200).json({ message: 'OK' });
  }
});

module.exports = router;
