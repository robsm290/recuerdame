// Sonido de alerta in-app generado con WebAudio (sin assets).
let ctx: AudioContext | null = null

export function playAlertSound() {
  try {
    ctx = ctx || new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const notes = [
      { freq: 880, at: 0 },
      { freq: 660, at: 0.18 },
      { freq: 880, at: 0.36 },
    ]
    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.3, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.2)
    }
  } catch {
    // sin audio disponible; la notificación del sistema sigue sonando
  }
}
