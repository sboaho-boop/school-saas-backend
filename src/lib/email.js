const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@eduplatform.com';

let transporter = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

async function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) return { skipped: true, reason: 'SMTP not configured' };
  try {
    const info = await t.sendMail({ from: FROM_EMAIL, to, subject, html });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { skipped: true, reason: err.message };
  }
}

async function sendOtpEmail(to, name, otp) {
  return sendEmail(to, 'Your EduPlatform Verification Code', `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#4f46e5;">EduPlatform</h2>
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:bold;color:#4f46e5;">${otp}</div>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      <p>Enter it on the verification page to activate your account.</p>
    </div>
  `);
}

module.exports = { sendEmail, sendOtpEmail };
