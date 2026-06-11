const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/jwt');

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, password: hashed, name, role: role || 'admin' } });
    const token = signToken(user);
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  // Simple token check without auth middleware
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = require('../lib/jwt').verifyToken(header.split(' ')[1]);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ error: 'Not found' });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await prisma.user.findUnique({ where: { email } });
    // Return success even if email not found (security best practice)
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    // Invalidate any existing tokens for this email
    await prisma.passwordResetToken.updateMany({ where: { email, used: false }, data: { used: true } });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour
    await prisma.passwordResetToken.create({ data: { email, token, expiresAt } });

    // In production, send email here. For demo, return token in response.
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

module.exports = router;
