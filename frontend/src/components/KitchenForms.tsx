import { useState } from 'react'
import { CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import { Button, inputCls } from './ui'
import { useAuth } from '../context/AuthContext'
import { BRANCHES, branchName, inr } from '../data/mock'
import { CK, addMove, raiseIndent, rateOf, type Indent, type MoveLine, type StockItem } from '../data/kitchen'
import { itemKey } from '../data/inventory'

const today = () => new Date().toLocaleDateString('en-CA')
const OUTLETS = BRANCHES.filter((b) => b.id !== CK)

/** Item lines with quantity (and rate, for goods received). Known items fill in their unit and rate. */
function Lines({ lines, setLines, stock, withRate, showStock }: {
  lines: MoveLine[]; setLines: (l: MoveLine[]) => void; stock: StockItem[]; withRate: boolean; showStock?: boolean
}) {
  const set = (i: number, p: Partial<MoveLine>) => setLines(lines.map((l, j) => {
    if (j !== i) return l
    const next = { ...l, ...p }
    // Picking a known item fills in its unit and latest rate.
    if (p.item !== undefined) {
      const known = stock.find((s) => s.item.toLowerCase() === p.item!.trim().toLowerCase())
      if (known) { next.unit = known.unit; if (!l.rate) next.rate = known.rate }
    }
    return next
  }))
  return (
    <div>
      <datalist id="ck-items">{stock.map((s) => <option key={s.key} value={s.item}>{s.unit}</option>)}</datalist>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr>
          <th className="py-1 text-left font-medium">Item</th><th className="w-20 text-left font-medium">Unit</th><th className="w-24 text-right font-medium">Qty</th>
          {withRate && <th className="w-24 text-right font-medium">Rate ₹</th>}{showStock && <th className="w-24 text-right font-medium">In stock</th>}<th className="w-8" />
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const have = stock.find((s) => s.key === itemKey(l.item, l.unit))?.onHand
            return (
              <tr key={i}>
                <td className="py-1 pr-2"><input list="ck-items" aria-label="Item" className={inputCls + ' !py-1.5'} value={l.item} onChange={(e) => set(i, { item: e.target.value })} /></td>
                <td className="pr-2"><input aria-label="Unit" className={inputCls + ' !py-1.5'} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} /></td>
                <td><input aria-label={`Quantity of ${l.item || 'item'}`} type="number" min="0" step="0.001" className={inputCls + ' !py-1.5 text-right'} value={l.qty || ''} placeholder="0" onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })} /></td>
                {withRate && <td className="pl-2"><input aria-label={`Rate of ${l.item || 'item'}`} type="number" min="0" step="0.01" className={inputCls + ' !py-1.5 text-right'} value={l.rate || ''} placeholder="0" onChange={(e) => set(i, { rate: Number(e.target.value) || 0 })} /></td>}
                {showStock && <td className={`pl-2 text-right tabular-nums ${have != null && l.qty > have ? 'text-rose-600' : 'text-slate-500'}`}>{have != null ? have : '—'}</td>}
                <td className="pl-2"><button aria-label="Remove line" className="text-slate-300 hover:text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#7a2228] hover:underline" onClick={() => setLines([...lines, { item: '', unit: 'kg', qty: 0, rate: 0 }])}><Plus size={15} /> Add item</button>
    </div>
  )
}

function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="text-lg font-semibold">{title}</p>
          <button aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}

