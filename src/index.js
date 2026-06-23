require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const staffRoutes = require('./routes/staff');
const financeRoutes = require('./routes/finance');
const transportRoutes = require('./routes/transport');
const taskRoutes = require('./routes/tasks');
const markRoutes = require('./routes/marks');
const academicRoutes = require('./routes/academics');
const attendanceRoutes = require('./routes/attendance');
const communicationRoutes = require('./routes/communication');
const billingRoutes = require('./routes/billing');
const importRoutes = require('./routes/import');
const walletRoutes = require('./routes/wallet');
const parentRoutes = require('./routes/parent');
const orderRoutes = require('./routes/orders');
const campusRoutes = require('./routes/campus');
const pushRoutes = require('./routes/push');
const notificationRoutes = require('./routes/notifications');
const studentPortalRoutes = require('./routes/student');
const privacyRoutes = require('./routes/privacy');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const timetableRoutes = require('./routes/timetable');
const uploadRoutes = require('./routes/upload');
const walletWebhookRoutes = require('./routes/wallet-webhook');
const superRoutes = require('./routes/super');

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://school-saas-fawn.vercel.app').split(',');

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/import', importRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/academics', academicRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/campus', campusRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/student', studentPortalRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/wallet', walletWebhookRoutes);
app.use('/api/super', superRoutes);

const path = require('path');
const fs = require('fs');
const uploadDir = process.env.UPLOAD_DIR || (process.env.RAILWAY_VOLUME_MOUNT ? path.join(process.env.RAILWAY_VOLUME_MOUNT, 'uploads') : path.join(__dirname, '..', 'uploads'));
if (fs.existsSync(uploadDir)) app.use('/uploads', express.static(uploadDir));

app.get('/api/audit-logs', require('./middleware/auth').authenticate, require('./middleware/auth').requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const logs = await (require('./lib/prisma')).auditLog.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

try {
  const { ensureVapidKeys } = require('./lib/web-push');
  ensureVapidKeys();
} catch {}

app.listen(PORT, () => {
  console.log(`EduPlatform API running on http://localhost:${PORT}`);
});
