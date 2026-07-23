const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

const DIRECT_DEBIT_CHANNELS = {
  'mtn-gh': 'mtn-gh-direct-debit',
  'vodafone-gh': 'vodafone-gh-direct-debit',
};

function preapprovalInitiate({ phone, channel, callbackUrl, clientReferenceId, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const ddChannel = DIRECT_DEBIT_CHANNELS[channel] || channel;

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      clientReferenceId,
      customerMsisdn: phone,
      channel: ddChannel,
      callbackUrl: callbackUrl || `${BASE_URL}/api/direct-debit/preapproval-webhook`,
    });

    const url = `https://preapproval.hubtel.com/api/v2/merchant/${collectionAccount}/preapproval/initiate`;
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

function preapprovalVerifyOtp({ phone, hubtelPreApprovalId, clientReferenceId, otpCode, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      customerMsisdn: phone,
      hubtelPreApprovalId,
      clientReferenceId,
      otpCode,
    });

    const url = `https://preapproval.hubtel.com/api/v2/merchant/${collectionAccount}/preapproval/verifyotp`;
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

function preapprovalStatus({ clientReferenceId, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const url = `https://preapproval.hubtel.com/api/v2/merchant/${collectionAccount}/preapproval/${clientReferenceId}/status`;
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

function preapprovalCancel({ phone, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const url = `https://preapproval.hubtel.com/api/v2/merchant/${collectionAccount}/preapproval/${phone}/cancel`;
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

function directDebitCharge({ customerName, customerMsisdn, customerEmail, channel, amount, description, clientReference, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const ddChannel = DIRECT_DEBIT_CHANNELS[channel] || channel;

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      CustomerName: customerName || '',
      CustomerMsisdn: customerMsisdn,
      CustomerEmail: customerEmail || '',
      Channel: ddChannel,
      Amount: amount,
      PrimaryCallbackUrl: callbackUrl || `${BASE_URL}/api/wallet/hubtel-webhook`,
      Description: description || 'Direct Debit Charge',
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

function preapprovalReactivate({ phone, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const collectionAccount = schoolCredentials?.hubtelMerchantAccount || process.env.HUBTEL_MERCHANT_ACCOUNT || '';

    if (!clientId || !clientSecret || !collectionAccount) {
      return reject(new Error('Hubtel credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      callbackUrl: callbackUrl || `${BASE_URL}/api/direct-debit/preapproval-webhook`,
      customerMsisdn: phone,
    });

    const url = `https://preapproval.hubtel.com/api/v2/merchant/${collectionAccount}/preapproval/reactivate`;
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

module.exports = {
  preapprovalInitiate,
  preapprovalVerifyOtp,
  preapprovalStatus,
  preapprovalCancel,
  preapprovalReactivate,
  directDebitCharge,
  DIRECT_DEBIT_CHANNELS,
};