/** Goods received at the Centre Kitchen without a bill, or goods issued to an outlet (optionally for an indent). */
export function MoveDialog({ kind, stock, indent, onClose, onDone }: { kind: 'in' | 'out'; stock: StockItem[]; indent?: Indent; onClose: () => void; onDone: (msg: string) => void }) {
  const auth = useAuth()
  const [date, setDate] = useState(today())
  const [party, setParty] = useState(indent?.branch ?? (kind === 'out' ? OUTLETS[0].id : ''))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<MoveLine[]>(() => indent
    ? indent.lines.filter((l) => l.qty > l.sent).map((l) => ({ item: l.item, unit: l.unit, qty: Math.round((l.qty - l.sent) * 1000) / 1000, rate: rateOf(stock, l.item, l.unit) }))
    : [{ item: '', unit: 'kg', qty: 0, rate: 0 }])
  const valid = lines.some((l) => l.item.trim() && l.qty > 0) && (kind === 'in' || party)
  // Issues are valued at the latest purchase rate.
  const priced = kind === 'out' ? lines.map((l) => ({ ...l, rate: rateOf(stock, l.item, l.unit) })) : lines
  const value = priced.reduce((s, l) => s + l.qty * l.rate, 0)
  const short = kind === 'out' ? priced.filter((l) => { const s = stock.find((x) => x.key === itemKey(l.item, l.unit)); return l.qty > 0 && (!s || l.qty > s.onHand) }) : []

  const save = () => {
    addMove({ kind, date, to: kind === 'out' ? party : undefined, from: kind === 'in' ? party.trim() || 'Received' : undefined, lines: priced,
      indentId: indent?.id, note: note.trim(), addedBy: auth.email ?? 'Demo user', addedAt: new Date().toISOString() })
    onDone(kind === 'in' ? `Goods received recorded (${inr(Math.round(value))}).` : `Issued to ${branchName(party)} (${inr(Math.round(value))}).`)
  }

  return (
    <Dialog title={kind === 'in' ? 'Goods received at Centre Kitchen' : indent ? `Issue for ${branchName(indent.branch)}'s indent` : 'Issue goods to an outlet'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={CheckCircle2} disabled={!valid} onClick={save}>{kind === 'in' ? 'Save goods received' : 'Issue goods'}</Button></>}>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Date<input type="date" max={today()} className={inputCls + ' mt-1'} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {kind === 'out' ? (
          <label className="text-xs font-medium text-slate-600">To outlet
            <select aria-label="To outlet" className={inputCls + ' mt-1'} value={party} disabled={!!indent} onChange={(e) => setParty(e.target.value)}>{OUTLETS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        ) : (
          <label className="text-xs font-medium text-slate-600">From (vendor / person)<input className={inputCls + ' mt-1'} value={party} placeholder="e.g. farmer, market" onChange={(e) => setParty(e.target.value)} /></label>
        )}
        <label className="text-xs font-medium text-slate-600">Note<input className={inputCls + ' mt-1'} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <Lines lines={lines} setLines={setLines} stock={stock} withRate={kind === 'in'} showStock={kind === 'out'} />
      <p className="mt-3 text-sm text-slate-600">Value: <b>{inr(Math.round(value))}</b>{kind === 'out' && ' (at latest purchase rate)'}</p>
      {kind === 'in' && <p className="mt-1 text-xs text-slate-500">Goods that came with a bill don't need this: bills posted for Central Kitchen count as received automatically.</p>}
      {short.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">More than the stock shown for: {short.map((l) => l.item).join(', ')}. You can still issue (stock counts may be behind).</p>}
    </Dialog>
  )
}

/** An outlet asks the Centre Kitchen for items. */
export function IndentDialog({ stock, myBranch, onClose, onDone }: { stock: StockItem[]; myBranch: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const auth = useAuth()
  const [branch, setBranch] = useState(myBranch ?? OUTLETS[0].id)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<MoveLine[]>([{ item: '', unit: 'kg', qty: 0, rate: 0 }])
  const valid = lines.some((l) => l.item.trim() && l.qty > 0)
  const save = () => {
    raiseIndent({ branch, date, note: note.trim(), lines: lines.map((l) => ({ item: l.item, unit: l.unit, qty: l.qty, sent: 0 })), addedBy: auth.email ?? 'Demo user', addedAt: new Date().toISOString() })
    onDone(`Indent sent to Centre Kitchen from ${branchName(branch)}.`)
  }
  return (
    <Dialog title="Raise an indent" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={CheckCircle2} disabled={!valid} onClick={save}>Send to Centre Kitchen</Button></>}>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">From outlet
          <select aria-label="From outlet" className={inputCls + ' mt-1'} value={branch} disabled={!!myBranch} onChange={(e) => setBranch(e.target.value)}>{OUTLETS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Needed on<input type="date" className={inputCls + ' mt-1'} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-xs font-medium text-slate-600">Note<input className={inputCls + ' mt-1'} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <Lines lines={lines} setLines={setLines} stock={stock} withRate={false} />
    </Dialog>
  )
}
