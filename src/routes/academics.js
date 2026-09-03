const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = Router();
router.use(authenticate);

router.get('/classes', async (req, res) => {
  const classes = await prisma.academicClass.findMany({
    where: { schoolId: req.schoolId },
    include: { subjects: true },
    orderBy: { name: 'asc' },
  });
  res.json(classes);
});

router.post('/classes', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const cls = await prisma.academicClass.create({ data: { ...req.body, schoolId: req.schoolId } });
    await logAudit(req, 'create', 'class', cls.id, { name: cls.name });
    res.status(201).json(cls);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/classes/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const cls = await prisma.academicClass.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!cls) return res.status(404).json({ error: 'Not found' });
    await prisma.subject.deleteMany({ where: { classId: req.params.id } });
    await prisma.academicClass.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'class', req.params.id, { name: cls.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/subjects', async (req, res) => {
  const subjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { name: 'asc' },
  });
  res.json(subjects);
});

router.post('/subjects', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const subject = await prisma.subject.create({ data: { ...req.body, schoolId: req.schoolId } });
    await logAudit(req, 'create', 'subject', subject.id, { name: subject.name });
    res.status(201).json(subject);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/subjects/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const subject = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!subject) return res.status(404).json({ error: 'Not found' });
    await prisma.subject.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'subject', req.params.id, { name: subject.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/terms', async (req, res) => {
  const terms = await prisma.term.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { isActive: 'desc' },
  });
  res.json(terms);
});

router.post('/terms', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const term = await prisma.term.create({ data: { ...req.body, schoolId: req.schoolId } });
    res.status(201).json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/terms/:id/activate', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.term.updateMany({ where: { schoolId: req.schoolId, isActive: true }, data: { isActive: false } });
    const term = await prisma.term.update({ where: { id: req.params.id }, data: { isActive: true } });
    res.json(term);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function generateMeetingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PTA-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueMeetingCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateMeetingCode();
    const existing = await prisma.classMeeting.findUnique({ where: { meetingCode: code } });
    if (!existing) return code;
  }
  return `PTA-${Date.now().toString(36).toUpperCase()}`;
}

router.get('/meetings', async (req, res) => {
  try {
    const where = { schoolId: req.schoolId };
    if (req.query.classId) where.classId = String(req.query.classId);
    if (req.query.status) where.status = String(req.query.status);
    const meetings = await prisma.classMeeting.findMany({
      where,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ meetingDate: 'desc' }, { startTime: 'desc' }],
    });
    res.json(meetings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/meetings', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const { classId, title, agenda, meetingDate, startTime, endTime } = req.body;
    if (!classId || !title || !meetingDate || !startTime) {
      return res.status(400).json({ error: 'classId, title, meetingDate and startTime required' });
    }
    const cls = await prisma.academicClass.findFirst({ where: { id: classId, schoolId: req.schoolId } });
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const meetingCode = await uniqueMeetingCode();
    const meeting = await prisma.classMeeting.create({
      data: {
        schoolId: req.schoolId,
        classId,
        createdById: req.user.id,
        title,
        agenda: agenda || '',
        meetingDate,
        startTime,
        endTime: endTime || '',
        status: 'scheduled',
        meetingCode,
      },
    });

    const fullSchedule = `${startTime}${endTime ? ' - ' + endTime : ''}`;

    await prisma.calendarEvent.create({
      data: {
        schoolId: req.schoolId,
        title: `PTA Meeting: ${title} (${cls.name})`,
        description: `Class ${cls.name} PTA meeting. Join code: ${meetingCode}. ${agenda || ''}`.trim(),
        date: meetingDate,
        endDate: meetingDate,
        time: startTime,
        endTime: endTime || null,
        type: 'meeting',
        color: '#8b5cf6',
        allDay: false,
        createdBy: req.user.id,
      },
    });

    const ann = await prisma.announcement.create({
      data: {
        schoolId: req.schoolId,
        title: `Upcoming PTA Meeting - ${cls.name}`,
        body: `PTA meeting for ${cls.name} on ${meetingDate} at ${fullSchedule}.\nTitle: ${title}\nJoin code: ${meetingCode}\n${agenda ? 'Agenda: ' + agenda : ''}`.trim(),
        authorId: req.user.id,
        priority: 'normal',
      },
      include: { author: { select: { id: true, name: true } } },
    });

    try {
      const staffUsers = await prisma.user.findMany({
        where: { schoolId: req.schoolId, role: { in: ['admin', 'headteacher', 'teaching'] } },
        select: { id: true },
      });
      for (const u of staffUsers) {
        await prisma.notification.create({
          data: {
            schoolId: req.schoolId,
            userId: u.id,
            type: 'class-meeting',
            title: `PTA Meeting - ${cls.name}`,
            message: `${title} on ${meetingDate} at ${startTime}. Join code: ${meetingCode}`,
          },
        });
      }
    } catch (_e) {
      // Notification fan-out is best-effort; never fail meeting creation because of it.
    }

    await logAudit(req, 'create', 'class-meeting', meeting.id, { title: meeting.title, className: cls.name });
    res.status(201).json({ ...meeting, announcement: ann });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/meetings/:id', async (req, res) => {
  try {
    const meeting = await prisma.classMeeting.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
      include: { class: { select: { id: true, name: true } } },
    });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/meetings/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const existing = await prisma.classMeeting.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });
    const { title, agenda, meetingDate, startTime, endTime, status } = req.body;
    const meeting = await prisma.classMeeting.update({
      where: { id: req.params.id },
      data: { title, agenda, meetingDate, startTime, endTime, status },
    });
    res.json(meeting);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/meetings/:id', requireRole('headteacher', 'admin', 'teaching'), async (req, res) => {
  try {
    const existing = await prisma.classMeeting.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });
    await prisma.classMeeting.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'class-meeting', req.params.id, { title: existing.title });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
