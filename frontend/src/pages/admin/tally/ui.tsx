import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'

// The Tally Prime look: dark top bar, light-blue title bar, button bar on the right, yellow highlight on the
// selected line, keyboard first. Shared by every screen in the Gateway.

export const T = {
  top: 'bg-[#2c3e50] text-white',
  title: 'bg-[#cfe0f1] text-[#1b2a3a]',
  panel: 'bg-[#f6f8fb]',
  head: 'bg-[#1f5f99] text-white',
  sel: 'bg-[#ffd75e] text-[#1b2a3a]',
  bar: 'bg-[#e4e9f0]',
  line: 'border-[#c5d1de]',
  hot: 'font-bold underline decoration-[#1f5f99] underline-offset-2',
  input: 'w-full rounded-none border-0 border-b border-[#9db3c8] bg-white/70 px-1.5 py-1 text-sm text-[#1b2a3a] outline-none focus:border-[#1f5f99] focus:bg-[#fff6d6] disabled:bg-transparent disabled:text-[#556]',
}

/** A label with its hot key letter marked, e.g. <Hot text="Create" hot="C" />. */
export function Hot({ text, hot }: { text: string; hot?: string }) {
  if (!hot) return <>{text}</>
  const i = text.toLowerCase().indexOf(hot.toLowerCase())
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<span className={T.hot}>{text[i]}</span>{text.slice(i + 1)}</>
}

/** The key that was pressed, as Tally names it: "f5", "ctrl+f8", "alt+c", "ctrl+a", "escape". */
export const comboOf = (e: KeyboardEvent) => `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.altKey ? 'alt+' : ''}${e.key.toLowerCase()}`

/* ---------- Keys: each screen tells the frame what its keys do ---------- */

export type Handlers = Record<string, (() => void) | undefined>
// A stack: the screen or box on top gets the keys; when it closes, the one under it gets them back.
const KeysCtx = createContext<{ push: (h: { current: Handlers }) => () => void } | null>(null)
export const KeysProvider = KeysCtx.Provider

/** Register this screen's keys (e.g. { 'ctrl+a': save, 'alt+d': remove }). An undefined handler = key not used here. */
export function useScreenKeys(h: Handlers) {
  const ctx = useContext(KeysCtx)
  const ref = useRef(h)
  ref.current = h
  useEffect(() => (ctx ? ctx.push(ref) : undefined), [ctx])
}

/* ---------- Pieces ---------- */

export type BarButton = { k: string; label: string; on?: () => void; off?: boolean; gap?: boolean }

/** The button bar on the right of every Tally screen (a strip along the bottom on a phone). */
export function ButtonBar({ buttons }: { buttons: BarButton[] }) {
  return (
    <aside aria-label="Shortcut keys" className={`${T.bar} flex shrink-0 gap-px overflow-x-auto border-t ${T.line} text-xs lg:w-44 lg:flex-col lg:overflow-visible lg:border-l lg:border-t-0`}>
      {buttons.map((b, i) => (
        <button key={b.k + b.label + i} type="button" disabled={b.off || !b.on} onClick={b.on}
          className={`flex shrink-0 items-baseline gap-1.5 bg-[#eef2f6] px-2.5 py-1.5 text-left hover:bg-[#ffe9a3] disabled:cursor-default disabled:bg-[#e4e9f0] disabled:text-[#9aa7b4] lg:w-full ${b.gap ? 'lg:mt-2' : ''}`}>
          <span className="font-bold text-[#1f5f99] disabled:text-inherit">{b.k}:</span>
          <span className="truncate">{b.label}</span>
        </button>
      ))}
    </aside>
  )
}

/** "Name : value" row, as Tally lays out its forms. */
export function Row({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`grid items-center gap-x-3 py-0.5 text-sm ${wide ? 'grid-cols-[minmax(120px,190px)_1fr]' : 'grid-cols-[minmax(110px,170px)_1fr]'}`}>
      <span className="text-[#33475b]">{label}</span>
      <span className="flex items-center gap-1"><span className="text-[#33475b]">:</span><span className="min-w-0 flex-1">{children}</span></span>
    </label>
  )
}

export function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <p className={`mb-1 border-b ${T.line} pb-0.5 text-xs font-semibold uppercase tracking-wide text-[#1f5f99]`}>{title}</p>
      {children}
    </section>
  )
}

/** Indian number format with two decimals; empty for zero. */
export const amt = (n: number) => (n ? Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
export const bal = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : `${amt(n)} ${n > 0 ? 'Dr' : 'Cr'}`)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-11-19" -> "19-Nov-26", as Tally prints dates. */
export const tDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8))}-${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}` : '')
export const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })

/** A small Tally-style dialog box in the middle of the screen. */
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md border border-[#1f5f99] bg-white shadow-2xl">
        <p className={`${T.head} px-3 py-1.5 text-sm font-semibold`}>{title}</p>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
