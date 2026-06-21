const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = Router();
router.use(authenticate);

function generateCode() {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.get('/', async (req, res) => {
  const campuses = await prisma.campus.findMany({
    where: { schoolId: req.schoolId },
    include: {
      headTeacher: { select: { id: true, name: true, email: true } },
      _count: { select: { staff: true, users: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(campuses);
});

router.get('/:id', async (req, res) => {
  const campus = await prisma.campus.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
    include: {
      headTeacher: { select: { id: true, name: true, email: true } },
      _count: { select: { staff: true, users: true } },
      staff: { orderBy: { name: 'asc' } },
      users: { select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!campus) return res.status(404).json({ error: 'Campus not found' });
  res.json(campus);
});

router.post('/', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { name, address, headTeacherId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    let code;
    do {
      code = generateCode();
    } while (await prisma.campus.findFirst({ where: { schoolId: req.schoolId, code } }));
    const campus = await prisma.campus.create({
      data: { schoolId: req.schoolId, name, code, address: address || '', headTeacherId: headTeacherId || undefined },
    });
    await logAudit(req, 'create', 'campus', campus.id, { name, code });
    res.status(201).json(campus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { name, address, headTeacherId } = req.body;
    const data = {};
    if (name) data.name = name;
    if (address !== undefined) data.address = address;
    if (headTeacherId !== undefined) data.headTeacherId = headTeacherId || null;
    const campus = await prisma.campus.update({
      where: { id: req.params.id },
      data,
    });
    await logAudit(req, 'update', 'campus', campus.id, { updates: Object.keys(req.body) });
    res.json(campus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    await prisma.campus.delete({ where: { id: req.params.id } });
    await logAudit(req, 'delete', 'campus', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
