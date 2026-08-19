const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.get('/hubtel', authenticate, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.schoolId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelMerchantAccount: true,
        hubtelDisbursementAccount: true,
        hubtelSmsClientId: true,
        hubtelSmsClientSecret: true,
        smsSenderId: true,
      },
    });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ credentials: school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/hubtel', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { hubtelClientId, hubtelClientSecret, hubtelMerchantAccount, hubtelDisbursementAccount, hubtelSmsClientId, hubtelSmsClientSecret, smsSenderId } = req.body;
    const school = await prisma.school.update({
      where: { id: req.schoolId },
      data: {
        hubtelClientId: hubtelClientId || '',
        hubtelClientSecret: hubtelClientSecret || '',
        hubtelMerchantAccount: hubtelMerchantAccount || '',
        hubtelDisbursementAccount: hubtelDisbursementAccount || '',
        hubtelSmsClientId: hubtelSmsClientId || '',
        hubtelSmsClientSecret: hubtelSmsClientSecret || '',
        smsSenderId: smsSenderId || '',
      },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelMerchantAccount: true,
        hubtelDisbursementAccount: true,
        hubtelSmsClientId: true,
        hubtelSmsClientSecret: true,
        smsSenderId: true,
      },
    });
    res.json({ message: 'Hubtel credentials saved', credentials: school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Onboarding ──────────────────────────────────────

router.get('/onboarding-status', authenticate, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId }, select: { onboardingComplete: true } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const [termCount, classCount, subjectCount, staffCount, studentCount] = await Promise.all([
      prisma.term.count({ where: { schoolId: req.schoolId } }),
      prisma.academicClass.count({ where: { schoolId: req.schoolId } }),
      prisma.subject.count({ where: { schoolId: req.schoolId } }),
      prisma.staff.count({ where: { schoolId: req.schoolId } }),
      prisma.student.count({ where: { schoolId: req.schoolId } }),
    ]);

    res.json({
      onboardingComplete: school.onboardingComplete,
      progress: { terms: termCount, classes: classCount, subjects: subjectCount, staff: staffCount, students: studentCount },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/onboarding-complete', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.school.update({ where: { id: req.schoolId }, data: { onboardingComplete: true } });
    res.json({ message: 'Onboarding marked as complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { name, address, country, schoolType, primaryColor } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address;
    if (country !== undefined) data.country = country;
    if (schoolType !== undefined) data.schoolType = schoolType;
    if (primaryColor !== undefined) data.primaryColor = primaryColor;
    const school = await prisma.school.update({ where: { id: req.schoolId }, data });
    res.json(school);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
