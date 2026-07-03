import type { Task, Settings, Priority } from './types'

const TOKEN_KEY = 'recuerdame_token'
const EMAIL_KEY = 'recuerdame_email'

export function getSession(): { token: string; email: string } | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const email = localStorage.getItem(EMAIL_KEY)
  return token && email ? { token, email } : null
}

export function setSession(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })
  if (res.status === 401 && token) {
    // sesión expirada: volver a la pantalla de acceso
    clearSession()
    window.location.reload()
    throw new Error('Sesión expirada')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`)
  return body as T
}

// ---- auth ----
export function registerUser(email: string, password: string) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return request<{ token: string; email: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, timezone }),
  })
}

export function loginUser(email: string, password: string) {
  return request<{ token: string; email: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// ---- tasks ----
export const fetchTasks = () => request<Task[]>('/api/tasks')

export function createTask(title: string, priority: Priority, due_date: string | null) {
  return request<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, priority, due_date }),
  })
}

export function updateTask(id: number, patch: Partial<Pick<Task, 'title' | 'priority' | 'due_date'>> & { completed?: boolean }) {
  return request<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
}

export function deleteTask(id: number) {
  return request<void>(`/api/tasks/${id}`, { method: 'DELETE' })
}

// ---- settings ----
export const fetchSettings = () => request<Settings>('/api/settings')

export function saveSettings(settings: Settings) {
  return request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

// ---- push ----
export const fetchVapidKey = () => request<{ publicKey: string }>('/api/push/public-key')

export function apiSubscribePush(subscription: PushSubscriptionJSON) {
  return request<{ ok: true }>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription }),
  })
}

export function apiUnsubscribePush(endpoint: string) {
  return request<{ ok: true }>('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })
}

export function sendTestPush() {
  return request<{ sent: boolean; reason?: string }>('/api/push/test', { method: 'POST' })
}
