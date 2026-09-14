const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const prisma = require('../lib/prisma');
const { directReceiveMoney } = require('../lib/hubtel-direct-receive');
const { publicBaseUrl } = require('../lib/urls');

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.RAILWAY_VOLUME_MOUNT ? path.join(process.env.RAILWAY_VOLUME_MOUNT, 'uploads') : path.join(__dirname, '..', '..', 'uploads'));

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `mkt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname || '')}`),
});
const mediaUpload = multer({ storage: mediaStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const JWT_SECRET = process.env.JWT_SECRET || 'teacher-kofi-secret';
const CHANNELS = ['mtn-gh', 'vodafone-gh', 'tigo-gh'];
const TEACHER_SHARE = 0.7; // teacher keeps 70%, platform 30%

function signToken(role, id) {
  return jwt.sign({ id, type: 'marketplace', role }, JWT_SECRET, { expiresIn: '30d' });
}

function authenticateMarketplace(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.type !== 'marketplace') return res.status(401).json({ error: 'Invalid token' });
    req.actorId = decoded.id;
    req.actorRole = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.actorRole)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('233') ? digits : `233${digits.replace(/^0/, '')}`;
}

function isSuccess(code, status) {
  const c = String(code || '');
  const s = String(status || '');
  return c === '0000' || /succ/i.test(s) || c === '2000';
}

// ---------- Auth ----------

