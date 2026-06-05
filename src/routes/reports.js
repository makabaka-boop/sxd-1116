const express = require('express');
const router = express.Router();
const { store } = require('../models/store');
const { generateDailyReport } = require('../services/report');
const { takeSnapshot, getSnapshot, compareSnapshotWithCurrent } = require('../services/snapshot');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  let reports = store.dailyReports;
  if (req.query.date) {
    reports = reports.filter((r) => r.date === req.query.date);
  }
  res.json(reports);
});

router.post('/generate', auth, requireRole('admin'), (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  const existing = store.dailyReports.find((r) => r.date === date);
  if (existing) {
    return res.status(409).json({ error: 'Report already exists for this date', report_id: existing.id });
  }
  const report = generateDailyReport(date);
  if (report.error) return res.status(400).json(report);
  res.status(201).json(report);
});

router.post('/:id/confirm', auth, requireRole('auditor'), (req, res) => {
  const report = store.dailyReports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.confirmed_by) {
    return res.status(400).json({ error: 'Report already confirmed' });
  }
  report.confirmed_by = req.user.id;
  report.confirmed_at = new Date().toISOString();
  res.json(report);
});

router.get('/snapshots', auth, (req, res) => {
  let snapshots = store.snapshots;
  if (req.query.date) {
    snapshots = snapshots.filter((s) => s.date === req.query.date);
  }
  if (req.query.type) {
    snapshots = snapshots.filter((s) => s.type === req.query.type);
  }
  res.json(snapshots.map((s) => ({ id: s.id, date: s.date, type: s.type, created_at: s.created_at })));
});

router.post('/snapshots', auth, requireRole('admin'), (req, res) => {
  const { date, type } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  const snapshot = takeSnapshot(date, type || 'full');
  res.status(201).json({ id: snapshot.id, date: snapshot.date, type: snapshot.type, created_at: snapshot.created_at });
});

router.get('/snapshots/:id', auth, (req, res) => {
  const snapshot = store.snapshots.find((s) => s.id === req.params.id);
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snapshot);
});

router.get('/rollback/:date', auth, (req, res) => {
  const { date } = req.params;
  const snapshot = getSnapshot(date, 'full');
  if (!snapshot) {
    return res.status(404).json({ error: 'No snapshot found for the given date', date });
  }
  res.json({ date, snapshot });
});

router.get('/compare/:date', auth, (req, res) => {
  const { date } = req.params;
  const diff = compareSnapshotWithCurrent(date);
  if (diff.error) return res.status(404).json(diff);
  res.json(diff);
});

module.exports = router;
