// A short alert chime made in the browser (no sound file). Used when a Reconcile statement doesn't match.
// Browsers only allow sound after the person has clicked or typed on the page once; if an alert comes before that,
// the chime plays on the first click instead. Each device can turn the sound off (kept in this browser).

const KEY = 'prisim.alertSound'
let ctx: AudioContext | null = null
let waiting = false

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* ignore */ }
}

function chime(c: AudioContext) {
  // Two rising tones, then the second again: noticeable without being harsh.
  const t0 = c.currentTime + 0.02
  const notes: [number, number][] = [[660, 0], [880, 0.18], [880, 0.5]]
  for (const [freq, at] of notes) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t0 + at)
    g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.28)
    o.connect(g).connect(c.destination)
    o.start(t0 + at)
    o.stop(t0 + at + 0.3)
  }
}

/** Play the alert chime (if this device has sound on). Returns 'played', 'waiting' (until the first click) or 'off'. */
export function playAlertSound(force = false): 'played' | 'waiting' | 'off' {
  if (!force && !soundOn()) return 'off'
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
  if (!Ctx) return 'off'
  try {
    ctx ??= new Ctx()
    if (ctx.state === 'running') { chime(ctx); return 'played' }
    // Not allowed yet: try now, and otherwise play on the first click or key press (only once either way).
    if (waiting) return 'waiting'
    waiting = true
    const play = () => {
      if (!waiting) return
      waiting = false
      window.removeEventListener('pointerdown', onTouch)
      window.removeEventListener('keydown', onTouch)
      if (ctx) chime(ctx)
    }
    const onTouch = () => { void ctx?.resume().then(play).catch(() => { /* ignore */ }) }
    window.addEventListener('pointerdown', onTouch)
    window.addEventListener('keydown', onTouch)
    void ctx.resume().then(() => { if (ctx?.state === 'running') play() }).catch(() => { /* still blocked */ })
    return 'waiting'
  } catch {
    return 'off'
  }
}
