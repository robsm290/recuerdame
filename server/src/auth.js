import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, getMeta, setMeta } from './db.js';

let jwtSecret = getMeta('jwt_secret');
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString('hex');
  setMeta('jwt_secret', jwtSecret);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function register(email, password, timezone) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Email inválido');
  if (!password || String(password).length < 8) {
    throw httpError(400, 'La contraseña debe tener al menos 8 caracteres');
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw httpError(409, 'Ya existe una cuenta con ese email');

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(info.lastInsertRowid, tz);
  return { token: signToken(info.lastInsertRowid), email };
}

export function login(email, password) {
  email = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    throw httpError(401, 'Email o contraseña incorrectos');
  }
  return { token: signToken(user.id), email: user.email };
}

function signToken(userId) {
  return jwt.sign({ uid: userId }, jwtSecret, { expiresIn: '365d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
