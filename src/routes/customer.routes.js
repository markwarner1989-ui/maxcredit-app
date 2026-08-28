'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../auth');
const { id, logActivity, touchApplication } = require('../helpers');
const payments = require('../payments');
const { messages } = require('../email');
const { syncCustomer } = require('../creditEngine');

const router = express.Router();
router.use(requireAuth('customer'));

// ---------- file upload setup ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10);
    cb(null, id() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpe?g|png|heic|webp)|application\/pdf/.test(file.mimetype);
    cb(ok ? null : new Error('Only images or PDF are allowed'), ok);
  },
});

// Get (or lazily create) THIS customer's current application
function currentApp(userId) {
  let app = db.prepare("SELECT * FROM applications WHERE customer_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1").get(userId);
  return app;
}

// ---------- claim an invite (link a retailer-created application to me) ----------
router.post('/claim-invite', (req, res) => {
  const { token: inviteToken } = req.body || {};
  if (!inviteToken) return res.status(400).json({ error: 'Missing invite token' });
  const app = db.prepare('SELECT * FROM applications WHERE invite_token = ?').get(inviteToken);
  if (!app) return res.status(404).json({ error: 'Invitation not found' });
  if (app.customer_id && app.customer_id !== req.user.id) {
    return res.status(409).json({ error: 'This invitation is already claimed' });
  }
  db.prepare('UPDATE applications SET customer_id = ? WHERE id = ?').run(req.user.id, app.id);
  res.json({ ok: true, application_id: app.id });
});

// ---------- my application state ----------
router.get('/application', (req, res) => {
  const app = currentApp(req.user.id);
  if (!app) return res.json({ application: null, pricing: pricing() });
  app.documents = db.prepare('SELECT doc_type, uploaded_at FROM documents WHERE application_id = ?').all(app.id);
  app.payments = db.prepare('SELECT kind, amount, status, period, created_at FROM payments WHERE application_id = ? ORDER BY created_at DESC').all(app.id);
  res.json({ application: app, pricing: pricing() });
});

// ---------- step 1: save applicant details (creates application if none) ----------
router.post('/application/details', (req, res) => {
  const b = req.body || {};
  let app = currentApp(req.user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!app) {
    app = { id: id() };
    db.prepare(`INSERT INTO applications
        (id, customer_id, status, signup_fee, monthly_fee) VALUES (?,?,?,?,?)`)
      .run(app.id, req.user.id, 'application_started', config.SIGNUP_FEE, config.MONTHLY_FEE);
  }
  db.prepare(`UPDATE applications SET
      first_name=?, last_name=?, email=?, phone=?, address=?, city=?, state=?, zip=?, timezone=?, dob=?,
      status = CASE WHEN status='invited' THEN 'application_started' ELSE status END,
      updated_at=datetime('now')
      WHERE id=?`)
    .run(b.first_name || u.name, b.last_name || null, b.email || u.email, b.phone || u.phone,
         b.address || null, b.city || null, b.state || null, b.zip || null, b.timezone || null, b.dob || null,
         app.id);
  logActivity(req.user, 'application_details', app.id);
  res.json({ ok: true, application_id: app.id });
});

// ---------- step 2: create a payment intent (signup deposit or a pending monthly) ----------
router.post('/payment/intent', async (req, res) => {
  const app = currentApp(req.user.id);
  if (!app) return res.status(400).json({ error: 'Start your application first' });
  const kind = (req.body && req.body.kind) === 'monthly' ? 'monthly' : 'signup';
  const amount = kind === 'signup' ? (app.signup_fee || config.SIGNUP_FEE) : (app.monthly_fee || config.MONTHLY_FEE);
  try {
    const intent = await payments.createIntent({
      amount, currency: config.CURRENCY,
      description: `${config.COMPANY_NAME} ${kind} payment`,
      metadata: { application_id: app.id, kind },
    });
    res.json({ ok: true, kind, amount, currency: config.CURRENCY,
      clientSecret: intent.clientSecret, intentId: intent.id, demo: intent.demo,
      publishableKey: payments.publishableKey });
  } catch (e) {
    res.status(500).json({ error: 'Could not start payment: ' + e.message });
  }
});

