import type { ReminderPayload } from '../types'

export default function InAppAlert({
  payload,
  onClose,
}: {
  payload: ReminderPayload
  onClose: () => void
}) {
  return (
    <div className={`in-app-alert priority-${payload.priority}`} role="alert">
      <div className="in-app-alert-content">
        <strong>{payload.title}</strong>
        <pre>{payload.body}</pre>
      </div>
      <button className="in-app-alert-close" onClick={onClose} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  )
}
