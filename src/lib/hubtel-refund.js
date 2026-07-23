const https = require('https');

const BASE_URL = 'refund-api.hubtel.com';

function makeRequest({ method, path, body, credentials }) {
  const auth = 'Basic ' + Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL,
      path,
      method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ code: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ code: res.statusCode, data: null });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Initiate refund — only for successful transactions within last 45 days
async function initiateRefund({ orderId, accountNumber, callbackUrl, credentials }) {
  const path = `/refund/${accountNumber}/order/${orderId}`;
  const result = await makeRequest({
    method: 'POST',
    path,
    body: { callbackUrl },
    credentials,
  });
  return result.data;
}

module.exports = { initiateRefund };
