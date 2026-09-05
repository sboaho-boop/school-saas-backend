function parseOptions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

const AUTO_GRADED = ['mcq', 'truefalse', 'number'];

function gradeAnswer(question, answer) {
  if (question == null) return { correct: false, points: 0 };
  const points = parseFloat(question.points) || 0;
  if (answer === undefined || answer === null || answer === '') {
    return { correct: false, points: 0 };
  }
  const type = question.type || 'mcq';
  const correct = question.correctAnswer == null ? '' : String(question.correctAnswer).trim();

  if (type === 'mcq' || type === 'truefalse') {
    const opts = parseOptions(question.options);
    const a = String(answer).trim();
    const matchesText = opts.some((o) => o != null && String(o).trim() === a);
    const b = a;
    if (b === correct) return { correct: true, points };
    // Support correctAnswer stored as option index ("0".."3") or option text
    if (!isNaN(parseInt(correct)) && opts.length > 0 && parseInt(correct) < opts.length) {
      const byIndex = opts[parseInt(correct)];
      if (byIndex != null && String(byIndex).trim() === a) return { correct: true, points };
    }
    if (type === 'truefalse') {
      // accept True/False case-insensitively against index 0/1
      if (correct === '0' && a.toLowerCase() === 'true') return { correct: true, points };
      if (correct === '1' && a.toLowerCase() === 'false') return { correct: true, points };
    }
    if (type === 'mcq' && matchesText) return { correct: false, points };
    return { correct: false, points };
  }

  if (type === 'number') {
    const a = parseFloat(String(answer).trim());
    const b = parseFloat(correct);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) < 1e-9) return { correct: true, points };
    return { correct: false, points };
  }

  // theory — no auto grading
  return { correct: false, points };
}

function autoGrade(questions, answers) {
  const parsed = typeof answers === 'string' ? JSON.parse(answers || '{}') : (answers || {});
  let score = 0;
  let correct = 0;
  const statusMap = {};
  for (const q of questions) {
    if (!AUTO_GRADED.includes(q.type || 'mcq')) continue;
    const res = gradeAnswer(q, parsed[q.id]);
    if (res.correct) { score += res.points; correct++; }
    statusMap[q.id] = { correct: res.correct, points: res.points };
  }
  return { score, correct, statusMap };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPaper(questions, shuffleQuestions, toStudent) {
  let list = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (shuffleQuestions) list = shuffle(list);
  return list.map((q) => {
    if (!toStudent) return q;
    const { correctAnswer, ...rest } = q;
    return {
      ...rest,
      options: q.type === 'truefalse' && (!q.options || q.options.length === 0) ? ['True', 'False'] : parseOptions(q.options),
    };
  });
}

module.exports = { parseOptions, gradeAnswer, autoGrade, shuffle, buildPaper, AUTO_GRADED };