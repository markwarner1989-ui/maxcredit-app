'use strict';
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES }
  );
}

// Express middleware: require a valid token, optionally restrict by role(s)
function requireAuth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const payload = jwt.verify(token, config.JWT_SECRET);
      const user = db.prepare('SELECT id, role, name, email, active FROM users WHERE id = ?').get(payload.id);
      if (!user || !user.active) return res.status(401).json({ error: 'Account not found or disabled' });
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Not authorized for this area' });
      }
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
  };
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth };
