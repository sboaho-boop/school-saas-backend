const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@eduplatformsoftware.com';

let transporter = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
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

async function sendOtpEmail(to, name, otp, verificationToken) {
  const verifyUrl = verificationToken
    ? `https://eduplatformsoftware.com/verify-email?token=${verificationToken}`
    : '';
  return sendEmail(to, 'Your EDUPLATFORM SOFTWARE SERVICES Verification Code', `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#4f46e5;">EDUPLATFORM SOFTWARE SERVICES</h2>
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:bold;color:#4f46e5;">${otp}</div>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      ${verifyUrl ? `
      <p style="margin-top:20px;">Or click the button below to verify instantly:</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${verifyUrl}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Verify Email</a>
      </div>
      <p style="font-size:12px;color:#888;">Button not working? Copy this link:<br/><a href="${verifyUrl}">${verifyUrl}</a></p>
      ` : ''}
      <p>Enter the code on the verification page to activate your account.</p>
    </div>
  `);
}

module.exports = { sendEmail, sendOtpEmail };
