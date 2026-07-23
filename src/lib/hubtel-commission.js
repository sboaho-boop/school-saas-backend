const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

const SERVICE_IDS = {
  MTN_AIRTIME: 'fdd76c884e614b1c8f669a3207b09a98',
  TELECEL_AIRTIME: 'f4be83ad74c742e185224fdae1304800',
  AT_AIRTIME: 'dae2142eb5a14c298eace60240c09e4b',
  ECG: 'e6d6bac062b5499cb1ece1ac3d742a84',
  TELECEL_BROADBAND: 'b9a1aa246ba748f9ba01ca4cdbb3d1d3',
  MTN_DATA: 'b230733cd56b4a0fad820e39f66bc27c',
  TELECEL_DATA: 'fa27127ba039455da04a2ac8a1613e00',
  AT_DATA: '06abd92da459428496967612463575ca',
  DSTV: '297a96656b5846ad8b00d5d41b256ea7',
  GOTV: 'e6ceac7f3880435cb30b048e9617eb41',
  TELECEL_POSTPAID: 'a3ab78c84c6b4976b78a6f393e247a72',
  GHANA_WATER: '6c1e8a82d2e84feeb8bfd6be2790d71d',
  STARTIMES: '6598652d34ea4112949c93c079c501ce',
};

function commissionQuery({ serviceId, destination, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const disbursementAccount = schoolCredentials?.hubtelDisbursementAccount || process.env.HUBTEL_DISBURSEMENT_ACCOUNT || '';

    if (!clientId || !clientSecret || !disbursementAccount) {
      return reject(new Error('Hubtel disbursement credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const url = `https://cs.hubtel.com/commissionservices/${disbursementAccount}/${serviceId}?destination=${encodeURIComponent(destination)}`;
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
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

function commissionPayment({ serviceId, destination, amount, description, clientReference, extradata, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const disbursementAccount = schoolCredentials?.hubtelDisbursementAccount || process.env.HUBTEL_DISBURSEMENT_ACCOUNT || '';

    if (!clientId || !clientSecret || !disbursementAccount) {
      return reject(new Error('Hubtel disbursement credentials not configured'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      Destination: destination,
      Amount: amount,
      CallbackUrl: callbackUrl || `${BASE_URL}/api/commissions/hubtel-webhook`,
      ClientReference: clientReference,
      ...(extradata ? { Extradata: extradata } : {}),
    });

    const url = `https://cs.hubtel.com/commissionservices/${disbursementAccount}/${serviceId}`;
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

module.exports = { SERVICE_IDS, commissionQuery, commissionPayment };
