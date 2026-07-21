const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkPlanLimit } = require('../middleware/planLimit');
const { logAudit } = require('../middleware/audit');
const { sendSms } = require('../lib/sms');
const { sendOtpEmail } = require('../lib/email');
const { generateStaffIndexNumber } = require('../lib/index-number');

const router = Router();
router.use(authenticate);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseStaff(s) {
  let subjects = s.assignedSubjects;
  if (typeof subjects === 'string') { try { subjects = JSON.parse(subjects); } catch { subjects = []; } }
  return { ...s, assignedSubjects: subjects, campusId: s.campus?.id || null, campusName: s.campus?.name || null, campus: undefined };
}

router.get('/', async (req, res) => {
  const staff = await prisma.staff.findMany({
    where: { schoolId: req.schoolId },
    include: { campus: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(staff.map(parseStaff));
});

router.get('/:id', async (req, res) => {
  const member = await prisma.staff.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
    include: { campus: { select: { id: true, name: true } } },
  });
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json(parseStaff(member));
});

router.post('/', requireRole('headteacher', 'admin'), checkPlanLimit('staff'), async (req, res) => {
  try {
    const creatorRole = req.user.role;

    // Hierarchy: admin can only create headteacher; headteacher creates all other staff
    if (creatorRole === 'admin' && req.body.staffType !== 'headteacher') {
      return res.status(403).json({ error: 'Admin can only create the Headteacher. The Headteacher manages all other staff.' });
    }
    if (creatorRole === 'headteacher' && req.body.staffType === 'headteacher') {
      return res.status(403).json({ error: 'Only an Admin can create a Headteacher.' });
    }
    const indexNumber = await generateStaffIndexNumber(req.schoolId);
    const data = { ...req.body, indexNumber, schoolId: req.schoolId };
    if (data.assignedSubjects) data.assignedSubjects = JSON.stringify(data.assignedSubjects);
    const member = await prisma.staff.create({ data });

    const tempPassword = crypto.randomBytes(12).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const otp = generateOtp();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        schoolId: req.schoolId,
        email: member.email,
        password: hashed,
        name: member.name,
        role: member.staffType,
        phone: member.phone || '',
        isVerified: false,
        verificationCode: otp,
        verificationExpiry: expiry,
      },
    }).catch(async () => {
      await prisma.staff.delete({ where: { id: member.id } });
      throw new Error('A user with this email already exists in this school');
    });

    const via = {};
    const emailRes = await sendOtpEmail(member.email, member.name, otp);
    if (emailRes.success) via.email = true;
    const smsRes = member.phone ? await sendSms(member.phone, `EDUPLATFORM SOFTWARE SERVICES: Your verification code is ${otp}. Expires in 15 minutes.`) : { skipped: true };
    if (smsRes.success) via.sms = true;

    await logAudit(req, 'create', 'staff', member.id, { name: member.name, verificationSent: via });

    res.status(201).json(parseStaff({
      ...member,
      verification: { otp, tempPassword, sentVia: via, expiresAt: expiry.toISOString(), message: !via.email && !via.sms ? 'No email/SMS configured. Share this code with the staff member.' : 'Verification code sent.' },
    }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const creatorRole = req.user.role;
    const target = await prisma.staff.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!target) return res.status(404).json({ error: 'Staff not found' });
    if (creatorRole === 'admin' && target.staffType !== 'headteacher') {
      return res.status(403).json({ error: 'Admin can only manage the Headteacher.' });
    }
    if (creatorRole === 'headteacher' && target.staffType === 'headteacher') {
      return res.status(403).json({ error: 'Only an Admin can manage the Headteacher.' });
    }
    const data = { ...req.body };
    if (data.assignedSubjects) data.assignedSubjects = JSON.stringify(data.assignedSubjects);
    const member = await prisma.staff.update({ where: { id: req.params.id }, data });
    await logAudit(req, 'update', 'staff', member.id, { updates: Object.keys(req.body) });
    res.json(parseStaff(member));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const creatorRole = req.user.role;
    const target = await prisma.staff.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!target) return res.status(404).json({ error: 'Staff not found' });
    if (creatorRole === 'admin' && target.staffType !== 'headteacher') {
      return res.status(403).json({ error: 'Admin can only manage the Headteacher.' });
    }
    if (creatorRole === 'headteacher' && target.staffType === 'headteacher') {
      return res.status(403).json({ error: 'Only an Admin can manage the Headteacher.' });
    }
    await prisma.staff.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'staff', req.params.id, { name: target.name });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Generate access card UID for staff
router.post('/generate-card', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ error: 'staffId required' });
    const member = await prisma.staff.findFirst({ where: { id: staffId, schoolId: req.schoolId } });
    if (!member) return res.status(404).json({ error: 'Staff not found' });

    const chars = '0123456789ABCDEF';
    let cardUid;
    let attempts = 0;
    do {
      cardUid = 'STAFF-';
      for (let i = 0; i < 8; i++) cardUid += chars[Math.floor(Math.random() * chars.length)];
      attempts++;
    } while (await prisma.staff.findFirst({ where: { cardUid, schoolId: req.schoolId } }) && attempts < 50);

    if (attempts >= 50) return res.status(500).json({ error: 'Failed to generate unique card UID' });

    await prisma.staff.update({ where: { id: staffId }, data: { cardUid } });
    await logAudit(req, 'generate-card', 'staff', staffId, { cardUid });
    res.json({ cardUid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Link wristband UID for staff
router.post('/link-wristband', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { staffId, wristbandUid } = req.body;
    if (!staffId || !wristbandUid) return res.status(400).json({ error: 'staffId and wristbandUid required' });
    const member = await prisma.staff.findFirst({ where: { id: staffId, schoolId: req.schoolId } });
    if (!member) return res.status(404).json({ error: 'Staff not found' });
    await prisma.staff.update({ where: { id: staffId }, data: { wristbandUid } });
    await logAudit(req, 'link-wristband', 'staff', staffId, { wristbandUid });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Staff tap — mark attendance by card/wristband UID
router.post('/tap', async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    const member = await prisma.staff.findFirst({
      where: { schoolId: req.schoolId, OR: [{ cardUid: uid }, { wristbandUid: uid }] },
    });
    if (!member) return res.status(404).json({ error: 'Card not linked to any staff member' });
    if (member.status !== 'active') return res.status(403).json({ error: 'Staff account is not active' });

    const today = new Date().toISOString().split('T')[0];
    const existing = await prisma.staffAttendance.findFirst({
      where: { staffId: member.id, date: today },
    });

    let attendance;
    if (existing) {
      attendance = await prisma.staffAttendance.update({
        where: { id: existing.id },
        data: { status: 'present' },
      });
    } else {
      attendance = await prisma.staffAttendance.create({
        data: { staffId: member.id, staffName: member.name, date: today, status: 'present', schoolId: req.schoolId },
      });
    }

    res.json({ message: 'Staff attendance marked', staff: member.name, role: member.role, attendance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get staff attendance records
router.get('/attendance/:staffId', async (req, res) => {
  try {
    const records = await prisma.staffAttendance.findMany({
      where: { staffId: req.params.staffId, schoolId: req.schoolId },
      orderBy: { date: 'desc' },
      take: 30,
    });
    res.json(records);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
