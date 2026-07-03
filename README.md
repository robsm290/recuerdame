# Recuérdame

PWA de recordatorios **persistentes e insistentes** de tareas, pensada para combatir la procrastinación. Dentro del rango horario que configures (p. ej. 09:00–19:00), te envía una notificación push cada 30 minutos (intervalo configurable) con **todas** tus tareas pendientes de la prioridad más alta que tenga algo pendiente: alta → media → baja. Si no hay tareas pendientes, no molesta.

## Arquitectura

- **`client/`** — Frontend React + Vite + TypeScript, instalable como PWA (`vite-plugin-pwa`). El service worker ([client/src/sw.ts](client/src/sw.ts)) recibe los push, muestra la notificación del sistema (con sonido, `silent: false`) y avisa a las ventanas abiertas para mostrar también la alerta in-app con sonido propio.
- **`server/`** — Node.js + Express + SQLite (`better-sqlite3`). Guarda usuarios, tareas, ajustes y suscripciones push. Un cron (`node-cron`, cada minuto) evalúa por usuario: ¿está dentro de su rango horario (en su zona horaria)? ¿pasó el intervalo desde el último aviso? ¿qué tareas pendientes hay? → envía el push con `web-push` (VAPID).
- **Cuentas**: email + contraseña (bcrypt + JWT). Permiten usar la misma lista de tareas en varios dispositivos; cada dispositivo registra su propia suscripción push.
- Las claves VAPID y el secreto JWT se generan automáticamente al primer arranque y se guardan en `server/data/recuerdame.db` (no hay que configurar nada).

## Desarrollo

```bash
npm install            # raíz (concurrently)
npm --prefix client install
npm --prefix server install
npm run dev            # servidor API en :3999 + Vite en :5173 (proxy /api)
```

Nota: en modo dev el service worker no está activo; para probar push instala/compila:

```bash
npm run build          # compila client/dist
npm start              # sirve la app + API en http://localhost:3999
```

`localhost` cuenta como contexto seguro, así que el push funciona en local sin HTTPS.

## Producción

Tres requisitos innegociables:

1. **Proceso Node siempre encendido** — el cron corre en memoria. Serverless puro o planes gratuitos que "duermen" el proceso rompen los recordatorios.
2. **HTTPS** — obligatorio para service worker y push fuera de `localhost` (las plataformas PaaS lo dan gratis).
3. **Disco persistente** para `server/data/` (SQLite + claves VAPID). Si se pierde, los usuarios y las suscripciones push se pierden con él.

Variables de entorno: `PORT` (la fija la plataforma; por defecto 3999) y `VAPID_CONTACT=mailto:tu-email@dominio.com`.

### Opción A — Railway (la más simple, ~5 USD/mes)

1. Sube el repo a GitHub.
2. En [railway.app](https://railway.app): New Project → Deploy from GitHub repo. Detecta el `Dockerfile` y construye solo.
3. En el servicio: Settings → Networking → Generate Domain (te da HTTPS).
4. Añade un **Volume** montado en `/app/server/data`.
5. Variables → `VAPID_CONTACT=mailto:tu-email@dominio.com`.

### Opción B — Fly.io (similar, con capa gratuita ajustada)

```bash
fly launch --no-deploy   # detecta el Dockerfile
fly volumes create data --size 1
# en fly.toml: [mounts] source="data" destination="/app/server/data"
# y auto_stop_machines = "off"  (¡crítico! si la máquina se apaga, no hay cron)
fly secrets set VAPID_CONTACT=mailto:tu-email@dominio.com
fly deploy
```

### Opción C — VPS (más barato a largo plazo, ~4 USD/mes: Hetzner, DigitalOcean…)

```bash
# en el servidor (Ubuntu/Debian), con un dominio apuntando a su IP:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs caddy
git clone <tu-repo> /opt/recuerdame && cd /opt/recuerdame
npm --prefix client install && npm --prefix server install && npm run build
```

Servicio systemd (`/etc/systemd/system/recuerdame.service`):

```ini
[Unit]
Description=Recuerdame
After=network.target

[Service]
WorkingDirectory=/opt/recuerdame
ExecStart=/usr/bin/node server/src/index.js
Environment=VAPID_CONTACT=mailto:tu-email@dominio.com
Restart=always

[Install]
WantedBy=multi-user.target
```

Caddy como proxy HTTPS automático (`/etc/caddy/Caddyfile`):

```
tudominio.com {
    reverse_proxy localhost:3999
}
```

```bash
sudo systemctl enable --now recuerdame && sudo systemctl reload caddy
```

Caddy consigue y renueva el certificado TLS solo. Haz copia de seguridad periódica de `server/data/`.

## Límites de la plataforma (importante)

- **iOS/iPadOS**: el push solo funciona si el usuario **instala la PWA** (Safari → Compartir → «Añadir a pantalla de inicio») y activa las notificaciones desde la app instalada. Requiere iOS 16.4+.
- **Sonido**: la notificación se envía como *no silenciosa* (`silent: false`), lo que reproduce el sonido de notificación del sistema; los navegadores no permiten forzar un audio personalizado en la notificación push. La alerta in-app sí reproduce su propio sonido.
- **Entrega**: el push lo entrega el servicio del navegador (FCM/APNs/Mozilla); con el dispositivo apagado o sin red, la notificación llega al reconectar (TTL de 25 min: si expira, simplemente llegará la del siguiente ciclo).
