const express = require('express');
const router = express.Router();
const { store, createDepartment, createDesk, getActiveMaintenanceForDesk } = require('../models/store');
const { auth, requireRole } = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  res.json(store.departments);
});

router.post('/', auth, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const dept = createDepartment({ name });
  res.status(201).json(dept);
});

router.put('/:id', auth, requireRole('admin'), (req, res) => {
  const dept = store.departments.find((d) => d.id === req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  if (req.body.name) dept.name = req.body.name;
  res.json(dept);
});

router.delete('/:id', auth, requireRole('admin'), (req, res) => {
  const idx = store.departments.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Department not found' });
  store.departments.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

router.get('/desks', auth, (req, res) => {
  let desks = store.desks;
  if (req.query.department_id) {
    desks = desks.filter((d) => d.department_id === req.query.department_id);
  }
  const today = new Date().toISOString().substring(0, 10);
  const result = desks.map((d) => {
    const maintenance = getActiveMaintenanceForDesk(d.id, today);
    return {
      ...d,
      maintenance_info: maintenance ? { id: maintenance.id, start_date: maintenance.start_date, end_date: maintenance.end_date, reason: maintenance.reason, status: maintenance.status } : null,
      availability: maintenance ? 'maintenance' : d.status,
    };
  });
  res.json(result);
});

router.post('/desks', auth, requireRole('admin'), (req, res) => {
  const { name, department_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (department_id) {
    const dept = store.departments.find((d) => d.id === department_id);
    if (!dept) return res.status(400).json({ error: 'Department not found' });
  }
  const desk = createDesk({ name, department_id });
  res.status(201).json(desk);
});

router.put('/desks/:id', auth, requireRole('admin'), (req, res) => {
  const desk = store.desks.find((d) => d.id === req.params.id);
  if (!desk) return res.status(404).json({ error: 'Desk not found' });
  if (req.body.name) desk.name = req.body.name;
  if (req.body.department_id !== undefined) desk.department_id = req.body.department_id;
  if (req.body.status && ['available', 'occupied', 'maintenance'].includes(req.body.status)) {
    desk.status = req.body.status;
  }
  res.json(desk);
});

router.get('/desks/:id/detail', auth, (req, res) => {
  const desk = store.desks.find((d) => d.id === req.params.id);
  if (!desk) return res.status(404).json({ error: 'Desk not found' });
  const today = new Date().toISOString().substring(0, 10);
  const maintenance = getActiveMaintenanceForDesk(desk.id, today);
  const upcomingPlans = store.maintenancePlans.filter(
    (p) => p.desk_id === desk.id && p.status !== 'cancelled' && p.status !== 'completed' && p.start_date > today
  );
  res.json({
    ...desk,
    maintenance_info: maintenance ? { id: maintenance.id, start_date: maintenance.start_date, end_date: maintenance.end_date, reason: maintenance.reason, status: maintenance.status } : null,
    upcoming_maintenance: upcomingPlans.map((p) => ({ id: p.id, start_date: p.start_date, end_date: p.end_date, reason: p.reason, status: p.status })),
    availability: maintenance ? 'maintenance' : desk.status,
  });
});

router.delete('/desks/:id', auth, requireRole('admin'), (req, res) => {
  const idx = store.desks.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Desk not found' });
  store.desks.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

module.exports = router;
