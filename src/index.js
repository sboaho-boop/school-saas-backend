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
const examRoutes = require('./routes/exams');
const incidentRoutes = require('./routes/incidents');
const libraryRoutes = require('./routes/library');
const hostelRoutes = require('./routes/hostel');
const conferenceRoutes = require('./routes/conferences');
const campaignRoutes = require('./routes/campaigns');
const lessonPlanRoutes = require('./routes/lesson-plans');
const inventoryRoutes = require('./routes/inventory');
const calendarRoutes = require('./routes/calendar');
const alumniRoutes = require('./routes/alumni');
const aiRoutes = require('./routes/ai');
const schoolSettingsRoutes = require('./routes/school-settings');
const hubtelStatusRoutes = require('./routes/hubtel-status');
const sendToBankRoutes = require('./routes/send-to-bank');
const directDebitRoutes = require('./routes/direct-debit');
const recurringInvoiceRoutes = require('./routes/recurring-invoice');
const commissionRoutes = require('./routes/commissions');
const invoicingRoutes = require('./routes/invoicing');
const verificationRoutes = require('./routes/verification');
const refundRoutes = require('./routes/refund');
const balanceRoutes = require('./routes/balance');
const smsRoutes = require('./routes/sms');
const creditScoreRoutes = require('./routes/credit-score');
const identityReportRoutes = require('./routes/identity-report');
const consumerProfileRoutes = require('./routes/consumer-profile');

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
app.use('/api/exams', examRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/hostel', hostelRoutes);
app.use('/api/conferences', conferenceRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/lesson-plans', lessonPlanRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/school', schoolSettingsRoutes);
app.use('/api/hubtel', hubtelStatusRoutes);
app.use('/api/send-to-bank', sendToBankRoutes);
app.use('/api/direct-debit', directDebitRoutes);
app.use('/api/recurring-invoice', recurringInvoiceRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/invoicing', invoicingRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/credit-score', creditScoreRoutes);
app.use('/api/identity-report', identityReportRoutes);
app.use('/api/consumer-profile', consumerProfileRoutes);

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
  console.log(`EDUPLATFORM SOFTWARE SERVICES API running on http://localhost:${PORT}`);
});
