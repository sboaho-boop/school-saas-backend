const { Router } = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken, verifyToken } = require('../lib/jwt');
const { authenticate } = require('../middleware/auth');
const { generateAIReply, checkAILimit, detectLanguage, buildKofiSystem, transcribeAudio } = require('../lib/ai');
const { getGradeConfig } = require('../lib/gradebook-config');
const { gradeAnswer, buildPaper, AUTO_GRADED } = require('../lib/exam-engine');

const router = Router();

function authenticateStudent(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(header.split(' ')[1]);
    if (payload.role !== 'student') return res.status(403).json({ error: 'Not a student token' });
    req.studentId = payload.id;
    req.schoolId = payload.schoolId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/login', async (req, res) => {
  try {
    const { indexNumber, password } = req.body;
    if (!indexNumber || !password) return res.status(400).json({ error: 'Index number and password required' });
    const student = await prisma.student.findFirst({ where: { indexNumber } });
    if (!student) return res.status(404).json({ error: 'Student not found with this index number' });
    if (!student.password) return res.status(401).json({ error: 'Password not set. Ask your parent to set a password from their dashboard.' });
    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(401).json({ error: 'Invalid password' });
    const token = signToken({ id: student.id, indexNumber, role: 'student', schoolId: student.schoolId });
    res.json({ token, student: { id: student.id, name: `${student.firstName} ${student.lastName}`, className: student.className, indexNumber: student.indexNumber } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/dashboard', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      include: {
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
        attendanceRecs: { orderBy: { date: 'desc' }, take: 30 },
        grades: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { subject: { select: { name: true } } },
        },
      },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    // Get class teacher
    const classGroup = await prisma.academicClass.findFirst({
      where: { id: student.classId, schoolId: student.schoolId },
      select: { teacher: true },
    });
    // Attendance stats
    const totalDays = student.attendanceRecs.length;
    const presentDays = student.attendanceRecs.filter(a => a.status === 'present').length;
    const absentDays = student.attendanceRecs.filter(a => a.status === 'absent').length;
    const lateDays = student.attendanceRecs.filter(a => a.status === 'late').length;
    // Grade stats
    const avgScore = student.grades.length > 0
      ? Math.round(student.grades.reduce((s, g) => s + g.score, 0) / student.grades.length)
      : null;
    res.json({
      name: `${student.firstName} ${student.lastName}`,
      className: student.className,
      indexNumber: student.indexNumber,
      photoUrl: student.photoUrl,
      classTeacher: classGroup?.teacher || null,
      wallet: student.wallet ? { balance: student.wallet.balance, totalSpent: student.wallet.totalSpent, frozen: student.wallet.frozen } : null,
      transactions: student.wallet?.transactions || [],
      attendance: student.attendanceRecs,
      attendanceStats: { total: totalDays, present: presentDays, absent: absentDays, late: lateDays },
      grades: student.grades.map(g => ({
        id: g.id,
        score: g.score,
        grade: g.grade,
        components: g.components,
        remarks: g.remarks,
        subjectName: g.subject?.name || 'Unknown',
      })),
      avgScore,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/reports', authenticateStudent, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const report = await prisma.studentReport.create({
      data: { studentId: req.studentId, schoolId: req.schoolId, title, content },
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/reports', authenticateStudent, async (req, res) => {
  try {
    const reports = await prisma.studentReport.findMany({
      where: { studentId: req.studentId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/all-reports', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!['headteacher', 'admin'].includes(user?.role || '')) return res.status(403).json({ error: 'Only admin and headteacher can view all reports' });
    const reports = await prisma.studentReport.findMany({
      where: { schoolId: req.schoolId },
      include: { student: { select: { firstName: true, lastName: true, className: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/set-password', authenticate, async (req, res) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password) return res.status(400).json({ error: 'studentId and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const hashed = await bcrypt.hash(password, 10);
    await prisma.student.update({ where: { id: studentId }, data: { password: hashed } });
    res.json({ message: 'Student password set' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/course-site', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      select: { classId: true, firstName: true, lastName: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const cls = await prisma.academicClass.findFirst({ where: { id: student.classId, schoolId: req.schoolId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const [subjects, assignments, exams, lessonPlans, announcements, meetings, terms] = await Promise.all([
      prisma.subject.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { name: 'asc' } }),
      prisma.assignment.findMany({
        where: { classId: cls.id, schoolId: req.schoolId },
        orderBy: { dueDate: 'asc' },
        include: { submissions: { where: { studentId: req.studentId }, select: { id: true, status: true, grade: true, feedback: true, submittedAt: true } } },
      }),
      prisma.exam.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { dueDate: 'asc' }, select: { id: true, title: true, subjectId: true, duration: true, totalPoints: true, dueDate: true } }),
      prisma.lessonPlan.findMany({ where: { classId: cls.id, schoolId: req.schoolId, status: 'approved' }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.announcement.findMany({ where: { schoolId: req.schoolId, OR: [{ classId: cls.id }, { classId: null }] }, orderBy: { createdAt: 'desc' }, take: 20, include: { author: { select: { name: true } } } }),
      prisma.classMeeting.findMany({ where: { classId: cls.id, schoolId: req.schoolId }, orderBy: { meetingDate: 'desc' }, take: 10 }),
      prisma.term.findMany({ where: { schoolId: req.schoolId }, orderBy: { isActive: 'desc' } }),
    ]);

    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));
    const activeTerm = terms.find((t) => t.isActive) || terms[0];

    let myGrades = [];
    let weights = null;
    if (activeTerm) {
      const cfg = await getGradeConfig(req.schoolId);
      weights = cfg.weights;
      const grades = await prisma.grade.findMany({ where: { studentId: req.studentId, termId: activeTerm.id, schoolId: req.schoolId } });
      myGrades = subjects.map((sub) => {
        const g = grades.find((gr) => gr.subjectId === sub.id);
        let components = {};
        if (g && g.components) {
          try { components = JSON.parse(typeof g.components === 'string' ? g.components : '{}'); } catch { components = {}; }
        }
        return {
          subjectId: sub.id,
          subjectName: sub.name,
          subjectCode: sub.code,
          score: g ? g.score : 0,
          grade: g ? g.grade : '',
          remarks: g ? g.remarks : '',
          components,
        };
      });
    }

    res.json({
      class: { id: cls.id, name: cls.name, section: cls.section, teacher: cls.teacher },
      term: activeTerm ? { id: activeTerm.id, name: activeTerm.name, academicYear: activeTerm.academicYear } : null,
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, teacher: s.teacher })),
      assignments: assignments.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        dueDate: a.dueDate,
        totalPoints: a.totalPoints || 100,
        subject: subjectMap[a.subjectId] ? subjectMap[a.subjectId].name : null,
        submission: a.submissions[0] || null,
      })),
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        subjectName: subjectMap[e.subjectId] ? subjectMap[e.subjectId].name : 'General',
        duration: e.duration,
        totalPoints: e.totalPoints,
        dueDate: e.dueDate,
      })),
      lessonPlans: lessonPlans.map((lp) => ({
        id: lp.id,
        topic: lp.topic,
        week: lp.week,
        subjectName: subjectMap[lp.subjectId] ? subjectMap[lp.subjectId].name : 'General',
      })),
      announcements,
      meetings,
      weights,
      myGrades,
      stats: {
        subjectCount: subjects.length,
        assignmentCount: assignments.length,
        examCount: exams.length,
        announcementCount: announcements.length,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/assignments', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const assignments = await prisma.assignment.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: { createdAt: 'desc' },
      include: {
        submissions: { where: { studentId: req.studentId }, select: { id: true, status: true, grade: true, feedback: true, content: true, submittedAt: true } },
      },
    });
    res.json(assignments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/timetable', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true, room: true, subjectId: true, staffId: true },
    });
    const subjectIds = [...new Set(slots.filter((s) => s.subjectId).map((s) => s.subjectId))];
    const subjects = subjectIds.length
      ? await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId: req.schoolId }, select: { id: true, name: true, code: true } })
      : [];
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.id] = s; });
    res.json(slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      subjectId: s.subjectId,
      subjectName: s.subjectId && subjectMap[s.subjectId] ? subjectMap[s.subjectId].name : 'Free Period',
      subjectCode: s.subjectId && subjectMap[s.subjectId] ? subjectMap[s.subjectId].code : '',
      staffId: s.staffId,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/exam/list', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true, firstName: true, lastName: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const exams = await prisma.exam.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: { dueDate: 'asc' },
      include: { questions: { select: { id: true, points: true, type: true } }, submissions: { where: { studentId: req.studentId }, orderBy: { startedAt: 'desc' } } },
    });
    const results = exams.map((e) => {
      const latest = e.submissions[0] || null;
      const totalPoints = e.questions.reduce((s, q) => s + q.points, 0);
      const available = !latest || (e.allowRetake && latest.status === 'submitted') || latest.status === 'graded';
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        duration: e.duration,
        dueDate: e.dueDate,
        totalPoints: e.totalPoints || totalPoints,
        passScore: e.passScore,
        questionCount: e.questions.length,
        shuffleQuestions: e.shuffleQuestions,
        allowRetake: e.allowRetake,
        status: latest ? latest.status : 'not_started',
        score: latest ? latest.score : null,
        grade: latest ? latest.grade : '',
        startedAt: latest ? latest.startedAt : null,
        submittedAt: latest ? latest.submittedAt : null,
      };
    });
    res.json({ student: `${student.firstName} ${student.lastName}`, exams: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /exam/:id — get the paper (without correct answers) for taking; create/resume an attempt
router.post('/exam/:id/start', authenticateStudent, async (req, res) => {
  try {
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student || student.classId !== exam.classId) return res.status(403).json({ error: 'This exam is not for your class' });

    const existing = await prisma.examSubmission.findMany({ where: { examId: exam.id, studentId: req.studentId }, orderBy: { startedAt: 'desc' } });
    const latest = existing[0];
    if (latest && (latest.status === 'submitted' || latest.status === 'graded') && !exam.allowRetake) {
      return res.status(403).json({ error: 'Already submitted. Retakes are not allowed for this exam.' });
    }

    // Resume an in-progress attempt, else create one
    let active = latest && latest.status === 'started' ? latest : null;
    if (!active) active = await prisma.examSubmission.create({ data: { examId: exam.id, studentId: req.studentId, schoolId: req.schoolId, status: 'started', answers: '{}' } });

    const paper = buildPaper(exam.questions, exam.shuffleQuestions, true);
    res.json({ examId: exam.id, title: exam.title, description: exam.description, duration: exam.duration, totalPoints: exam.totalPoints, passScore: exam.passScore, shuffleQuestions: exam.shuffleQuestions, questions: paper, attemptId: active.id, startedAt: active.startedAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /exam/:id/save — persist answers during the attempt
router.post('/exam/:id/save', authenticateStudent, async (req, res) => {
  try {
    const { answers } = req.body;
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const active = await prisma.examSubmission.findFirst({ where: { examId: exam.id, studentId: req.studentId, schoolId: req.schoolId, status: 'started' } });
    if (!active) return res.status(404).json({ error: 'No active attempt. Start the exam first.' });
    const current = JSON.parse(active.answers || '{}');
    const next = { ...current, ...answers };
    await prisma.examSubmission.update({ where: { id: active.id }, data: { answers: JSON.stringify(next) } });
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /exam/:id/submit — final submission; auto-grade mcq/truefalse/number
router.post('/exam/:id/submit', authenticateStudent, async (req, res) => {
  try {
    const { answers } = req.body;
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const active = await prisma.examSubmission.findFirst({ where: { examId: exam.id, studentId: req.studentId, schoolId: req.schoolId, status: 'started' } });
    if (!active) return res.status(404).json({ error: 'No active attempt. Start the exam first.' });

    const parsed = JSON.parse(answers || active.answers || '{}');
    const auto = { score: 0, correct: 0 };
    for (const q of exam.questions) {
      if (!AUTO_GRADED.includes(q.type)) continue;
      const r = gradeAnswer(q, parsed[q.id]);
      if (r.correct) { auto.score += r.points; auto.correct++; }
    }
    const totalScore = exam.questions.reduce((s, q) => s + q.points, 0);
    const pct = totalScore > 0 ? (auto.score / totalScore) * 100 : 0;
    const grade = pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : pct >= 40 ? 'E' : 'F';
    const hasTheory = exam.questions.some((q) => !AUTO_GRADED.includes(q.type));

    const updated = await prisma.examSubmission.update({
      where: { id: active.id },
      data: {
        answers: JSON.stringify(parsed),
        score: auto.score,
        totalScore,
        grade: hasTheory ? '' : grade,
        graded: !hasTheory,
        status: hasTheory ? 'submitted' : 'graded',
        submittedAt: new Date(),
        endedAt: new Date(),
      },
    });
    res.json({ id: updated.id, score: auto.score, totalScore, grade: hasTheory ? '(pending)' : grade, correct: auto.correct, total: exam.questions.length, pendingTheory: hasTheory });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /exam/:id/result — student's latest attempt detail
router.get('/exam/:id/result', authenticateStudent, async (req, res) => {
  try {
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { questions: { orderBy: { order: 'asc' } } } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const sub = await prisma.examSubmission.findFirst({ where: { examId: exam.id, studentId: req.studentId, schoolId: req.schoolId }, orderBy: { startedAt: 'desc' } });
    if (!sub || sub.status === 'started') return res.status(404).json({ error: 'No submission found' });

    const answers = JSON.parse(sub.answers || '{}');
    const graded = JSON.parse(sub.gradedAnswers || '{}');
    const questions = exam.questions.map((q) => {
      const isAuto = AUTO_GRADED.includes(q.type);
      const resObj = isAuto ? gradeAnswer(q, answers[q.id]) : null;
      let answer = answers[q.id] !== undefined ? answers[q.id] : '';
      let correct = false;
      let points = 0;
      if (isAuto) { correct = resObj.correct; points = resObj.correct ? q.points : 0; }
      else { points = graded[q.id] ? (parseFloat(graded[q.id].points) || 0) : 0; correct = points > 0; }
      return {
        id: q.id,
        type: q.type,
        order: q.order,
        questionText: q.questionText,
        options: (() => { try { return JSON.parse(q.options || '[]'); } catch { return []; } })(),
        correctAnswer: q.correctAnswer,
        points: q.points,
        answer,
        correct,
        earned: points,
        teacherFeedback: graded[q.id] ? graded[q.id].feedback || '' : '',
      };
    });

    res.json({
      examId: exam.id,
      title: exam.title,
      score: sub.score,
      totalScore: sub.totalScore,
      grade: sub.grade || '',
      graded: sub.graded,
      status: sub.status,
      questions,
      submittedAt: sub.submittedAt,
      endedAt: sub.endedAt,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/exams', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.studentId }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const exams = await prisma.exam.findMany({
      where: { schoolId: req.schoolId, classId: student.classId },
      orderBy: { dueDate: 'asc' },
      select: { id: true, title: true, subjectId: true, duration: true, totalPoints: true, dueDate: true },
    });
    const subjectIds = [...new Set(exams.map((e) => e.subjectId))];
    const subjects = subjectIds.length
      ? await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId: req.schoolId }, select: { id: true, name: true } })
      : [];
    const subjectMap = {};
    subjects.forEach((s) => { subjectMap[s.id] = s.name; });
    res.json(exams.map((e) => ({
      id: e.id,
      title: e.title,
      subjectName: subjectMap[e.subjectId] || 'General',
      duration: e.duration,
      totalPoints: e.totalPoints,
      dueDate: e.dueDate,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/report-card', authenticateStudent, async (req, res) => {
  try {
    const student = await prisma.student.findFirst({ where: { id: req.studentId, schoolId: req.schoolId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const term = req.query.termId
      ? await prisma.term.findFirst({ where: { id: String(req.query.termId), schoolId: req.schoolId } })
      : await prisma.term.findFirst({ where: { schoolId: req.schoolId, isActive: true } })
        || await prisma.term.findFirst({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });

    if (!term) {
      return res.json({ student: { firstName: student.firstName, lastName: student.lastName, className: student.className }, term: null, subjects: [], totalScore: 0, totalSubjects: 0, average: 0, overallGrade: '', noTerm: true });
    }

    const grades = await prisma.grade.findMany({
      where: { studentId: req.studentId, termId: term.id, schoolId: req.schoolId },
      orderBy: { score: 'desc' },
    });

    const subjects = await prisma.subject.findMany({ where: { classId: student.classId, schoolId: req.schoolId }, orderBy: { name: 'asc' } });

    const subjectGrades = {};
    grades.forEach((g) => { subjectGrades[g.subjectId] = g; });

    const subjectScores = subjects.map((sub) => {
      const g = subjectGrades[sub.id];
      let components = {};
      if (g && g.components) {
        try { components = JSON.parse(typeof g.components === 'string' ? g.components : '{}'); } catch { components = {}; }
      }
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        subjectCode: sub.code,
        score: g ? g.score : 0,
        grade: g ? g.grade : '',
        components,
        remarks: g ? g.remarks : '',
      };
    });

    const totalScore = subjectScores.reduce((sum, s) => sum + s.score, 0);
    const totalSubjects = subjectScores.length;
    const average = totalSubjects > 0 ? Math.round((totalScore / totalSubjects) * 100) / 100 : 0;
    const overallGrade = totalSubjects > 0 ? ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E', 'F'][Math.max(0, Math.min(9, Math.floor((100 - average) / 10)))] : '';

    res.json({
      student: { firstName: student.firstName, lastName: student.lastName, className: student.className },
      term: { name: term.name, academicYear: term.academicYear },
      subjects: subjectScores,
      totalScore,
      totalSubjects,
      average,
      overallGrade,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Student AI Tutor ──────────────────────────────────────

router.post('/ai/chat', authenticateStudent, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const limit = await checkAILimit(req.schoolId);
    if (!limit.allowed) {
      return res.status(403).json({
        error: `AI tutor limit reached (${limit.used}/${limit.limit} today). Your school needs to upgrade to use more.`,
        limit,
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      select: { firstName: true, className: true, classId: true },
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const studentContext = `Class: ${student.className || 'Unknown'}`;

    const studentName = student.firstName;
    const languageCode = detectLanguage(message);

    const messages = [
      { role: 'system', content: buildKofiSystem({ name: studentName, languageCode }) + '\n' + studentContext },
      ...(history || []).slice(-20),
      { role: 'user', content: message },
    ];

    const reply = await generateAIReply(messages, req.schoolId);
    if (!reply) return res.status(503).json({ error: 'AI tutor not configured yet. Contact your school administrator.' });

    prisma.aIConversation.create({
      data: {
        schoolId: req.schoolId,
        userId: req.studentId,
        userMessage: message,
        aiResponse: reply,
      },
    }).catch(() => {});

    res.json({ reply, remaining: limit.remaining });
  } catch (err) {
    console.error('Student AI chat error:', err.message);
    res.status(500).json({ error: err.message || 'AI service unavailable' });
  }
});

router.get('/ai/history', authenticateStudent, async (req, res) => {
  try {
    const conversations = await prisma.aIConversation.findMany({
      where: { schoolId: req.schoolId, userId: req.studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(conversations);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Student AI Voice ──────────────────────────────────────
const multer = require('multer');
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/ai/voice', authenticateStudent, voiceUpload.single('audio'), async (req, res) => {
  try {
    const { history, language } = req.body;
    const lang = language || 'en';

    if (!req.file) return res.status(400).json({ error: 'Audio file required' });

    const limit = await checkAILimit(req.schoolId);
    if (!limit.allowed) {
      return res.status(403).json({ error: `AI tutor limit reached (${limit.used}/${limit.limit} today). Your school needs to upgrade to use more.`, limit });
    }

    const transcribed = await transcribeAudio(req.file.buffer, req.file.mimetype, lang);
    if (!transcribed) {
      return res.status(503).json({ error: 'Could not transcribe the audio right now. Please try again or type your message.' });
    }

    if (!transcribed.trim()) {
      return res.status(400).json({ error: 'Could not understand the audio. Please try again.' });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.studentId },
      select: { firstName: true, className: true, classId: true },
    });

    const studentCtx = `Class: ${student?.className || 'Unknown'}`;

    const parsedHistory = typeof history === 'string' ? JSON.parse(history || '[]') : (history || []);

    const messages = [
      { role: 'system', content: buildKofiSystem({ name: student?.firstName, languageCode: lang, voice: true }) + '\n' + studentCtx },
      ...parsedHistory.slice(-20),
      { role: 'user', content: transcribed },
    ];

    const reply = await generateAIReply(messages, req.schoolId);
    if (!reply) return res.status(503).json({ error: 'AI tutor not configured yet. Contact your school administrator.' });

    await prisma.aIConversation.create({
      data: {
        schoolId: req.schoolId,
        userId: req.studentId,
        userMessage: `[voice/${lang}] ${transcribed}`,
        aiResponse: reply,
      },
    }).catch(() => {});

    res.json({ transcribed, reply, language: lang, remaining: limit.remaining });
  } catch (err) {
    console.error('[student/voice] Error:', err.message);
    res.status(500).json({ error: err.message || 'Voice processing failed' });
  }
});

module.exports = router;
