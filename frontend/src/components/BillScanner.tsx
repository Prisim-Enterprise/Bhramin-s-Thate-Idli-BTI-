import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, RotateCcw, ScanLine, X } from 'lucide-react'
import { Button } from './ui'

// Scans a bill with the phone or laptop camera, and takes the picture by itself once the bill is
// held steady and in focus inside the frame. The picture is cropped to the frame and its contrast
// cleaned up (like a document scanner) before it's used as the bill file.

/** The frame to hold the bill in, in camera pixels: bill-shaped (portrait, about 1 : 1.4), as big as fits. */
function frameRect(vw: number, vh: number) {
  const h = vh * 0.9
  const w = Math.min(vw * 0.9, h / 1.4)
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}
const STEADY_FOR = 6 // checks in a row (about 1.5 seconds) before it takes the picture
const TICK = 250 // ms between checks

type Status = 'starting' | 'looking' | 'steady' | 'dark' | 'blurry' | 'moving' | 'captured' | 'error'
const MESSAGE: Record<Status, string> = {
  starting: 'Starting the camera…',
  looking: 'Place the whole bill inside the frame',
  moving: 'Hold still…',
  steady: 'Hold still… taking the picture',
  dark: 'Too dark: add light or move near a window',
  blurry: 'Not sharp yet: hold a little further away, or tap the screen to focus',
  captured: 'Scanned',
  error: '',
}

/** Small grey copy of the frame area, for the steadiness / sharpness / light checks. */
function sample(video: HTMLVideoElement, c: HTMLCanvasElement) {
  const f = frameRect(video.videoWidth, video.videoHeight)
  const W = 120
  const H = Math.max(2, Math.round((W * f.h) / f.w))
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(video, f.x, f.y, f.w, f.h, 0, 0, W, H)
  const d = g.getImageData(0, 0, W, H).data
  const grey = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) grey[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  return { grey, W, H }
}

function measure(cur: Float32Array, prev: Float32Array | null, W: number, H: number) {
  let sum = 0
  for (let i = 0; i < cur.length; i++) sum += cur[i]
  const brightness = sum / cur.length
  // Sharpness: how much the picture changes between neighbouring dots (edges of the writing). Blurry = low.
  let lap = 0
  let n = 0
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    const v = 4 * cur[i] - cur[i - 1] - cur[i + 1] - cur[i - W] - cur[i + W]
    lap += v * v
    n++
  }
  const sharpness = lap / n
  // Movement: how different this frame is from the last one.
  let diff = 0
  if (prev) for (let i = 0; i < cur.length; i++) diff += Math.abs(cur[i] - prev[i])
  const movement = prev ? diff / cur.length : 99
  return { brightness, sharpness, movement }
}

/** Crop to the frame and stretch the contrast so paper is white and writing is dark. */
function capture(video: HTMLVideoElement): Promise<File> {
  const f = frameRect(video.videoWidth, video.videoHeight)
  const sw = Math.round(f.w)
  const sh = Math.round(f.h)
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  const g = c.getContext('2d')!
  g.drawImage(video, f.x, f.y, f.w, f.h, 0, 0, sw, sh)
  const img = g.getImageData(0, 0, sw, sh)
  const d = img.data
  // Levels from the 2nd and 98th brightness percentiles.
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++
  const total = d.length / 4
  let lo = 0
  let hi = 255
  for (let acc = 0, v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break } }
  for (let acc = 0, v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break } }
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, ((d[i + k] - lo) * 255) / span))
  g.putImageData(img, 0, 0)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(new File([b], `scan-${stamp}.jpg`, { type: 'image/jpeg' })) : rej(new Error('Could not save the scan'))), 'image/jpeg', 0.9))
}

