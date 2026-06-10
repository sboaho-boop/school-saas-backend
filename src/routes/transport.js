const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const routes = await prisma.transportRoute.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(routes);
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.stops) data.stops = JSON.stringify(data.stops);
    data.capacity = parseInt(data.capacity, 10);
    const route = await prisma.transportRoute.create({ data });
    res.status(201).json(route);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.stops) data.stops = JSON.stringify(data.stops);
    if (data.capacity) data.capacity = parseInt(data.capacity, 10);
    const route = await prisma.transportRoute.update({ where: { id: req.params.id }, data });
    res.json(route);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.transportRoute.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
