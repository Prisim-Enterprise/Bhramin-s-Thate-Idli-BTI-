import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Download, Plus, Trash2, Warehouse, XCircle } from 'lucide-react'
import { Badge, Button, Card, Table } from '../../../components/ui'
import { Tile, downloadCsv, money } from '../../../components/report'
import { IndentDialog, MoveDialog } from '../../../components/KitchenForms'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { branchName, inr } from '../../../data/mock'
import { fmtDateTime, niceDate } from '../../../data/entries'
import { deleteMove, saveIndent, useCentreKitchen, type CkFlow, type Indent } from '../../../data/kitchen'

export type CkTab = 'in' | 'out' | 'stock' | 'indents'
const TABS: { id: CkTab; label: string; icon: typeof Warehouse }[] = [
  { id: 'indents', label: 'Indents', icon: ClipboardList },
  { id: 'in', label: 'Incoming', icon: ArrowDownToLine },
  { id: 'out', label: 'Outgoing', icon: ArrowUpFromLine },
  { id: 'stock', label: 'Stock', icon: Warehouse },
]
const STATUS: Record<Indent['status'], [string, 'amber' | 'blue' | 'green' | 'slate']> = { open: ['waiting', 'amber'], part: ['part sent', 'blue'], done: ['sent', 'green'], cancelled: ['cancelled', 'slate'] }

/** Rows of goods in or out, each opening to show its items. */
export function FlowTable({ flows, canDelete, showWho = true }: { flows: CkFlow[]; canDelete?: boolean; showWho?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Table head={['Date', 'In / out', 'From / to', 'Items', 'Value', ...(showWho ? ['Entered by'] : []), '']}>
      {flows.map((f) => (
        <Fragment key={f.key}>
          <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === f.key ? null : f.key)}>
            <td><span className="inline-flex items-center gap-1">{open === f.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{niceDate(f.date)}</span></td>
            <td><Badge tone={f.kind === 'in' ? 'green' : 'blue'}>{f.kind === 'in' ? (f.source === 'Bill' ? 'in · bill' : 'in') : 'out'}</Badge></td>
            <td className="font-medium text-slate-900">{f.kind === 'out' ? branchName(f.party) : f.party}</td>
            <td className="max-w-[260px] truncate text-slate-600">{f.lines.map((l) => `${l.item} ${l.qty} ${l.unit}`).join(', ')}</td>
            <td className="tabular-nums">{inr(Math.round(f.value))}</td>
            {showWho && <td><span className="block">{f.by || '—'}</span><span className="text-xs text-slate-500">{f.at ? fmtDateTime(f.at) : ''}</span></td>}
            <td className="text-right">
              {f.source === 'Bill' && <Link onClick={(e) => e.stopPropagation()} to={`/admin/accounting/bills?id=${f.ref}`} className="text-sm font-medium text-[#7a2228] hover:underline">{f.ref}</Link>}
              {canDelete && f.moveId && <button aria-label="Delete" className="text-slate-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); if (confirm('Delete this entry?')) deleteMove(f.moveId!) }}><Trash2 size={15} /></button>}
            </td>
          </tr>
          {open === f.key && (
            <tr className="bg-[#fffaf0]"><td colSpan={showWho ? 7 : 6} className="!whitespace-normal">
              <table className="w-full text-sm"><tbody>
                {f.lines.map((l, i) => <tr key={i}><td className="py-0.5 pl-6">{l.item}</td><td className="text-right tabular-nums">{l.qty} {l.unit}</td><td className="text-right tabular-nums text-slate-500">@ ₹{l.rate}</td><td className="text-right tabular-nums">{inr(Math.round(l.qty * l.rate))}</td></tr>)}
              </tbody></table>
              {f.note && <p className="mt-1 pl-6 text-xs text-slate-500">{f.note}</p>}
            </td></tr>
          )}
        </Fragment>
      ))}
      {!flows.length && <tr><td colSpan={showWho ? 7 : 6} className="!py-8 text-center text-slate-500">Nothing recorded yet.</td></tr>}
    </Table>
  )
}

