import cron from 'node-cron';
import { db } from './db.js';
import { sendToUser } from './push.js';

const PRIORITY_LABEL = { high: 'alta', medium: 'media', low: 'baja' };

/** Current wall-clock time as 'HH:MM' in the given IANA timezone. */
function localTime(timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());
  }
}

/** True if 'now' falls inside [start, end). Supports ranges that cross midnight. */
export function inWindow(now, start, end) {
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // e.g. 22:00 - 06:00
}

/**
 * Picks the tasks to include in a reminder: all pending HIGH tasks;
 * if none, all pending MEDIUM; if none, all pending LOW.
 */
export function pickTasks(userId) {
  for (const priority of ['high', 'medium', 'low']) {
    const rows = db.prepare(
      'SELECT title, due_date FROM tasks WHERE user_id = ? AND completed = 0 AND priority = ? ORDER BY created_at'
    ).all(userId, priority);
    if (rows.length > 0) return { priority, tasks: rows };
  }
  return null;
}

export function buildPayload(picked) {
  const { priority, tasks } = picked;
  const label = PRIORITY_LABEL[priority];
  const title = tasks.length === 1
    ? `⏰ 1 tarea pendiente (prioridad ${label})`
    : `⏰ ${tasks.length} tareas pendientes (prioridad ${label})`;
  const lines = tasks.slice(0, 8).map((t) => {
    const due = t.due_date ? ` (límite ${t.due_date})` : '';
    return `• ${t.title}${due}`;
  });
  if (tasks.length > 8) lines.push(`… y ${tasks.length - 8} más`);
  return { type: 'reminder', title, body: lines.join('\n'), priority, count: tasks.length };
}

/**
 * One evaluation pass for a single user. Returns the payload if a
 * reminder was due and sent, or null.
 */
export async function evaluateUser(user, { force = false } = {}) {
  const nowMs = Date.now();
  if (!force) {
    if (!inWindow(localTime(user.timezone), user.start_time, user.end_time)) return null;
    // 5s slack so a cron tick landing a hair early doesn't skip a full cycle
    if (user.last_sent_at && nowMs - user.last_sent_at < user.interval_minutes * 60000 - 5000) return null;
  }
  const picked = pickTasks(user.user_id);
  if (!picked) return null;

  const payload = buildPayload(picked);
  await sendToUser(user.user_id, payload);
  db.prepare('UPDATE settings SET last_sent_at = ? WHERE user_id = ?').run(nowMs, user.user_id);
  return payload;
}

async function tick() {
  const users = db.prepare(`
    SELECT s.user_id, s.start_time, s.end_time, s.interval_minutes, s.timezone, s.last_sent_at
    FROM settings s
    WHERE EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.user_id = s.user_id)
  `).all();
  for (const user of users) {
    try {
      await evaluateUser(user);
    } catch (err) {
      console.error(`[notifier] error evaluando user ${user.user_id}:`, err);
    }
  }
}

export function startNotifier() {
  cron.schedule('* * * * *', tick);
  console.log('[notifier] cron activo: evaluación cada minuto');
}
