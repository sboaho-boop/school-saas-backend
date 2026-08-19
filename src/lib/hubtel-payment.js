const https = require('https');

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID || '';
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET || '';
const HUBTEL_MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT || '';
const HUBTEL_CHECKOUT_URL = process.env.HUBTEL_CHECKOUT_URL || 'https://payproxyapi.hubtel.com/items/initiate';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function createCheckout({ amount, title, description, clientReference, payeeName, payeeEmail, payeeMobileNumber, callbackUrl, returnUrl, cancellationUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = (schoolCredentials?.hubtelClientId && schoolCredentials.hubtelClientId.trim()) || HUBTEL_CLIENT_ID;
    const clientSecret = (schoolCredentials?.hubtelClientSecret && schoolCredentials.hubtelClientSecret.trim()) || HUBTEL_CLIENT_SECRET;
    const merchantAccount = (schoolCredentials?.hubtelMerchantAccount && schoolCredentials.hubtelMerchantAccount.trim()) || HUBTEL_MERCHANT_ACCOUNT;

    console.log('[hubtel-checkout] clientId set:', !!clientId, 'clientSecret set:', !!clientSecret, 'merchant:', !!merchantAccount);

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

    console.log('[hubtel-checkout] Sending request to:', HUBTEL_CHECKOUT_URL, 'amount:', amount, 'merchant:', merchantAccount);

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        console.log('[hubtel-checkout] Response status:', res.statusCode, 'body:', body.substring(0, 500));
        try {
          const data = JSON.parse(body);
          if (data.responseCode === '0000') {
            resolve({ checkoutUrl: data.data.checkoutUrl, checkoutId: data.data.checkoutId || clientReference });
          } else {
            reject(new Error(`Hubtel error (${res.statusCode}): ${data.message || data.ResponseMessage || JSON.stringify(data)}`));
          }
        } catch {
          reject(new Error(`Hubtel response (status ${res.statusCode}): ${body.substring(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => {
      console.error('[hubtel-checkout] Request error:', err.message);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

module.exports = { createCheckout };
