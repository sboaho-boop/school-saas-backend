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
const aiVoiceRoutes = require('./routes/ai-voice');
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
const compactReportRoutes = require('./routes/compact-report');
const repaymentHistoryRoutes = require('./routes/repayment-history');
const sendMoneyRoutes = require('./routes/send-money');
const ussdRoutes = require('./routes/ussd');
const conversationRoutes = require('./routes/conversations');
const templateRoutes = require('./routes/templates');
const preferenceRoutes = require('./routes/notification-preferences');
const emailCampaignRoutes = require('./routes/email-campaigns');
const smsDeliveryRoutes = require('./routes/sms-delivery');
const tutorAuthRoutes = require('./routes/tutor-auth');
const tutorAIRoutes = require('./routes/tutor-ai');
const tutorSubRoutes = require('./routes/tutor-subscription');
const prisma = require('./lib/prisma');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://school-saas-fawn.vercel.app,https://eduplatformsoftware.com,https://www.eduplatformsoftware.com,https://teacherkofi.com,https://www.teacherkofi.com').split(',').map(s => s.trim());

if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'fallback-secret' || jwtSecret === 'teacher-kofi-secret' || jwtSecret.length < 24) {
    console.warn('=================================================================');
    console.warn('WARNING: JWT_SECRET is missing or weak. You MUST set a strong');
    console.warn('JWT_SECRET (>= 24 chars) in the Render dashboard or tokens are forgeable.');
    console.warn('=================================================================');
  }
}

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.log('CORS blocked origin:', origin, 'Allowed:', ALLOWED_ORIGINS);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/import', importRoutes);
app.use('/api/wallet', walletWebhookRoutes);
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
app.use('/api/ai', aiVoiceRoutes);
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
app.use('/api/compact-report', compactReportRoutes);
app.use('/api/repayment-history', repaymentHistoryRoutes);
app.use('/api/send-money', sendMoneyRoutes);
app.use('/api/ussd', ussdRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/notification-preferences', preferenceRoutes);
app.use('/api/email-campaigns', emailCampaignRoutes);
app.use('/api/sms-delivery', smsDeliveryRoutes);
app.use('/api/tutor/auth', authLimiter, tutorAuthRoutes);
app.use('/api/tutor/ai', tutorAIRoutes);
app.use('/api/tutor/subscription', tutorSubRoutes);
app.use('/api/tutor/upload', require('./routes/tutor-upload'));

const path = require('path');
const fs = require('fs');
const uploadDir = process.env.UPLOAD_DIR || (process.env.RAILWAY_VOLUME_MOUNT ? path.join(process.env.RAILWAY_VOLUME_MOUNT, 'uploads') : path.join(__dirname, '..', 'uploads'));
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '1d', immutable: true, fallthrough: false }));

app.get('/api/audit-logs', require('./middleware/auth').authenticate, require('./middleware/auth').requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const logs = await (require('./lib/prisma')).auditLog.findMany({ where: { schoolId: req.schoolId }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const message = err.type === 'entity.parse.failed' ? 'Invalid JSON in request body' : (err.status ? err.message : 'Internal server error');
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err.message);
  res.status(status).json({ error: message });
});

try {
  const { ensureVapidKeys } = require('./lib/web-push');
  ensureVapidKeys();
} catch {}

try {
  const { startCronWorkers } = require('./lib/cron-workers');
  startCronWorkers();
} catch (e) { console.error('Cron workers failed to start:', e.message); }

app.listen(PORT, async () => {
  console.log(`EDUPLATFORM SOFTWARE SERVICES API running on http://localhost:${PORT}`);
  try {
    const bcrypt = require('bcryptjs');
    const existing = await prisma.superAdmin.findUnique({ where: { email: 'sboaho@gmail.com' } });
    if (!existing) {
      const hash = await bcrypt.hash('superadmin123', 10);
      await prisma.superAdmin.create({ data: { email: 'sboaho@gmail.com', password: hash, name: 'Christopher Boakye', role: 'owner' } });
      console.log('Super admin created: sboaho@gmail.com / superadmin123');
    }
  } catch (e) { console.error('Super admin seed error:', e.message); }
});
