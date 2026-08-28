'use strict';
const { customAlphabet } = require('nanoid');
const db = require('./db');

const id = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const token = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 24);

function logActivity(actor, action, target, meta) {
  try {
    db.prepare(
      'INSERT INTO activity (id, actor_id, actor_role, action, target, meta) VALUES (?,?,?,?,?,?)'
    ).run(id(), actor?.id || null, actor?.role || null, action, target || null, meta ? JSON.stringify(meta) : null);
  } catch (_) { /* activity logging is best-effort */ }
}

function touchApplication(appId) {
  db.prepare("UPDATE applications SET updated_at = datetime('now') WHERE id = ?").run(appId);
}

module.exports = { id, token, logActivity, touchApplication };
