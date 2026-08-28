'use strict';
// Creates the default super admin (and optional demo data with --demo).
// Safe to require() from server.js — only exits when run directly via `npm run seed`.
const db = require('./db');
const config = require('./config');
const { hashPassword } = require('./auth');
const { id } = require('./helpers');

function ensureSuperAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE role='super_admin' LIMIT 1").get();
  if (existing) return false;
  const uid = id();
  db.prepare('INSERT INTO users (id, role, name, email, password_hash) VALUES (?,?,?,?,?)')
    .run(uid, 'super_admin', config.ADMIN_NAME, config.ADMIN_EMAIL.toLowerCase(), hashPassword(config.ADMIN_PASSWORD));
  console.log(`✓ Super admin created: ${config.ADMIN_EMAIL} / ${config.ADMIN_PASSWORD} (change after first login)`);
  return true;
}

function seedDemo() {
  const rUser = id();
  try {
    db.prepare('INSERT INTO users (id, role, name, email, phone, password_hash) VALUES (?,?,?,?,?,?)')
      .run(rUser, 'retailer', 'Demo Retailer', 'retailer@demo.com', '555-0100', hashPassword('Retailer@123'));
    db.prepare('INSERT INTO retailers (id, user_id, company, commission) VALUES (?,?,?,?)')
      .run(id(), rUser, 'Demo Auto Sales', 10);
    console.log('✓ Demo retailer: retailer@demo.com / Retailer@123');
  } catch (e) { console.log('  (demo retailer already exists)'); }
}

// run on import (idempotent, silent if already seeded)
ensureSuperAdmin();

if (require.main === module) {
  if (process.argv.includes('--demo')) seedDemo();
  console.log('Seed complete.');
  process.exit(0);
}

module.exports = { ensureSuperAdmin, seedDemo };
