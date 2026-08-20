const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { triggerNotification, NOTIFICATION_TYPES, getClassStudentGuardians } = require('../lib/notification-engine');

const router = Router();
router.use(authenticate);

function parseClasses(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {} }
  return [];
}

router.get('/', async (req, res) => {
  try {
    const where = { schoolId: req.schoolId };
    if (req.staff && req.staff.staffType === 'teaching') {
      const classes = parseClasses(req.staff.assignedClasses);
      if (classes.length > 0) where.classId = { in: classes };
    }
    if (req.query.classId) where.classId = req.query.classId;
    const assignments = await prisma.assignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { submissions: { select: { id: true, studentId: true, status: true, grade: true } } },
    });
    res.json(assignments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
      include: {
        submissions: {
          include: { student: { select: { firstName: true, lastName: true } } },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
    if (!assignment) return res.status(404).json({ error: 'Not found' });
    res.json(assignment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const { title, description, dueDate, classId, subjectId, totalPoints, fileUrl } = req.body;
    if (!title || !description || !dueDate || !classId) return res.status(400).json({ error: 'title, description, dueDate, classId required' });
    const assignment = await prisma.assignment.create({
      data: { title, description, dueDate, classId, subjectId, totalPoints: totalPoints || 100, fileUrl, createdBy: req.user.id, schoolId: req.schoolId },
    });

    const guardians = await getClassStudentGuardians(req.schoolId, classId);
    if (guardians.length > 0) {
      triggerNotification(req.schoolId, NOTIFICATION_TYPES.ASSIGNMENT_POSTED, {
        title: `New assignment: ${title}`,
        message: `A new assignment has been posted. Due: ${dueDate}.`,
        recipients: guardians,
      }).catch(() => {});
    }

    res.status(201).json(assignment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    await prisma.submission.deleteMany({ where: { assignmentId: req.params.id } });
    await prisma.assignment.deleteMany({ where: { id: req.params.id, schoolId: req.schoolId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
