// created_at llega en dos formatos según el backend:
//  - SQLite:     '2026-07-03 17:40:19'  (UTC, sin marcador de zona)
//  - PostgreSQL: '2026-07-03T21:04:27.000Z' (ISO con zona)
// Normaliza ambos y formatea en la hora local del dispositivo.
export function formatDateTime(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
