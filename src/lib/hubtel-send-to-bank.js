const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

const BANK_CODES = {
  'SCB': '300302',
  'ABSA': '300303',
  'GCB': '300304',
  'NIB': '300305',
  'ARB APEX': '300306',
  'ADB': '300307',
  'UMB': '300309',
  'REPUBLIC': '300310',
  'ZENITH': '300311',
  'ECOBANK': '300312',
  'CAL': '300313',
  'FIRST ATLANTIC': '300316',
  'PRUDENTIAL': '300317',
  'STANBIC': '300318',
  'FIRST BANK': '300319',
  'BOA': '300320',
  'GTB': '300322',
  'FIDELITY': '300323',
  'BSIC': '300324',
  'UBA': '300325',
  'ACCESS': '300329',
  'CBG': '300331',
  'FNB': '300334',
  'GHL': '300362',
};

function sendToBank({ amount, bankAccountNumber, bankAccountName, bankCode, bankName, recipientPhoneNumber, description, clientReference, callbackUrl, schoolCredentials }) {
  return new Promise((resolve, reject) => {
    const clientId = schoolCredentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = schoolCredentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';
    const disbursementAccount = schoolCredentials?.hubtelDisbursementAccount || process.env.HUBTEL_DISBURSEMENT_ACCOUNT || '';

    if (!clientId || !clientSecret || !disbursementAccount) {
      return reject(new Error('Hubtel disbursement credentials not configured'));
    }

    if (!bankAccountNumber) {
      return reject(new Error('Bank account number is required'));
    }

    if (!bankCode) {
      return reject(new Error('Bank code is required'));
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const payload = JSON.stringify({
      Amount: amount,
      BankAccountNumber: bankAccountNumber,
      BankAccountName: bankAccountName || '',
      BankName: bankName || '',
      BankBranch: '',
      BankBranchCode: '',
      BankCode: bankCode,
      RecipientPhoneNumber: recipientPhoneNumber || '',
      PrimaryCallbackUrl: callbackUrl || `${BASE_URL}/api/send-to-bank/hubtel-webhook`,
      Description: description || 'EDUPLATFORM Send-To-Bank',
      ClientReference: clientReference,
    });

    const url = `https://smp.hubtel.com/api/merchants/${disbursementAccount}/send/bank/gh/${bankCode}`;
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
          const data = JSON.parse(body);
          resolve(data);
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

module.exports = { sendToBank, BANK_CODES };
