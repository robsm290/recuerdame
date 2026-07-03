import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import { register, login, requireAuth, isValidTimezone, httpError } from './auth.js';
import { vapidPublicKey } from './push.js';
import { startNotifier, evaluateUser } from './notifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = new Set(['high', 'medium', 'low']);
const ALARM_SOUNDS = new Set(['classic', 'bell', 'digital', 'urgent', 'soft']);
const TASK_FIELDS = 'id, title, description, priority, due_date, completed, created_at, completed_at';

// ---------- auth ----------
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, timezone } = req.body || {};
    res.status(201).json(await register(email, password, timezone));
  } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    res.json(await login(email, password));
  } catch (err) { next(err); }
});

// ---------- settings ----------
app.get('/api/settings', requireAuth, async (req, res, next) => {
  try {
    const settings = await db.get(
      'SELECT start_time, end_time, interval_minutes, timezone, alarm_sound FROM settings WHERE user_id = ?',
      [req.userId]
    );
    res.json(settings);
  } catch (err) { next(err); }
});

app.put('/api/settings', requireAuth, async (req, res, next) => {
  try {
    const { start_time, end_time, interval_minutes, timezone, alarm_sound } = req.body || {};
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
      throw httpError(400, 'Horario inválido (formato HH:MM)');
    }
    const interval = Number(interval_minutes);
    if (!Number.isInteger(interval) || interval < 5 || interval > 720) {
      throw httpError(400, 'El intervalo debe estar entre 5 y 720 minutos');
    }
    const tz = isValidTimezone(timezone) ? timezone : 'UTC';
    const sound = ALARM_SOUNDS.has(alarm_sound) ? alarm_sound : 'classic';
    await db.run(
      'UPDATE settings SET start_time = ?, end_time = ?, interval_minutes = ?, timezone = ?, alarm_sound = ? WHERE user_id = ?',
      [start_time, end_time, interval, tz, sound, req.userId]
    );
    res.json({ start_time, end_time, interval_minutes: interval, timezone: tz, alarm_sound: sound });
  } catch (err) { next(err); }
});

// ---------- tasks ----------
app.get('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const tasks = await db.all(
      `SELECT ${TASK_FIELDS} FROM tasks WHERE user_id = ? ORDER BY completed, created_at DESC`,
      [req.userId]
    );
    res.json(tasks);
  } catch (err) { next(err); }
});

app.post('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const { title, description, priority, due_date } = req.body || {};
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw httpError(400, 'La tarea necesita un nombre');
    if (cleanTitle.length > 300) throw httpError(400, 'Nombre demasiado largo');
    if (!PRIORITIES.has(priority)) throw httpError(400, 'Prioridad inválida');
    const desc = String(description || '').trim();
    if (desc.length > 2000) throw httpError(400, 'Descripción demasiado larga');
    const due = due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date) ? due_date : null;
    const task = await db.get(
      `INSERT INTO tasks (user_id, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?) RETURNING ${TASK_FIELDS}`,
      [req.userId, cleanTitle, desc || null, priority, due]
    );
    res.status(201).json(task);
  } catch (err) { next(err); }
});

app.put('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.userId,
    ]);
    if (!existing) throw httpError(404, 'Tarea no encontrada');
    const body = req.body || {};

    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    if (!title || title.length > 300) throw httpError(400, 'Nombre inválido');
    let description = existing.description;
    if (body.description !== undefined) {
      const desc = String(body.description || '').trim();
      if (desc.length > 2000) throw httpError(400, 'Descripción demasiado larga');
      description = desc || null;
    }
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

    const task = await db.get(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, completed = ?, completed_at = ? WHERE id = ? RETURNING ${TASK_FIELDS}`,
      [title, description, priority, due, completed, completedAt, existing.id]
    );
    res.json(task);
  } catch (err) { next(err); }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const info = await db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.userId,
    ]);
    if (info.changes === 0) throw httpError(404, 'Tarea no encontrada');
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------- notifications history ----------
app.get('/api/notifications', requireAuth, async (req, res, next) => {
  try {
    const items = await db.all(
      'SELECT id, title, body, priority, task_count, delivered, sent_at FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT 10',
      [req.userId]
    );
    res.json(items);
  } catch (err) { next(err); }
});

// ---------- push ----------
app.get('/api/push/public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.get('/api/push/status', requireAuth, async (req, res, next) => {
  try {
    const row = await db.get('SELECT COUNT(*) AS devices FROM subscriptions WHERE user_id = ?', [
      req.userId,
    ]);
    res.json({ devices: Number(row.devices) });
  } catch (err) { next(err); }
});

app.post('/api/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const sub = req.body && req.body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) {
      throw httpError(400, 'Suscripción inválida');
    }
    await db.run(
      `INSERT INTO subscriptions (user_id, endpoint, subscription_json) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription_json = excluded.subscription_json`,
      [req.userId, sub.endpoint, JSON.stringify(sub)]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (endpoint) {
      await db.run('DELETE FROM subscriptions WHERE endpoint = ? AND user_id = ?', [
        endpoint,
        req.userId,
      ]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Sends a reminder right now (ignores window/interval) — lets the user verify
// that push works on this device after subscribing.
app.post('/api/push/test', requireAuth, async (req, res, next) => {
  try {
    const user = await db.get(
      `SELECT s.user_id, s.start_time, s.end_time, s.interval_minutes, s.timezone, s.last_sent_at
       FROM settings s WHERE s.user_id = ?`,
      [req.userId]
    );
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
