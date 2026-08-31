const { generateAIReply, streamAIReply, transcribeAudio, detectLanguage, buildKofiSystem } = require('../lib/ai');
const { parseRichReply, resolveImages, stripImageData, generateImage, buildClearPrompt } = require('../lib/rich-media');
const { Router } = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const { authenticateTutor } = require('./tutor-auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TUTOR_AI_LIMITS = { free: 5, pro: 100, unlimited: -1 };

const router = Router();
router.use(authenticateTutor);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function computeTutorLimit(user) {
  const plan = user?.plan || 'free';
  const limit = TUTOR_AI_LIMITS[plan] ?? TUTOR_AI_LIMITS.free;
  const today = todayKey();
  let used = user?.dailyUsage || 0;
  const isNewDay = user?.dailyUsageDate !== today;
  if (isNewDay) used = 0;
  return { plan, limit, used, isNewDay, allowed: limit === -1 ? true : used < limit, remaining: limit === -1 ? -1 : Math.max(0, limit - used) };
}

async function persistTutorUsage(userId, nextUsed, isNewDay, createConversation) {
  const today = todayKey();
  await prisma.tutorUser.update({ where: { id: userId }, data: { dailyUsage: nextUsed, dailyUsageDate: today } });
  if (createConversation) await prisma.tutorConversation.create(createConversation);
}

router.post('/chat', async (req, res) => {
  try {
    const { message, history, image } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { name: true, plan: true, dailyUsage: true, dailyUsageDate: true } });
    const limit = computeTutorLimit(user);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    const languageCode = detectLanguage(message);
    const userMsg = { role: 'user', content: message };
    if (image) userMsg.image = image;
    const messages = [
      { role: 'system', content: buildKofiSystem({ name: user?.name, languageCode }) },
      ...(history || []).slice(-20),
      userMsg,
    ];

    const raw = await generateAIReply(messages);
    if (!raw) return res.status(503).json({ error: 'AI service not configured.' });

    const parsed = parseRichReply(raw);
    const resolvedCount = await resolveImages(parsed.media);
    if (resolvedCount > 0) {
      const dataUri = parsed.media.find((m) => m.type === 'image' && m.data);
      if (dataUri) {
        const m = /^data:image\/([a-z0-9+]+);base64,(.+)$/.exec(dataUri.data);
        if (m) dataUri.data = 'data:image/' + m[1] + ';base64,' + m[2];
      }
    }
    const reply = parsed.text;
    const media = parsed.media;

    const remaining = limit.remaining === -1 ? -1 : Math.max(0, limit.remaining - 1);
    persistTutorUsage(req.userId, limit.isNewDay ? 1 : limit.used + 1, limit.isNewDay, {
      data: { userId: req.userId, userMessage: message, aiResponse: reply, media: media ? JSON.stringify(stripImageData(media)) : null },
    }).catch(() => {});

    res.json({ reply, remaining, media });
  } catch (err) {
    console.error('Tutor AI chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI service unavailable' });
  }
});

router.post('/chat/stream', async (req, res) => {
  try {
    const { message, history, image } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { name: true, plan: true, dailyUsage: true, dailyUsageDate: true } });
    const limit = computeTutorLimit(user);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    const languageCode = detectLanguage(message);
    const userMsg = { role: 'user', content: message };
    if (image) userMsg.image = image;
    const messages = [
      { role: 'system', content: buildKofiSystem({ name: user?.name, languageCode }) },
      ...(history || []).slice(-20),
      userMsg,
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });
    const send = (obj) => { if (!aborted) res.write('data: ' + JSON.stringify(obj) + '\n\n'); };

    let text = '';
    for await (const token of streamAIReply(messages)) {
      if (aborted) break;
      text += token;
      send({ token });
    }

    if (!text.trim()) {
      if (!aborted) send({ error: 'AI service not configured.' });
      res.end();
      return;
    }

    const parsed = parseRichReply(text);
    await resolveImages(parsed.media);
    const media = parsed.media;
    const reply = parsed.text;
    if (media && media.length) send({ media });
    send({ reply });

    const remaining = limit.remaining === -1 ? -1 : Math.max(0, limit.remaining - 1);
    send({ done: true, remaining });
    res.end();

    if (!aborted) {
      persistTutorUsage(req.userId, limit.isNewDay ? 1 : limit.used + 1, limit.isNewDay, {
        data: { userId: req.userId, userMessage: message, aiResponse: reply, media: media && media.length ? JSON.stringify(stripImageData(media)) : null },
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Tutor AI stream error:', err.message);
    if (!res.headersSent) return res.status(500).json({ error: err.message || 'AI service unavailable' });
    res.end();
  }
});

