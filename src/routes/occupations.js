const express = require('express');
const router = express.Router();
const { store, createTemporaryOccupation, isDeskUnderMaintenance } = require('../models/store');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  let occs = store.temporaryOccupations;
  if (req.query.status) {
    occs = occs.filter((o) => o.status === req.query.status);
  }
  if (req.query.desk_id) {
    occs = occs.filter((o) => o.desk_id === req.query.desk_id);
  }
  if (req.query.user_id) {
    occs = occs.filter((o) => o.user_id === req.query.user_id);
  }
  res.json(occs);
});

router.post('/', auth, requireRole('operator', 'admin'), (req, res) => {
  const { desk_id, user_id, start_time } = req.body;
  if (!desk_id) return res.status(400).json({ error: 'desk_id is required' });
  const desk = store.desks.find((d) => d.id === desk_id);
  if (!desk) return res.status(400).json({ error: 'Desk not found' });

  const today = new Date().toISOString().substring(0, 10);
  if (isDeskUnderMaintenance(desk_id, today)) {
    return res.status(409).json({ error: 'Cannot create temporary occupation: desk is currently under maintenance' });
  }

  const activeOcc = store.temporaryOccupations.find(
    (o) => o.desk_id === desk_id && o.status === 'active'
  );
  if (activeOcc) {
    return res.status(409).json({ error: 'Desk already has an active temporary occupation' });
  }

  const targetUser = user_id || req.user.id;
  const occ = createTemporaryOccupation({
    desk_id,
    user_id: targetUser,
    start_time: start_time || new Date().toISOString(),
  });

  desk.status = 'occupied';
  res.status(201).json(occ);
});

router.post('/:id/release', auth, requireRole('operator', 'admin'), (req, res) => {
  const occ = store.temporaryOccupations.find((o) => o.id === req.params.id);
  if (!occ) return res.status(404).json({ error: 'Occupation not found' });
  if (occ.status !== 'active') {
    return res.status(400).json({ error: 'Occupation is not active' });
  }

  occ.status = 'released';
  occ.end_time = new Date().toISOString();
  occ.updated_at = new Date().toISOString();

  const anyOtherActive = store.temporaryOccupations.find(
    (o) => o.desk_id === occ.desk_id && o.status === 'active' && o.id !== occ.id
  );
  const anyScheduleActive = store.scheduleAssignments.find(
    (a) => a.desk_id === occ.desk_id && a.status === 'active'
  );
  if (!anyOtherActive && !anyScheduleActive) {
    const desk = store.desks.find((d) => d.id === occ.desk_id);
    if (desk) desk.status = 'available';
  }

  res.json(occ);
});

router.get('/unreleased', auth, (req, res) => {
  const now = new Date();
  const unreleased = store.temporaryOccupations.filter((o) => {
    if (o.status !== 'active') return false;
    const start = new Date(o.start_time);
    const hours = (now - start) / (1000 * 60 * 60);
    return hours >= 24;
  });
  res.json(unreleased);
});

module.exports = router;
