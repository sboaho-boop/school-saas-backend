const https = require('https');
const url = require('url');

const HUBTEL_SMS_BASE_URL = process.env.HUBTEL_SMS_BASE_URL || 'https://api.hubtel.com';
const HUBTEL_SMS_CLIENT_ID = process.env.HUBTEL_SMS_CLIENT_ID || '';
const HUBTEL_SMS_CLIENT_SECRET = process.env.HUBTEL_SMS_CLIENT_SECRET || '';
const HUBTEL_SMS_FROM = process.env.HUBTEL_SMS_FROM || 'EDUPLATFORM';

function sendSms(phone, message, credentials) {
  return new Promise((resolve, reject) => {
    const clientId = credentials?.hubtelSmsClientId || HUBTEL_SMS_CLIENT_ID;
    const clientSecret = credentials?.hubtelSmsClientSecret || HUBTEL_SMS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return resolve({ skipped: true, reason: 'SMS client ID/Secret not set' });
    const apiUrl = `${HUBTEL_SMS_BASE_URL}/v1/messages/send?clientid=${encodeURIComponent(clientId)}&clientsecret=${encodeURIComponent(clientSecret)}&from=${encodeURIComponent(HUBTEL_SMS_FROM)}&to=${encodeURIComponent(phone)}&content=${encodeURIComponent(message)}`;
    const parsed = new url.URL(apiUrl);
    https.get(parsed.href, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ status: body }); }
      });
    }).on('error', reject);
  });
}

async function sendRegistrationAlert(phone, name, schoolName) {
  return sendSms(phone, `Welcome ${name}! Your school "${schoolName}" is registered on EDUPLATFORM SOFTWARE SERVICES. Login at your dashboard to get started.`);
}

async function sendLoginAlert(phone, name) {
  return sendSms(phone, `Hi ${name}, a login was detected on your EDUPLATFORM SOFTWARE SERVICES account. If this wasn't you, please change your password immediately.`);
}

async function sendFeeReceipt(phone, studentName, amount, balance) {
  return sendSms(phone, `Fee payment of GHS ${amount} received for ${studentName}. Outstanding balance: GHS ${balance}. Thank you.`);
}

async function sendAttendanceAlert(phone, studentName, status) {
  return sendSms(phone, `${studentName} was marked ${status} at school today.`);
}

async function sendLowBalanceAlert(phone, studentName, balance) {
  return sendSms(phone, `Alert: ${studentName}'s wallet balance is low (GHS ${balance}). Please top up to avoid service interruptions.`);
}

async function sendSubscriptionAlert(phone, plan, action) {
  return sendSms(phone, `Your EDUPLATFORM SOFTWARE SERVICES subscription has been ${action}. Plan: ${plan}. Check your billing settings for details.`);
}

module.exports = { sendSms, sendRegistrationAlert, sendLoginAlert, sendFeeReceipt, sendAttendanceAlert, sendLowBalanceAlert, sendSubscriptionAlert };
