const express = require('express');
const router = express.Router();
const { store, createMaintenancePlan, isDeskUnderMaintenance } = require('../models/store');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  let plans = store.maintenancePlans;
  if (req.query.desk_id) {
    plans = plans.filter((p) => p.desk_id === req.query.desk_id);
  }
  if (req.query.status) {
    plans = plans.filter((p) => p.status === req.query.status);
  }
  if (req.query.start_date) {
    plans = plans.filter((p) => p.start_date >= req.query.start_date);
  }
  if (req.query.end_date) {
    plans = plans.filter((p) => p.end_date <= req.query.end_date);
  }
  res.json(plans);
});

router.get('/:id', auth, (req, res) => {
  const plan = store.maintenancePlans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'Maintenance plan not found' });
  res.json(plan);
});

router.post('/', auth, requireRole('admin'), (req, res) => {
  const { desk_id, start_date, end_date, reason } = req.body;
  if (!desk_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'desk_id, start_date, and end_date are required' });
  }
  if (start_date > end_date) {
    return res.status(400).json({ error: 'start_date must be before or equal to end_date' });
  }

  const desk = store.desks.find((d) => d.id === desk_id);
  if (!desk) return res.status(400).json({ error: 'Desk not found' });

  const overlappingPlan = store.maintenancePlans.find(
    (p) =>
      p.desk_id === desk_id &&
      p.status !== 'cancelled' &&
      p.status !== 'completed' &&
      p.start_date <= end_date &&
      p.end_date >= start_date
  );
  if (overlappingPlan) {
    return res.status(409).json({
      error: 'This desk already has an overlapping maintenance plan',
      conflicting_plan_id: overlappingPlan.id,
    });
  }

  let current = new Date(start_date);
  const endDate = new Date(end_date);
  const conflictingOccupations = [];
  const conflictingAssignments = [];

  while (current <= endDate) {
    const dateStr = current.toISOString().substring(0, 10);

    const activeOcc = store.temporaryOccupations.find(
      (o) => o.desk_id === desk_id && o.status === 'active'
    );
    if (activeOcc && !conflictingOccupations.find((c) => c.id === activeOcc.id)) {
      conflictingOccupations.push(activeOcc);
    }

    const dayAssignments = store.scheduleAssignments.filter(
      (a) => a.desk_id === desk_id && a.date === dateStr && a.status === 'active'
    );
    for (const a of dayAssignments) {
      if (!conflictingAssignments.find((c) => c.id === a.id)) {
        conflictingAssignments.push(a);
      }
    }

    current.setDate(current.getDate() + 1);
  }

  if (conflictingOccupations.length > 0 || conflictingAssignments.length > 0) {
    const reasons = [];
    if (conflictingOccupations.length > 0) {
      reasons.push(`desk has ${conflictingOccupations.length} unreleased temporary occupation(s)`);
    }
    if (conflictingAssignments.length > 0) {
      reasons.push(`desk has ${conflictingAssignments.length} active schedule assignment(s) in the maintenance period`);
    }
    return res.status(409).json({
      error: `Cannot create maintenance plan: ${reasons.join(' and ')}`,
      conflicting_occupations: conflictingOccupations.map((o) => o.id),
      conflicting_assignments: conflictingAssignments.map((a) => a.id),
    });
  }

  const today = new Date().toISOString().substring(0, 10);
  const status = start_date <= today && end_date >= today ? 'active' : 'scheduled';

  const plan = createMaintenancePlan({ desk_id, start_date, end_date, reason, status });

  if (status === 'active') {
    desk.status = 'maintenance';
  }

  res.status(201).json(plan);
});

router.put('/:id', auth, requireRole('admin'), (req, res) => {
  const plan = store.maintenancePlans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'Maintenance plan not found' });
  if (plan.status === 'cancelled' || plan.status === 'completed') {
    return res.status(400).json({ error: `Cannot update a ${plan.status} maintenance plan` });
  }

  const new_start_date = req.body.start_date || plan.start_date;
  const new_end_date = req.body.end_date || plan.end_date;
  if (new_start_date > new_end_date) {
    return res.status(400).json({ error: 'start_date must be before or equal to end_date' });
  }

  const overlappingPlan = store.maintenancePlans.find(
    (p) =>
      p.id !== plan.id &&
      p.desk_id === plan.desk_id &&
      p.status !== 'cancelled' &&
      p.status !== 'completed' &&
      p.start_date <= new_end_date &&
      p.end_date >= new_start_date
  );
  if (overlappingPlan) {
    return res.status(409).json({
      error: 'Modified date range overlaps with another maintenance plan',
      conflicting_plan_id: overlappingPlan.id,
    });
  }

  if (req.body.start_date !== undefined) plan.start_date = req.body.start_date;
  if (req.body.end_date !== undefined) plan.end_date = req.body.end_date;
  if (req.body.reason !== undefined) plan.reason = req.body.reason;
  plan.updated_at = new Date().toISOString();

  const today = new Date().toISOString().substring(0, 10);
  const wasActive = plan.status === 'active';
  const shouldActive = plan.start_date <= today && plan.end_date >= today;

  if (shouldActive && !wasActive) {
    plan.status = 'active';
    const desk = store.desks.find((d) => d.id === plan.desk_id);
    if (desk) desk.status = 'maintenance';
  } else if (!shouldActive && wasActive) {
    plan.status = 'scheduled';
    const desk = store.desks.find((d) => d.id === plan.desk_id);
    if (desk && desk.status === 'maintenance') {
      desk.status = 'available';
    }
  }

  res.json(plan);
});

router.post('/:id/cancel', auth, requireRole('admin'), (req, res) => {
  const plan = store.maintenancePlans.find((p) => p.id === req.params.id);
  if (!plan) return res.status(404).json({ error: 'Maintenance plan not found' });
  if (plan.status === 'cancelled') {
    return res.status(400).json({ error: 'Maintenance plan is already cancelled' });
  }
  if (plan.status === 'completed') {
    return res.status(400).json({ error: 'Cannot cancel a completed maintenance plan' });
  }

  const wasActive = plan.status === 'active';
  plan.status = 'cancelled';
  plan.updated_at = new Date().toISOString();

  if (wasActive) {
    const desk = store.desks.find((d) => d.id === plan.desk_id);
    if (desk && desk.status === 'maintenance') {
      const anyActiveOcc = store.temporaryOccupations.find(
        (o) => o.desk_id === desk.id && o.status === 'active'
      );
      const anyActiveAssign = store.scheduleAssignments.find(
        (a) => a.desk_id === desk.id && a.date === new Date().toISOString().substring(0, 10) && a.status === 'active'
      );
      if (!anyActiveOcc && !anyActiveAssign) {
        desk.status = 'available';
      } else {
        desk.status = 'occupied';
      }
    }
  }

  res.json(plan);
});

module.exports = router;
