/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event: PushEvent) => {
  let data: { type?: string; title?: string; body?: string } | null = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }
  if (!data || data.type !== 'reminder') return

  event.waitUntil(
    (async () => {
      // Aviso in-app para las ventanas abiertas, además de la notificación del sistema
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) client.postMessage({ type: 'reminder', payload: data })

      await self.registration.showNotification(data!.title || 'Tareas pendientes', {
        body: data!.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'recuerdame-reminder', // reemplaza la anterior en vez de acumularse
        renotify: true, // vuelve a sonar/vibrar aunque reemplace a otra
        silent: false,
        vibrate: [200, 100, 200],
        data: { url: '/' },
      } as NotificationOptions)
    })()
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = clients[0]
      if (existing) await existing.focus()
      else await self.clients.openWindow('/')
    })()
  )
})
