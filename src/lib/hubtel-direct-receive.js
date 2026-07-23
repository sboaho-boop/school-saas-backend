const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

function directReceiveMoney({ customerName, customerMsisdn, customerEmail, channel, amount, description, clientReference, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    if (!customerMsisdn) {
      return reject(new Error('Customer phone number is required'));
    }

    const normalizedPhone = customerMsisdn.replace(/[^0-9]/g, '');
    const msisdn = normalizedPhone.startsWith('233') ? normalizedPhone : `233${normalizedPhone.replace(/^0/, '')}`;

    if (!['mtn-gh', 'vodafone-gh', 'tigo-gh'].includes(channel)) {
      return reject(new Error('Invalid channel. Must be: mtn-gh, vodafone-gh, or tigo-gh'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      CustomerName: customerName || '',
      CustomerMsisdn: msisdn,
      CustomerEmail: customerEmail || '',
      Channel: channel,
      Amount: amount,
      PrimaryCallbackUrl: callbackUrl || `${BASE_URL}/api/wallet/hubtel-webhook`,
      Description: description || 'Wallet Top-Up',
      ClientReference: clientReference,
    });

    const url = `https://rmp.hubtel.com/merchantaccount/merchants/${collectionAccount}/receive/mobilemoney`;
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
          const data = JSON.parse(body);
          resolve(data);
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

module.exports = { directReceiveMoney };
