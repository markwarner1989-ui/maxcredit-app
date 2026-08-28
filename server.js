'use strict';
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');

// ensure DB exists + super admin is seeded on boot (idempotent)
require('./src/db');
require('./src/seed'); // seed.js exits the process only when run directly

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/retailer', require('./src/routes/retailer.routes'));
app.use('/api/customer', require('./src/routes/customer.routes'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// static frontend (PWA)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// SPA fallback: any non-API route serves index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// error handler (multer + others)
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 400).json({ error: err.message || 'Something went wrong' });
});

app.listen(config.PORT, () => {
  console.log(`\n🚀 ${config.COMPANY_NAME} app running on http://localhost:${config.PORT}`);
  console.log(`   Stripe: ${config.STRIPE_SECRET_KEY ? 'LIVE keys detected' : 'DEMO mode (no keys)'}`);
  console.log(`   Data dir: ${config.DATA_DIR}\n`);
});
