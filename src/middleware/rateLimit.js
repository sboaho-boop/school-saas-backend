const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  keyGenerator: (req) => {
    const id = (req.body?.email || req.body?.indexNumber || '').toString().toLowerCase().trim();
    return `${req.ip}|${id || 'unknown'}`;
  },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please slow down and try again.' },
});

module.exports = { loginLimiter, aiLimiter };