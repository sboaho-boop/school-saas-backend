const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

function sendMoney({ recipientName, recipientMsisdn, customerEmail, channel, amount, description, clientReference, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const disbursementAccount = schoolCredentials?.hubtelDisbursementAccount || '';

    if (!clientId || !clientSecret || !disbursementAccount) {
      return reject(new Error('Hubtel disbursement account not configured'));
    }

    if (!recipientMsisdn) {
      return reject(new Error('Recipient phone number is required'));
    }

    const normalizedPhone = recipientMsisdn.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    if (!['mtn-gh', 'vodafone-gh', 'tigo-gh'].includes(channel)) {
      return reject(new Error('Invalid channel. Must be: mtn-gh, vodafone-gh, or tigo-gh'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      RecipientName: recipientName || msisdn,
      RecipientMsisdn: msisdn,
      CustomerEmail: customerEmail || '',
      Channel: channel,
      Amount: amount,
      PrimaryCallbackURL: callbackUrl || `${BASE_URL}/api/send-money/hubtel-webhook`,
      Description: description || 'Send Money',
      ClientReference: clientReference,
    });

    const url = `https://smp.hubtel.com/api/merchants/${disbursementAccount}/send/mobilemoney`;
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Hubtel response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function checkSendMoneyStatus({ clientReference, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const disbursementAccount = schoolCredentials?.hubtelDisbursementAccount || '';

    if (!clientId || !clientSecret || !disbursementAccount) {
      return reject(new Error('Hubtel disbursement account not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const url = `https://smrsc.hubtel.com/api/merchants/${disbursementAccount}/transactions/status?clientReference=${clientReference}`;
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Hubtel response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { sendMoney, checkSendMoneyStatus };
