const https = require('https');

const BASE_URL = 'trnf.hubtel.com';

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

// Collection Account Balance
async function getCollectionBalance({ accountNumber, credentials }) {
  const path = `/api/inter-transfers/${accountNumber}`;
  const result = await makeRequest({ method: 'GET', path, credentials });
  return result.data;
}

// Disbursement Account Balance
async function getDisbursementBalance({ accountNumber, credentials }) {
  const path = `/api/inter-transfers/prepaid/${accountNumber}`;
  const result = await makeRequest({ method: 'GET', path, credentials });
  return result.data;
}

// Transfer from Collection → Disbursement
async function transferToDisbursement({ accountNumber, amount, destinationAccountNumber, description, clientReference, callbackUrl, credentials }) {
  const path = `/api/inter-transfers/${accountNumber}`;
  const result = await makeRequest({
    method: 'POST',
    path,
    body: {
      Description: description || 'Internal transfer',
      Amount: amount,
      ClientReference: clientReference,
      DestinationAccountNumber: destinationAccountNumber,
      PrimaryCallbackUrl: callbackUrl,
    },
    credentials,
  });
  return result.data;
}

// Transfer Status Check
async function getTransferStatus({ accountNumber, clientReference, credentials }) {
  const path = `/api/inter-transfers/status/${accountNumber}?clientReference=${clientReference}`;
  const result = await makeRequest({ method: 'GET', path, credentials });
  return result.data;
}

module.exports = {
  getCollectionBalance,
  getDisbursementBalance,
  transferToDisbursement,
  getTransferStatus,
};
