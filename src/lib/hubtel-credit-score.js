const https = require('https');

const BASE_URL = 'score-api.mycreditscore.com.gh';

function makeRequest({ body, credentials }) {
  const auth = 'Basic ' + Buffer.from(`${credentials.apiId}:${credentials.apiKey}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE_URL,
      path: '/api/v1/score-check',
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

async function checkCreditScore({
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
  };
  if (identifierName) body.identifierName = identifierName;
  if (identifierNationality) body.identifierNationality = identifierNationality;
  if (identifierMobileNumber) body.identifierMobileNumber = identifierMobileNumber;
  if (purposeOfCheck) body.purposeOfCheck = purposeOfCheck;
  if (typeOfCreditFacility) body.typeOfCreditFacility = typeOfCreditFacility;
  if (lenderReferenceId) body.lenderReferenceId = lenderReferenceId;
  if (voterId) body.voterId = voterId;
  if (passportNumber) body.passportNumber = passportNumber;
  if (driverLicenseNumber) body.driverLicenseNumber = driverLicenseNumber;
  if (ssnitNumber) body.ssnitNumber = ssnitNumber;
  if (nhisNumber) body.nhisNumber = nhisNumber;
  if (tin) body.tin = tin;

  const result = await makeRequest({ body, credentials });
  return result.data;
}

module.exports = { checkCreditScore };
