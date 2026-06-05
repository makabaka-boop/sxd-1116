const express = require('express');
const cron = require('node-cron');
const { store, createUser, createDepartment, createDesk } = require('./models/store');
const { generateDailyReport } = require('./services/report');
const userRoutes = require('./routes/users');
const departmentRoutes = require('./routes/departments');
const scheduleRoutes = require('./routes/schedules');
const occupationRoutes = require('./routes/occupations');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = 8016;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/occupations', occupationRoutes);
app.use('/api/reports', reportRoutes);

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

function seedData() {
  const admin = createUser({ username: 'admin', role: 'admin' });
  const operator = createUser({ username: 'operator1', role: 'operator' });
  const auditor = createUser({ username: 'auditor1', role: 'auditor' });

  const devDept = createDepartment({ name: 'Dev' });
  const designDept = createDepartment({ name: 'Design' });

  const desk1 = createDesk({ name: 'A-01', department_id: devDept.id });
  const desk2 = createDesk({ name: 'A-02', department_id: devDept.id });
  const desk3 = createDesk({ name: 'B-01', department_id: designDept.id });
  const desk4 = createDesk({ name: 'B-02', department_id: designDept.id });

  console.log('--- Seed Data ---');
  console.log('Admin:', admin.id, '| Operator:', operator.id, '| Auditor:', auditor.id);
  console.log('Departments:', devDept.id, designDept.id);
  console.log('Desks:', desk1.id, desk2.id, desk3.id, desk4.id);
  console.log('------------------');
}

cron.schedule('0 23 * * *', () => {
  const today = new Date().toISOString().substring(0, 10);
  console.log(`[CRON] Generating daily report for ${today}...`);
  const existing = store.dailyReports.find((r) => r.date === today);
  if (!existing) {
    const report = generateDailyReport(today);
    if (!report.error) {
      console.log(`[CRON] Report generated: occupancy ${report.occupancy_rate}%, temp occupations ${report.temp_occupation_count}, unreleased ${report.unreleased_count}`);
    }
  }
});

seedData();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
