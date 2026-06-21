const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');
const { authenticate } = require('../middleware/auth');
const { sendRegistrationAlert, sendLoginAlert } = require('../lib/sms');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' };

function signTempToken(userId) {
  return jwt.sign({ id: userId, temp: true }, JWT_SECRET, { expiresIn: '5m' });
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, schoolName, phone, privacyConsent } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    if (!privacyConsent) return res.status(400).json({ error: 'You must accept the privacy policy to register' });
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const schoolCount = await prisma.school.count();
    const schoolCode = `SCH-${String(schoolCount + 1).padStart(3, '0')}`;
    const school = await prisma.school.create({ data: { code: schoolCode, name: schoolName || `${name}'s School` } });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role: role || 'headteacher', schoolId: school.id, phone: phone || '' },
    });
    await prisma.subscription.create({ data: { schoolId: school.id } });

    await prisma.privacyConsent.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        type: 'privacy_policy',
        version: '1.0',
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role, schoolId: school.id });

    if (user.phone) {
      sendRegistrationAlert(user.phone, user.name, school.name).catch(() => {});
    }

    res.cookie('edu_token', token, COOKIE_OPTIONS);
    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: school.id, phone: user.phone, twoFactorEnabled: false },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      const tempToken = signTempToken(user.id);
      return res.json({ require2fa: true, tempToken, userId: user.id });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role, schoolId: user.schoolId });

    if (user.phone) {
      sendLoginAlert(user.phone, user.name).catch(() => {});
    }

    res.cookie('edu_token', token, COOKIE_OPTIONS);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, phone: user.phone, twoFactorEnabled: false },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('edu_token', { path: '/' });
  res.json({ message: 'Logged out' });
});

router.post('/verify-2fa', async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) return res.status(400).json({ error: 'tempToken and otp required' });

    let payload;
    try { payload = jwt.verify(tempToken, JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid or expired temp token' }); }
    if (!payload.temp) return res.status(401).json({ error: 'Invalid token type' });

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.twoFactorSecret) return res.status(401).json({ error: '2FA not configured' });

    const isValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: otp });
    if (!isValid) return res.status(401).json({ error: 'Invalid OTP' });

    const token = signToken({ id: user.id, email: user.email, role: user.role, schoolId: user.schoolId });

    if (user.phone) {
      sendLoginAlert(user.phone, user.name).catch(() => {});
    }

    res.cookie('edu_token', token, COOKIE_OPTIONS);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, phone: user.phone, twoFactorEnabled: true },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(header.split(' ')[1]);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ error: 'Not found' });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId, phone: user.phone, twoFactorEnabled: user.twoFactorEnabled });
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.json({ message: 'Already verified' });
    if (user.verificationCode !== otp) return res.status(401).json({ error: 'Invalid OTP' });
    if (new Date() > new Date(user.verificationExpiry)) return res.status(401).json({ error: 'OTP expired' });

    const tempPassword = crypto.randomBytes(12).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationCode: null, verificationExpiry: null, password: hashed },
    });

    res.json({ message: 'Verified successfully', tempPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    await prisma.passwordResetToken.updateMany({ where: { email, used: false }, data: { used: true } });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);
    await prisma.passwordResetToken.create({ data: { email, token, expiresAt } });

    res.json({ message: 'If that email exists, a reset link has been sent.', resetToken: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used) return res.status(400).json({ error: 'Invalid or expired token' });
    if (new Date() > record.expiresAt) return res.status(400).json({ error: 'Token expired' });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { email: record.email }, data: { password: hashed } });
    await prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secretObj = speakeasy.generateSecret({ name: `EduPlatform (${user.email})` });
    const qrCode = await QRCode.toDataURL(secretObj.otpauth_url);

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secretObj.base32 } });

    res.json({ secret: secretObj.base32, qrCode, message: 'Scan the QR code with your authenticator app, then verify with /2fa/verify' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/verify', authenticate, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.twoFactorSecret) return res.status(400).json({ error: '2FA not set up. Call /2fa/setup first.' });

    const isValid = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: otp });
    if (!isValid) return res.status(401).json({ error: 'Invalid OTP' });

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });

    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid password' });

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });

    res.json({ message: '2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sms-preferences', authenticate, async (req, res) => {
  try {
    const prefs = req.body;
    if (typeof prefs !== 'object') return res.status(400).json({ error: 'Body must be a preferences object' });
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { smsPreferences: JSON.stringify(prefs) } });
    res.json({ smsPreferences: JSON.parse(user.smsPreferences) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sms-preferences', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({ smsPreferences: JSON.parse(user.smsPreferences || '{}') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