export default function BillScanner({ onDone, onClose }: { onDone: (f: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const work = useRef(document.createElement('canvas'))
  const [status, setStatus] = useState<Status>('starting')
  const [error, setError] = useState('')
  const [steady, setSteady] = useState(0)
  const [auto, setAuto] = useState(true)
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null) // camera picture size, to line the frame up

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  const start = useCallback(async () => {
    setShot(null)
    setSteady(0)
    setStatus('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access. Use a photo or scanned PDF instead.')
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      stream.current = s
      if (video.current) { video.current.srcObject = s; await video.current.play() }
      setStatus('looking')
    } catch (e) {
      const name = (e as { name?: string }).name
      setError(name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site in the browser, then try again.'
        : name === 'NotFoundError' ? 'No camera found on this device. Use a photo or scanned PDF instead.'
        : e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [])

  useEffect(() => { void start(); return stop }, [start])

  const take = useCallback(async () => {
    if (!video.current || !video.current.videoWidth) return
    const file = await capture(video.current)
    setShot({ file, url: URL.createObjectURL(file) })
    setStatus('captured')
    stop()
  }, [])

  // Watch the frame: once the bill is still, sharp and bright enough for a moment, take the picture.
  useEffect(() => {
    if (status === 'captured' || status === 'error' || status === 'starting') return
    let prev: Float32Array | null = null
    let count = 0
    const t = setInterval(() => {
      const v = video.current
      if (!v || !v.videoWidth) return
      const { grey, W, H } = sample(v, work.current)
      const m = measure(grey, prev, W, H)
      prev = grey
      let s: Status
      if (m.brightness < 45) s = 'dark'
      else if (m.movement > 6) s = 'moving'
      else if (m.sharpness < 60) s = 'blurry'
      else s = 'steady'
      count = s === 'steady' ? count + 1 : 0
      setSteady(count)
      setStatus(count ? 'steady' : s === 'steady' ? 'looking' : s)
      if (auto && count >= STEADY_FOR) { clearInterval(t); void take() }
    }, TICK)
    return () => clearInterval(t)
  }, [status === 'captured' || status === 'error' || status === 'starting', auto, take]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { stop(); if (shot) URL.revokeObjectURL(shot.url); onClose() }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-3 sm:p-6" role="dialog" aria-label="Scan bill" onClick={(e) => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between text-white">
        <p className="flex items-center gap-2 font-semibold"><ScanLine size={18} /> Scan bill</p>
        <button aria-label="Close scanner" onClick={close} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={22} /></button>
      </div>

      <div className="relative mx-auto flex min-h-0 w-full max-w-3xl flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black">
        {shot ? (
          <img src={shot.url} alt="Scanned bill" className="max-h-full max-w-full object-contain" />
        ) : (
          <>
            {/* Box shaped exactly like the camera picture, so the frame drawn on it matches what gets captured. */}
            <div className="relative max-h-full max-w-full" style={size ? { aspectRatio: `${size.w} / ${size.h}`, height: size.h >= size.w ? '100%' : undefined, width: size.h < size.w ? '100%' : undefined } : { width: '100%', height: '100%' }}>
              <video ref={video} playsInline muted className="h-full w-full object-fill"
                onLoadedMetadata={(e) => setSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
              {status !== 'error' && size && (() => {
                const f = frameRect(size.w, size.h)
                // The frame to put the bill in; it turns green while the bill is steady.
                return <div className={`pointer-events-none absolute rounded-xl border-4 transition-colors ${status === 'steady' ? 'border-emerald-400' : 'border-white/80'}`}
                  style={{ left: `${(f.x / size.w) * 100}%`, top: `${(f.y / size.h) * 100}%`, width: `${(f.w / size.w) * 100}%`, height: `${(f.h / size.h) * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
              })()}
            </div>
          </>
        )}
        {status === 'error' && <p className="absolute inset-x-6 text-center text-white">{error}</p>}
      </div>

      <div className="mx-auto mt-3 w-full max-w-3xl text-center text-white">
        {status !== 'error' && !shot && (
          <>
            <p className={`text-sm font-medium ${status === 'steady' ? 'text-emerald-300' : status === 'dark' || status === 'blurry' ? 'text-amber-300' : 'text-white'}`} aria-live="polite">{MESSAGE[status]}</p>
            <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded bg-white/20"><div className="h-1.5 bg-emerald-400 transition-all" style={{ width: `${Math.min(100, (steady / STEADY_FOR) * 100)}%` }} /></div>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {shot ? (
            <>
              <Button variant="secondary" icon={RotateCcw} onClick={() => { URL.revokeObjectURL(shot.url); void start() }}>Retake</Button>
              <Button icon={CheckCircle2} onClick={() => { stop(); onDone(shot.file) }}>Use this scan</Button>
            </>
          ) : status === 'error' ? (
            <>
              <Button variant="secondary" onClick={() => void start()}>Try again</Button>
              <Button variant="ghost" onClick={close}>Close</Button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-white/80"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Take the picture by itself</label>
              <Button icon={Camera} disabled={status === 'starting'} onClick={() => void take()}>Take picture now</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
