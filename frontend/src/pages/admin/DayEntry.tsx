import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, FileText, Plus, Save, Trash2 } from 'lucide-react'
import { Button, Card, Field, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { BRANCHES, inr } from '../../data/mock'
import {
  KNOWN_LEDGERS, PAYOUT_TYPES, billTotal, blankEntry, cashIn, closing, findDuplicate, fmtDateTime, getEntry, guessType, niceDate, paidOut, saveEntry, viaApps,
  type DayEntry as Entry, type PayoutType,
} from '../../data/entries'

type NumKey = 'opening' | 'sales' | 'cgst' | 'sgst' | 'container' | 'discount' | 'roundOff' | 'mobikwik' | 'swiggy' | 'zomato' | 'rapido'

// One day's figures for one branch, laid out like the Tally Imprest Book.
// Opened empty ("Enter manually"), pre-filled from a PDF, or to edit a saved entry.
export default function DayEntry() {
  const { id } = useParams()
  const { state } = useLocation() as { state: { entry?: Entry; skipped?: string[] } | null }
  const navigate = useNavigate()
  const { can } = useApp()
  const auth = useAuth()

  const [e, setE] = useState<Entry>(() => (id && getEntry(id)) || state?.entry || blankEntry())
  const set = (patch: Partial<Entry>) => setE((x) => ({ ...x, ...patch }))
  const dup = useMemo(() => findDuplicate(e.branch, e.date, e.id), [e.branch, e.date, e.id])
  const editable = can('accounts', e.id ? 'edit' : 'create')

  const num = (k: NumKey, label: string, hint?: string) => (
    <Field label={label}>
      <input type="number" step="0.01" inputMode="decimal" disabled={!editable} className={inputCls + ' text-right tabular-nums'}
        value={e[k] || ''} placeholder="0" onChange={(ev) => set({ [k]: Number(ev.target.value) || 0 } as Partial<Entry>)} />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </Field>
  )

  const setPayout = (i: number, patch: Partial<Entry['payouts'][number]>) =>
    set({ payouts: e.payouts.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const cash = cashIn(e)
  const valid = e.payouts.every((p) => p.ledger.trim() && p.amount > 0) && cash >= 0

  const save = () => {
    saveEntry({ ...e, payouts: e.payouts.map((p) => ({ ...p, ledger: p.ledger.trim() })) }, auth.email ?? 'Demo user')
    navigate('/admin/accounting')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{e.id ? 'Edit day entry' : e.source === 'pdf' ? 'Check the figures read from the PDF' : 'Enter day figures'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {e.source === 'pdf'
              ? <span className="inline-flex items-center gap-1"><FileText size={14} /> Read from <b>{e.fileName}</b>. Check each number, fix anything wrong, then save.</span>
              : 'Same layout as the Imprest Book. Totals work themselves out.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/admin/accounting')}>Cancel</Button>
          <Button icon={Save} disabled={!editable || !valid} onClick={save}>Save entry</Button>
        </div>
      </div>

      {e.id && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          {e.source === 'pdf' ? 'Uploaded' : 'Entered'} by <b>{e.addedBy ?? 'unknown'}</b> on {fmtDateTime(e.addedAt ?? e.savedAt)}
          {e.editedBy && <> · last changed by <b>{e.editedBy}</b> on {fmtDateTime(e.savedAt)}</>}
        </p>
      )}

      {state?.skipped?.length ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <b>{state.skipped.length} line(s) in the PDF weren't recognised</b> and were left out: {state.skipped.join(' · ')}
        </p>
      ) : null}

      <div className="space-y-4">
        <Card title="1. Branch and date">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Branch">
              <select className={inputCls} disabled={!editable} value={e.branch} onChange={(ev) => set({ branch: ev.target.value })}>
                {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} disabled={!editable} value={e.date} onChange={(ev) => set({ date: ev.target.value })} />
            </Field>
            {num('opening', 'Opening balance (cash in hand)')}
          </div>
          {dup && (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={16} /> There is already an entry for this branch on {niceDate(e.date)}. Saving adds a second one.
            </p>
          )}
        </Card>

        <Card title="2. Sales for the day">
          <div className="grid gap-3 sm:grid-cols-3">
            {num('sales', 'Food sales (before GST)')}
            {num('cgst', 'CGST @ 2.5%')}
            {num('sgst', 'SGST @ 2.5%')}
            {num('container', 'Container charges')}
            {num('discount', 'Discount (settlement)', 'Reduces the bill')}
            {num('roundOff', 'Round off', 'Use minus for a negative round off')}
          </div>
          <Line label="Total billed" value={billTotal(e)} strong />
        </Card>

        <Card title="3. How the money came in">
          <div className="grid gap-3 sm:grid-cols-4">
            {num('mobikwik', 'Mobikwik (UPI / card)')}
            {num('swiggy', 'Swiggy')}
            {num('zomato', 'Zomato')}
            {num('rapido', 'Rapido')}
          </div>
          <Line label="Through apps and UPI" value={viaApps(e)} />
          <Line label="Cash collected (what's left)" value={cash} strong
            warn={cash < 0 ? 'Apps and UPI add up to more than the bill. Check the numbers.' : undefined} />
        </Card>

        <Card title="4. Paid out of cash" actions={
          <Button size="sm" variant="secondary" icon={Plus} disabled={!editable}
            onClick={() => set({ payouts: [...e.payouts, { type: 'expense', ledger: '', amount: 0 }] })}>Add line</Button>
        }>
          {e.payouts.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing paid out. Use <b>Add line</b> for salary, water tanker, groceries and so on.</p>
          ) : (
            <div className="space-y-2">
              <datalist id="ledgers">{KNOWN_LEDGERS.map((l) => <option key={l.name} value={l.name} />)}</datalist>
              {e.payouts.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <input list="ledgers" placeholder="What for (e.g. Water Tanker)" className={inputCls + ' col-span-2 sm:col-span-1'} disabled={!editable}
                    value={p.ledger} onChange={(ev) => setPayout(i, { ledger: ev.target.value, type: guessType(ev.target.value) })} />
                  <select className={inputCls} disabled={!editable} value={p.type} onChange={(ev) => setPayout(i, { type: ev.target.value as PayoutType })}
                    aria-label="Goes to report">
                    {Object.entries(PAYOUT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="number" step="0.01" inputMode="decimal" placeholder="0" aria-label="Amount" className={inputCls + ' text-right tabular-nums'}
                    disabled={!editable} value={p.amount || ''} onChange={(ev) => setPayout(i, { amount: Number(ev.target.value) || 0 })} />
                  <button aria-label="Remove line" disabled={!editable} onClick={() => set({ payouts: e.payouts.filter((_, j) => j !== i) })}
                    className="grid w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-x-6 sm:grid-cols-3">
            <Line label="Expenses" value={paidOut(e, 'expense')} />
            <Line label="Purchases" value={paidOut(e, 'purchase')} />
            <Line label="Salary" value={paidOut(e, 'salary')} />
          </div>
        </Card>

        <Card title="5. End of day">
          <Line label="Opening balance" value={e.opening} />
          <Line label="+ Cash collected" value={cash} />
          <Line label="− Paid out" value={paidOut(e)} />
          <Line label="Closing balance" value={closing(e)} strong />
        </Card>
      </div>
    </div>
  )
}

function Line({ label, value, strong, warn }: { label: ReactNode; value: number; strong?: boolean; warn?: string }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className={`flex justify-between text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        <span>{label}</span><span className="tabular-nums">{inr(Math.round(value * 100) / 100)}</span>
      </div>
      {warn && <p className="mt-1 text-xs text-rose-600">{warn}</p>}
    </div>
  )
}
