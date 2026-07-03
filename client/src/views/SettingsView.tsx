import { useEffect, useState, type FormEvent } from 'react'
import { fetchSettings, saveSettings, sendTestPush, fetchPushStatus } from '../api'
import { enablePush, disablePush, isPushEnabled, pushSupported } from '../push'
import type { Settings } from '../types'

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<number | null>(null)

  useEffect(() => {
    fetchSettings().then(setSettings).catch((err) => setError(err.message))
    isPushEnabled().then(setPushOn)
    fetchPushStatus().then((s) => setDevices(s.devices)).catch(() => {})
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setError('')
    setMessage('')
    try {
      const saved = await saveSettings({
        ...settings,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      setSettings(saved)
      setMessage('Ajustes guardados.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const togglePush = async () => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
        setMessage('Notificaciones desactivadas en este dispositivo.')
      } else {
        await enablePush()
        setPushOn(true)
        setMessage('¡Listo! Este dispositivo recibirá recordatorios.')
      }
      fetchPushStatus().then((s) => setDevices(s.devices)).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error con las notificaciones')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setError('')
    setMessage('')
    try {
      const result = await sendTestPush()
      setMessage(
        result.sent
          ? 'Recordatorio de prueba enviado. Debería llegar en unos segundos.'
          : `No se envió: ${result.reason ?? 'sin tareas pendientes'}. Crea alguna tarea primero.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar la prueba')
    }
  }

  if (!settings) return <p className="muted">{error || 'Cargando…'}</p>

  return (
    <div className="settings-view">
      <section className="card">
        <h2>Horario de alertas</h2>
        <p className="muted">
          Solo recibirás recordatorios dentro de este rango, cada{' '}
          {settings.interval_minutes} minutos.
        </p>
        <form onSubmit={save} className="settings-form">
          <div className="settings-grid">
            <label>
              Desde
              <input
                type="time"
                value={settings.start_time}
                onChange={(e) => setSettings({ ...settings, start_time: e.target.value })}
                required
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                value={settings.end_time}
                onChange={(e) => setSettings({ ...settings, end_time: e.target.value })}
                required
              />
            </label>
            <label>
              Cada (minutos)
              <input
                type="number"
                min={5}
                max={720}
                value={settings.interval_minutes}
                onChange={(e) =>
                  setSettings({ ...settings, interval_minutes: Number(e.target.value) })
                }
                required
              />
            </label>
          </div>
          <p className="muted">Zona horaria detectada: {settings.timezone}</p>
          <button className="btn-primary" type="submit">
            Guardar ajustes
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Notificaciones en este dispositivo</h2>
        {!pushSupported() && (
          <p className="form-error">
            Este navegador no soporta push. En iPhone/iPad: abre esta web en Safari, toca
            Compartir → «Añadir a pantalla de inicio» y abre la app instalada.
          </p>
        )}
        <div className="push-actions">
          <button className="btn-primary" onClick={togglePush} disabled={busy || !pushSupported()}>
            {pushOn ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          </button>
          {pushOn && (
            <button className="btn-secondary" onClick={test}>
              Enviar prueba ahora
            </button>
          )}
        </div>
        <p className="muted">
          {devices !== null && (
            <>
              Dispositivos con notificaciones activas en tu cuenta: <strong>{devices}</strong>.{' '}
            </>
          )}
          Puedes activar las notificaciones en varios dispositivos con la misma cuenta; todos
          recibirán los recordatorios.
        </p>
      </section>

      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
