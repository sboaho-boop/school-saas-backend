const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { sendTutorWelcomeEmail, sendTutorResetEmail } = require('../lib/email');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'teacher-kofi-secret';

function signToken(userId) {
  return jwt.sign({ userId, type: 'tutor' }, JWT_SECRET, { expiresIn: '30d' });
}

function authenticateTutor(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.type !== 'tutor') return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.tutorUser.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.tutorUser.create({
      data: { name, email: email.toLowerCase(), password: hash },
      select: { id: true, name: true, email: true, plan: true, createdAt: true },
    });

    const token = signToken(user.id);
    // Fire-and-forget welcome email — never blocks or delays registration
    sendTutorWelcomeEmail(user.email, user.name).then((r) => {
      if (!r.success) console.error('[welcome email] not sent:', r.reason || '');
    }).catch((err) => {
      console.error('[welcome email] error:', err.message);
    });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Tutor register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.tutorUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
      token,
    });
  } catch (err) {
    console.error('Tutor login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.tutorUser.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const resetToken = jwt.sign({ userId: user.id, type: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
      const resetUrl = `https://eduplatformsoftware.com/tutor/reset-password?token=${resetToken}`;
      sendTutorResetEmail(user.email, user.name, resetUrl).then((r) => {
        if (!r.success) console.error('[reset email] not sent:', r.reason || '');
      }).catch((err) => {
        console.error('[reset email] error:', err.message);
      });
    }
    // Always return success — never reveal whether the email exists
    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.json({ success: true });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'reset') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.tutorUser.update({
      where: { id: decoded.userId },
      data: { password: hash },
    });
    res.json({ success: true });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'This reset link has expired or is invalid. Please request a new one.' });
    }
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

router.get('/me', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, email: true, plan: true,
        subscriptionStart: true, subscriptionEnd: true,
        dailyUsage: true, dailyUsageDate: true, createdAt: true,
        preferredLanguage: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/me', authenticateTutor, async (req, res) => {
  try {
    const { name, preferredLanguage } = req.body;
    const data = {};
    if (name) data.name = name;
    if (preferredLanguage) data.preferredLanguage = preferredLanguage;
    const user = await prisma.tutorUser.update({
      where: { id: req.userId },
      data,
      select: { id: true, name: true, email: true, plan: true, preferredLanguage: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.authenticateTutor = authenticateTutor;
