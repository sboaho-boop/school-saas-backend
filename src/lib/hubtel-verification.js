const https = require('https');

const BASE_URLS = {
  commissions: 'cs.hubtel.com',
  verification: 'rnv.hubtel.com',
};

function makeRequest({ method, hostname, path, body, credentials }) {
  const auth = 'Basic ' + Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
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

// MSISDN Name Query — get SIM registration name
async function queryMsirdnName({ phone, accountNumber, credentials }) {
  const phoneNum = phone.startsWith('233') ? phone : '233' + phone.slice(1);
  const path = `/commissionservices/${accountNumber}/3e0841e70afc42fb97d13d19abd36384?destination=${phoneNum}`;
  const result = await makeRequest({
    method: 'GET',
    hostname: BASE_URLS.commissions,
    path,
    credentials,
  });
  return result.data;
}

// Mobile Money Registration & Username Query
async function queryMobileMoney({ phone, channel, accountNumber, credentials }) {
  const phoneNum = phone.startsWith('0') ? phone : phone.startsWith('233') ? '0' + phone.slice(3) : phone;
  const channelMap = {
    mtn: 'mtn-gh',
    vodafone: 'vodafone-gh',
    airteltigo: 'tigo-gh',
    telecel: 'vodafone-gh',
    at: 'tigo-gh',
  };
  const resolvedChannel = channelMap[channel] || channel;
  const path = `/v2/merchantaccount/merchants/${accountNumber}/mobilemoney/verify?channel=${resolvedChannel}&customerMsisdn=${phoneNum}`;
  const result = await makeRequest({
    method: 'GET',
    hostname: BASE_URLS.verification,
    path,
    credentials,
  });
  return result.data;
}

// Ghana Card Validation
async function verifyGhanaCard({ ghanaCardNumber, surname, firstnames, gender, dateOfBirth, accountNumber, credentials }) {
  const path = `/v2/merchantaccount/merchants/${accountNumber}/ghanacard/verify`;
  const result = await makeRequest({
    method: 'POST',
    hostname: BASE_URLS.verification,
    path,
    body: { ghanaCardNumber, surname, firstnames, gender, dateOfBirth },
    credentials,
  });
  return result.data;
}

// Voter ID Validation
async function verifyVoterId({ voterIdCardNumber, surname, othernames, sex, dateOfBirth, accountNumber, credentials }) {
  const path = `/v2/merchantaccount/merchants/${accountNumber}/voteridcard/verify`;
  const result = await makeRequest({
    method: 'POST',
    hostname: BASE_URLS.verification,
    path,
    body: { voterIdCardNumber, surname, othernames, sex, dateOfBirth },
    credentials,
  });
  return result.data;
}

// MTN Chenosis — verify Ghana Card via MTN MSISDN
async function verifyChenosis({ phone, consentType, accountNumber, credentials }) {
  const phoneNum = phone.startsWith('233') ? phone : '233' + phone.slice(1);
  const path = `/v2/merchantaccount/merchants/${accountNumber}/idcard/verify?idtype=ghanacard&idnumber=${phoneNum}&network=MTN&consentType=${consentType || 'sms'}`;
  const result = await makeRequest({
    method: 'GET',
    hostname: BASE_URLS.verification,
    path,
    credentials,
  });
  return result.data;
}

// Bank Account Name Query
async function verifyBankAccount({ bankCode, bankAccountNumber, accountNumber, credentials }) {
  const path = `/v2/merchantaccount/merchants/${accountNumber}/bank/verify/${bankCode}/${bankAccountNumber}`;
  const result = await makeRequest({
    method: 'GET',
    hostname: BASE_URLS.verification,
    path,
    credentials,
  });
  return result.data;
}

const BANK_CODES = {
  'STANDARD CHARTERED BANK': '300302',
  'ABSA BANK GHANA LIMITED': '300303',
  'GCB BANK LIMITED': '300304',
  'NATIONAL INVESTMENT BANK': '300305',
  'ARB APEX BANK LIMITED': '300306',
  'AGRICULTURAL DEVELOPMENT BANK': '300307',
  'UNIVERSAL MERCHANT BANK': '300309',
  'REPUBLIC BANK LIMITED': '300310',
  'ZENITH BANK GHANA LTD': '300311',
  'ECOBANK GHANA LTD': '300312',
  'CAL BANK LIMITED': '300313',
  'FIRST ATLANTIC BANK': '300316',
  'PRUDENTIAL BANK LTD': '300317',
  'STANBIC BANK': '300318',
  'FIRST BANK OF NIGERIA': '300319',
  'BANK OF AFRICA': '300320',
  'GUARANTY TRUST BANK': '300322',
  'FIDELITY BANK LIMITED': '300323',
  'SAHEL - SAHARA BANK (BSIC)': '300324',
  'UNITED BANK OF AFRICA': '300325',
  'ACCESS BANK LTD': '300329',
  'CONSOLIDATED BANK GHANA': '300331',
  'FIRST NATIONAL BANK': '300334',
  'GHL BANK': '300362',
};

module.exports = {
  queryMsirdnName,
  queryMobileMoney,
  verifyGhanaCard,
  verifyVoterId,
  verifyChenosis,
  verifyBankAccount,
  BANK_CODES,
};
