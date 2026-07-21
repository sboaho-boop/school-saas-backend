const https = require('https');

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID || '';
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET || '';
const HUBTEL_MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT || '';
const HUBTEL_CHECKOUT_URL = process.env.HUBTEL_CHECKOUT_URL || 'https://api.hubtel.com/v1/merchantaccount/onlinecheckout';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function createCheckout({ amount, title, description, clientReference, payeeName, payeeEmail, payeeMobileNumber, callbackUrl, returnUrl, cancellationUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || HUBTEL_CLIENT_ID;
    const clientSecret = schoolCredentials?.hubtelClientSecret || HUBTEL_CLIENT_SECRET;
    const merchantAccount = schoolCredentials?.hubtelMerchantAccount || HUBTEL_MERCHANT_ACCOUNT;

    if (!clientId || !clientSecret || !merchantAccount) {
      return reject(new Error('Hubtel payment not configured. Set Hubtel credentials in school settings or environment variables.'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      merchantAccountNumber: merchantAccount,
      totalAmount: amount,
      title,
      description: description || 'Payment for EDUPLATFORM SOFTWARE SERVICES',
      callbackUrl: callbackUrl || `${BASE_URL}/api/billing/hubtel-webhook`,
      returnUrl: returnUrl || `${FRONTEND_URL}/settings?billing=success`,
      cancellationUrl: cancellationUrl || `${FRONTEND_URL}/settings?billing=cancelled`,
      payeeName: payeeName || '',
      payeeEmail: payeeEmail || '',
      payeeMobileNumber: payeeMobileNumber || '',
      clientReference,
    });

    const parsed = new URL(HUBTEL_CHECKOUT_URL);
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
          if (data.responseCode === '0000') {
            resolve({ checkoutUrl: data.data.checkoutUrl, checkoutId: data.data.checkoutId || clientReference });
          } else {
            reject(new Error(data.message || 'Hubtel checkout failed'));
          }
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

module.exports = { createCheckout };
