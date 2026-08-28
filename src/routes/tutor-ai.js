const { generateAIReply, detectLanguage, buildKofiSystem } = require('../lib/ai');
const { Router } = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const { authenticateTutor } = require('./tutor-auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TUTOR_AI_LIMITS = { free: 5, pro: 100, unlimited: -1 };

const LANGUAGES_FOR_WHISPER = {
  en: 'en', fr: 'fr', tw: 'ak', ha: 'ha',
  ga: 'en', ewe: 'ee', fante: 'ak', dagbani: 'dag',
};

const router = Router();
router.use(authenticateTutor);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function checkTutorLimit(userId) {
  const user = await prisma.tutorUser.findUnique({
    where: { id: userId },
    select: { plan: true, dailyUsage: true, dailyUsageDate: true },
  });
  const plan = user?.plan || 'free';
  const limit = TUTOR_AI_LIMITS[plan] ?? TUTOR_AI_LIMITS.free;
  if (limit === -1) return { allowed: true, plan, remaining: -1 };

  const today = todayKey();
  let usage = user?.dailyUsage || 0;
  if (user?.dailyUsageDate !== today) {
    await prisma.tutorUser.update({ where: { id: userId }, data: { dailyUsage: 0, dailyUsageDate: today } });
    usage = 0;
  }
  return { allowed: usage < limit, plan, remaining: Math.max(0, limit - usage), used: usage, limit };
}

async function incrementUsage(userId) {
  const today = todayKey();
  const user = await prisma.tutorUser.findUnique({ where: { id: userId }, select: { dailyUsage: true, dailyUsageDate: true } });
  if (user?.dailyUsageDate !== today) {
    await prisma.tutorUser.update({ where: { id: userId }, data: { dailyUsage: 1, dailyUsageDate: today } });
  } else {
    await prisma.tutorUser.update({ where: { id: userId }, data: { dailyUsage: { increment: 1 } } });
  }
}

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const limit = await checkTutorLimit(req.userId);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { name: true } });
    const languageCode = detectLanguage(message);

    const messages = [
      { role: 'system', content: buildKofiSystem({ name: user?.name, languageCode }) },
      ...(history || []).slice(-20),
      { role: 'user', content: message },
    ];

    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured.' });

    await prisma.tutorConversation.create({
      data: { userId: req.userId, userMessage: message, aiResponse: reply },
    }).catch(() => {});

    await incrementUsage(req.userId);
    const updatedLimit = await checkTutorLimit(req.userId);
    res.json({ reply, remaining: updatedLimit.remaining });
  } catch (err) {
    console.error('Tutor AI chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI service unavailable' });
  }
});

function buildImagePrompt(prompt) {
  const safe = String(prompt || '').trim().slice(0, 500);
  return (safe || 'a happy Ghanaian child studying')
    + '. Style: bright, friendly, child-friendly cartoon illustration for a young student (ages 4-16). '
    + 'Colorful, wholesome, educational. No scary, violent, or inappropriate content. No extra text.';
}

router.post('/image', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Describe the picture you want.' });

    const limit = await checkTutorLimit(req.userId);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    const imagePrompt = buildImagePrompt(prompt);
    let imageData = null;

    // Primary: OpenAI DALL-E 3
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
        if (b64) imageData = 'data:image/png;base64,' + b64;
      } catch (err) {
        console.error('DALL-E error:', err.message);
      }
    }

    // Fallback: Pollinations (free, no key)
    if (!imageData) {
      try {
        const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(imagePrompt) + '?width=1024&height=1024&nologo=true';
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imageData = 'data:image/png;base64,' + buf.toString('base64');
        }
      } catch (err) {
        console.error('Pollinations error:', err.message);
      }
    }

    if (!imageData) return res.status(503).json({ error: 'Image generation is not available right now. Try again later.' });

    await prisma.tutorConversation.create({
      data: { userId: req.userId, userMessage: '[image] ' + prompt, aiResponse: '[generated image] ' + prompt },
    }).catch(() => {});

    await incrementUsage(req.userId);
    const updatedLimit = await checkTutorLimit(req.userId);
    res.json({ imageData, prompt, remaining: updatedLimit.remaining });
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

    const limit = await checkTutorLimit(req.userId);
    if (!limit.allowed) {
      return res.status(403).json({ error: 'Daily limit reached (' + limit.used + '/' + limit.limit + '). Upgrade for more.', limit });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Voice not configured. Set OPENAI_API_KEY.' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const audioFile = new File([req.file.buffer], 'voice.webm', { type: req.file.mimetype || 'audio/webm' });
    const whisperLang = LANGUAGES_FOR_WHISPER[lang] || 'en';
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1', file: audioFile, language: whisperLang,
    });
    const transcribed = transcription.text || '';

    if (!transcribed.trim()) {
      return res.status(400).json({ error: 'Could not understand the audio.' });
    }

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { name: true } });
    const parsedHistory = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);
    const messages = [
      { role: 'system', content: buildKofiSystem({ name: user?.name, languageCode: lang, voice: true }) },
      ...parsedHistory.slice(-20),
      { role: 'user', content: transcribed },
    ];

    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured.' });

    await prisma.tutorConversation.create({
      data: { userId: req.userId, userMessage: '[voice/' + lang + '] ' + transcribed, aiResponse: reply },
    }).catch(() => {});

    await incrementUsage(req.userId);
    const updatedLimit = await checkTutorLimit(req.userId);
    res.json({ transcribed, reply, language: lang, remaining: updatedLimit.remaining });
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
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
