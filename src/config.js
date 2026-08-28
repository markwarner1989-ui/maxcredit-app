'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// DATA_DIR lets Render mount a Persistent Disk (e.g. /data) so the SQLite
// database + uploaded documents survive restarts and re-deploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR,
  UPLOAD_DIR,
  DB_PATH: process.env.DB_PATH || path.join(DATA_DIR, 'maxcredit.db'),

  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production-please',
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',

  // Seed / default super admin (change after first login)
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@maxcreditsolution.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@12345',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Super Admin',

  // Business / pricing (configurable — see Scope of Work §8)
  COMPANY_NAME: process.env.COMPANY_NAME || 'Max Credit Solution',
  COMPANY_PHONE: process.env.COMPANY_PHONE || '(855) 348-8758',
  SIGNUP_FEE: Number(process.env.SIGNUP_FEE || 199),      // one-time deposit, USD
  MONTHLY_FEE: Number(process.env.MONTHLY_FEE || 199),    // recurring, USD
  PLAN_MONTHS: Number(process.env.PLAN_MONTHS || 12),
  CANCEL_WINDOW_DAYS: Number(process.env.CANCEL_WINDOW_DAYS || 14),
  CURRENCY: process.env.CURRENCY || 'usd',

  // Stripe (optional — app runs in demo mode without keys)
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',

  // Email (optional — logs to console if SMTP not configured)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Max Credit Solution <no-reply@maxcreditsolution.com>',

  // Credit-repair engine bridge (DisputeFox / Credit Cloud) — placeholder webhook
  CREDIT_ENGINE: process.env.CREDIT_ENGINE || 'disputefox',
  CREDIT_ENGINE_WEBHOOK: process.env.CREDIT_ENGINE_WEBHOOK || '',

  PUBLIC_URL: process.env.PUBLIC_URL || '',
};
