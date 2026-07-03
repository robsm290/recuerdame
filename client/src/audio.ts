// Sonidos de alerta in-app generados con WebAudio (sin assets).
// El sonido de la notificación del sistema lo controla el SO; esto aplica
// a la alerta que se muestra dentro de la app.

export type SoundId = 'classic' | 'bell' | 'digital' | 'urgent' | 'soft'

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: 'classic', label: 'Clásico' },
  { id: 'bell', label: 'Campana' },
  { id: 'digital', label: 'Digital' },
  { id: 'urgent', label: 'Urgente' },
  { id: 'soft', label: 'Suave' },
]

const SOUND_KEY = 'recuerdame_sound'

/** Guarda la preferencia en el dispositivo para reproducirla sin ir al servidor. */
export function rememberSound(id: string) {
  localStorage.setItem(SOUND_KEY, id)
}

let ctx: AudioContext | null = null

interface Note {
  freq: number
  at: number
  dur: number
  vol?: number
  type?: OscillatorType
}

const PRESETS: Record<SoundId, Note[]> = {
  classic: [
    { freq: 880, at: 0, dur: 0.15, vol: 0.3 },
    { freq: 660, at: 0.18, dur: 0.15, vol: 0.3 },
    { freq: 880, at: 0.36, dur: 0.15, vol: 0.3 },
  ],
  bell: [
    { freq: 784, at: 0, dur: 0.9, vol: 0.3 },
    { freq: 1568, at: 0, dur: 0.6, vol: 0.12 },
    { freq: 2352, at: 0, dur: 0.3, vol: 0.05 },
    { freq: 784, at: 0.5, dur: 0.9, vol: 0.22 },
    { freq: 1568, at: 0.5, dur: 0.6, vol: 0.09 },
  ],
  digital: [
    { freq: 1046, at: 0, dur: 0.07, vol: 0.18, type: 'square' },
    { freq: 1046, at: 0.12, dur: 0.07, vol: 0.18, type: 'square' },
    { freq: 1046, at: 0.24, dur: 0.07, vol: 0.18, type: 'square' },
    { freq: 1396, at: 0.4, dur: 0.12, vol: 0.18, type: 'square' },
  ],
  urgent: [
    { freq: 950, at: 0, dur: 0.12, vol: 0.25, type: 'sawtooth' },
    { freq: 650, at: 0.13, dur: 0.12, vol: 0.25, type: 'sawtooth' },
    { freq: 950, at: 0.26, dur: 0.12, vol: 0.25, type: 'sawtooth' },
    { freq: 650, at: 0.39, dur: 0.12, vol: 0.25, type: 'sawtooth' },
    { freq: 950, at: 0.52, dur: 0.12, vol: 0.25, type: 'sawtooth' },
    { freq: 650, at: 0.65, dur: 0.12, vol: 0.25, type: 'sawtooth' },
  ],
  soft: [
    { freq: 523, at: 0, dur: 0.35, vol: 0.18 },
    { freq: 659, at: 0.25, dur: 0.45, vol: 0.18 },
  ],
}

export function playAlertSound(sound?: string) {
  try {
    const id: SoundId =
      sound && sound in PRESETS
        ? (sound as SoundId)
        : ((localStorage.getItem(SOUND_KEY) || 'classic') as SoundId)
    const notes = PRESETS[id] || PRESETS.classic

    ctx = ctx || new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    for (const { freq, at, dur, vol = 0.3, type = 'sine' } of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(vol, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + dur + 0.05)
    }
  } catch {
    // sin audio disponible; la notificación del sistema sigue sonando
  }
}
