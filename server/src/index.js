import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { register, login, requireAuth, isValidTimezone, httpError } from './auth.js';
import { vapidPublicKey } from './push.js';
import { startNotifier, evaluateUser } from './notifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = new Set(['high', 'medium', 'low']);

// ---------- auth ----------
app.post('/api/auth/register', (req, res, next) => {
  try {
    const { email, password, timezone } = req.body || {};
    res.status(201).json(register(email, password, timezone));
  } catch (err) { next(err); }
});

app.post('/api/auth/login', (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    res.json(login(email, password));
  } catch (err) { next(err); }
});

// ---------- settings ----------
app.get('/api/settings', requireAuth, (req, res) => {
  const s = db.prepare(
    'SELECT start_time, end_time, interval_minutes, timezone FROM settings WHERE user_id = ?'
  ).get(req.userId);
  res.json(s);
});

app.put('/api/settings', requireAuth, (req, res, next) => {
  try {
    const { start_time, end_time, interval_minutes, timezone } = req.body || {};
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
      throw httpError(400, 'Horario inválido (formato HH:MM)');
    }
    const interval = Number(interval_minutes);
    if (!Number.isInteger(interval) || interval < 5 || interval > 720) {
      throw httpError(400, 'El intervalo debe estar entre 5 y 720 minutos');
    }
    const tz = isValidTimezone(timezone) ? timezone : 'UTC';
    db.prepare(
      'UPDATE settings SET start_time = ?, end_time = ?, interval_minutes = ?, timezone = ? WHERE user_id = ?'
    ).run(start_time, end_time, interval, tz, req.userId);
    res.json({ start_time, end_time, interval_minutes: interval, timezone: tz });
  } catch (err) { next(err); }
});

// ---------- tasks ----------
app.get('/api/tasks', requireAuth, (req, res) => {
  const tasks = db.prepare(
    'SELECT id, title, priority, due_date, completed, created_at, completed_at FROM tasks WHERE user_id = ? ORDER BY completed, created_at DESC'
  ).all(req.userId);
  res.json(tasks);
});

app.post('/api/tasks', requireAuth, (req, res, next) => {
  try {
    const { title, priority, due_date } = req.body || {};
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw httpError(400, 'La tarea necesita un nombre');
    if (cleanTitle.length > 300) throw httpError(400, 'Nombre demasiado largo');
    if (!PRIORITIES.has(priority)) throw httpError(400, 'Prioridad inválida');
    const due = due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date) ? due_date : null;
    const info = db.prepare(
      'INSERT INTO tasks (user_id, title, priority, due_date) VALUES (?, ?, ?, ?)'
    ).run(req.userId, cleanTitle, priority, due);
    const task = db.prepare('SELECT id, title, priority, due_date, completed, created_at, completed_at FROM tasks WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) { next(err); }
});

app.put('/api/tasks/:id', requireAuth, (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!existing) throw httpError(404, 'Tarea no encontrada');
    const body = req.body || {};

    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    if (!title || title.length > 300) throw httpError(400, 'Nombre inválido');
    const priority = body.priority !== undefined ? body.priority : existing.priority;
    if (!PRIORITIES.has(priority)) throw httpError(400, 'Prioridad inválida');
    let due = existing.due_date;
    if (body.due_date !== undefined) {
      due = body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null;
    }
    let completed = existing.completed;
    let completedAt = existing.completed_at;
    if (body.completed !== undefined) {
      completed = body.completed ? 1 : 0;
      completedAt = completed ? new Date().toISOString() : null;
    }

    db.prepare(
      'UPDATE tasks SET title = ?, priority = ?, due_date = ?, completed = ?, completed_at = ? WHERE id = ?'
    ).run(title, priority, due, completed, completedAt, existing.id);
    const task = db.prepare('SELECT id, title, priority, due_date, completed, created_at, completed_at FROM tasks WHERE id = ?').get(existing.id);
    res.json(task);
  } catch (err) { next(err); }
});

app.delete('/api/tasks/:id', requireAuth, (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    if (info.changes === 0) throw httpError(404, 'Tarea no encontrada');
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------- push ----------
app.get('/api/push/public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res, next) => {
  try {
    const sub = req.body && req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) {
      throw httpError(400, 'Suscripción inválida');
    }
    db.prepare(`
      INSERT INTO subscriptions (user_id, endpoint, subscription_json) VALUES (?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription_json = excluded.subscription_json
    `).run(req.userId, sub.endpoint, JSON.stringify(sub));
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) {
    db.prepare('DELETE FROM subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.userId);
  }
  res.json({ ok: true });
});

// Sends a reminder right now (ignores window/interval) — lets the user verify
// that push works on this device after subscribing.
app.post('/api/push/test', requireAuth, async (req, res, next) => {
  try {
    const user = db.prepare(`
      SELECT s.user_id, s.start_time, s.end_time, s.interval_minutes, s.timezone, s.last_sent_at
      FROM settings s WHERE s.user_id = ?
    `).get(req.userId);
    const payload = await evaluateUser(user, { force: true });
    if (!payload) return res.json({ sent: false, reason: 'Sin tareas pendientes' });
    res.json({ sent: true, payload });
  } catch (err) { next(err); }
});

// ---------- static (production) ----------
const distDir = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// ---------- errors ----------
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.status ? err.message : 'Error interno' });
});

const port = Number(process.env.PORT) || 3999;
app.listen(port, () => {
  console.log(`Recuérdame escuchando en http://localhost:${port}`);
  startNotifier();
});
