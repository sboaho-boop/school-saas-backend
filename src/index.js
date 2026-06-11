require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

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

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(morgan('dev'));

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billing'));

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
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

app.get('/api/audit-logs', require('./middleware/auth').authenticate, require('./middleware/auth').requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const logs = await (require('./lib/prisma')).auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`EduPlatform API running on http://localhost:${PORT}`);
});
