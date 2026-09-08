const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { generateAIReply, buildKofiSystem } = require('../lib/ai');

const router = Router();

const demoLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many demo messages. Try again in a minute.' },
});

const DEMO_SYSTEM = buildKofiSystem({ name: 'a visitor', languageCode: 'en' }) +
  '\n\nIMPORTANT: This is a quick website preview. Give a SHORT, warm answer in 1-3 short sentences. Skip the full lesson plan, skip media/image/video blocks, and do not use markdown.';

router.post('/chat', demoLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }
    const messages = [
      { role: 'system', content: DEMO_SYSTEM },
      ...(Array.isArray(history) ? history : []).slice(-6),
      { role: 'user', content: message.trim().slice(0, 300) },
    ];
    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured.' });
    res.json({ reply });
  } catch (err) {
    console.error('Kofi demo chat error:', err.message);
    res.status(500).json({ error: 'AI service unavailable. Please try again.' });
  }
});

module.exports = router;