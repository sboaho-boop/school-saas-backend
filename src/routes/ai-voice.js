const { Router } = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { generateAIReply, checkAILimit, buildKofiSystem, transcribeAudio } = require('../lib/ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

async function getSchoolContext(schoolId) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
  const studentCount = await prisma.student.count({ where: { schoolId } });
  const staffCount = await prisma.staff.count({ where: { schoolId } });
  return { schoolName: school?.name || 'Unknown', studentCount, staffCount };
}

router.post('/voice', upload.single('audio'), async (req, res) => {
  try {
    const { history, language, studentContext } = req.body;
    const lang = language || 'en';

    if (!req.file) return res.status(400).json({ error: 'Audio file required' });

    const limit = await checkAILimit(req.schoolId);
    if (!limit.allowed) {
      return res.status(403).json({
        error: `AI tutor limit reached (${limit.used}/${limit.limit} today). Upgrade to Pro for more.`,
        limit,
      });
    }

    let transcribed = await transcribeAudio(req.file.buffer, req.file.mimetype, lang);
    if (!transcribed) {
      return res.status(503).json({ error: 'Could not transcribe the audio right now. Please try again or type your message.' });
    }

    if (!transcribed.trim()) {
      return res.status(400).json({ error: 'Could not understand the audio. Please try again.' });
    }

    const context = await getSchoolContext(req.schoolId);
    const schoolInfo = `School: ${context.schoolName} (${context.studentCount} students, ${context.staffCount} staff)`;

    let userContext = '';
    if (studentContext) {
      userContext = `\nStudent info: Grade ${studentContext.grade || 'unknown'}, Age ${studentContext.age || 'unknown'}`;
    }

    const parsedHistory = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);

    const messages = [
      { role: 'system', content: buildKofiSystem({ name: studentContext?.name, languageCode: lang, voice: true }) + '\n' + schoolInfo + userContext },
      ...parsedHistory.slice(-20),
      { role: 'user', content: transcribed },
    ];

    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured. Set GEMINI_API_KEY or OPENAI_API_KEY.' });

    prisma.aIConversation.create({
      data: {
        schoolId: req.schoolId,
        userId: req.user.id,
        userMessage: `[voice/${lang}] ${transcribed}`,
        aiResponse: reply,
      },
    }).catch(() => {});

    res.json({ transcribed, reply, language: lang, remaining: limit.remaining });
  } catch (err) {
    console.error('[voice] Error:', err.message);
    res.status(500).json({ error: err.message || 'Voice processing failed' });
  }
});

module.exports = router;
