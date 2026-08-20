const https = require('https');
const url = require('url');

const HUBTEL_SMS_BASE_URL = process.env.HUBTEL_SMS_BASE_URL || 'sms.hubtel.com';
const HUBTEL_SMS_CLIENT_ID = process.env.HUBTEL_SMS_CLIENT_ID || '';
const HUBTEL_SMS_CLIENT_SECRET = process.env.HUBTEL_SMS_CLIENT_SECRET || '';
const HUBTEL_SMS_FROM = process.env.HUBTEL_SMS_FROM || 'EDUPLATFORM';

function makeSmsRequest({ method, path, body, credentials }) {
  const clientId = credentials?.hubtelSmsClientId || credentials?.clientId || HUBTEL_SMS_CLIENT_ID;
  const clientSecret = credentials?.hubtelSmsClientSecret || credentials?.clientSecret || HUBTEL_SMS_CLIENT_SECRET;
  const auth = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HUBTEL_SMS_BASE_URL,
      path,
      method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Simple SMS — single recipient via GET (existing)
function sendSms(phone, message, credentials) {
  const clientId = credentials?.hubtelSmsClientId || credentials?.clientId || HUBTEL_SMS_CLIENT_ID;
  const clientSecret = credentials?.hubtelSmsClientSecret || credentials?.clientSecret || HUBTEL_SMS_CLIENT_SECRET;
  const from = credentials?.smsFrom || HUBTEL_SMS_FROM;
  if (!clientId || !clientSecret) return Promise.resolve({ skipped: true, reason: 'SMS client ID/Secret not set' });

  return new Promise((resolve, reject) => {
    const apiUrl = `https://${HUBTEL_SMS_BASE_URL}/v1/messages/send?clientid=${encodeURIComponent(clientId)}&clientsecret=${encodeURIComponent(clientSecret)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(phone)}&content=${encodeURIComponent(message)}`;
    https.get(apiUrl, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ raw: body }); }
      });
    }).on('error', reject);
  });
}

// Simple SMS — single recipient via POST
async function sendSmsPost({ to, content, from, credentials }) {
  return makeSmsRequest({
    method: 'POST',
    path: '/v1/messages/send',
    body: { From: from || HUBTEL_SMS_FROM, To: to, Content: content },
    credentials,
  });
}

// Batch SMS — same message to multiple recipients
async function sendBatchSms({ recipients, content, from, credentials }) {
  return makeSmsRequest({
    method: 'POST',
    path: '/v1/messages/batch/simple/send',
    body: { From: from || HUBTEL_SMS_FROM, Recipients: recipients, Content: content },
    credentials,
  });
}

// Personalized Batch SMS — different message per recipient
async function sendPersonalizedBatch({ personalizedRecipients, from, credentials }) {
  return makeSmsRequest({
    method: 'POST',
    path: '/v1/messages/batch/personalized/send',
    body: { From: from || HUBTEL_SMS_FROM, personalizedRecipients },
    credentials,
  });
}

// Message status check — by messageId or batchId
async function checkMessageStatus({ messageId, credentials }) {
  return makeSmsRequest({
    method: 'GET',
    path: `/v1/messages/${messageId}`,
    credentials,
  });
}

async function sendRegistrationAlert(phone, name, schoolName, credentials) {
  return sendSmsPost({ to: phone, content: `Welcome ${name}! Your school "${schoolName}" is registered on EDUPLATFORM SOFTWARE SERVICES. Login at your dashboard to get started.`, credentials });
}

async function sendLoginAlert(phone, name, credentials) {
  return sendSmsPost({ to: phone, content: `Hi ${name}, a login was detected on your EDUPLATFORM SOFTWARE SERVICES account. If this wasn't you, please change your password immediately.`, credentials });
}

async function sendFeeReceipt(phone, studentName, amount, balance, credentials) {
  return sendSmsPost({ to: phone, content: `Fee payment of GHS ${amount} received for ${studentName}. Outstanding balance: GHS ${balance}. Thank you.`, credentials });
}

async function sendAttendanceAlert(phone, studentName, status, credentials) {
  return sendSmsPost({ to: phone, content: `${studentName} was marked ${status} at school today.`, credentials });
}

async function sendLowBalanceAlert(phone, studentName, balance, credentials) {
  return sendSmsPost({ to: phone, content: `Alert: ${studentName}'s wallet balance is low (GHS ${balance}). Please top up to avoid service interruptions.`, credentials });
}

async function sendSubscriptionAlert(phone, plan, action, credentials) {
  return sendSmsPost({ to: phone, content: `Your EDUPLATFORM SOFTWARE SERVICES subscription has been ${action}. Plan: ${plan}. Check your billing settings for details.`, credentials });
}

async function sendResultAlert(phone, studentName, term, credentials) {
  return sendSmsPost({ to: phone, content: `Academic results for ${term} are now available for ${studentName}. Login to view details.`, credentials });
}

async function sendAssignmentAlert(phone, studentName, assignmentTitle, credentials) {
  return sendSmsPost({ to: phone, content: `New assignment "${assignmentTitle}" posted for ${studentName}. Check your dashboard for details.`, credentials });
}

// Check Hubtel SMS account balance / credits
async function checkSmsBalance(credentials) {
  const clientId = credentials?.hubtelSmsClientId || credentials?.clientId || HUBTEL_SMS_CLIENT_ID;
  const clientSecret = credentials?.hubtelSmsClientSecret || credentials?.clientSecret || HUBTEL_SMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { skipped: true, reason: 'SMS client ID/Secret not set' };

  try {
    const result = await makeSmsRequest({
      method: 'GET',
      path: '/v1/balance',
      credentials: { clientId, clientSecret },
    });
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  sendSms,
  sendSmsPost,
  sendBatchSms,
  sendPersonalizedBatch,
  checkMessageStatus,
  checkSmsBalance,
  sendRegistrationAlert,
  sendLoginAlert,
  sendFeeReceipt,
  sendAttendanceAlert,
  sendLowBalanceAlert,
  sendSubscriptionAlert,
  sendResultAlert,
  sendAssignmentAlert,
};
