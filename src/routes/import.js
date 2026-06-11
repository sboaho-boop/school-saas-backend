const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { checkPlanLimit } = require('../middleware/planLimit');

const router = Router();
router.use(authenticate);

router.post('/students', requireRole('headteacher', 'admin'), checkPlanLimit('student'), async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }
    const classes = await prisma.academicClass.findMany();
    const classMap = {};
    classes.forEach((c) => { classMap[c.name] = c.id; });
    const created = [];
    const errors = [];
    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        if (!r.firstName || !r.lastName || !r.email) {
          errors.push({ row: i + 1, error: 'Missing required fields (firstName, lastName, email)' });
          continue;
        }
        const classId = classMap[r.className] || '';
        const data = {
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          classId: classId,
          className: r.className || '',
          dateOfBirth: r.dateOfBirth || '',
          gender: r.gender || 'male',
          parentName: r.parentName || '',
          parentPhone: r.parentPhone || '',
          parentEmail: r.parentEmail || '',
          enrollmentDate: r.enrollmentDate || new Date().toISOString().split('T')[0],
          status: r.status || 'active',
        };
        const student = await prisma.student.create({ data });
        created.push(student);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    await logAudit(req, 'import', 'students', '', { count: created.length, errors: errors.length });
    res.status(201).json({ imported: created.length, errors, students: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/staff', requireRole('headteacher', 'admin'), checkPlanLimit('staff'), async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }
    const created = [];
    const errors = [];
    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        if (!r.name || !r.email) {
          errors.push({ row: i + 1, error: 'Missing required fields (name, email)' });
          continue;
        }
        const data = {
          name: r.name,
          email: r.email,
          phone: r.phone || '',
          role: r.role || 'Staff',
          department: r.department || '',
          staffType: r.staffType || 'non-teaching',
          assignedClass: r.assignedClass || null,
          assignedSubjects: r.assignedSubjects ? JSON.stringify(r.assignedSubjects) : '[]',
          status: r.status || 'active',
          hireDate: r.hireDate || new Date().toISOString().split('T')[0],
        };
        const member = await prisma.staff.create({ data });
        created.push(member);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    await logAudit(req, 'import', 'staff', '', { count: created.length, errors: errors.length });
    res.status(201).json({ imported: created.length, errors, staff: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/marks', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }
    const results = [];
    const errors = [];
    const term = await prisma.term.findFirst({ where: { isActive: true } });
    const termId = term ? term.id : '';
    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        if (!r.studentId || !r.subjectId || r.score === undefined) {
          errors.push({ row: i + 1, error: 'Missing required fields (studentId, subjectId, score)' });
          continue;
        }
        const tid = r.termId || termId;
        const existing = await prisma.grade.findFirst({ where: { studentId: r.studentId, subjectId: r.subjectId, termId: tid } });
        if (existing) {
          const updated = await prisma.grade.update({ where: { id: existing.id }, data: { score: r.score, grade: r.grade || '', remarks: r.remarks || '' } });
          results.push(updated);
        } else {
          const created = await prisma.grade.create({ data: { studentId: r.studentId, subjectId: r.subjectId, classId: r.classId || '', termId: tid, score: r.score, grade: r.grade || '', remarks: r.remarks || '' } });
          results.push(created);
        }
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    await logAudit(req, 'import', 'marks', '', { count: results.length, errors: errors.length });
    res.status(201).json({ imported: results.length, errors, grades: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
