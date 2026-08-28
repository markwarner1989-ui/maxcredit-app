'use strict';
const express = require('express');
const db = require('../db');
const config = require('../config');
const payments = require('../payments');

const router = express.Router();

// Public runtime config for the frontend (pricing, company, Stripe pk, mode)
router.get('/config', (req, res) => {
  res.json({
    company: config.COMPANY_NAME,
    phone: config.COMPANY_PHONE,
    pricing: { signup: config.SIGNUP_FEE, monthly: config.MONTHLY_FEE, months: config.PLAN_MONTHS },
    cancelWindowDays: config.CANCEL_WINDOW_DAYS,
    currency: config.CURRENCY,
    stripe: { live: payments.isLive(), publishableKey: payments.publishableKey },
    creditEngine: config.CREDIT_ENGINE,
  });
});

// Preview an invitation (so the apply page can greet + prefill)
router.get('/invite/:token', (req, res) => {
  const app = db.prepare('SELECT id, first_name, last_name, email, phone, status FROM applications WHERE invite_token = ?')
    .get(req.params.token);
  if (!app) return res.status(404).json({ error: 'Invitation not found or expired' });
  res.json({ invite: app });
});

module.exports = router;
