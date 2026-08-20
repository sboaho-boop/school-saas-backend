const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authenticate);
router.use(requireRole('headteacher', 'admin'));

router.get('/', async (req, res) => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, subject, body, variables, category } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'name and body required' });
    const template = await prisma.messageTemplate.create({
      data: {
        schoolId: req.schoolId,
        name,
        subject: subject || '',
        body,
        variables: JSON.stringify(variables || []),
        category: category || 'general',
      },
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, subject, body, variables, category } = req.body;
    const template = await prisma.messageTemplate.updateMany({
      where: { id: req.params.id, schoolId: req.schoolId },
      data: {
        ...(name && { name }),
        ...(subject !== undefined && { subject }),
        ...(body && { body }),
        ...(variables && { variables: JSON.stringify(variables) }),
        ...(category && { category }),
      },
    });
    res.json({ message: 'Template updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.messageTemplate.deleteMany({
      where: { id: req.params.id, schoolId: req.schoolId },
    });
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/preview', async (req, res) => {
  try {
    const template = await prisma.messageTemplate.findFirst({
      where: { id: req.params.id, schoolId: req.schoolId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const vars = JSON.parse(template.variables || '[]');
    const providedVars = req.body.variables || {};

    let preview = template.body;
    for (const v of vars) {
      preview = preview.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), providedVars[v] || `[${v}]`);
    }

    res.json({ subject: template.subject, body: preview });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
