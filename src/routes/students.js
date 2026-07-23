const { Router } = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimit');
const { logAudit } = require('../middleware/audit');
const { sendSms } = require('../lib/sms');
const { generateStudentIndexNumber } = require('../lib/index-number');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const where = { schoolId: req.schoolId };
  if (req.staff && req.staff.staffType === 'teaching' && req.staff.assignedClass) {
    const cls = await prisma.academicClass.findFirst({ where: { name: req.staff.assignedClass, schoolId: req.schoolId } });
    if (cls) where.classId = cls.id;
    else return res.json([]);
  }
  const students = await prisma.student.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(students);
});

router.get('/:id', async (req, res) => {
  const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!student) return res.status(404).json({ error: 'Not found' });
  res.json(student);
});

router.post('/', requireRole('headteacher', 'admin'), checkPlanLimit('student'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const indexNumber = await generateStudentIndexNumber(req.schoolId);
    const student = await prisma.student.create({ data: { ...data, indexNumber, schoolId: req.schoolId } });
    await logAudit(req, 'create', 'student', student.id, { name: `${student.firstName} ${student.lastName}`, indexNumber });
    if (student.parentPhone) {
      const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
      sendSms(student.parentPhone, `Dear parent, ${student.firstName} ${student.lastName} has been admitted to ${school?.name || 'our school'}. Welcome! - EDUPLATFORM SOFTWARE SERVICES`).catch(() => {});
    }
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const student = await prisma.student.update({ where: { id: req.params.id }, data });
    await logAudit(req, 'update', 'student', student.id, { updates: Object.keys(req.body) });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Not found' });
    const [attendance, grades, fees, wallet, reports] = await Promise.all([
      prisma.attendance.findMany({ where: { studentId: req.params.id }, orderBy: { date: 'desc' } }),
      prisma.grade.findMany({ where: { studentId: req.params.id }, include: { subject: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.feeRecord.findMany({ where: { studentId: req.params.id } }),
      prisma.studentWallet.findUnique({ where: { studentId: req.params.id }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } } }),
      prisma.studentReport.findMany({ where: { studentId: req.params.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ attendance, grades, fees, wallet, reports });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Not found' });
    await prisma.student.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'student', req.params.id, { name: `${student.firstName} ${student.lastName}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