// Lazy import of the MIME detection used by the rich-media helper.
function detectMime(buf) {
  if (!buf || buf.length < 4) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  return 'png';
}

router.post('/image', async (req, res) => {
  try {
    const { prompt, style } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Describe the picture you want.' });

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { plan: true, dailyUsage: true, dailyUsageDate: true } });
    const limit = computeTutorLimit(user);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    let imagePrompt = buildImagePrompt(prompt, style);
    let imageData = null;

    // Primary: OpenAI DALL-E 3 (used only if a key is configured)
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const result = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        });
        const b64 = result.data?.[0]?.b64_json;
        if (b64) {
          imagePrompt = buildClearPrompt(prompt) + (style === 'real' ? ' realistic photograph, sharp focus, natural lighting.' : ' bright child-friendly cartoon illustration.');
          imageData = 'data:image/' + detectMime(Buffer.from(b64, 'base64')) + ';base64,' + b64;
        }
      } catch (err) {
        console.error('DALL-E error:', err.message);
      }
    }

    // Fallback: Pollinations (free, no key) with retries + correct MIME type
    if (!imageData) {
      imagePrompt = buildClearPrompt(prompt) + (style === 'real' ? ' realistic photograph, sharp focus, natural lighting.' : ' bright child-friendly cartoon illustration.');
      imageData = await generateImage(imagePrompt, { width: 1024, height: 1024 });
      if (!imageData) console.error('Pollinations failed after retries.');
    }

    if (!imageData) return res.status(503).json({ error: 'Image generation is not available right now. Try again later.' });

    const remaining = limit.remaining === -1 ? -1 : Math.max(0, limit.remaining - 1);
    persistTutorUsage(req.userId, limit.isNewDay ? 1 : limit.used + 1, limit.isNewDay, {
      data: { userId: req.userId, userMessage: '[image] ' + prompt, aiResponse: '[generated image] ' + prompt },
    }).catch(() => {});

    res.json({ imageData, prompt, remaining });
  } catch (err) {
    console.error('Tutor AI image error:', err.message);
    res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

router.post('/voice', upload.single('audio'), async (req, res) => {
  try {
    const { history, language } = req.body;
    const lang = language || 'en';

    if (!req.file) return res.status(400).json({ error: 'Audio file required' });

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { name: true, plan: true, dailyUsage: true, dailyUsageDate: true } });
    const limit = computeTutorLimit(user);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    const transcribed = await transcribeAudio(req.file.buffer, req.file.mimetype, lang);
    if (!transcribed) {
      return res.status(503).json({ error: 'Could not transcribe the audio right now. Please try again or type your message.' });
    }

    if (!transcribed.trim()) {
      return res.status(400).json({ error: 'Could not understand the audio.' });
    }
    const parsedHistory = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);
    const messages = [
      { role: 'system', content: buildKofiSystem({ name: user?.name, languageCode: lang, voice: true }) },
      ...parsedHistory.slice(-20),
      { role: 'user', content: transcribed },
    ];

    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured.' });

    const parsed = parseRichReply(reply);
    const cleanReply = parsed.text; // voice stays text-only (no media/images)

    const remaining = limit.remaining === -1 ? -1 : Math.max(0, limit.remaining - 1);
    persistTutorUsage(req.userId, limit.isNewDay ? 1 : limit.used + 1, limit.isNewDay, {
      data: { userId: req.userId, userMessage: '[voice/' + lang + '] ' + transcribed, aiResponse: cleanReply },
    }).catch(() => {});

    res.json({ transcribed, reply: cleanReply, language: lang, remaining });
  } catch (err) {
    console.error('[tutor voice] Error:', err.message);
    res.status(500).json({ error: err.message || 'Voice processing failed' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const conversations = await prisma.tutorConversation.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const data = conversations.map((c) => {
      let media = null;
      if (c.media) {
        try { media = JSON.parse(c.media); } catch { media = null; }
      }
      return { userMessage: c.userMessage, aiResponse: c.aiResponse, media };
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
