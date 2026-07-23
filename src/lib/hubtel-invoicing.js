const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

function createSimpleInvoice({
  invoiceNumber, dueDate, createdBy, customerName, customerPhoneNumber,
  customerEmail, note, items, discounts, fees, appliedTaxes, callbackUrl,
  schoolCredentials,
}) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      invoiceNumber,
      dueDate,
      createdBy: createdBy || 'EDUPLATFORM',
      customerName: customerName || '',
      customerPhoneNumber,
      customerEmail: customerEmail || '',
      note: note || '',
      items,
      ...(discounts && discounts.length ? { discounts } : {}),
      ...(fees && fees.length ? { fees } : {}),
      ...(appliedTaxes && appliedTaxes.length ? { appliedTaxes } : {}),
      callbackUrl: callbackUrl || `${BASE_URL}/api/invoicing/hubtel-webhook`,
    });

    const url = `https://invoicing.hubtel.com/api/v2.0/invoice/${collectionAccount}/simple`;
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

function createRepeatInvoice({
  invoiceNumber, dueDate, createdBy, customerName, customerPhoneNumber,
  customerEmail, note, items, frequency, shouldBeAutoDebited,
  discounts, fees, appliedTaxes, callbackUrl, schoolCredentials,
}) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      invoiceNumber,
      dueDate,
      createdBy: createdBy || 'EDUPLATFORM',
      customerName: customerName || '',
      customerPhoneNumber,
      customerEmail: customerEmail || '',
      note: note || '',
      items,
      frequency,
      shouldBeAutoDebited: shouldBeAutoDebited || false,
      ...(discounts && discounts.length ? { discounts } : {}),
      ...(fees && fees.length ? { fees } : {}),
      ...(appliedTaxes && appliedTaxes.length ? { appliedTaxes } : {}),
      callbackUrl: callbackUrl || `${BASE_URL}/api/invoicing/hubtel-webhook`,
    });

    const url = `https://invoicing.hubtel.com/api/v2.0/invoice/${collectionAccount}/repeat`;
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

function checkInvoiceStatus({ invoiceId, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const url = `https://invoicing.hubtel.com/api/v2.0/invoice/${collectionAccount}/${invoiceId}/status-check`;
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

module.exports = { createSimpleInvoice, createRepeatInvoice, checkInvoiceStatus };
