const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

const RECURRING_CHANNELS = {
  'mtn-gh': 'mtn_gh_rec',
  'vodafone-gh': 'vodafone_gh_rec',
};

const INTERVALS = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

function createInvoice({
  orderDate, invoiceEndDate, description, startTime, paymentInterval,
  customerMobileNumber, customerName, channel, recurringAmount, totalAmount,
  initialAmount, callbackUrl, schoolCredentials,
}) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const recChannel = RECURRING_CHANNELS[channel] || channel;

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      orderDate: orderDate || new Date().toISOString().replace(/\.\d{3}Z$/, ''),
      invoiceEndDate,
      description: description || 'EDUPLATFORM recurring payment',
      startTime: startTime || '10:00',
      paymentInterval,
      customerMobileNumber,
      paymentOption: 'MobileMoney',
      channel: recChannel,
      customerName: customerName || '',
      recurringAmount,
      totalAmount: totalAmount || recurringAmount,
      initialAmount: initialAmount || recurringAmount,
      currency: 'GHS',
      callbackUrl: callbackUrl || `${BASE_URL}/api/recurring-invoice/hubtel-webhook`,
    });

    const url = `https://rip.hubtel.com/api/proxy/${collectionAccount}/create-invoice`;
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

function verifyInvoice({ recurringInvoiceId, requestId, otpCode }) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${process.env.HUBTEL_CLIENT_ID || ''}:${process.env.HUBTEL_CLIENT_SECRET || ''}`).toString('base64');

    const payload = JSON.stringify({
      recurringInvoiceId,
      requestId,
      otpCode,
    });

    const url = 'https://rip.hubtel.com/api/proxy/verify-invoice';
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

function cancelInvoice({ recurringInvoiceId, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const url = `https://rip.hubtel.com/api/proxy/${collectionAccount}/cancel-invoice/${recurringInvoiceId}`;
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'DELETE',
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

module.exports = { createInvoice, verifyInvoice, cancelInvoice, RECURRING_CHANNELS, INTERVALS };
