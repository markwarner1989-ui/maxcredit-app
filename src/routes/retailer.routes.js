'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { id, token, logActivity } = require('../helpers');
const { messages } = require('../email');
const config = require('../config');

const router = express.Router();
router.use(requireAuth('retailer'));

// Retailer dashboard stats (their customers only)
router.get('/stats', (req, res) => {
  const rid = req.user.id;
  const n = (sql) => db.prepare(sql).get(rid).n;
  res.json({
    total:     n('SELECT COUNT(*) n FROM applications WHERE retailer_id = ?'),
    leads:     db.prepare("SELECT COUNT(*) n FROM applications WHERE retailer_id = ? AND status IN ('invited','application_started')").get(rid).n,
    active:    db.prepare("SELECT COUNT(*) n FROM applications WHERE retailer_id = ? AND status IN ('deposit_paid','documents_uploaded','signed','active')").get(rid).n,
    completed: db.prepare("SELECT COUNT(*) n FROM applications WHERE retailer_id = ? AND status='completed'").get(rid).n,
  });
});

// Send an invitation to a prospective customer → creates an application + invite link
router.post('/invite', async (req, res) => {
  const { first_name, last_name, email, phone } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Customer email is required' });
  const inviteToken = token();
  const appId = id();
  db.prepare(`INSERT INTO applications
      (id, retailer_id, status, first_name, last_name, email, phone, signup_fee, monthly_fee, invite_token)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(appId, req.user.id, 'invited', first_name || null, last_name || null,
         String(email).toLowerCase(), phone || null, config.SIGNUP_FEE, config.MONTHLY_FEE, inviteToken);

  const link = (config.PUBLIC_URL || '') + '/#/apply/' + inviteToken;
  await messages.invitation({ email, first: first_name }, link);
  logActivity(req.user, 'send_invite', appId, { email });
  res.status(201).json({ ok: true, application_id: appId, invite_link: link, invite_token: inviteToken });
});

// List the retailer's own customers
router.get('/customers', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM applications WHERE retailer_id = ?';
  const params = [req.user.id];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (q) { sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; const l = `%${q}%`; params.push(l, l, l); }
  sql += ' ORDER BY updated_at DESC LIMIT 300';
  res.json({ customers: db.prepare(sql).all(...params) });
});

// Detail (retailer can only see their own)
router.get('/customers/:id', (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ? AND retailer_id = ?').get(req.params.id, req.user.id);
  if (!app) return res.status(404).json({ error: 'Customer not found' });
  app.payments = db.prepare("SELECT kind, amount, status, period, created_at FROM payments WHERE application_id = ? ORDER BY created_at DESC").all(app.id);
  app.documents = db.prepare('SELECT doc_type, uploaded_at FROM documents WHERE application_id = ?').all(app.id);
  res.json({ application: app });
});

module.exports = router;
