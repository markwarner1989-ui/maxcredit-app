'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, hashPassword } = require('../auth');
const { id, token, logActivity } = require('../helpers');
const { messages } = require('../email');
const config = require('../config');

const router = express.Router();
router.use(requireAuth('super_admin'));

// ---- Dashboard stats ----
router.get('/stats', (req, res) => {
  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='paid'").get().s;
  const outstanding = db.prepare(`
    SELECT COALESCE(SUM(p.amount),0) AS s FROM payments p WHERE p.status IN ('pending','failed')
  `).get().s;
  res.json({
    customers:   count("SELECT COUNT(*) n FROM users WHERE role='customer'"),
    retailers:   count("SELECT COUNT(*) n FROM users WHERE role='retailer'"),
    leads:       count("SELECT COUNT(*) n FROM applications WHERE status IN ('invited','application_started')"),
    active:      count("SELECT COUNT(*) n FROM applications WHERE status IN ('active','signed','documents_uploaded','deposit_paid')"),
    completed:   count("SELECT COUNT(*) n FROM applications WHERE status='completed'"),
    cancelled:   count("SELECT COUNT(*) n FROM applications WHERE status='cancelled'"),
    applications: count("SELECT COUNT(*) n FROM applications"),
    revenue,
    outstanding,
    pricing: { signup: config.SIGNUP_FEE, monthly: config.MONTHLY_FEE, months: config.PLAN_MONTHS },
  });
});

// ---- Applications (all customers) ----
router.get('/applications', (req, res) => {
  const { status, q } = req.query;
  let sql = `
    SELECT a.*, ru.name AS retailer_name
    FROM applications a
    LEFT JOIN users ru ON ru.id = a.retailer_id
    WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ' AND a.status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)';
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  sql += ' ORDER BY a.updated_at DESC LIMIT 500';
  res.json({ applications: db.prepare(sql).all(...params) });
});

// ---- Single application detail (docs + payments) ----
router.get('/applications/:id', (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  app.documents = db.prepare('SELECT id, doc_type, original_name, mime, size, uploaded_at FROM documents WHERE application_id = ?').all(app.id);
  app.payments = db.prepare('SELECT * FROM payments WHERE application_id = ? ORDER BY created_at DESC').all(app.id);
  res.json({ application: app });
});

// ---- Update application status / notes ----
router.patch('/applications/:id', (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const { status, notes } = req.body || {};
  const allowed = ['invited','application_started','deposit_paid','documents_uploaded','signed','active','completed','cancelled'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare("UPDATE applications SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?")
    .run(status || null, notes ?? null, app.id);
  logActivity(req.user, 'update_application', app.id, { status });
  res.json({ ok: true });
});

// ---- Retailers ----
router.get('/retailers', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.active, u.created_at,
           r.company, r.commission,
           (SELECT COUNT(*) FROM applications a WHERE a.retailer_id = u.id) AS customers
    FROM users u JOIN retailers r ON r.user_id = u.id
    WHERE u.role='retailer' ORDER BY u.created_at DESC`).all();
  res.json({ retailers: rows });
});

router.post('/retailers', (req, res) => {
  const { name, email, phone, company, commission, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email already in use' });
  const uid = id();
  db.prepare('INSERT INTO users (id, role, name, email, phone, password_hash) VALUES (?,?,?,?,?,?)')
    .run(uid, 'retailer', name, String(email).toLowerCase(), phone || null, hashPassword(password));
  db.prepare('INSERT INTO retailers (id, user_id, company, commission) VALUES (?,?,?,?)')
    .run(id(), uid, company || null, Number(commission) || 0);
  logActivity(req.user, 'create_retailer', uid);
  res.status(201).json({ ok: true, id: uid });
});

router.patch('/retailers/:id', (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role='retailer'").get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Retailer not found' });
  const { active, commission, company } = req.body || {};
  if (active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, u.id);
  if (commission !== undefined || company !== undefined) {
    db.prepare('UPDATE retailers SET commission = COALESCE(?, commission), company = COALESCE(?, company) WHERE user_id = ?')
      .run(commission ?? null, company ?? null, u.id);
  }
  res.json({ ok: true });
});

// ---- Payments overview ----
router.get('/payments', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, a.first_name, a.last_name, a.email
    FROM payments p LEFT JOIN applications a ON a.id = p.application_id
    ORDER BY p.created_at DESC LIMIT 500`).all();
  res.json({ payments: rows });
});

// ---- Trigger monthly billing run (creates pending charges + emails) ----
router.post('/billing/run', async (req, res) => {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const active = db.prepare("SELECT * FROM applications WHERE status IN ('active','signed','completed')").all();
  let created = 0;
  for (const app of active) {
    const already = db.prepare('SELECT id FROM payments WHERE application_id = ? AND kind = ? AND period = ?')
      .get(app.id, 'monthly', period);
    if (already) continue;
    const pid = id();
    db.prepare('INSERT INTO payments (id, application_id, customer_id, kind, amount, currency, status, period) VALUES (?,?,?,?,?,?,?,?)')
      .run(pid, app.id, app.customer_id, 'monthly', app.monthly_fee || config.MONTHLY_FEE, config.CURRENCY, 'pending', period);
    const link = (config.PUBLIC_URL || '') + '/#/pay/' + app.id;
    if (app.email) await messages.monthlyRequest(app.email, app.first_name, app.monthly_fee || config.MONTHLY_FEE, link);
    created++;
  }
  logActivity(req.user, 'billing_run', period, { created });
  res.json({ ok: true, period, created });
});

// ---- Secure document view/download (admin only) ----
router.get('/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const filePath = path.join(config.UPLOAD_DIR, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  res.setHeader('Content-Type', doc.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_name || doc.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ---- Activity feed ----
router.get('/activity', (req, res) => {
  res.json({ activity: db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 100').all() });
});

module.exports = router;
