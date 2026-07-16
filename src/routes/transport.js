const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

function parseRoute(r) {
  let stops = r.stops;
  if (typeof stops === 'string') { try { stops = JSON.parse(stops); } catch { stops = []; } }
  return { ...r, stops };
}

router.get('/', async (req, res) => {
  const routes = await prisma.transportRoute.findMany({
    where: { schoolId: req.schoolId },
    include: { drivers: { select: { id: true, name: true, cardUid: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(routes.map(parseRoute));
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    if (data.stops) data.stops = JSON.stringify(data.stops);
    if (data.capacity) data.capacity = parseInt(data.capacity, 10);
    const { driverIds, ...routeData } = data;
    const route = await prisma.transportRoute.create({ data: routeData });
    if (driverIds && driverIds.length > 0) {
      await prisma.transportRoute.update({
        where: { id: route.id },
        data: { drivers: { connect: driverIds.map((id) => ({ id })) } },
      });
    }
    res.status(201).json(parseRoute(route));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.transportRoute.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const data = { ...req.body };
    if (data.stops) data.stops = JSON.stringify(data.stops);
    if (data.capacity) data.capacity = parseInt(data.capacity, 10);
    const { driverIds, ...routeData } = data;
    if (driverIds) {
      await prisma.transportRoute.update({
        where: { id: req.params.id },
        data: { drivers: { set: driverIds.map((id) => ({ id })) } },
      });
    }
    const route = await prisma.transportRoute.update({ where: { id: req.params.id }, data: routeData });
    res.json(parseRoute(route));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.transportRoute.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.transportRoute.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === DRIVER TRIP CHECK-IN ===

router.post('/driver-checkin', async (req, res) => {
  try {
    const { cardUid } = req.body;
    if (!cardUid) return res.status(400).json({ error: 'Card UID required' });

    const driver = await prisma.staff.findFirst({
      where: { schoolId: req.schoolId, cardUid, status: 'active' },
    });
    if (!driver) return res.status(404).json({ error: 'No active staff found with this card' });

    const route = await prisma.transportRoute.findFirst({
      where: { schoolId: req.schoolId, drivers: { some: { id: driver.id } } },
    });
    if (!route) return res.status(404).json({ error: 'No route assigned to this driver' });

    const today = new Date().toISOString().split('T')[0];
    const existing = await prisma.driverTrip.findFirst({
      where: { schoolId: req.schoolId, staffId: driver.id, date: today },
    });

    let trip;
    if (existing) {
      trip = await prisma.driverTrip.update({
        where: { id: existing.id },
        data: { status: 'checked_in', checkInTime: new Date(), departureTime: null, arrivalTime: null, completedAt: null },
      });
    } else {
      trip = await prisma.driverTrip.create({
        data: { schoolId: req.schoolId, routeId: route.id, staffId: driver.id, date: today },
      });
    }

    res.json({ message: 'Driver checked in', driver: driver.name, route: route.name, trip });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/driver-trip/:id/depart', async (req, res) => {
  try {
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const updated = await prisma.driverTrip.update({
      where: { id: req.params.id },
      data: { status: 'departed', departureTime: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/driver-trip/:id/arrive', async (req, res) => {
  try {
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const updated = await prisma.driverTrip.update({
      where: { id: req.params.id },
      data: { status: 'arrived', arrivalTime: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/driver-trip/:id/complete', async (req, res) => {
  try {
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const updated = await prisma.driverTrip.update({
      where: { id: req.params.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/driver-trips', async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    const trips = await prisma.driverTrip.findMany({
      where: { schoolId: req.schoolId, date: today },
      include: { driver: { select: { id: true, name: true, cardUid: true } }, route: { select: { id: true, name: true } } },
      orderBy: { checkInTime: 'desc' },
    });
    res.json(trips);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
