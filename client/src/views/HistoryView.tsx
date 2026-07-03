import { useEffect, useState } from 'react'
import { fetchNotifications } from '../api'
import type { NotificationEntry } from '../types'
import { formatDateTime } from '../format'

export default function HistoryView() {
  const [items, setItems] = useState<NotificationEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="form-error">{error}</p>
  if (!items) return <p className="muted">Cargando…</p>

  return (
    <div className="history-view">
      <h2>Últimas notificaciones</h2>
      <p className="muted">
        Los últimos recordatorios que el servidor envió a tu cuenta (máximo 10).
      </p>
      {items.length === 0 && (
        <p className="empty-state">
          Aún no se ha enviado ningún recordatorio. Se envían dentro de tu horario de alertas,
          cuando hay tareas pendientes y algún dispositivo con notificaciones activadas.
        </p>
      )}
      <ul className="notif-list">
        {items.map((n) => (
          <li key={n.id} className={`notif-item priority-${n.priority}`}>
            <div className="notif-head">
              <strong>{n.title}</strong>
              <span className="notif-date">{formatDateTime(n.sent_at)}</span>
            </div>
            <pre className="notif-body">{n.body}</pre>
            <span className={`notif-delivered ${n.delivered === 0 ? 'warn' : ''}`}>
              {n.delivered === 0
                ? '⚠️ No se entregó a ningún dispositivo'
                : `Entregada a ${n.delivered} dispositivo${n.delivered === 1 ? '' : 's'}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
