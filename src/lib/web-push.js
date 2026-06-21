const webPush = require('web-push');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:sboaho@gmail.com';

function ensureVapidKeys() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not set. Generating ephemeral keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env.');
    const keys = webPush.generateVAPIDKeys();
    webPush.setVapidDetails(VAPID_EMAIL, keys.publicKey, keys.privateKey);
    return keys;
  }
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
}

function sendPushNotification(sub, payload) {
  try {
    return webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
      JSON.stringify(payload),
    );
  } catch {
    return Promise.resolve({ statusCode: 410 });
  }
}

module.exports = { ensureVapidKeys, sendPushNotification, webPush };