// The Centre Kitchen's daily work: outlets' indents, goods coming in, goods going out, and what's in stock.
export default function CentreKitchen({ initial = 'indents' }: { initial?: CkTab }) {
  const { can } = useApp()
  const auth = useAuth()
  const ck = useCentreKitchen()
  const [tab, setTab] = useState<CkTab>(initial)
  const [dialog, setDialog] = useState<null | { kind: 'in' | 'out'; indent?: Indent } | 'indent'>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const myBranch = (() => { const b = auth.session?.user.app_metadata?.branch as string | undefined; return b && b !== 'HO' ? b : null })()
  // Receiving and issuing goods is Centre Kitchen work (Indents: approve or edit), not outlet managers'.
  const canIssue = can('indent', 'approve') || can('indent', 'edit')
  const canRaise = can('indent', 'create')

  const ins = ck.flows.filter((f) => f.kind === 'in')
  const outs = ck.flows.filter((f) => f.kind === 'out')
  const sum = (fs: CkFlow[]) => fs.reduce((t, f) => t + f.value, 0)
  const waiting = ck.indents.filter((i) => i.status === 'open' || i.status === 'part')
  const visibleIndents = ck.indents.filter((i) => !myBranch || i.branch === myBranch)
  const stockValue = ck.stock.reduce((t, s) => t + s.value, 0)
  const done = (msg: string) => { setDialog(null); setNotice(msg) }

  const csv = () => downloadCsv('BTI-Centre-Kitchen-Stock.csv', [['Item', 'Unit', 'Last count', 'Counted on', 'In since', 'Out since', 'On hand', 'Rate', 'Value'],
    ...ck.stock.map((s) => [s.item, s.unit, s.counted ?? '', s.countedOn ?? '', s.inQty, s.outQty, s.onHand, s.rate, s.value])])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-slate-900">Centre Kitchen</h1><p className="mt-1 text-sm text-slate-500">Indents from outlets, goods coming in and going out, and what's in stock</p></div>
        <div className="flex flex-wrap gap-2">
          {canRaise && <Button variant="secondary" icon={ClipboardList} onClick={() => { setDialog('indent'); setNotice(null) }}>Raise indent</Button>}
          {canIssue && <Button variant="secondary" icon={ArrowDownToLine} onClick={() => { setDialog({ kind: 'in' }); setNotice(null) }}>Goods received</Button>}
          {canIssue && <Button icon={ArrowUpFromLine} onClick={() => { setDialog({ kind: 'out' }); setNotice(null) }}>Issue to outlet</Button>}
        </div>
      </div>
      {notice && <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 size={16} />{notice}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Indents waiting" value={String(waiting.length)} tone={waiting.length ? 'amber' : 'green'} note={waiting.length ? [...new Set(waiting.map((i) => branchName(i.branch)))].join(', ') : 'all sent'} />
        <Tile label="Came in" value={money(sum(ins))} note={`${ins.length} deliveries`} />
        <Tile label="Went out" value={money(sum(outs))} note={`${outs.length} issues to outlets`} />
        <Tile label="Stock on hand" value={money(stockValue)} note={ck.low.length ? `${ck.low.length} item(s) at or below reorder level` : `${ck.stock.length} items`} tone={ck.low.length ? 'red' : 'slate'} />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-[#7a2228] text-white' : 'text-slate-600 hover:bg-[#fbf3e4]'}`}>
            <t.icon size={15} />{t.label}{t.id === 'indents' && waiting.length > 0 && <span className={`rounded-full px-1.5 text-xs ${tab === t.id ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>{waiting.length}</span>}
          </button>
        ))}
      </div>

      <Card className="mt-4" pad={false}>
        {tab === 'indents' && (
          <Table head={['Outlet', 'Needed on', 'Items asked', 'Status', 'Raised by', '']}>
            {visibleIndents.map((i) => (
              <tr key={i.id}>
                <td className="font-medium text-slate-900">{branchName(i.branch)}</td>
                <td>{niceDate(i.date)}</td>
                <td className="!whitespace-normal text-slate-600">{i.lines.map((l) => `${l.item} ${l.qty} ${l.unit}${l.sent ? ` (sent ${l.sent})` : ''}`).join(', ')}{i.note && <span className="block text-xs text-slate-400">{i.note}</span>}</td>
                <td><Badge tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Badge></td>
                <td><span className="block">{i.addedBy}</span><span className="text-xs text-slate-500">{fmtDateTime(i.addedAt)}</span></td>
                <td className="whitespace-nowrap text-right">
                  {canIssue && (i.status === 'open' || i.status === 'part') && <Button size="sm" icon={ArrowUpFromLine} onClick={() => { setDialog({ kind: 'out', indent: i }); setNotice(null) }}>Issue</Button>}
                  {(i.status === 'open') && (canIssue || i.addedBy === auth.email) && (
                    <Button size="sm" variant="ghost" icon={XCircle} onClick={() => { if (confirm('Cancel this indent?')) saveIndent({ ...i, status: 'cancelled', updatedBy: auth.email ?? '', updatedAt: new Date().toISOString() }) }}>Cancel</Button>
                  )}
                </td>
              </tr>
            ))}
            {!visibleIndents.length && <tr><td colSpan={6} className="!py-8 text-center text-slate-500">No indents yet. Outlets use “Raise indent” to ask the Centre Kitchen for items.</td></tr>}
          </Table>
        )}
        {tab === 'in' && <FlowTable flows={ins} canDelete={canIssue} />}
        {tab === 'out' && <FlowTable flows={outs} canDelete={canIssue} />}
        {tab === 'stock' && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-sm">
              <span className="text-slate-500">Last closing count + in − out since then. <Link to="/admin/inventory/closing" className="text-[#7a2228] underline">Count stock</Link></span>
              <button onClick={csv} className="inline-flex items-center gap-1 font-medium text-[#7a2228] hover:underline"><Download size={14} /> Download</button>
            </div>
            <Table head={['Item', 'Last count', 'In since', 'Out since', 'On hand', 'Rate', 'Value', '']}>
              {ck.stock.map((s) => {
                const lvl = ck.levels[s.key]?.reorder
                const low = lvl != null && lvl > 0 && s.onHand <= lvl
                return (
                  <tr key={s.key}>
                    <td className="font-medium text-slate-900">{s.item} <span className="font-normal text-slate-500">[{s.unit}]</span></td>
                    <td className="tabular-nums">{s.counted != null ? <>{s.counted}<span className="block text-xs text-slate-400">{niceDate(s.countedOn!)}</span></> : '—'}</td>
                    <td className="tabular-nums text-emerald-700">+{s.inQty}</td>
                    <td className="tabular-nums text-sky-700">−{s.outQty}</td>
                    <td className={`font-semibold tabular-nums ${s.onHand < 0 ? 'text-rose-600' : ''}`}>{s.onHand}</td>
                    <td className="tabular-nums text-slate-500">{s.rate ? '₹' + s.rate : '—'}</td>
                    <td className="tabular-nums">{inr(Math.round(s.value))}</td>
                    <td>{low ? <Badge tone="red">reorder (≤ {lvl})</Badge> : s.onHand < 0 ? <Badge tone="amber">check count</Badge> : null}</td>
                  </tr>
                )
              })}
              {!ck.stock.length && <tr><td colSpan={8} className="!py-8 text-center text-slate-500">No stock yet. It builds up from bills posted for Central Kitchen, goods received and closing counts.</td></tr>}
            </Table>
          </>
        )}
      </Card>

      {dialog === 'indent' && <IndentDialog stock={ck.stock} myBranch={myBranch} onClose={() => setDialog(null)} onDone={done} />}
      {dialog && dialog !== 'indent' && <MoveDialog kind={dialog.kind} indent={dialog.indent} stock={ck.stock} onClose={() => setDialog(null)} onDone={(m) => { done(m); setTab(dialog.kind === 'in' ? 'in' : dialog.indent ? 'indents' : 'out') }} />}
      {!canIssue && <p className="mt-3 text-xs text-slate-500"><Plus size={12} className="inline" /> Issuing goods and recording goods received is for Centre Kitchen staff.</p>}
    </div>
  )
}
