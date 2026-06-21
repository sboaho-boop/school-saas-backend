const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = Router();

function requireSuper(req, res, next) {
  let token = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    token = auth.split(' ')[1];
  } else if (req.cookies && req.cookies.edu_super_token) {
    token = req.cookies.edu_super_token;
  }
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    req.superAdminId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function generateSchoolCode(index) {
  return `SCH-${String(index).padStart(3, '0')}`;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const admin = await prisma.superAdmin.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, email: admin.email, role: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.cookie('edu_super_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 24 * 60 * 60 * 1000, path: '/' });
    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('edu_super_token', { path: '/' });
  res.json({ message: 'Logged out' });
});

router.get('/me', requireSuper, async (req, res) => {
  const admin = await prisma.superAdmin.findUnique({ where: { id: req.superAdminId } });
  if (!admin) return res.status(404).json({ error: 'Not found' });
  res.json({ id: admin.id, email: admin.email, name: admin.name });
});

router.get('/schools', requireSuper, async (req, res) => {
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { students: true, staff: true, users: true } },
      subscriptions: true,
    },
  });
  res.json(schools);
});

router.get('/schools/:id', requireSuper, async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { students: true, staff: true, users: true, wallets: true } },
      subscriptions: true,
      users: { select: { id: true, email: true, name: true, role: true } },
    },
  });
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json(school);
});

