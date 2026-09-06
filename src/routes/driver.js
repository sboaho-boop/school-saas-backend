const { Router } = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { verifyToken } = require('../lib/jwt');

const router = Router();

function parseStops(r) {
  let stops = r.stops;
  if (typeof stops === 'string') { try { stops = JSON.parse(stops); } catch { stops = []; } }
  return stops;
}

async function authenticateDriver(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const payload = verifyToken(token);
    if (payload.role !== 'driver') return res.status(403).json({ error: 'Not a driver token' });
    const staff = await prisma.staff.findUnique({ where: { id: payload.staffId }, include: { assignedRoutes: true } });
    if (!staff || staff.status !== 'active') return res.status(401).json({ error: 'Driver not found or inactive' });
    if (staff.assignedRoutes.length === 0) return res.status(403).json({ error: 'No route assigned to this driver' });
    req.staff = staff;
    req.driverId = staff.id;
    req.schoolId = staff.schoolId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const TRIP_FIELDS = {
  include: {
    route: { select: { id: true, name: true } },
  },
};

router.post('/login', async (req, res) => {
  try {
    const { indexNumber } = req.body;
    if (!indexNumber) return res.status(400).json({ error: 'Index number required' });
    const staff = await prisma.staff.findFirst({
      where: { indexNumber: String(indexNumber).trim(), status: 'active' },
      include: { assignedRoutes: true },
    });
    if (!staff) return res.status(401).json({ error: 'No active staff found with this index number' });
    if (staff.assignedRoutes.length === 0) return res.status(403).json({ error: 'No route assigned to this staff member' });
    const token = jwt.sign({ staffId: staff.id, schoolId: staff.schoolId, role: 'driver', name: staff.name }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.json({
      token,
      driver: { id: staff.id, name: staff.name, indexNumber: staff.indexNumber, role: staff.role, schoolId: staff.schoolId },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/me', authenticateDriver, async (req, res) => {
  try {
    const staff = req.staff;
    const routes = staff.assignedRoutes.filter((r) => r.status === 'active').map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      stops: parseStops(r),
      capacity: r.capacity,
      status: r.status,
    }));
    const today = new Date().toISOString().split('T')[0];
    const trips = await prisma.driverTrip.findMany({
      where: { schoolId: req.schoolId, staffId: req.driverId, date: today },
      orderBy: { checkInTime: 'desc' },
      include: { route: { select: { id: true, name: true } } },
    });
    res.json({
      driver: { id: staff.id, name: staff.name, indexNumber: staff.indexNumber, role: staff.role, phone: staff.phone, cardUid: staff.cardUid },
      routes,
      trip: trips[0] || null,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/trip/start', authenticateDriver, async (req, res) => {
  try {
    const driver = req.staff;
    const route = driver.assignedRoutes.find((r) => r.status === 'active');
    if (!route) return res.status(403).json({ error: 'No active route assigned' });
    const today = new Date().toISOString().split('T')[0];
    const existing = await prisma.driverTrip.findFirst({ where: { schoolId: req.schoolId, staffId: driver.id, date: today } });
    let trip;
    if (existing) {
      trip = await prisma.driverTrip.update({
        where: { id: existing.id },
        data: { status: 'checked_in', checkInTime: new Date(), departureTime: null, arrivalTime: null, completedAt: null },
        ...TRIP_FIELDS,
      });
    } else {
      trip = await prisma.driverTrip.create({
        data: { schoolId: req.schoolId, routeId: route.id, staffId: driver.id, date: today },
        ...TRIP_FIELDS,
      });
    }
    res.json(trip);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function tripTransition(action) {
  const map = {
    depart: { status: 'departed', departureTime: new Date() },
    arrive: { status: 'arrived', arrivalTime: new Date() },
    complete: { status: 'completed', completedAt: new Date() },
  };
  return map[action];
}

router.put('/trip/:id/:action', authenticateDriver, async (req, res) => {
  try {
    const action = req.params.action;
    if (!['depart', 'arrive', 'complete'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId, staffId: req.driverId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const updated = await prisma.driverTrip.update({ where: { id: trip.id }, data: tripTransition(action), ...TRIP_FIELDS });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/trip/:id/students', authenticateDriver, async (req, res) => {
  try {
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId, staffId: req.driverId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const students = await prisma.student.findMany({
      where: { schoolId: req.schoolId, routeId: trip.routeId, status: 'active' },
      select: { id: true, firstName: true, lastName: true, indexNumber: true, className: true, pickupStop: true },
      orderBy: { firstName: 'asc' },
    });
    const rollCall = await prisma.driverStudent.findMany({
      where: { tripId: trip.id },
      select: { studentId: true, status: true, markedAt: true },
    });
    const byStudent = new Map(rollCall.map((rc) => [rc.studentId, rc]));
    const studentsWithRollCall = students.map((s) => ({
      ...s,
      rollCall: byStudent.get(s.id) ? { status: byStudent.get(s.id).status, markedAt: byStudent.get(s.id).markedAt } : { status: 'awaiting', markedAt: null },
    }));
    res.json({ tripId: trip.id, routeId: trip.routeId, students: studentsWithRollCall });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/trip/:id/students/:studentId', authenticateDriver, async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['awaiting', 'onboard', 'dropped'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const trip = await prisma.driverTrip.findFirst({ where: { id: req.params.id, schoolId: req.schoolId, staffId: req.driverId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const student = await prisma.student.findFirst({ where: { id: req.params.studentId, schoolId: req.schoolId, routeId: trip.routeId } });
    if (!student) return res.status(404).json({ error: 'Student is not on this route' });
    const rc = await prisma.driverStudent.upsert({
      where: { tripId_studentId: { tripId: trip.id, studentId: student.id } },
      update: { status, markedAt: new Date() },
      create: { tripId: trip.id, studentId: student.id, schoolId: req.schoolId, pickupStop: student.pickupStop || '', status, markedAt: new Date() },
    });
    res.json(rc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;