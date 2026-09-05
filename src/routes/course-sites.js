const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getGradeConfig, calcTotal } = require('../lib/gradebook-config');

const router = Router();
router.use(authenticate);

function parseClasses(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch {} }
  return [];
}

async function visibleClassIds(req) {
  if (req.staff && req.staff.staffType === 'teaching') {
    const names = parseClasses(req.staff.assignedClasses);
    const classes = await prisma.academicClass.findMany({ where: { schoolId: req.schoolId, name: { in: names } }, select: { id: true } });
    return classes.map(c => c.id);
  }
  return null; // null = all classes
}

// GET /api/course-sites — list classes with counts for the site picker
router.get('/', async (req, res) => {
  try {
    const ids = await visibleClassIds(req);
    const where = { schoolId: req.schoolId };
    if (ids) where.id = { in: ids };
    const classes = await prisma.academicClass.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        subjects: { select: { id: true, name: true, code: true, teacher: true } },
        _count: {
          select: {
            subjects: true,
          },
        },
      },
    });
    const classIds = classes.map(c => c.id);
    const [assignments, exams, lessonPlans, announcements, students, meetings] = await Promise.all([
      prisma.assignment.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
      prisma.exam.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
      prisma.lessonPlan.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
      prisma.announcement.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
      prisma.student.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
      prisma.classMeeting.groupBy({ by: ['classId'], where: { classId: { in: classIds }, schoolId: req.schoolId }, _count: { _all: true } }),
    ]);
    const countMap = (rows) => Object.fromEntries(rows.map(r => [r.classId, r._count._all]));
    const am = countMap(assignments), em = countMap(exams), lm = countMap(lessonPlans), anm = countMap(announcements), sm = countMap(students), mtm = countMap(meetings);
    res.json(classes.map(c => ({
      id: c.id,
      name: c.name,
      section: c.section,
      studentCount: sm[c.id] || 0,
      subjectCount: c._count.subjects || 0,
      assignmentCount: am[c.id] || 0,
      examCount: em[c.id] || 0,
      lessonPlanCount: lm[c.id] || 0,
      announcementCount: anm[c.id] || 0,
      meetingCount: mtm[c.id] || 0,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/course-sites/:classId — full bundle for one class
router.get('/:classId', async (req, res) => {
  try {
    const cls = await prisma.academicClass.findFirst({ where: { id: req.params.classId, schoolId: req.schoolId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const ids = await visibleClassIds(req);
    if (ids && !ids.includes(cls.id)) return res.status(403).json({ error: 'Not your assigned class' });

    const [subjects, assignments, exams, lessonPlans, announcements, students, meetings, terms] = await Promise.all([
      prisma.subject.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { name: 'asc' } }),
      prisma.assignment.findMany({
        where: { classId: cls.id, schoolId: req.schoolId },
        orderBy: { createdAt: 'desc' },
        include: { submissions: { select: { id: true, studentId: true, status: true, grade: true } } },
      }),
      prisma.exam.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questions: true } } } }),
      prisma.lessonPlan.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { createdAt: 'desc' } }),
      prisma.announcement.findMany({ where: { schoolId: req.schoolId, OR: [{ classId: cls.id }, { classId: null }] }, orderBy: { createdAt: 'desc' }, take: 30, include: { author: { select: { id: true, name: true } } } }),
      prisma.student.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, firstName: true, lastName: true, gender: true, status: true } }),
      prisma.classMeeting.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { meetingDate: 'desc' }, take: 20 }),
      prisma.term.findMany({ where: { schoolId: req.schoolId }, orderBy: { isActive: 'desc' } }),
    ]);

    const activeTerm = terms.find(t => t.isActive) || terms[0];

    // Enrich assignments with per-submission student names
    const studentNames = new Map(students.map(s => [s.id, `${s.firstName} ${s.lastName}`]));
    const enrichedAssignments = assignments.map(a => ({
      ...a,
      totalPoints: a.totalPoints || 100,
      submittedCount: a.submissions.filter(s => s.status === 'submitted' || s.status === 'graded' || s.status === 'returned').length,
      gradedCount: a.submissions.filter(s => s.status === 'graded').length,
      returnedCount: a.submissions.filter(s => s.status === 'returned').length,
      submissions: a.submissions.map(s => ({ ...s, studentName: studentNames.get(s.studentId) || 'Unknown' })),
    }));

    // Gradebook summary per subject (active term)
    let gradebook = [];
    let weights = null;
    if (activeTerm) {
      const cfg = await getGradeConfig(req.schoolId);
      weights = cfg.weights;
      const grades = await prisma.grade.findMany({ where: { classId: cls.id, termId: activeTerm.id, schoolId: req.schoolId } });
      gradebook = subjects.map(sub => {
        const rows = grades.filter(g => g.subjectId === sub.id);
        return {
          subjectId: sub.id,
          subjectName: sub.name,
          subjectCode: sub.code,
          teacher: sub.teacher,
          gradesCount: rows.length,
          average: rows.length ? Math.round((rows.reduce((s, g) => s + g.score, 0) / rows.length) * 10) / 10 : 0,
          max: rows.length ? Math.max(...rows.map(g => g.score)) : 0,
          min: rows.length ? Math.min(...rows.map(g => g.score)) : 0,
          gradedStudents: rows.length,
          totalStudents: students.length,
        };
      });
    }

    res.json({
      class: { id: cls.id, name: cls.name, section: cls.section },
      subjects,
      assignments: enrichedAssignments,
      exams,
      lessonPlans,
      announcements,
      students,
      meetings,
      term: activeTerm ? { id: activeTerm.id, name: activeTerm.name, academicYear: activeTerm.academicYear } : null,
      weights,
      gradebook,
      stats: {
        studentCount: students.length,
        subjectCount: subjects.length,
        assignmentCount: assignments.length,
        examCount: exams.length,
        lessonPlanCount: lessonPlans.length,
        announcementCount: announcements.length,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;