const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@eduplatformsoftware.com';

// One transporter per connection mode ('starttls' = configured port, 'ssl' = 465 fallback)
const transporters = {};

function getTransporter(mode) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (transporters[mode]) return transporters[mode];
  const useSsl = mode === 'ssl';
  const port = useSsl ? 465 : SMTP_PORT;
  transporters[mode] = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: useSsl,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });
  return transporters[mode];
}

function isConnectionError(msg) {
  return /connect|timeout|ECONN|ETIMEDOUT|ENOTFOUND|socket|tls|greeting/i.test(msg || '');
}

async function sendEmail(to, subject, html) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return { skipped: true, reason: 'SMTP not configured' };
  const modes = ['starttls', 'ssl'];
  let lastErr = null;
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    try {
      const info = await getTransporter(mode).sendMail({ from: FROM_EMAIL, to, subject, html });
      return { success: true, messageId: info.messageId, mode };
    } catch (err) {
      lastErr = err.message;
      // Connection-level failures: try the other mode. Auth/content errors: don't.
      if (i < modes.length - 1 && isConnectionError(lastErr)) continue;
      break;
    }
  }
  return { skipped: true, reason: lastErr };
}

function emailConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
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

async function sendTutorWelcomeEmail(to, name) {
  const first = (name || '').trim().split(/\s+/)[0] || 'friend';
  return sendEmail(to, 'Welcome to Teacher Kofi! Your account is ready', `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#d946ef);border-radius:12px 12px 0 0;padding:28px 24px;text-align:center;">
        <div style="color:#fff;font-size:28px;font-weight:bold;">Teacher Kofi</div>
        <div style="color:#fcedff;font-size:14px;margin-top:4px;">Your AI learning companion</div>
      </div>
      <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="color:#333;font-size:15px;line-height:1.6;">Hi ${first}, congratulations on creating your Teacher Kofi account!</p>
        <p style="color:#333;font-size:15px;line-height:1.6;">You now have your own personal AI tutor. Teacher Kofi can help you with:</p>
        <ul style="color:#333;font-size:15px;line-height:1.8;">
          <li>Mathematics, English, Science, ICT and Social Studies</li>
          <li>Ghanaian languages: Twi, Ga, Ewe, Fante and Dagbani</li>
          <li>Homework help, quizzes and learning games</li>
          <li>Voice lessons and step-by-step teaching diagrams</li>
        </ul>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://eduplatformsoftware.com/tutor/dashboard" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Start Learning</a>
        </div>
        <p style="color:#333;font-size:15px;line-height:1.6;">When you're ready for unlimited messages and the full course library, check out the <a href="https://eduplatformsoftware.com/tutor/pricing" style="color:#7c3aed;font-weight:bold;">Pro plan</a>.</p>
        <p style="color:#333;font-size:15px;line-height:1.6;">We're excited to learn with you!</p>
        <p style="color:#888;font-size:13px;margin-top:24px;">— The Teacher Kofi Team</p>
      </div>
    </div>
  `);
}

async function sendTutorResetEmail(to, name, resetUrl) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return sendEmail(to, 'Reset your Teacher Kofi password', `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#d946ef);border-radius:12px 12px 0 0;padding:28px 24px;text-align:center;">
        <div style="color:#fff;font-size:28px;font-weight:bold;">Teacher Kofi</div>
        <div style="color:#fcedff;font-size:14px;margin-top:4px;">Password Reset</div>
      </div>
      <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="color:#333;font-size:15px;line-height:1.6;">Hi ${first},</p>
        <p style="color:#333;font-size:15px;line-height:1.6;">We received a request to reset the password for your Teacher Kofi account (<strong>${to}</strong>).</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${resetUrl}" style="background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Reset Password</a>
        </div>
        <p style="color:#333;font-size:15px;line-height:1.6;">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will stay the same.</p>
        <p style="font-size:12px;color:#888;margin-top:16px;">Button not working? Copy this link:<br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color:#888;font-size:13px;margin-top:24px;">— The Teacher Kofi Team</p>
      </div>
    </div>
  `);
}

module.exports = { sendEmail, sendOtpEmail, sendTutorWelcomeEmail, sendTutorResetEmail, emailConfigured };
