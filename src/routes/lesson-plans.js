const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const plans = await prisma.lessonPlan.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' } });
  res.json(plans);
});

router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  const { classId, subjectId, week, topic, objectives, materials, activities, assessment } = req.body;
  if (!classId || !subjectId || !week || !topic || !objectives) return res.status(400).json({ error: 'classId, subjectId, week, topic, objectives required' });
  const plan = await prisma.lessonPlan.create({ data: { schoolId: req.schoolId, classId, subjectId, teacherId: req.user.id, week, topic, objectives, materials: materials || '', activities: activities || '', assessment: assessment || '' } });
  res.status(201).json(plan);
});

router.put('/:id/submit', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  await prisma.lessonPlan.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: { status: 'submitted' } });
  res.json({ ok: true });
});

router.put('/:id/approve', requireRole('headteacher', 'admin'), async (req, res) => {
  await prisma.lessonPlan.updateMany({ where: { id: req.params.id, schoolId: req.schoolId }, data: { status: 'approved', approvedBy: req.user.id, approvedAt: new Date() } });
  res.json({ ok: true });
});

module.exports = router;
