const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { sendTutorWelcomeEmail } = require('../lib/email');

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
    // Fire-and-forget welcome email — never blocks registration or fails it
    sendTutorWelcomeEmail(user.email, user.name).catch((err) => {
      console.error('Tutor welcome email error:', err.message);
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

router.get('/me', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, email: true, plan: true,
        subscriptionStart: true, subscriptionEnd: true,
        dailyUsage: true, dailyUsageDate: true, createdAt: true,
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
    const { name } = req.body;
    const user = await prisma.tutorUser.update({
      where: { id: req.userId },
      data: { ...(name && { name }) },
      select: { id: true, name: true, email: true, plan: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.authenticateTutor = authenticateTutor;
