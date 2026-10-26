import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChefHat, Clock, ExternalLink, MapPin, Phone, Plus, Store, User } from 'lucide-react'
import { Badge, Button, Card, Field, PageHeader, Toggle, inputCls } from '../../components/ui'
import { Tile } from '../../components/report'
import { useApp } from '../../context/AppContext'
import {
  BRANCHES, BRANCH_INFO, BRANCH_INTEGRATIONS, COMPANY_INTEGRATIONS, INTEGRATIONS,
  type BranchIntegration, type IntegrationId,
} from '../../data/mock'

type Branch = (typeof BRANCHES)[number] & (typeof BRANCH_INFO)[string]
type State = 'live' | 'issue' | 'off' | 'na'

const AI_IDS: IntegrationId[] = ['forecast', 'costwatch', 'askai']
const GROUPS = ['Online orders', 'Billing', 'AI', 'Alerts'] as const

function Dot({ state, label }: { state: State; label?: string }) {
  const cls = { live: 'bg-emerald-500', issue: 'bg-amber-500', off: 'bg-slate-300', na: '' }[state]
  if (state === 'na') return <span className="text-slate-300">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      {label ?? { live: 'Live', issue: 'Issue', off: 'Off' }[state]}
    </span>
  )
}

export default function BranchesIntegrations() {
  const { can, ocrEnabled, toggleOcr } = useApp()
  const edit = can('settings', 'edit')

  const [branches, setBranches] = useState<Branch[]>(() => BRANCHES.map((b) => ({ ...b, ...BRANCH_INFO[b.id] })))
  const [integ, setInteg] = useState(BRANCH_INTEGRATIONS)
  const [company, setCompany] = useState(COMPANY_INTEGRATIONS)
  const [sel, setSel] = useState('B1')
  const [form, setForm] = useState<null | { name: string; address: string; area: string; pincode: string; phone: string; manager: string }>(null)

  const branch = branches.find((b) => b.id === sel)!
  const isCK = (id: string) => id === 'CK'
  const outlets = branches.filter((b) => !isCK(b.id))

  const stateOf = (id: string, key: IntegrationId): State => {
    const def = INTEGRATIONS.find((i) => i.id === key)!
    if (def.outletOnly && isCK(id)) return 'na'
    const x = integ[id]?.[key]
    if (!x?.on) return x?.issue ? 'issue' : 'off'
    return x.issue ? 'issue' : 'live'
  }
  const liveCount = (key: IntegrationId) => outlets.filter((b) => stateOf(b.id, key) === 'live').length
  const aiOn = branches.reduce((s, b) => s + AI_IDS.filter((k) => integ[b.id]?.[k]?.on).length, 0)

  const patch = (key: IntegrationId, p: Partial<BranchIntegration>) =>
    setInteg((all) => ({ ...all, [sel]: { ...all[sel], [key]: { ...(all[sel]?.[key] ?? { on: false }), ...p } } }))

  const addBranch = () => {
    if (!form?.name.trim()) return
    const id = 'B' + (branches.length)
    setBranches((bs) => [...bs, {
      id, name: form.name, city: 'Bengaluru', restaurant: 'R1', manager: form.manager || '—', ocr: false, sales: 0, foodCost: 0, status: 'offline',
      address: form.address, area: form.area || form.name, pincode: form.pincode, phone: form.phone, hours: '—',
    }])
    setInteg((all) => ({ ...all, [id]: {} }))
    setSel(id)
    setForm(null)
  }

  const mapUrl = (b: Branch) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.address}, ${b.area}, ${b.city} ${b.pincode}`)}`

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Branches & Integrations"
        subtitle="Every BTI location, where it is, and which apps and AI tools it's connected to"
        actions={can('settings', 'create') && <Button icon={Plus} onClick={() => setForm({ name: '', address: '', area: '', pincode: '', phone: '', manager: '' })}>Add branch</Button>}
      />

      {form && (
        <Card title="New branch" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Branch name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Malleshwaram" /></Field>
            <Field label="Street address"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Area"><input className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
            <Field label="Pincode"><input className={inputCls} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Manager"><input className={inputCls} value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></Field>
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={addBranch}>Save branch</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile label="Locations" value={String(branches.length)} note={`${outlets.length} outlets + central kitchen`} />
        <Tile label="Online now" value={`${branches.filter((b) => b.status === 'online').length} / ${branches.length}`} tone={branches.every((b) => b.status === 'online') ? 'green' : 'amber'} />
        <Tile label="Swiggy live" value={`${liveCount('swiggy')} / ${outlets.length}`} tone={liveCount('swiggy') === outlets.length ? 'green' : 'amber'} />
        <Tile label="Zomato live" value={`${liveCount('zomato')} / ${outlets.length}`} tone={liveCount('zomato') === outlets.length ? 'green' : 'amber'} />
        <Tile label="AI tools on" value={String(aiOn)} note={`across ${branches.length} locations`} />
      </div>

      {/* At a glance */}
      <Card title="All branches at a glance" className="mt-4" pad={false}
        actions={<span className="hidden gap-3 sm:flex"><Dot state="live" /><Dot state="issue" /><Dot state="off" /></span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {['Branch', 'Location', 'Status', 'Swiggy', 'Zomato', 'ONDC', 'POS', 'Bill OCR', 'AI tools', 'WhatsApp'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-medium first:pl-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => {
                const ai = AI_IDS.filter((k) => integ[b.id]?.[k]?.on).length
                return (
                  <tr key={b.id} onClick={() => setSel(b.id)} className={`cursor-pointer ${sel === b.id ? 'bg-[#fbf3e4]' : 'hover:bg-slate-50'}`}>
                    <td className="py-2.5 pl-4 pr-3">
                      <span className="flex items-center gap-2 font-medium">
                        {isCK(b.id) ? <ChefHat size={15} className="text-amber-600" /> : <Store size={15} className="text-slate-400" />}
                        {b.name}
                      </span>
                    </td>
                    <td className="px-3 text-slate-600">{b.area}{b.pincode && <span className="text-slate-400"> · {b.pincode}</span>}</td>
                    <td className="px-3"><Badge>{b.status}</Badge></td>
                    {(['swiggy', 'zomato', 'ondc', 'pos'] as IntegrationId[]).map((k) => <td key={k} className="px-3"><Dot state={stateOf(b.id, k)} /></td>)}
                    <td className="px-3"><Dot state={ocrEnabled[b.id] ? 'live' : 'off'} label={ocrEnabled[b.id] ? 'On' : 'Off'} /></td>
                    <td className="px-3"><Dot state={ai ? 'live' : 'off'} label={`${ai} of 3`} /></td>
                    <td className="px-3"><Dot state={stateOf(b.id, 'whatsapp')} label={integ[b.id]?.whatsapp?.on ? 'On' : 'Off'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Click a branch to see its full details and change its connections.</p>
      </Card>

      {/* Selected branch */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2">{isCK(branch.id) ? <ChefHat size={16} className="text-amber-600" /> : <Store size={16} />}{branch.name} <span className="font-normal text-slate-400">({branch.id})</span></span>}
          actions={<Badge>{branch.status}</Badge>}>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5">
              <MapPin size={16} className="mt-0.5 shrink-0 text-[#7a2228]" />
              <span>
                {branch.address && <span className="block">{branch.address}</span>}
                <span className="block">{branch.area}, {branch.city} {branch.pincode}</span>
                {branch.address && (
                  <a href={mapUrl(branch)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#7a2228]">
                    Open in Google Maps <ExternalLink size={12} />
                  </a>
                )}
              </span>
            </li>
            <li className="flex gap-2.5"><User size={16} className="shrink-0 text-slate-400" />Manager: {branch.manager}</li>
            {branch.phone && <li className="flex gap-2.5"><Phone size={16} className="shrink-0 text-slate-400" /><a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="hover:underline">{branch.phone}</a></li>}
            <li className="flex gap-2.5"><Clock size={16} className="shrink-0 text-slate-400" />Open {branch.hours}</li>
          </ul>
          {branch.status !== 'online' && (
            <p className="mt-4 flex gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle size={14} className="shrink-0" /> This branch is offline, so its apps can't send or receive data. Check the internet connection at the outlet.
            </p>
          )}
        </Card>

        <Card title={`Connections for ${branch.name}`} className="lg:col-span-2" pad={false}>
          {GROUPS.map((g) => {
            const items = INTEGRATIONS.filter((i) => i.group === g && !(i.outletOnly && isCK(branch.id)))
            const showOcr = g === 'Billing'
            if (!items.length && !showOcr) return null
            return (
              <div key={g} className="border-b border-slate-100 last:border-0">
                <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-[#7a2228]">{g}</p>
                <ul>
                  {items.map((i) => {
                    const x = integ[branch.id]?.[i.id]
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className="min-w-[180px] flex-1">
                          <span className="block text-sm font-medium">{i.name}</span>
                          <span className="block text-xs text-slate-500">{i.desc}</span>
                          {x?.issue && <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} />{x.issue}</span>}
                          {x?.on && !x.issue && x.lastSync && <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} />Synced {x.lastSync}</span>}
                        </span>
                        {i.needsId && (
                          <input className={inputCls + ' !w-40 !py-1 text-xs'} placeholder={i.needsId} aria-label={i.needsId} disabled={!edit}
                            value={x?.ref ?? ''} onChange={(e) => patch(i.id, { ref: e.target.value })} />
                        )}
                        <Toggle checked={!!x?.on} disabled={!edit || (!!i.needsId && !x?.ref)} label={`${i.name} for ${branch.name}`}
                          onChange={() => patch(i.id, { on: !x?.on, issue: undefined, lastSync: !x?.on ? 'just now' : x?.lastSync })} />
                      </li>
                    )
                  })}
                  {showOcr && (
                    <li className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1">
                        <span className="block text-sm font-medium">Bill OCR</span>
                        <span className="block text-xs text-slate-500">Read vendor bills uploaded at this location</span>
                      </span>
                      <Toggle checked={!!ocrEnabled[branch.id]} disabled={!edit} label={`Bill OCR for ${branch.name}`} onChange={() => toggleOcr(branch.id)} />
                    </li>
                  )}
                </ul>
              </div>
            )
          })}
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Enter the store ID from Swiggy, Zomato, ONDC or the POS before switching it on.</p>
        </Card>
      </div>

      <Card title="Connections for the whole business" className="mt-4" pad={false}>
        <ul className="divide-y divide-slate-100">
          {company.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="block text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-slate-500">{c.desc}</span>
              </span>
              <Badge>{c.on ? 'connected' : 'disconnected'}</Badge>
              <Toggle checked={c.on} disabled={!edit} label={c.name} onChange={() => setCompany(company.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
