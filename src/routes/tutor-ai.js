const { Router } = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const { authenticateTutor } = require('./tutor-auth');
const { SYSTEM_PROMPT, generateAIReply } = require('../lib/ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TUTOR_AI_LIMITS = { free: 5, pro: 100, unlimited: -1 };

const LANGUAGES_FOR_WHISPER = {
  en: 'en', fr: 'fr', tw: 'ak', ha: 'ha',
  ga: 'en', ewe: 'ee', fante: 'ak', dagbani: 'dag',
};

const LANGUAGE_NAMES = {
  en: 'English', fr: 'French', tw: 'Twi', ha: 'Hausa',
  ga: 'Ga', ewe: 'Ewe', fante: 'Fante', dagbani: 'Dagbani',
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
    const userContext = 'Student name: ' + (user?.name || 'Student');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + userContext },
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

router.post('/voice', upload.single('audio'), async (req, res) => {
  try {
    const { history, language } = req.body;
    const lang = language || 'en';
    const langName = LANGUAGE_NAMES[lang] || 'English';

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
    const userContext = 'Student name: ' + (user?.name || 'Student');
    const languageInstruction = '\nThe student is speaking in ' + langName + '. Please respond in ' + langName + '. Keep your spoken response natural and concise.';

    const parsedHistory = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + userContext + languageInstruction },
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
