import { useEffect, useState } from 'react'
import { getSession, clearSession } from './api'
import type { ReminderPayload } from './types'
import { playAlertSound } from './audio'
import AuthView from './views/AuthView'
import TasksView from './views/TasksView'
import SettingsView from './views/SettingsView'
import HistoryView from './views/HistoryView'
import InAppAlert from './components/InAppAlert'

type View = 'tasks' | 'history' | 'settings'

export default function App() {
  const [session, setSessionState] = useState(getSession())
  const [view, setView] = useState<View>('tasks')
  const [alert, setAlert] = useState<ReminderPayload | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'reminder') {
        setAlert(event.data.payload as ReminderPayload)
        playAlertSound()
        setRefreshKey((k) => k + 1)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  if (!session) {
    return <AuthView onLogin={() => setSessionState(getSession())} />
  }

  const logout = () => {
    clearSession()
    setSessionState(null)
  }

  return (
    <div className="app">
      {alert && <InAppAlert payload={alert} onClose={() => setAlert(null)} />}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">!</span>
          <h1>Recuérdame</h1>
        </div>
        <nav>
          <button
            className={view === 'tasks' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setView('tasks')}
          >
            Tareas
          </button>
          <button
            className={view === 'history' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setView('history')}
          >
            Historial
          </button>
          <button
            className={view === 'settings' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setView('settings')}
          >
            Ajustes
          </button>
          <button className="nav-btn" onClick={logout} title={session.email}>
            Salir
          </button>
        </nav>
      </header>
      <main>
        {view === 'tasks' && <TasksView refreshKey={refreshKey} />}
        {view === 'history' && <HistoryView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
