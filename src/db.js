'use strict';
const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','retailer','customer')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- extra profile for retailers (dealers)
CREATE TABLE IF NOT EXISTS retailers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company       TEXT,
  commission    REAL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- a customer's enrollment / credit-restoration application
CREATE TABLE IF NOT EXISTS applications (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  retailer_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- lifecycle status
  status          TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','application_started','deposit_paid','documents_uploaded','signed','active','completed','cancelled')),
  -- applicant details
  first_name      TEXT,
  last_name       TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  timezone        TEXT,
  dob             TEXT,
  -- money
  signup_fee      REAL,
  monthly_fee     REAL,
  total_paid      REAL NOT NULL DEFAULT 0,
  -- agreement
  signed_name     TEXT,
  signed_at       TEXT,
  -- credit engine sync
  synced_engine   INTEGER NOT NULL DEFAULT 0,
  invite_token    TEXT UNIQUE,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  doc_type       TEXT NOT NULL,       -- id_front, id_back, ssn_card, proof_address, other
  filename       TEXT NOT NULL,
  original_name  TEXT,
  mime           TEXT,
  size           INTEGER,
  uploaded_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  customer_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,        -- signup | monthly
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'usd',
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded
  provider       TEXT DEFAULT 'demo',  -- stripe | demo
  provider_ref   TEXT,
  period         TEXT,                 -- e.g. 2026-08 for monthly cycles
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  meta        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_status   ON applications(status);
CREATE INDEX IF NOT EXISTS idx_app_retailer ON applications(retailer_id);
CREATE INDEX IF NOT EXISTS idx_app_customer ON applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_pay_app      ON payments(application_id);
CREATE INDEX IF NOT EXISTS idx_doc_app      ON documents(application_id);
`);

module.exports = db;
