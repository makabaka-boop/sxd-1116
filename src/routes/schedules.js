const express = require('express');
const router = express.Router();
const { store, createScheduleRule, createScheduleAssignment } = require('../models/store');
const { auth, requireRole } = require('../middleware/auth');

router.get('/rules', auth, (req, res) => {
  let rules = store.scheduleRules;
  if (req.query.department_id) {
    rules = rules.filter((r) => r.department_id === req.query.department_id);
  }
  if (req.query.desk_id) {
    rules = rules.filter((r) => r.desk_id === req.query.desk_id);
  }
  res.json(rules);
});

router.post('/rules', auth, requireRole('admin'), (req, res) => {
  const { name, department_id, desk_id, user_id, weekday, effective_date, expired_date } = req.body;
  if (!name || weekday === undefined) {
    return res.status(400).json({ error: 'name and weekday are required' });
  }
  if (weekday < 0 || weekday > 6) {
    return res.status(400).json({ error: 'weekday must be 0-6 (Sun-Sat)' });
  }
  if (effective_date && expired_date && effective_date > expired_date) {
    return res.status(400).json({ error: 'effective_date must be before expired_date' });
  }
  const rule = createScheduleRule({ name, department_id, desk_id, user_id, weekday, effective_date, expired_date });
  res.status(201).json(rule);
});

router.put('/rules/:id', auth, requireRole('admin'), (req, res) => {
  const rule = store.scheduleRules.find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Schedule rule not found' });
  const fields = ['name', 'department_id', 'desk_id', 'user_id', 'weekday', 'effective_date', 'expired_date'];
  for (const f of fields) {
    if (req.body[f] !== undefined) rule[f] = req.body[f];
  }
  rule.updated_at = new Date().toISOString();
  res.json(rule);
});

router.delete('/rules/:id', auth, requireRole('admin'), (req, res) => {
  const idx = store.scheduleRules.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule rule not found' });
  store.scheduleRules.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

router.get('/assignments', auth, (req, res) => {
  let assignments = store.scheduleAssignments;
  if (req.query.date) {
    assignments = assignments.filter((a) => a.date === req.query.date);
  }
  if (req.query.desk_id) {
    assignments = assignments.filter((a) => a.desk_id === req.query.desk_id);
  }
  if (req.query.user_id) {
    assignments = assignments.filter((a) => a.user_id === req.query.user_id);
  }
  res.json(assignments);
});

router.post('/assignments', auth, requireRole('admin'), (req, res) => {
  const { schedule_rule_id, desk_id, user_id, date } = req.body;
  if (!desk_id || !user_id || !date) {
    return res.status(400).json({ error: 'desk_id, user_id, and date are required' });
  }
  const assignment = createScheduleAssignment({ schedule_rule_id, desk_id, user_id, date });

  const today = new Date().toISOString().substring(0, 10);
  if (date === today) {
    const desk = store.desks.find((d) => d.id === desk_id);
    if (desk && desk.status !== 'maintenance') {
      desk.status = 'occupied';
    }
  }

  res.status(201).json(assignment);
});

router.put('/assignments/:id', auth, requireRole('admin'), (req, res) => {
  const assignment = store.scheduleAssignments.find((a) => a.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  if (req.body.status) assignment.status = req.body.status;
  if (req.body.desk_id) assignment.desk_id = req.body.desk_id;
  if (req.body.user_id) assignment.user_id = req.body.user_id;
  assignment.updated_at = new Date().toISOString();
  res.json(assignment);
});

function generateAssignmentsForDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const weekday = date.getDay();
  const activeRules = store.scheduleRules.filter((r) => {
    if (r.weekday !== weekday) return false;
    if (r.effective_date && dateStr < r.effective_date) return false;
    if (r.expired_date && dateStr > r.expired_date) return false;
    return true;
  });

  const generated = [];
  for (const rule of activeRules) {
    const exists = store.scheduleAssignments.find(
      (a) =>
        a.schedule_rule_id === rule.id &&
        a.date === dateStr &&
        a.status === 'active'
    );
    if (exists) continue;

    const targetDesk = rule.desk_id;
    if (!targetDesk) continue;

    const assignment = createScheduleAssignment({
      schedule_rule_id: rule.id,
      desk_id: targetDesk,
      user_id: rule.user_id,
      date: dateStr,
      status: 'active',
    });

    const today = new Date().toISOString().substring(0, 10);
    if (dateStr === today) {
      const desk = store.desks.find((d) => d.id === targetDesk);
      if (desk && desk.status !== 'maintenance') {
        desk.status = 'occupied';
      }
    }

    generated.push(assignment);
  }
  return generated;
}

router.post('/generate', auth, requireRole('admin'), (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  const generated = generateAssignmentsForDate(date);
  res.json({ generated_count: generated.length, assignments: generated });
});

module.exports = router;
