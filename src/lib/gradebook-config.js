const prisma = require('./prisma');

const COMPONENT_NAMES = ['classExercise', 'homework', 'quiz', 'midterm', 'exam'];
const DEFAULT_WEIGHTS = { classExercise: 10, homework: 10, quiz: 30, midterm: 20, exam: 30 };

function parseWeights(raw) {
  let weights = {};
  if (typeof raw === 'string') {
    try { weights = JSON.parse(raw || '{}'); } catch { weights = {}; }
  } else if (raw && typeof raw === 'object') {
    weights = raw;
  }
  const out = {};
  let sum = 0;
  COMPONENT_NAMES.forEach((name) => {
    const w = Math.max(0, Math.min(100, parseFloat(weights[name]) || 0));
    out[name] = w;
    sum += w;
  });
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  if (sum !== 100) {
    const scale = 100 / sum;
    COMPONENT_NAMES.forEach((name) => { out[name] = Math.round(out[name] * scale * 10) / 10; });
  }
  return out;
}

async function getGradeConfig(schoolId) {
  const rec = await prisma.gradeConfig.findUnique({ where: { schoolId } });
  const weights = parseWeights(rec ? rec.weights : null);
  return { weights, hasConfig: !!rec };
}

async function saveGradeConfig(schoolId, weights) {
  const normalized = parseWeights(weights);
  const rec = await prisma.gradeConfig.upsert({
    where: { schoolId },
    update: { weights: JSON.stringify(normalized) },
    create: { schoolId, weights: JSON.stringify(normalized) },
  });
  return { weights: normalized, hasConfig: true, id: rec.id };
}

function componentMax(weights, name) {
  return weights[name] != null ? weights[name] : (DEFAULT_WEIGHTS[name] || 0);
}

function calcTotal(components, weights) {
  const c = typeof components === 'string' ? JSON.parse(components || '{}') : (components || {});
  const w = parseWeights(weights);
  return COMPONENT_NAMES.reduce((sum, name) => sum + (parseFloat(c[name]) || 0), 0);
}

module.exports = { COMPONENT_NAMES, DEFAULT_WEIGHTS, parseWeights, getGradeConfig, saveGradeConfig, componentMax, calcTotal };