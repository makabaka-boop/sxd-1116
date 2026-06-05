const express = require('express');
const router = express.Router();
const { store, createDepartment, createDesk } = require('../models/store');
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
  res.json(desks);
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

router.delete('/desks/:id', auth, requireRole('admin'), (req, res) => {
  const idx = store.desks.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Desk not found' });
  store.desks.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

module.exports = router;
