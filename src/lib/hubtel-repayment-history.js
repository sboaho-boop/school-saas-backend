const https = require('https');

const BASE_URL = 'score-debt-api.mycreditscore.com.gh';

function makeRequest({ body, credentials }) {
  const auth = 'Basic ' + Buffer.from(`${credentials.apiId}:${credentials.apiKey}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL,
      path: '/api/v1/repayment-history',
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
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

async function getRepaymentHistory({
  ghanaCard,
  identifierName,
  identifierNationality,
  identifierDob,
  identifierMobileNumber,
  creditAmount,
  purposeOfCheck,
  typeOfCreditFacility,
  lenderReferenceId,
  voterId,
  passportNumber,
  driverLicenseNumber,
  ssnitNumber,
  nhisNumber,
  tin,
  credentials,
}) {
  const body = {
    ghanaCard,
    identifierDob,
    creditAmount,
    identifierName: identifierName || '',
    identifierNationality: identifierNationality || '',
    identifierMobileNumber: identifierMobileNumber || '',
    currencyOfCredit: 'GHS',
    purposeOfCheck: purposeOfCheck || '',
    typeOfCreditFacility: typeOfCreditFacility || '',
    lenderReferenceId: lenderReferenceId || '',
    voterId: voterId || '',
    passportNumber: passportNumber || '',
    driverLicenseNumber: driverLicenseNumber || '',
    ssnitNumber: ssnitNumber || '',
    nhisNumber: nhisNumber || '',
    tin: tin || '',
  };

  const result = await makeRequest({ body, credentials });
  return result.data;
}

module.exports = { getRepaymentHistory };
