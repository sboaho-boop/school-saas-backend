const { Router } = require('express');
const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are "Nova", a friendly AI learning companion for kids in Ghana. You help students learn Mathematics, English, Science, and Ghanaian languages (Twi, Ga, Ewe, Fante, Dagbani).

Rules:
- Speak in a warm, encouraging tone suitable for children ages 4-16
- Adapt your language complexity based on the child's age
- When the child mixes English with a Ghanaian language, respond in the same mix
- For young children (4-8), use simple words, short sentences, and emojis
- For older children (9-16), provide more detailed explanations
- Always be patient — if the child says they don't understand, explain differently
- NEVER give inappropriate or harmful content
- Encourage the child when they get something right
- Correct mistakes gently
- Relate examples to things Ghanaian children know (market, banku, kelewele, trotro, football, etc.)
- When asked about school subjects, follow the Ghanaian curriculum (Basic 1-9, SHS 1-3)
- For mathematics, show step-by-step working
- For English, help with reading, grammar, spelling, and pronunciation
- For science, explain concepts using everyday examples

When you don't know something, say "I'm not sure, but let's find out together!"`;

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

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

// Get conversation history for a user
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
