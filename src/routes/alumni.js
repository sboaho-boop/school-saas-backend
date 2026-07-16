const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const alumni = await prisma.alumni.findMany({ where: { schoolId: req.schoolId }, include: { student: { select: { firstName: true, lastName: true, className: true } } }, orderBy: { graduationYear: 'desc' } });
  res.json(alumni);
});

router.post('/', async (req, res) => {
  const { studentId, graduationYear, currentOccupation, phone, email, address, socialLinks } = req.body;
  if (!studentId || !graduationYear) return res.status(400).json({ error: 'studentId and graduationYear required' });
  const existing = await prisma.alumni.findUnique({ where: { studentId } });
  if (existing) return res.status(400).json({ error: 'Already an alumnus' });
  const alum = await prisma.alumni.create({ data: { schoolId: req.schoolId, studentId, graduationYear, currentOccupation: currentOccupation || '', phone: phone || '', email: email || '', address: address || '', socialLinks: JSON.stringify(socialLinks || {}) } });
  res.status(201).json(alum);
});

module.exports = router;