router.post('/schools', requireSuper, async (req, res) => {
  try {
    const { name, adminEmail, adminPassword, adminName } = req.body;
    if (!name || !adminEmail || !adminPassword) return res.status(400).json({ error: 'name, adminEmail, adminPassword required' });

    const existing = await prisma.user.findFirst({ where: { email: adminEmail } });
    const existingSuper = await prisma.superAdmin.findUnique({ where: { email: adminEmail } });
    if (existing || existingSuper) return res.status(400).json({ error: 'Email already in use' });

    const count = await prisma.school.count();
    const code = generateSchoolCode(count + 1);

    const school = await prisma.school.create({ data: { code, name } });

    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: { schoolId: school.id, email: adminEmail, password: hashed, name: adminName || 'School Admin', role: 'headteacher' },
    });

    await prisma.subscription.create({
      data: { schoolId: school.id, plan: 'free', status: 'active', studentLimit: 100, staffLimit: 10 },
    });

    res.status(201).json({ school, message: `School created. Code: ${code}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id', requireSuper, async (req, res) => {
  try {
    const { name, code } = req.body;
    const data = {};
    if (name) data.name = name;
    if (code) {
      const existing = await prisma.school.findUnique({ where: { code } });
      if (existing && existing.id !== req.params.id) return res.status(400).json({ error: 'Code already in use by another school' });
      data.code = code;
    }
    const school = await prisma.school.update({ where: { id: req.params.id }, data });
    res.json(school);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools/:id/students', requireSuper, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const students = await prisma.student.findMany({
      where: { schoolId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(students);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools/:id/wallets', requireSuper, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.params.id } });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const wallets = await prisma.studentWallet.findMany({
      where: { schoolId: req.params.id },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(wallets);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/schools/:id/generate-card', requireSuper, async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: req.params.id } });
    if (!student) return res.status(404).json({ error: 'Student not found in this school' });

    const chars = '0123456789ABCDEF';
    let cardUid;
    let attempts = 0;
    do {
      cardUid = 'EDU-';
      for (let i = 0; i < 8; i++) cardUid += chars[Math.floor(Math.random() * chars.length)];
      attempts++;
    } while (await prisma.studentWallet.findFirst({ where: { cardUid } }) && attempts < 50);
    if (attempts >= 50) return res.status(500).json({ error: 'Failed to generate unique card UID' });

    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      create: { studentId, studentName: `${student.firstName} ${student.lastName}`, cardUid, schoolId: req.params.id },
      update: { cardUid },
    });
    res.json({ cardUid, wallet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/schools/:id/link-wristband', requireSuper, async (req, res) => {
  try {
    const { studentId, wristbandUid } = req.body;
    if (!studentId || !wristbandUid) return res.status(400).json({ error: 'studentId and wristbandUid required' });
    const existing = await prisma.studentWallet.findFirst({ where: { schoolId: req.params.id, wristbandUid } });
    if (existing) return res.status(400).json({ error: 'Wristband UID already linked to another student' });
    const wallet = await prisma.studentWallet.upsert({
      where: { studentId },
      update: { wristbandUid },
      create: { studentId, studentName: '', wristbandUid, schoolId: req.params.id },
    });
    res.json({ wallet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/schools/:id/top-up', requireSuper, async (req, res) => {
  try {
    const { studentId, amount } = req.body;
    if (!studentId || !amount) return res.status(400).json({ error: 'studentId and amount required' });
    const wallet = await prisma.studentWallet.findFirst({ where: { studentId, schoolId: req.params.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const updated = await prisma.studentWallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: parseFloat(amount) } },
    });
    await prisma.transaction.create({
      data: { walletId: wallet.id, type: 'topup', amount: parseFloat(amount), balanceAfter: updated.balance, method: 'super_admin', service: 'topup', schoolId: req.params.id },
    });
    res.json({ wallet: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools/:id/zpl/:studentId', requireSuper, async (req, res) => {
  try {
    const { generateCardZpl } = require('../lib/zpl');
    const wallet = await prisma.studentWallet.findFirst({
      where: { studentId: req.params.studentId, schoolId: req.params.id },
    });
    if (!wallet || !wallet.cardUid) return res.status(404).json({ error: 'No card found' });
    const school = await prisma.school.findUnique({ where: { id: req.params.id } });
    const zpl = generateCardZpl({
      schoolName: school?.name || 'EduPlatform',
      studentName: wallet.studentName,
      cardUid: wallet.cardUid,
    });
    res.set('Content-Type', 'application/x-zpl');
    res.set('Content-Disposition', `attachment; filename="${wallet.cardUid}.zpl"`);
    res.send(zpl);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools/:id/zpl-bulk', requireSuper, async (req, res) => {
  try {
    const { generateBatchZpl } = require('../lib/zpl');
    const wallets = await prisma.studentWallet.findMany({
      where: { schoolId: req.params.id, cardUid: { not: null } },
    });
    if (wallets.length === 0) return res.status(404).json({ error: 'No cards to export' });
    const school = await prisma.school.findUnique({ where: { id: req.params.id } });
    const cards = wallets.map((w) => ({
      schoolName: school?.name || 'EduPlatform',
      studentName: w.studentName,
      cardUid: w.cardUid,
    }));
    const zpl = generateBatchZpl(cards);
    res.set('Content-Type', 'application/x-zpl');
    res.set('Content-Disposition', 'attachment; filename="all-cards.zpl"');
    res.send(zpl);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id', requireSuper, async (req, res) => {
  try {
    await prisma.school.delete({ where: { id: req.params.id } });
    res.json({ message: 'School deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/schools/:id/campuses', requireSuper, async (req, res) => {
  const campuses = await prisma.campus.findMany({
    where: { schoolId: req.params.id },
    include: {
      headTeacher: { select: { id: true, name: true, email: true } },
      _count: { select: { staff: true, users: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(campuses);
});

router.post('/schools/:id/campuses', requireSuper, async (req, res) => {
  try {
    const { name, address, headTeacherId, headTeacherEmail, headTeacherPassword, headTeacherName } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    let headTeacherIdFinal = headTeacherId;
    if (headTeacherEmail && headTeacherPassword) {
      const existing = await prisma.user.findFirst({ where: { email: headTeacherEmail } });
      if (existing) return res.status(400).json({ error: 'Email already in use' });
      const hashed = await bcrypt.hash(headTeacherPassword, 10);
      const ht = await prisma.user.create({
        data: { schoolId: req.params.id, email: headTeacherEmail, password: hashed, name: headTeacherName || 'Campus Head', role: 'headteacher' },
      });
      headTeacherIdFinal = ht.id;
    }

    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (await prisma.campus.findFirst({ where: { schoolId: req.params.id, code } }));

    const campus = await prisma.campus.create({
      data: { schoolId: req.params.id, name, code, address: address || '', headTeacherId: headTeacherIdFinal || undefined },
    });
    res.status(201).json(campus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/schools/:id/campuses/:campusId', requireSuper, async (req, res) => {
  try {
    const { name, address, headTeacherId } = req.body;
    const data = {};
    if (name) data.name = name;
    if (address !== undefined) data.address = address;
    if (headTeacherId !== undefined) data.headTeacherId = headTeacherId || null;
    const campus = await prisma.campus.update({ where: { id: req.params.campusId }, data });
    res.json(campus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schools/:id/campuses/:campusId', requireSuper, async (req, res) => {
  try {
    await prisma.campus.delete({ where: { id: req.params.campusId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
