const express = require('express');
const router = express.Router();
const { store, createUser } = require('../models/store');
const { auth, requireRole } = require('../middleware/auth');

router.post('/', (req, res) => {
  const { username, role, department_id } = req.body;
  if (!username || !role) return res.status(400).json({ error: 'username and role are required' });
  if (!['admin', 'operator', 'auditor'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, operator, or auditor' });
  }
  const existing = store.users.find((u) => u.username === username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  const user = createUser({ username, role, department_id });
  res.status(201).json({ id: user.id, username: user.username, role: user.role, department_id: user.department_id });
});

router.get('/', auth, requireRole('admin'), (req, res) => {
  const users = store.users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    department_id: u.department_id,
    created_at: u.created_at,
  }));
  res.json(users);
});

router.get('/me', auth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    department_id: req.user.department_id,
  });
});

module.exports = router;
