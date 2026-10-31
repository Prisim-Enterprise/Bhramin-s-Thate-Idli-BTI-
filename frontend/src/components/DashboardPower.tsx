import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Power, PowerOff } from 'lucide-react'
import { Button, Card } from './ui'
import { useAuth } from '../context/AuthContext'
import { switchDashboards, useSystem } from '../data/systemStore'
import { fmtDateTime } from '../data/entries'
import { API_ON } from '../lib/api'
import Logo from './Logo'

/** Control Panel card: turn every dashboard off (for everyone except admins) or back on. */
export function DashboardPowerCard() {
  const sys = useSystem(true)
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const off = !!sys?.off

  const flip = async (turnOff: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await switchDashboards(turnOff, turnOff ? message.trim() : '')
      setAsking(false)
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={`mb-4 border-2 ${off ? 'border-rose-300 bg-rose-50' : 'border-emerald-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-full ${off ? 'bg-rose-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
            {off ? <PowerOff size={22} /> : <Power size={22} />}
          </span>
          <div>
            <p className="font-semibold text-slate-900">Dashboards are {off ? 'OFF' : 'ON'}</p>
            <p className="text-sm text-slate-600">
              {off
                ? <>Turned off{sys?.by && <> by {sys.by}</>}{sys?.at && <> on {fmtDateTime(sys.at)}</>}. Only admins can use the system.</>
                : 'Everyone with a login can use the Centre Kitchen and branch dashboards.'}
            </p>
            {off && sys?.message && <p className="mt-0.5 text-sm text-rose-700">Message shown to staff: “{sys.message}”</p>}
          </div>
        </div>
        {!API_ON ? (
          <p className="text-xs text-slate-500">Available when signed in to the cloud.</p>
        ) : off ? (
          <Button icon={Power} disabled={busy} onClick={() => void flip(false)}>Turn on</Button>
        ) : (
          <button onClick={() => setAsking(true)} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
            <PowerOff size={16} /> Turn off
          </button>
        )}
      </div>

      {asking && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-white p-4">
          <p className="font-medium text-slate-900">Turn off all dashboards?</p>
          <p className="mt-1 text-sm text-slate-600">
            Everyone except admins is locked out within about 20 seconds, on every device: no viewing, saving, uploading or bill reading.
            Nothing is deleted. Turn it back on here at any time.
          </p>
          <label className="mt-3 block text-xs text-slate-500">Message for staff (optional)
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={300} value={message}
              placeholder="e.g. Month-end closing, back by 6 pm" onChange={(e) => setMessage(e.target.value)} />
          </label>
          {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
            <button disabled={busy} onClick={() => void flip(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              <PowerOff size={16} /> {busy ? 'Turning off…' : 'Yes, turn off'}
            </button>
          </div>
        </div>
      )}
      {!asking && error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </Card>
  )
}

/** Top-bar strip that reminds admins the dashboards are off for everyone else. */
export function DashboardsOffBanner() {
  const sys = useSystem(true)
  if (!sys?.off) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-rose-600 px-4 py-1.5 text-center text-sm font-medium text-white">
      <PowerOff size={15} /> Dashboards are turned OFF for staff. Only admins can use the system.
      <Link to="/control" className="underline underline-offset-2">Turn on</Link>
    </div>
  )
}

/** What staff see while the dashboards are off. */
export function DashboardsOffScreen({ message, at }: { message?: string; at?: string | null }) {
  const auth = useAuth()
  return (
    <div className="grid min-h-screen place-items-center bg-[#2a0f12] p-6 text-center text-white">
      <div className="max-w-md">
        <Logo size={80} className="mx-auto mb-6" />
        <PowerOff className="mx-auto text-[#d9a441]" size={40} />
        <h1 className="mt-4 text-2xl font-semibold">The dashboard is turned off</h1>
        <p className="mt-2 text-white/80">An admin has turned off the dashboards{at ? ` on ${fmtDateTime(at)}` : ''}. Please try again later.</p>
        {message && <p className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-[#f6e3b8]">“{message}”</p>}
        <p className="mt-3 text-sm text-white/60">This page checks every 20 seconds and opens again by itself when it's turned back on.</p>
        <button onClick={() => void auth.signOut()} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10">
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}
