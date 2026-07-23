const { Router } = require('express');
const https = require('https');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

const HUBTEL_STATUS_URL = 'https://api-txnstatus.hubtel.com/transactions';

function checkTransactionStatus(collectionAccount, clientReference, authHeader) {
  return new Promise((resolve, reject) => {
    const url = `${HUBTEL_STATUS_URL}/${collectionAccount}/status?clientReference=${encodeURIComponent(clientReference)}`;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch {
          resolve({ message: body });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

router.get('/status/:clientReference', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { clientReference } = req.params;
    if (!clientReference) return res.status(400).json({ error: 'clientReference required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const clientId = school.hubtelClientId || process.env.HUBTEL_CLIENT_ID;
    const clientSecret = school.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET;
    const collectionAccount = school.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT;

    if (!clientId || !clientSecret || !collectionAccount) {
      return res.status(400).json({ error: 'Hubtel credentials not configured' });
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const authHeader = `Basic ${auth}`;

    const result = await checkTransactionStatus(collectionAccount, clientReference, authHeader);
    res.json(result);
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status-all/:clientReference', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { clientReference } = req.params;
    if (!clientReference) return res.status(400).json({ error: 'clientReference required' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const clientId = school.hubtelClientId || process.env.HUBTEL_CLIENT_ID;
    const clientSecret = school.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET;
    const collectionAccount = school.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT;

    if (!clientId || !clientSecret || !collectionAccount) {
      return res.status(400).json({ error: 'Hubtel credentials not configured' });
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const authHeader = `Basic ${auth}`;

    const result = await checkTransactionStatus(collectionAccount, clientReference, authHeader);
    res.json(result);
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
