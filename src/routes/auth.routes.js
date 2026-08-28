'use strict';
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');
const { id, logActivity } = require('../helpers');

const router = express.Router();

// POST /api/auth/login  (all roles)
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been disabled' });
  logActivity(user, 'login', user.id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/register  (public self-registration → creates a customer)
router.post('/register', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

  const uid = id();
  db.prepare('INSERT INTO users (id, role, name, email, phone, password_hash) VALUES (?,?,?,?,?,?)')
    .run(uid, 'customer', name, String(email).toLowerCase(), phone || null, hashPassword(password));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  logActivity(user, 'register', uid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth(), (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword || '', user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (String(newPassword || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

function publicUser(u) {
  return { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone };
}

module.exports = router;
