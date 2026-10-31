import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Paperclip, Plus, Trash2, Wallet, X } from 'lucide-react'
import { Badge, Button, Card, Table, inputCls } from '../../../components/ui'
import { ScopePicker, Tile, downloadCsv, money } from '../../../components/report'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { fmtDateTime, niceDate } from '../../../data/entries'
import { addManualVoucher, deleteManualVoucher, keepFile, openReceipt, type ReceiptFile } from '../../../data/ledgerStore'
import { imprestLedger } from '../../../data/books'
import { monthName, useReportData } from '../../../data/analytics'
import { pettyLedgers, pettyLines } from '../../../data/petty'
import { API_ON, listLogins, type Login } from '../../../lib/api'
import { OpsHeader } from './shared'

const today = () => new Date().toLocaleDateString('en-CA')

/** A branch manager reports a petty expense: saved as a Journal (Dr expense, Cr the branch's cash). */
function AddPetty({ ledgers, myBranch, onClose, onSaved }: { ledgers: string[]; myBranch: string | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const auth = useAuth()
  const [branch, setBranch] = useState(myBranch ?? 'B1')
  const [date, setDate] = useState(today())
  const [ledger, setLedger] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = ledger.trim() && Number(amount) > 0 && date

  const save = async () => {
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      let receipt: ReceiptFile | undefined
      if (file) receipt = await keepFile(file)
      const now = new Date().toISOString()
      const ok = addManualVoucher({
        id: 'petty-' + branch + '-' + Date.now().toString(36), type: 'Journal', date, branch, amount: Number(amount),
        drLedger: ledger.trim(), crLedger: imprestLedger(branch), narration: note.trim() || `Petty expense: ${ledger.trim()}`,
        receipt, addedBy: auth.email ?? 'Demo user', addedAt: now,
      })
      if (!ok) throw new Error('Could not save. Check your connection and try again.')
      onSaved(`Saved ${inr(Number(amount))} for ${ledger.trim()} at ${branchName(branch)}.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-label="Add petty expense">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-lg font-semibold">Add petty expense</p>
          <button aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Branch
            <select className={inputCls + ' mt-1'} value={branch} disabled={!!myBranch} onChange={(e) => setBranch(e.target.value)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="text-xs font-medium text-slate-600">Date<input type="date" className={inputCls + ' mt-1'} value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">What for (ledger)
            <input list="petty-ledgers" className={inputCls + ' mt-1'} placeholder="e.g. Conveyance, Transportation, Cleaning" value={ledger} onChange={(e) => setLedger(e.target.value)} />
            <datalist id="petty-ledgers">{ledgers.map((l) => <option key={l} value={l} />)}</datalist></label>
          <label className="text-xs font-medium text-slate-600">Amount (₹)<input type="number" min="0" step="0.01" className={inputCls + ' mt-1 text-right'} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-600">Bill / receipt (optional)<input type="file" accept="image/*,application/pdf" className="mt-1 block w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Note (optional)<input className={inputCls + ' mt-1'} value={note} placeholder="e.g. auto to market for vegetables" onChange={(e) => setNote(e.target.value)} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Saved as a Journal in Account Books: <b>Dr {ledger.trim() || 'expense'}</b>, <b>Cr {imprestLedger(branch)}</b>.</p>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={CheckCircle2} disabled={!valid || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save petty expense'}</Button>
        </div>
      </div>
    </div>
  )
}

// Petty expenses from every branch: totals per branch, per manager, and each entry with who entered it and when.
export default function PettyExpenses() {
  const { can, role } = useApp()
  const auth = useAuth()
  const R = useReportData()
  const [manager, setManager] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [logins, setLogins] = useState<Login[]>([])
  useEffect(() => { if (API_ON && role === 'admin') listLogins().then(setLogins).catch(() => setLogins([])) }, [role])
  const myBranch = (() => { const b = auth.session?.user.app_metadata?.branch as string | undefined; return b && b !== 'HO' ? b : null })()

  const all = pettyLines(R.d, R.scope)
  const lines = all.filter((l) => !manager || l.by === manager)
  const total = lines.reduce((t, l) => t + l.amount, 0)
  const nameOf = (email: string) => logins.find((l) => l.email === email)?.name || email || 'unknown'
  const ledgers = useMemo(() => pettyLedgers(R.d), [R.d])

  const branches = BRANCHES.map((b) => {
    const mine = lines.filter((l) => l.branch === b.id)
    const last = mine.reduce<(typeof mine)[number] | null>((a, l) => (!a || (l.at ?? '') > (a.at ?? '') ? l : a), null)
    return { b, total: mine.reduce((t, l) => t + l.amount, 0), n: mine.length, last }
  })
  const reporting = branches.filter((x) => x.n)
  const managers = [...new Set(all.map((l) => l.by))].map((by) => {
    const mine = lines.filter((l) => l.by === by)
    return { by, branches: [...new Set(mine.map((l) => l.branch))], n: mine.length, total: mine.reduce((t, l) => t + l.amount, 0), last: mine.map((l) => l.at).sort().pop() ?? '' }
  }).filter((m) => m.n).sort((a, b) => b.total - a.total)

  const csv = () => downloadCsv(`BTI-Petty-Expenses-${R.month || 'all'}.csv`, [
    ['Date', 'Branch', 'Ledger', 'Amount', 'Note', 'Entered by', 'Entered at', 'From'],
    ...lines.map((l) => [l.date, branchName(l.branch), l.ledger, l.amount, l.note, nameOf(l.by), l.at ? fmtDateTime(l.at) : '', l.from]),
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <OpsHeader title="Petty Expenses">
        {R.hasData && <ScopePicker months={R.months} month={R.month} setMonth={R.setMonth} branch={R.branch} setBranch={R.setBranch} monthName={monthName} branches={BRANCHES} />}
        <select aria-label="Manager" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700" value={manager} onChange={(e) => setManager(e.target.value)}>
          <option value="">All managers</option>
          {[...new Set(all.map((l) => l.by))].map((m) => <option key={m} value={m}>{nameOf(m)}</option>)}
        </select>
        <button onClick={csv} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Export</button>
        {can('expenses', 'create') && <Button icon={Plus} onClick={() => { setAdding(true); setNotice(null) }}>Add petty expense</Button>}
      </OpsHeader>
      <p className="-mt-2 mb-4 text-sm text-slate-500">Small expenses paid from each branch's cash, as reported by the branch managers. {myBranch && <>You report for <b>{branchName(myBranch)}</b>.</>}</p>
      {notice && <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 size={16} />{notice}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total petty expenses" value={money(total)} note={R.label} />
        <Tile label="Entries" value={String(lines.length)} />
        <Tile label="Branches reporting" value={`${reporting.length} / ${BRANCHES.length}`} />
        <Tile label="Highest branch" value={reporting.length ? money(Math.max(...reporting.map((x) => x.total))) : '—'} note={reporting.length ? [...reporting].sort((a, b) => b.total - a.total)[0].b.name : 'none yet'} />
      </div>

      {/* Each branch */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">By branch</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {branches.filter((x) => !R.branch || x.b.id === R.branch).map(({ b, total: t, n, last }) => (
          <button key={b.id} onClick={() => R.setBranch(R.branch === b.id ? '' : b.id)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-[#d9a441] ${R.branch === b.id ? 'border-[#7a2228] ring-2 ring-[#7a2228]/15' : 'border-slate-200'}`}>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Wallet size={15} className="text-[#7a2228]" />{b.name}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{n ? money(t) : '—'}</p>
            <p className="mt-1 text-xs text-slate-500">{n ? `${n} entr${n === 1 ? 'y' : 'ies'}` : 'nothing reported'}</p>
            {last && <p className="mt-1 truncate text-xs text-slate-500">Last: {nameOf(last.by)} · {fmtDateTime(last.at)}</p>}
          </button>
        ))}
      </div>

      {/* Each manager */}
      <Card title="By manager" className="mt-6" pad={false}>
        <Table head={['Manager', 'Branch', 'Entries', 'Total', 'Last entry']}>
          {managers.map((m) => (
            <tr key={m.by} className="cursor-pointer hover:bg-slate-50" onClick={() => setManager(manager === m.by ? '' : m.by)}>
              <td><p className="font-medium text-slate-900">{nameOf(m.by)}</p>{nameOf(m.by) !== m.by && <p className="text-xs text-slate-500">{m.by}</p>}</td>
              <td>{m.branches.map(branchName).join(', ')}</td>
              <td className="tabular-nums">{m.n}</td>
              <td className="font-semibold tabular-nums">{inr(m.total)}</td>
              <td className="text-slate-500">{m.last ? fmtDateTime(m.last) : '—'}</td>
            </tr>
          ))}
          {!managers.length && <tr><td colSpan={5} className="!py-6 text-center text-slate-500">No petty expenses in this period.</td></tr>}
        </Table>
      </Card>

      {/* Every entry */}
      <Card title={`Every entry${manager ? ` · ${nameOf(manager)}` : ''} · ${inr(total)}`} className="mt-4" pad={false}>
        <Table head={['Date', 'Branch', 'What for', 'Amount', 'Entered by', 'Entered at', 'From', '']}>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>{niceDate(l.date)}</td>
              <td className="font-medium text-slate-900">{branchName(l.branch)}</td>
              <td>{l.ledger}{l.note && l.from === 'Petty journal' && !l.note.startsWith('Petty expense:') && <span className="block text-xs text-slate-500">{l.note}</span>}</td>
              <td className="font-semibold tabular-nums">{inr(l.amount)}</td>
              <td>{nameOf(l.by)}</td>
              <td className="text-slate-500">{l.at ? fmtDateTime(l.at) : '—'}</td>
              <td><Badge tone={l.from === 'Petty journal' ? 'violet' : 'slate'}>{l.from === 'Petty journal' ? 'journal' : 'imprest book'}</Badge></td>
              <td className="whitespace-nowrap text-right">
                {l.receipt && (l.receipt.key || l.receipt.dataUrl) && <button aria-label="View receipt" className="mr-2 text-[#7a2228]" onClick={() => openReceipt(l.receipt!)}><Paperclip size={15} /></button>}
                {l.voucherId && (can('accounts', 'delete') || (l.by === auth.email && can('expenses', 'edit'))) && (
                  <button aria-label="Delete entry" className="text-slate-400 hover:text-rose-600" onClick={() => { if (confirm(`Delete ${inr(l.amount)} for ${l.ledger}?`)) deleteManualVoucher(l.voucherId!) }}><Trash2 size={15} /></button>
                )}
              </td>
            </tr>
          ))}
          {!lines.length && <tr><td colSpan={8} className="!py-6 text-center text-slate-500">Nothing yet. Branch managers use “Add petty expense”; expense lines from uploaded Imprest Books also show here.</td></tr>}
          {lines.length > 0 && <tr className="bg-slate-50 font-semibold"><td colSpan={3}>Total</td><td className="tabular-nums">{inr(total)}</td><td colSpan={4} /></tr>}
        </Table>
      </Card>

      {adding && <AddPetty ledgers={ledgers} myBranch={myBranch} onClose={() => setAdding(false)} onSaved={(msg) => { setAdding(false); setNotice(msg) }} />}
    </div>
  )
}
