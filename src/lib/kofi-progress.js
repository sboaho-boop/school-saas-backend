const prisma = require('./prisma');

const SUBJECT_KEYWORDS = {
  'Mathematics': ['maths', 'math', 'mathematics', 'addition', 'subtraction', 'multiplication', 'division', 'fraction', 'decimal', 'percentage', 'geometry', 'algebra', 'number', 'counting', 'sum', 'minus', 'plus', 'times', 'divide', 'area', 'perimeter', 'fractions'],
  'English': ['english', 'grammar', 'spelling', 'vocabulary', 'reading', 'letter', 'alphabet', 'noun', 'verb', 'adjective', 'pronoun', 'comprehension', 'sentence', 'story', 'poem', 'punctuation'],
  'Science': ['science', 'plant', 'animal', 'water', 'energy', 'force', 'light', 'sound', 'weather', 'human body', 'habitat', 'temperature', 'magnet', 'evaporation', 'gravity', 'cell', 'soil', 'air'],
  'Social Studies': ['social', 'history', 'geography', 'ghana', 'culture', 'map', 'chief', 'independence', 'traditional', 'community', 'civil', 'festival', 'rivers'],
  'ICT': ['computer', 'ict', 'internet', 'technology', 'keyboard', 'mouse', 'software', 'hardware', 'email', 'typing', 'laptop'],
  'Ghanaian Language': ['twi', 'ga', 'ewe', 'fante', 'hausa', 'dagbani', 'akwaaba', 'da yie', 'words in twi', 'ghanai'],
};

function guessSubject(text) {
  const hay = (text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    const score = keywords.filter((k) => hay.includes(k)).length;
    if (score > bestScore) {
      best = subject;
      bestScore = score;
    }
  }
  return best || 'General';
}

function guessChapter(text, subject) {
  const hay = (text || '').toLowerCase();
  // Prefer the actual topic keyword(s) the student used
  const keywords = SUBJECT_KEYWORDS[subject] || [];
  const found = keywords
    .filter((k) => hay.includes(k))
    .sort((a, b) => b.length - a.length);
  if (found.length) {
    const picked = found[0];
    return picked.charAt(0).toUpperCase() + picked.slice(1);
  }
  // Fallback: first meaningful noun phrase in the message
  const words = hay.split(/[^a-z0-9 ]+/).filter(Boolean).join(' ').split(' ');
  if (words.length < 2) return subject;
  const meaningful = words.filter((w) => w.length > 3).slice(0, 3).join(' ');
  return meaningful.charAt(0).toUpperCase() + meaningful.slice(1) || subject;
}

async function recordActivity({ userId, userMessage, aiResponse, isLesson }) {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const user = await prisma.tutorUser.findUnique({ where: { id: userId }, select: { lastActiveDate: true, masteryStreak: true, xp: true, lessonsCompleted: true, topicsMastered: true } });
    if (!user) return;

    // Streak logic
    let streak = user.masteryStreak || 0;
    if (user.lastActiveDate === today) {
      // already active today, streak unchanged
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().slice(0, 10);
      streak = user.lastActiveDate === yKey ? streak + 1 : 1;
    }

    // XP + lesson award
    const xpGain = isLesson ? 10 : 2;
    const updated = {
      lastActiveDate: today,
      masteryStreak: streak,
      xp: (user.xp || 0) + xpGain,
      lessonsCompleted: isLesson ? (user.lessonsCompleted || 0) + 1 : user.lessonsCompleted || 0,
    };

    await prisma.tutorUser.update({ where: { id: userId }, data: updated });

    // Curriculum progress
    const subject = guessSubject(aiResponse || '');
    const chapter = guessChapter(userMessage, subject);
    const existing = await prisma.tutorCurriculumProgress.findUnique({
      where: { userId_subject_chapter: { userId, subject, chapter } },
    });
    if (existing) {
      await prisma.tutorCurriculumProgress.update({
        where: { id: existing.id },
        data: {
          status: existing.status === 'mastered' ? 'mastered' : 'in_progress',
          masteryScore: existing.masteryScore + (isLesson ? 10 : 2),
        },
      });
    } else {
      await prisma.tutorCurriculumProgress.create({
        data: {
          userId,
          subject,
          grade: '',
          chapter,
          title: chapter,
          status: isLesson ? 'in_progress' : 'unlocked',
          masteryScore: isLesson ? 10 : 2,
        },
      });
    }
  } catch (err) {
    console.error('[kofi-progress] recordActivity error:', err.message);
  }
}

async function getProgress(userId) {
  const user = await prisma.tutorUser.findUnique({
    where: { id: userId },
    select: { xp: true, masteryStreak: true, lastActiveDate: true, lessonsCompleted: true, topicsMastered: true, plan: true },
  });
  const curriculum = await prisma.tutorCurriculumProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  const bySubject = curriculum.reduce((acc, c) => {
    if (!acc[c.subject]) acc[c.subject] = { total: 0, mastered: 0, inProgress: 0, locked: 0 };
    acc[c.subject].total++;
    acc[c.subject][c.status] = (acc[c.subject][c.status] || 0) + 1;
    return acc;
  }, {});
  return {
    xp: user?.xp || 0,
    streak: user?.masteryStreak || 0,
    lastActiveDate: user?.lastActiveDate || '',
    lessonsCompleted: user?.lessonsCompleted || 0,
    plan: user?.plan || 'free',
    bySubject,
    topics: curriculum.map((c) => ({ subject: c.subject, chapter: c.chapter, status: c.status, masteryScore: c.masteryScore })),
  };
}

module.exports = { recordActivity, getProgress, guessSubject };