// ---------- step 2b: confirm a payment ----------
router.post('/payment/confirm', async (req, res) => {
  const app = currentApp(req.user.id);
  if (!app) return res.status(400).json({ error: 'No application found' });
  const { intentId, kind } = req.body || {};
  const result = await payments.confirmDemoOrRetrieve(intentId);
  if (!result.paid) return res.status(402).json({ error: 'Payment not completed', detail: result });

  const k = kind === 'monthly' ? 'monthly' : 'signup';
  const amount = k === 'signup' ? (app.signup_fee || config.SIGNUP_FEE) : (app.monthly_fee || config.MONTHLY_FEE);
  const period = new Date().toISOString().slice(0, 7);

  // if there is a matching pending monthly, mark it paid; else insert a new record
  let pay = null;
  if (k === 'monthly') pay = db.prepare("SELECT * FROM payments WHERE application_id=? AND kind='monthly' AND period=? AND status!='paid'").get(app.id, period);
  if (pay) {
    db.prepare("UPDATE payments SET status='paid', provider=?, provider_ref=? WHERE id=?")
      .run(result.demo ? 'demo' : 'stripe', intentId || null, pay.id);
  } else {
    db.prepare('INSERT INTO payments (id, application_id, customer_id, kind, amount, currency, status, provider, provider_ref, period) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id(), app.id, req.user.id, k, amount, config.CURRENCY, 'paid', result.demo ? 'demo' : 'stripe', intentId || null, period);
  }
  db.prepare('UPDATE applications SET total_paid = total_paid + ? WHERE id = ?').run(amount, app.id);
  if (k === 'signup' && ['invited','application_started'].includes(app.status)) {
    db.prepare("UPDATE applications SET status='deposit_paid' WHERE id=?").run(app.id);
  }
  touchApplication(app.id);
  if (app.email) await messages.paymentReceived(app.email, app.first_name, amount);
  logActivity(req.user, 'payment', app.id, { kind: k, amount });
  res.json({ ok: true, kind: k, amount });
});

// ---------- step 3: upload documents ----------
router.post('/application/documents', upload.array('files', 6), (req, res) => {
  const app = currentApp(req.user.id);
  if (!app) return res.status(400).json({ error: 'No application found' });
  const types = [].concat(req.body.doc_type || []); // parallel array to files
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
  files.forEach((f, i) => {
    db.prepare('INSERT INTO documents (id, application_id, doc_type, filename, original_name, mime, size) VALUES (?,?,?,?,?,?,?)')
      .run(id(), app.id, types[i] || 'other', f.filename, f.originalname, f.mimetype, f.size);
  });
  // if the required docs are present, advance status
  const have = db.prepare('SELECT DISTINCT doc_type FROM documents WHERE application_id = ?').all(app.id).map(r => r.doc_type);
  const hasRequired = have.includes('id_front') && have.includes('ssn_card');
  if (hasRequired && ['deposit_paid','application_started'].includes(app.status)) {
    db.prepare("UPDATE applications SET status='documents_uploaded' WHERE id=?").run(app.id);
  }
  touchApplication(app.id);
  logActivity(req.user, 'upload_documents', app.id, { count: files.length });
  res.json({ ok: true, uploaded: files.length, hasRequired });
});

// ---------- step 4: e-sign → sync to credit engine → active ----------
router.post('/application/sign', async (req, res) => {
  const app = currentApp(req.user.id);
  if (!app) return res.status(400).json({ error: 'No application found' });
  const { signed_name, agree } = req.body || {};
  if (!agree || !signed_name) return res.status(400).json({ error: 'Please type your full name and agree to the terms' });
  db.prepare("UPDATE applications SET signed_name=?, signed_at=datetime('now'), status='active', updated_at=datetime('now') WHERE id=?")
    .run(signed_name, app.id);

  const fresh = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
  const sync = await syncCustomer(fresh);
  if (sync.ok) db.prepare('UPDATE applications SET synced_engine = 1 WHERE id = ?').run(app.id);
  if (fresh.email) await messages.welcome(fresh.email, fresh.first_name);
  logActivity(req.user, 'sign', app.id, { synced: sync.ok });
  res.json({ ok: true, synced: sync.ok });
});

function pricing() {
  return { signup: config.SIGNUP_FEE, monthly: config.MONTHLY_FEE, months: config.PLAN_MONTHS,
    cancelWindowDays: config.CANCEL_WINDOW_DAYS };
}

module.exports = router;