router.post('/auth/teacher/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await prisma.marketplaceTeacher.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const teacher = await prisma.marketplaceTeacher.create({
      data: { name, email: email.toLowerCase(), password: hash, phone: phone || '' },
      select: { id: true, name: true, email: true, phone: true, pricePerLesson: true, subjects: true, approved: true },
    });
    res.status(201).json({ teacher, token: signToken('teacher', teacher.id) });
  } catch (err) {
    console.error('Marketplace teacher register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/teacher/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const teacher = await prisma.marketplaceTeacher.findUnique({ where: { email: email.toLowerCase() } });
    if (!teacher) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, teacher.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({
      teacher: {
        id: teacher.id, name: teacher.name, email: teacher.email, phone: teacher.phone,
        bio: teacher.bio, pricePerLesson: teacher.pricePerLesson, subjects: teacher.subjects,
        status: teacher.status, approved: teacher.approved,
      },
      token: signToken('teacher', teacher.id),
    });
  } catch (err) {
    console.error('Marketplace teacher login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/student/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await prisma.marketplaceStudent.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const student = await prisma.marketplaceStudent.create({
      data: { name, email: email.toLowerCase(), password: hash, phone: phone || '' },
      select: { id: true, name: true, email: true, phone: true },
    });
    res.status(201).json({ student, token: signToken('student', student.id) });
  } catch (err) {
    console.error('Marketplace student register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/student/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const student = await prisma.marketplaceStudent.findUnique({ where: { email: email.toLowerCase() } });
    if (!student) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, student.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({
      student: { id: student.id, name: student.name, email: student.email, phone: student.phone },
      token: signToken('student', student.id),
    });
  } catch (err) {
    console.error('Marketplace student login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Teacher profile ----------

router.get('/teacher/me', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const teacher = await prisma.marketplaceTeacher.findUnique({
      where: { id: req.actorId },
      select: {
        id: true, name: true, email: true, phone: true, bio: true,
        pricePerLesson: true, subjects: true, status: true, approved: true,
        earnings: true, totalStudents: true, createdAt: true,
      },
    });
    if (!teacher) return res.status(404).json({ error: 'Account not found' });
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/teacher/me', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const { name, phone, bio, pricePerLesson, subjects } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (bio !== undefined) data.bio = bio;
    if (pricePerLesson !== undefined) {
      const price = Number(pricePerLesson);
      if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
      data.pricePerLesson = price;
    }
    if (subjects !== undefined) {
      if (!Array.isArray(subjects)) return res.status(400).json({ error: 'subjects must be an array' });
      data.subjects = JSON.stringify(subjects);
    }
    const teacher = await prisma.marketplaceTeacher.update({
      where: { id: req.actorId },
      data,
      select: {
        id: true, name: true, email: true, phone: true, bio: true,
        pricePerLesson: true, subjects: true, earnings: true, totalStudents: true,
      },
    });
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Lessons ----------

// Browse published lessons (public).
router.get('/lessons', async (req, res) => {
  try {
    const now = new Date();
    const lessons = await prisma.marketplaceLesson.findMany({
      where: { status: { in: ['scheduled', 'live'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 100,
      include: {
        teacher: { select: { id: true, name: true, bio: true } },
        _count: { select: { enrollments: { where: { status: 'paid' } } } },
      },
    });
    res.json(lessons.map((l) => ({ ...l, paidStudents: l._count.enrollments, _count: undefined })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lessons/:id', async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: { select: { id: true, name: true, bio: true, subjects: true, pricePerLesson: true } },
        _count: { select: { enrollments: { where: { status: 'paid' } } } },
      },
    });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const paidCount = lesson._count.enrollments;
    const { _count, ...rest } = lesson;
    res.json({ ...rest, paidStudents: paidCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher starts a lesson -> creates the live classroom room.
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || 'https://eduplatformsoftware.com';

router.post('/teacher/lessons/:id/start', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.teacherId !== req.actorId) return res.status(403).json({ error: 'Forbidden' });
    if (lesson.status === 'cancelled') return res.status(400).json({ error: 'Cancelled lessons cannot be started' });

    const updated = await prisma.marketplaceLesson.update({
      where: { id: lesson.id },
      data: { status: 'live', roomReady: true, joinLink: `${FRONTEND_BASE}/marketplace/room/${lesson.id}` },
    });
    res.json(updated);
  } catch (err) {
    console.error('Marketplace start lesson error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Teacher ends a lesson -> closes the classroom room.
router.post('/teacher/lessons/:id/end', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.teacherId !== req.actorId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.marketplaceLesson.update({
      where: { id: lesson.id },
      data: { status: 'ended', roomReady: false, joinLink: '' },
    });
    try {
      const { notifyLessonEnded } = require('../ws/classroom');
      notifyLessonEnded(lesson.id);
    } catch {}
    res.json(updated);
  } catch (err) {
    console.error('Marketplace end lesson error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Room access check used by the classroom page.
router.get('/room/:lessonId', authenticateMarketplace, async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.lessonId } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    let me = null;
    if (req.actorRole === 'teacher') {
      const teacher = await prisma.marketplaceTeacher.findUnique({ where: { id: req.actorId }, select: { id: true, name: true } });
      if (!teacher) return res.status(403).json({ error: 'Teacher account not found' });
      if (teacher.id !== lesson.teacherId) return res.status(403).json({ error: 'Forbidden' });
      me = { id: teacher.id, name: teacher.name, role: 'teacher' };
    } else {
      const student = await prisma.marketplaceStudent.findUnique({ where: { id: req.actorId }, select: { id: true, name: true } });
      if (!student) return res.status(403).json({ error: 'Student account not found' });
      const enrollment = await prisma.marketplaceEnrollment.findFirst({
        where: { lessonId: lesson.id, studentId: student.id, status: 'paid' },
      });
      if (!enrollment) return res.status(403).json({ error: 'You are not enrolled in this lesson' });
      me = { id: student.id, name: student.name, role: 'student' };
    }

    res.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        description: lesson.description,
        status: lesson.status,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        joinLink: lesson.joinLink,
        roomReady: lesson.roomReady,
      },
      me,
    });
  } catch (err) {
    console.error('Marketplace room access error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Media/board upload (authenticated). The room WS enforces who may actually
// attach media to the board; this just stores the file and returns a URL.
router.post('/room/upload', authenticateMarketplace, mediaUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const kind = (req.body.kind === 'video' || String(req.file.mimetype || '').startsWith('video/')) ? 'video' : 'image';
    res.json({ url: `/uploads/${req.file.filename}`, kind });
  } catch (err) {
    console.error('Marketplace media upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Teacher schedules a lesson.
router.post('/teacher/lessons', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const { subject, title, description, price, date, startTime, durationMin, maxStudents } = req.body;
    if (!subject || !title) return res.status(400).json({ error: 'Subject and title are required' });
    if (!date || !startTime) return res.status(400).json({ error: 'A date and start time are required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' });

    const priceNum = price === undefined ? 0 : Number(price);
    if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid price' });

    const dur = Number(durationMin) || 60;
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(start.getTime() + dur * 60000);
    const endTime = [String(end.getHours()).padStart(2, '0'), String(end.getMinutes()).padStart(2, '0')].join(':');

    const lesson = await prisma.marketplaceLesson.create({
      data: {
        teacherId: req.actorId,
        subject,
        title,
        description: description || '',
        price: priceNum,
        date,
        startTime,
        endTime,
        durationMin: dur,
        maxStudents: Number(maxStudents) || 50,
      },
    });
    res.status(201).json(lesson);
  } catch (err) {
    console.error('Create lesson error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Teacher's own lessons (with paid student names).
router.get('/teacher/lessons', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const lessons = await prisma.marketplaceLesson.findMany({
      where: { teacherId: req.actorId },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      include: {
        _count: { select: { enrollments: { where: { status: 'paid' } } } },
        enrollments: {
          where: { status: 'paid' },
          orderBy: { createdAt: 'asc' },
          include: { student: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    res.json(
      lessons.map((l) => ({
        ...l,
        paidStudents: l._count.enrollments,
        _count: undefined,
        students: l.enrollments.map((e) => ({ id: e.student.id, name: e.student.name, email: e.student.email })),
        enrollments: undefined,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher updates a lesson / changes status.
router.put('/teacher/lessons/:id', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.teacherId !== req.actorId) return res.status(403).json({ error: 'Forbidden' });

    const { subject, title, description, price, date, startTime, durationMin, maxStudents, status, joinLink, roomReady } = req.body;
    const data = {};
    if (subject !== undefined) data.subject = subject;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Number(price);
    if (date !== undefined) data.date = date;
    if (joinLink !== undefined) data.joinLink = joinLink;
    if (roomReady !== undefined) data.roomReady = roomReady;
    if (status !== undefined) {
      if (!['scheduled', 'live', 'ended', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      data.status = status;
    }
    if (startTime !== undefined || durationMin !== undefined) {
      const sTime = startTime || lesson.startTime;
      const dur = Number(durationMin) || lesson.durationMin;
      const start = new Date(`1970-01-01T${sTime}`);
      const end = new Date(start.getTime() + dur * 60000);
      data.startTime = sTime;
      data.endTime = [String(end.getHours()).padStart(2, '0'), String(end.getMinutes()).padStart(2, '0')].join(':');
      data.durationMin = dur;
    }

    const updated = await prisma.marketplaceLesson.update({ where: { id: lesson.id }, data });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher deletes a lesson (only if no paid students yet, or force-unlist otherwise).
router.post('/teacher/lessons/:id/delete', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.teacherId !== req.actorId) return res.status(403).json({ error: 'Forbidden' });

    const paidCount = await prisma.marketplaceEnrollment.count({
      where: { lessonId: lesson.id, status: 'paid' },
    });
    if (paidCount > 0) {
      return res.status(400).json({ error: 'This lesson already has paying students and cannot be deleted. You can cancel it instead.' });
    }
    await prisma.marketplaceEnrollment.deleteMany({ where: { lessonId: lesson.id } });
    await prisma.marketplaceLesson.delete({ where: { id: lesson.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher earnings + paid enrollments.
router.get('/teacher/earnings', authenticateMarketplace, requireRole('teacher'), async (req, res) => {
  try {
    const teacher = await prisma.marketplaceTeacher.findUnique({
      where: { id: req.actorId },
      select: { id: true, earnings: true, totalStudents: true },
    });
    const enrollments = await prisma.marketplaceEnrollment.findMany({
      where: { teacherId: req.actorId, status: 'paid' },
      orderBy: { createdAt: 'desc' },
      include: {
        lesson: { select: { id: true, title: true, subject: true, date: true, startTime: true } },
        student: { select: { name: true, email: true } },
      },
    });
    const totalRevenue = enrollments.reduce((s, e) => s + e.amount, 0);
    const totalTeacherEarn = enrollments.reduce((s, e) => s + e.teacherEarn, 0);
    const totalPlatformFee = enrollments.reduce((s, e) => s + e.platformFee, 0);
    res.json({
      earnings: teacher?.earnings || 0,
      totalStudents: teacher?.totalStudents || 0,
      totalRevenue,
      totalTeacherEarn,
      totalPlatformFee,
      enrollmentsCount: enrollments.length,
      enrollments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Enrollment & payment ----------

// Student enrolls in a lesson → initiate MoMo payment.
router.post('/lessons/:id/enroll', authenticateMarketplace, requireRole('student'), async (req, res) => {
  try {
    const { phone, channel } = req.body;
    if (!phone || !CHANNELS.includes(channel)) {
      return res.status(400).json({ error: 'Phone number and channel (mtn-gh, vodafone-gh, or tigo-gh) are required' });
    }

    const lesson = await prisma.marketplaceLesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.status === 'cancelled' || lesson.status === 'ended') {
      return res.status(400).json({ error: 'This lesson is no longer accepting enrollments' });
    }
    if (lesson.price <= 0) return res.status(400).json({ error: 'This lesson is not payable yet' });

    const existingPaid = await prisma.marketplaceEnrollment.findFirst({
      where: { lessonId: lesson.id, studentId: req.actorId, status: 'paid' },
    });
    if (existingPaid) return res.status(409).json({ error: 'You have already enrolled in this lesson' });

    const paidCount = await prisma.marketplaceEnrollment.count({
      where: { lessonId: lesson.id, status: 'paid' },
    });
    if (paidCount >= lesson.maxStudents) return res.status(400).json({ error: 'This lesson is full' });

    const student = await prisma.marketplaceStudent.findUnique({ where: { id: req.actorId } });
    if (!student) return res.status(404).json({ error: 'Student account not found' });

    // Reuse an existing pending enrollment (idempotency — don't stack MoMo requests).
    let enrollment = await prisma.marketplaceEnrollment.findFirst({
      where: { lessonId: lesson.id, studentId: student.id, status: 'pending' },
    });

    const amount = lesson.price;
    if (enrollment && enrollment.reference) {
      return res.json({ enrollment, initiating: false, message: 'A payment for this lesson is already in progress. Approve it on your phone, or check its status.', alreadyPending: true });
    }

    const clientReference = enrollment
      ? enrollment.reference
      : `MPL-${student.id}-${Date.now().toString(36)}`;

    if (!enrollment) {
      enrollment = await prisma.marketplaceEnrollment.create({
        data: {
          lessonId: lesson.id,
          studentId: student.id,
          teacherId: lesson.teacherId,
          amount,
          channel,
          reference: clientReference,
          status: 'pending',
        },
      });
    }

    const msisdn = normalizePhone(phone);
    const callbackUrl = `${publicBaseUrl(req)}/api/marketplace/hubtel-webhook`;

    const result = await directReceiveMoney({
      customerName: student.name,
      customerMsisdn: msisdn,
      customerEmail: student.email || '',
      channel,
      amount,
      description: `Enrollment: ${lesson.title} (${student.name})`,
      clientReference,
      callbackUrl,
    });

    if (result && (result.status === 'error' || result.ResponseCode && String(result.ResponseCode) !== '0000')) {
      return res.status(502).json({ error: result.message || 'Payment could not be initiated' });
    }

    res.json({
      enrollment: { id: enrollment.id, status: enrollment.status, amount, reference: clientReference },
      message: 'Payment request sent to your phone. Approve it to complete your enrollment.',
    });
  } catch (err) {
    console.error('Enroll error:', err.message);
    res.status(500).json({ error: err.message || 'Could not start enrollment' });
  }
});

// Student's enrollment status (poll after paying).
router.get('/student/enrollments/:id', authenticateMarketplace, requireRole('student'), async (req, res) => {
  try {
    const enrollment = await prisma.marketplaceEnrollment.findUnique({
      where: { id: req.params.id },
      include: {
        lesson: {
          select: { id: true, title: true, subject: true, date: true, startTime: true, endTime: true, status: true, joinLink: true },
        },
        teacher: { select: { name: true } },
      },
    });
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
    if (enrollment.studentId !== req.actorId) return res.status(403).json({ error: 'Forbidden' });
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student's lessons (paid + pending).
router.get('/student/me', authenticateMarketplace, requireRole('student'), async (req, res) => {
  try {
    const student = await prisma.marketplaceStudent.findUnique({
      where: { id: req.actorId },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });
    if (!student) return res.status(404).json({ error: 'Account not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/student/lessons', authenticateMarketplace, requireRole('student'), async (req, res) => {
  try {
    const enrollments = await prisma.marketplaceEnrollment.findMany({
      where: { studentId: req.actorId },
      orderBy: { createdAt: 'desc' },
      include: {
        lesson: {
          select: { id: true, title: true, subject: true, date: true, startTime: true, endTime: true, status: true, joinLink: true, description: true },
        },
        teacher: { select: { id: true, name: true } },
      },
    });
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hubtel payment webhook → confirm + apply 70/30 split.
router.post('/hubtel-webhook', async (req, res) => {
  try {
    console.log('Marketplace webhook received:', JSON.stringify(req.body));
    const data = req.body.Data || req.body;
    const clientReference = data.ClientReference || data.OrderId;
    const status = data.Status || data.Message || '';
    const code = String(data.ResponseCode || '');

    if (!clientReference || !String(clientReference).startsWith('MPL-')) {
      return res.json({ message: 'Not a marketplace payment' });
    }
    if (!isSuccess(code, status)) {
      return res.json({ message: 'Payment not successful', code, status });
    }

    const enrollment = await prisma.marketplaceEnrollment.findFirst({
      where: { reference: clientReference },
    });
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found for reference' });
    if (enrollment.status === 'paid') return res.json({ message: 'Already processed', enrollmentId: enrollment.id });

    const teacherEarn = Math.round(enrollment.amount * TEACHER_SHARE * 100) / 100;
    const platformFee = Math.round((enrollment.amount - teacherEarn) * 100) / 100;

    const updated = await prisma.$transaction([
      prisma.marketplaceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'paid', teacherEarn, platformFee },
      }),
      prisma.marketplaceTeacher.update({
        where: { id: enrollment.teacherId },
        data: { earnings: { increment: teacherEarn }, totalStudents: { increment: 1 } },
      }),
    ]);

    console.log(`Marketplace enrollment ${enrollment.id} paid: GHS ${enrollment.amount} (teacher ${teacherEarn} / platform ${platformFee})`);
    res.json({ message: 'Enrollment confirmed', enrollmentId: enrollment.id });
  } catch (err) {
    console.error('Marketplace webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;