const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { SYSTEM_PROMPT, generateAIReply } = require('../lib/ai');

const router = Router();
router.use(authenticate);

async function getSchoolContext(schoolId) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
  const studentCount = await prisma.student.count({ where: { schoolId } });
  const staffCount = await prisma.staff.count({ where: { schoolId } });
  return { schoolName: school?.name || 'Unknown', studentCount, staffCount };
}

router.post('/chat', async (req, res) => {
  try {
    const { message, history, studentContext } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const context = await getSchoolContext(req.schoolId);
    const schoolInfo = `School: ${context.schoolName} (${context.studentCount} students, ${context.staffCount} staff)`;

    let userContext = '';
    if (studentContext) {
      userContext = `Student info: Grade ${studentContext.grade || 'unknown'}, Age ${studentContext.age || 'unknown'}, Preferred language: ${studentContext.language || 'English'}`;
    }

    const messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${schoolInfo}\n${userContext}` },
      ...(history || []).slice(-20),
      { role: 'user', content: message },
    ];

    const reply = await generateAIReply(messages);
    if (!reply) return res.status(503).json({ error: 'AI service not configured. Set GEMINI_API_KEY or OPENAI_API_KEY.' });

    await prisma.aIConversation.create({
      data: {
        schoolId: req.schoolId,
        userId: req.user.id,
        userMessage: message,
        aiResponse: reply,
      },
    }).catch(() => {});

    res.json({ reply });
  } catch (err) {
    console.error('AI chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI service unavailable' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const conversations = await prisma.aIConversation.findMany({
      where: { schoolId: req.schoolId, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(conversations);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
