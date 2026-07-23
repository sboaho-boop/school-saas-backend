const https = require('https');

const BASE_URL = 'profile-api.mycreditscore.com.gh';

function makeRequest({ body, credentials }) {
  const auth = 'Basic ' + Buffer.from(`${credentials.apiId}:${credentials.apiKey}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL,
      path: '/api/v1/consumer-identity-report',
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json; x-api-version=1.0',
        'Accept': 'text/plain; x-api-version=1.0',
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
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function getIdentityReport({
  nationalIds,
  names,
  numberAndEmail,
  dateOfBirth,
  gender,
  reasonForRequest,
  requestVerification,
  ghanaCardNumber,
  identitySource,
  reportType,
  requestedBy,
  requestedTime,
  credentials,
}) {
  const body = {
    nationalIds,
    names,
    numberAndEmail,
    dateOfBirth,
    gender,
    reasonForRequest,
    requestVerification,
    ghanaCardNumber,
    identitySource,
    reportType,
    requestedBy,
  };
  if (requestedTime) body.requestedTime = requestedTime;

  const result = await makeRequest({ body, credentials });
  return result.data;
}

module.exports = { getIdentityReport };
