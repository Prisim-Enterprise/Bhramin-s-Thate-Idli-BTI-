import { useState } from 'react'
import { Building2, ChefHat, Plus, Store } from 'lucide-react'
import { Badge, Button, Card, Field, PageHeader, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES, RESTAURANTS } from '../../data/mock'

export default function Restaurants() {
  const { can } = useApp()
  const [restaurants, setRestaurants] = useState(RESTAURANTS)
  const [branches, setBranches] = useState(BRANCHES)
  const [form, setForm] = useState<{ kind: 'restaurant' | 'branch'; name: string; parent: string; city: string } | null>(null)

  const save = () => {
    if (!form?.name.trim()) return
    if (form.kind === 'restaurant') {
      const id = 'R' + (restaurants.length + 1)
      setRestaurants((r) => [...r, { id, name: form.name, gstin: '', branches: [] }])
    } else {
      const id = 'B' + (branches.length)
      setBranches((b) => [...b, { id, name: form.name, city: form.city || '—', restaurant: form.parent, manager: '—', ocr: false, sales: 0, foodCost: 0, status: 'offline' }])
    }
    setForm(null)
  }

  const ck = branches.find((b) => b.id === 'CK')!

  return (
    <>
      <PageHeader
        title="Restaurants & Branches"
        subtitle="R1 … Rn, each with its branches. The central kitchen supplies all of them."
        actions={can('settings', 'create') && (
          <>
            <Button variant="secondary" icon={Plus} onClick={() => setForm({ kind: 'branch', name: '', parent: restaurants[0].id, city: '' })}>Add branch</Button>
            <Button icon={Plus} onClick={() => setForm({ kind: 'restaurant', name: '', parent: '', city: '' })}>Add restaurant</Button>
          </>
        )}
      />

      {form && (
        <Card title={form.kind === 'restaurant' ? 'New restaurant' : 'New branch'} className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            {form.kind === 'branch' && (
              <>
                <Field label="Restaurant">
                  <select className={inputCls} value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })}>
                    {restaurants.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}
                  </select>
                </Field>
                <Field label="City"><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2"><Button onClick={save}>Save</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><ChefHat size={20} /></span>
          <div className="flex-1">
            <p className="font-medium">{ck.name}</p>
            <p className="text-sm text-slate-500">{ck.city} · Manager: {ck.manager}</p>
          </div>
          <Badge>{ck.status}</Badge>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {restaurants.map((r) => (
          <Card key={r.id} title={<span className="flex items-center gap-2"><Building2 size={16} className="text-brand-600" />{r.id} · {r.name}</span>} actions={<span className="text-xs text-slate-400">{r.gstin || 'GSTIN not set'}</span>} pad={false}>
            <ul className="divide-y divide-slate-100">
              {branches.filter((b) => b.restaurant === r.id && b.id !== 'CK').map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <Store size={16} className="text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{b.name} <span className="text-slate-400">({b.id})</span></p>
                    <p className="text-xs text-slate-500">{b.city} · Manager: {b.manager}</p>
                  </div>
                  <Badge>{b.status}</Badge>
                </li>
              ))}
              {!branches.some((b) => b.restaurant === r.id && b.id !== 'CK') && <li className="px-4 py-3 text-sm text-slate-500">No branches yet.</li>}
            </ul>
          </Card>
        ))}
      </div>
    </>
  )
}
