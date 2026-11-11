import { useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Download, FileCheck2, FileText, Plus, ScanLine, Trash2, Undo2, Upload, XCircle } from 'lucide-react'
import { Tile, downloadCsv, money } from '../../../components/report'
import { Badge, Button, inputCls } from '../../../components/ui'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { fmtDateTime, niceDate, useEntries } from '../../../data/entries'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { keepFile, openReceipt } from '../../../data/ledgerStore'
import { readStatementFile, type StatementRead } from '../../../lib/readStatement'
import {
  DEDUCTION_KINDS, PARTNERS, TOLERANCE, addDays, partnerName, saveSettlement, settlementId, statementRow, useSettlements, weekEndOf, weekRows, weekStart,
  type PartnerId,
  type Deduction, type DeductionKind, type Settlement, type StatementRow,
} from '../../../data/settlements'

const r2 = (n: number) => Math.round(n * 100) / 100
const STATUS: Record<StatementRow['status'], ['green' | 'amber' | 'red' | 'slate' | 'blue', string]> = {
  matched: ['green', 'matched'], difference: ['red', 'difference'], 'waiting approval': ['amber', 'waiting approval'],
  'not received': ['blue', 'not received'], 'no statement': ['slate', 'no statement'],
}
const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700'
const amt = (v: number | null) => (v == null ? <span className="text-amber-600">N/A</span> : inr(v))
const diffCell = (v: number | null) => (v == null ? '—' : <span className={Math.abs(v) > TOLERANCE ? 'font-semibold text-rose-600' : 'text-emerald-700'}>{v > 0 ? '+' : ''}{inr(v)}</span>)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Statement for one partner, outlet and week: what they say they sold, what they kept, and what reached the bank. */
function StatementEditor({ row, canEdit, canApprove, by, onClose, onUpload }: { row: StatementRow; canEdit: boolean; canApprove: boolean; by: string; onClose: () => void; onUpload: () => void }) {
  const now = () => new Date().toISOString()
  const s: Settlement = row.s ?? {
    id: row.id, partner: row.partner, branch: row.branch, date: row.week, weekEnd: weekEndOf(row.week),
    gross: null, deductions: [], received: null, note: '', addedBy: by, addedAt: now(),
  }
  const save = (p: Partial<Settlement>) => saveSettlement({ ...s, ...p, updatedBy: by, updatedAt: now() })
  // Changing an approved deduction takes the approval away: it has to be approved again.
  const setDed = (i: number, p: Partial<Deduction>) => save({ deductions: s.deductions.map((d, j) => (j === i ? { ...d, ...p, approvedBy: undefined, approvedAt: undefined } : d)) })
  const approve = (i: number, yes: boolean) => save({ deductions: s.deductions.map((d, j) => (j === i ? { ...d, approvedBy: yes ? by : undefined, approvedAt: yes ? now() : undefined } : d)) })
  const add = (kind: DeductionKind) => save({ deductions: [...s.deductions, { id: newId(), kind, label: DEDUCTION_KINDS[kind], amount: 0 }] })
  const num = (v: string) => (v === '' ? null : +v)
  const pending = s.deductions.filter((d) => d.amount && !d.approvedBy)

  const checks = [
    { ok: row.salesDiff != null && Math.abs(row.salesDiff) <= TOLERANCE, wait: row.gross == null, text: row.gross == null ? 'Enter the gross sales from the statement' : `Statement sales ${inr(row.gross)} vs books ${inr(row.books)}${Math.abs(row.salesDiff!) > TOLERANCE ? ` (off by ${inr(row.salesDiff!)})` : ''}` },
    { ok: !pending.length && s.deductions.length > 0, wait: !s.deductions.length, text: !s.deductions.length ? 'Add the deductions from the statement' : pending.length ? `${pending.length} deduction(s) waiting for approval` : 'All deductions approved' },
    ...(s.statementNet != null ? [{ ok: row.payoutDiff != null && Math.abs(row.payoutDiff) <= TOLERANCE, wait: row.net == null, text: `Our net receipts ${row.net != null ? inr(row.net) : 'N/A'} vs the statement's net payout ${inr(s.statementNet)}${row.payoutDiff != null && Math.abs(row.payoutDiff) > TOLERANCE ? ` (off by ${inr(row.payoutDiff)}: a deduction is missing or wrong)` : ''}` }] : []),
    { ok: row.receiptDiff != null && Math.abs(row.receiptDiff) <= TOLERANCE, wait: row.received == null, text: row.received == null ? 'Enter what reached the bank' : `Received ${inr(row.received)} vs net receipts ${row.net != null ? inr(row.net) : 'N/A'}${row.receiptDiff != null && Math.abs(row.receiptDiff) > TOLERANCE ? ` (off by ${inr(row.receiptDiff)})` : ''}` },
  ]

  return (
    <div className="mt-5 rounded-2xl border-2 border-[#7a2228]/20 bg-white shadow-sm" data-testid="statement-editor">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <p className="font-semibold text-slate-900">{partnerName(row.partner)} · {branchName(row.branch)}</p>
          <p className="text-xs text-slate-500">Week {niceDate(row.week)} – {niceDate(weekEndOf(row.week))}{s.updatedBy && <> · last changed by {s.updatedBy} {s.updatedAt && fmtDateTime(s.updatedAt)}</>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.file && <button onClick={() => openReceipt(s.file!)} className="inline-flex items-center gap-1 text-sm font-medium text-[#7a2228] hover:underline"><FileText size={14} /> View statement</button>}
          {canEdit && <Button icon={ScanLine} onClick={onUpload}>{s.file ? 'Upload again' : 'Upload statement'}</Button>}
          <Badge tone={STATUS[row.status][0]}>{STATUS[row.status][1]}</Badge><button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
      </div>
      {s.readNote && <p className="mx-5 mt-4 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">{s.readNote}</p>}

      <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <label className="block text-xs font-semibold text-slate-600">Gross sales as per {partnerName(row.partner)} statement
            <input type="number" step="0.01" aria-label="Statement gross sales" className={inputCls + ' mt-1 !w-48 text-right placeholder:text-amber-600'} placeholder="N/A" disabled={!canEdit}
              value={s.gross ?? ''} onChange={(e) => save({ gross: num(e.target.value) })} />
            <span className="ml-2 text-xs font-normal text-slate-500">Books (Imprest): {inr(row.books)}</span>
          </label>

          <p className="mb-2 mt-5 text-xs font-semibold text-slate-600">Deductions on the statement</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1.5">Type</th><th>Description</th><th className="text-right">Amount</th><th className="pl-3">Approval</th><th /></tr></thead>
              <tbody>
                {s.deductions.map((d, i) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">
                      <select aria-label="Deduction type" className={inputCls + ' !py-1'} value={d.kind} disabled={!canEdit} onChange={(e) => setDed(i, { kind: e.target.value as DeductionKind })}>
                        {Object.entries(DEDUCTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="pr-2"><input aria-label="Description" className={inputCls + ' !py-1'} value={d.label} disabled={!canEdit} onChange={(e) => setDed(i, { label: e.target.value })} /></td>
                    <td className="pr-2"><input type="number" step="0.01" aria-label="Deduction amount" className={inputCls + ' !w-28 !py-1 text-right'} value={d.amount || ''} placeholder="0" disabled={!canEdit} onChange={(e) => setDed(i, { amount: +e.target.value || 0 })} /></td>
                    <td className="whitespace-nowrap pl-3">
                      {d.approvedBy
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700" title={d.approvedAt ? fmtDateTime(d.approvedAt) : ''}><CheckCircle2 size={14} /> {d.approvedBy}
                            {canApprove && <button aria-label="Undo approval" className="ml-1 text-slate-400 hover:text-slate-700" onClick={() => approve(i, false)}><Undo2 size={13} /></button>}</span>
                        : canApprove && d.amount > 0
                          ? <button onClick={() => approve(i, true)} className="rounded-md border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Approve</button>
                          : <span className="text-xs text-amber-700">{d.amount > 0 ? 'waiting approval' : '—'}</span>}
                    </td>
                    <td className="pl-2">{canEdit && <button aria-label="Remove deduction" className="text-slate-400 hover:text-rose-600" onClick={() => save({ deductions: s.deductions.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
                {!s.deductions.length && <tr><td colSpan={5} className="py-3 text-sm text-slate-500">No deductions yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-3">
              {(['commission', 'ads', 'gateway', 'gst', 'tds', 'other'] as DeductionKind[]).map((k) => (
                <button key={k} onClick={() => add(k)} className="inline-flex items-center gap-1 text-xs font-medium text-[#7a2228] hover:underline"><Plus size={12} />{DEDUCTION_KINDS[k]}</button>
              ))}
            </div>
          )}
          {canApprove && pending.length > 1 && (
            <button onClick={() => save({ deductions: s.deductions.map((d) => (d.amount && !d.approvedBy ? { ...d, approvedBy: by, approvedAt: now() } : d)) })}
              className="mt-3 rounded-md border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Approve all {pending.length}</button>
          )}

          <p className="mb-2 mt-6 text-xs font-semibold text-slate-600">Money received in the bank</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-500">Amount received<input type="number" step="0.01" aria-label="Amount received" className={inputCls + ' mt-1 text-right placeholder:text-amber-600'} placeholder="N/A" disabled={!canEdit} value={s.received ?? ''} onChange={(e) => save({ received: num(e.target.value) })} /></label>
            <label className="text-xs text-slate-500">Date received<input type="date" className={inputCls + ' mt-1'} disabled={!canEdit} value={s.receivedOn ?? ''} onChange={(e) => save({ receivedOn: e.target.value || undefined })} /></label>
            <label className="text-xs text-slate-500">Bank ref. / UTR<input className={inputCls + ' mt-1'} disabled={!canEdit} value={s.utr ?? ''} onChange={(e) => save({ utr: e.target.value || undefined })} /></label>
          </div>
          <label className="mt-3 block text-xs text-slate-500">Note<input className={inputCls + ' mt-1'} disabled={!canEdit} value={s.note} onChange={(e) => save({ note: e.target.value })} placeholder="e.g. penalty for a cancelled order, claimed back" /></label>
        </div>

        {/* The working */}
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="mb-2 font-semibold text-slate-900">Net receipts</p>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 tabular-nums">
              <dt className="text-slate-600">Gross sales (statement)</dt><dd className="text-right">{amt(row.gross)}</dd>
              <dt className="text-slate-600">− Commission</dt><dd className="text-right">{inr(row.commission)}</dd>
              <dt className="text-slate-600">− Advertisement</dt><dd className="text-right">{inr(row.ads)}</dd>
              <dt className="text-slate-600">− Other charges</dt><dd className="text-right">{inr(row.charges)}</dd>
              <dt className="border-t border-slate-200 pt-1.5 font-semibold">Net receipts</dt><dd className="border-t border-slate-200 pt-1.5 text-right font-semibold">{amt(row.net)}</dd>
              <dt className="text-slate-600">Actually received</dt><dd className="text-right">{amt(row.received)}</dd>
              <dt className="font-semibold">Difference</dt><dd className="text-right">{diffCell(row.receiptDiff)}</dd>
              {s.statementNet != null && <><dt className="text-slate-500">Net payout printed on statement</dt><dd className="text-right text-slate-500">{inr(s.statementNet)}</dd></>}
            </dl>
            {row.gross != null && row.gross > 0 && <p className="mt-2 text-xs text-slate-500">{partnerName(row.partner)} kept {Math.round((row.deductions / row.gross) * 1000) / 10}% of gross sales.</p>}
          </div>
          <ul className="space-y-2 text-sm">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                {c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : c.wait ? <CircleAlert size={17} className="mt-0.5 shrink-0 text-amber-500" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-rose-600" />}
                <span className={c.ok ? 'text-slate-700' : c.wait ? 'text-amber-800' : 'text-rose-700'}>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// Weekly statements from Swiggy, Zomato, Rapido and Mobikwik: deductions approved, net receipts matched to the bank.
export default function WeeklyStatement() {
  const entries = useEntries()
  const all = useSettlements()
  const { can } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const canEdit = can('accounts', 'create') || can('accounts', 'edit')
  const canApprove = can('accounts', 'approve')

  // Start on the latest week that has partner sales.
  const latest = useMemo(() => entries.filter((e) => e.swiggy || e.zomato || e.rapido || e.mobikwik).map((e) => e.date).sort().pop(), [entries])
  const [picked, setWeek] = useState<string | null>(null)
  const week = picked ?? weekStart(latest ?? new Date().toLocaleDateString('en-CA'))
  const [branch, setBranch] = useState('')
  const [partner, setPartner] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const target = useRef<StatementRow | null>(null) // the row an upload is for (null = work it out from the statement)

  const pickFile = (row: StatementRow | null) => { target.current = row; setMsg(null); fileInput.current?.click() }

  /** Read an uploaded statement and fill the matching week's row. Deductions come in unapproved. */
  const onFile = async (file: File) => {
    setReading('Reading ' + file.name + '…')
    let r: StatementRead
    try { r = await readStatementFile(file, setReading) } finally { setReading(null) }
    const t = target.current
    const p = (t?.partner ?? r.partner ?? (partner || undefined)) as PartnerId | undefined
    const b = t?.branch ?? r.branch ?? (branch || undefined)
    const w = t?.week ?? r.week ?? week
    if (r.method === 'none') return setMsg({ tone: 'error', text: r.note })
    if (!p || !b) {
      return setMsg({ tone: 'error', text: `Read the statement, but couldn't tell ${!p ? 'which partner (Swiggy, Zomato …)' : 'which outlet'} it is for. Pick it in the filters above, or open the row and use “Upload statement” there.` })
    }
    const id = settlementId(p, b, w)
    const old = all.find((x) => x.id === id)
    if (old && (old.gross != null || old.deductions.length) && !confirm(`${partnerName(p)} · ${branchName(b)} for this week already has figures. Replace them with what was read from ${file.name}?`)) return
    const kept = await keepFile(file).catch(() => ({ name: file.name, type: file.type, size: file.size }))
    const now = new Date().toISOString()
    const s: Settlement = {
      id, partner: p, branch: b, date: w, weekEnd: weekEndOf(w),
      gross: r.gross ?? null,
      deductions: r.deductions.map((d) => ({ ...d, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) })),
      received: old?.received ?? null, receivedOn: old?.receivedOn, utr: r.utr ?? old?.utr,
      note: old?.note ?? '', statementNet: r.netPayout ?? null, file: kept,
      readNote: r.note + (r.from ? ` Period on statement: ${niceDate(r.from)}${r.to ? ' – ' + niceDate(r.to) : ''}.` : ''),
      addedBy: old?.addedBy ?? by, addedAt: old?.addedAt ?? now, updatedBy: by, updatedAt: now,
    }
    saveSettlement(s)
    if (w !== week) setWeek(w)
    setOpen(id)
    const row = statementRow(p, b, w, entries, s)
    setMsg({ tone: 'ok', text: `${partnerName(p)} · ${branchName(b)}, week of ${niceDate(w)}: read ${row.gross != null ? 'gross ' + inr(row.gross) : 'no gross'}, ${s.deductions.length} deduction(s)${s.statementNet != null ? ', net payout ' + inr(s.statementNet) : ''}. Check the figures and approve the deductions.` })
  }

  const rows = useMemo(() => weekRows(week, entries, all, branch, partner), [week, entries, all, branch, partner])
  const sum = (f: (r: StatementRow) => number | null) => r2(rows.reduce((s, r) => s + (f(r) ?? 0), 0))
  const T = { books: sum((r) => r.books), gross: sum((r) => r.gross), commission: sum((r) => r.commission), ads: sum((r) => r.ads), charges: sum((r) => r.charges), net: sum((r) => r.net), received: sum((r) => r.received) }
  const pending = rows.reduce((s, r) => s + r.pending, 0)
  const matched = rows.filter((r) => r.status === 'matched').length
  const sel_ = rows.find((r) => r.id === open)

  const csv = () => downloadCsv(`BTI-Weekly-Statement-${week}.csv`, [
    ['Week', 'Partner', 'Outlet', 'Sales (books)', 'Gross (statement)', 'Commission', 'Advertisement', 'Other charges', 'Net receipts', 'Received', 'Difference', 'Deductions waiting approval', 'Status', 'Received on', 'UTR'],
    ...rows.map((r) => [`${week} to ${weekEndOf(week)}`, partnerName(r.partner), branchName(r.branch), r.books, r.gross ?? 'N/A', r.commission, r.ads, r.charges, r.net ?? 'N/A', r.received ?? 'N/A', r.receiptDiff ?? '', r.pending, r.status, r.s?.receivedOn ?? '', r.s?.utr ?? '']),
    ['', 'Total', '', T.books, T.gross, T.commission, T.ads, T.charges, T.net, T.received, r2(T.received - T.net), pending, '', '', ''],
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Weekly Statement</h1>
          <p className="mt-1 text-sm text-slate-500">Week {niceDate(week)} – {niceDate(weekEndOf(week))} · {matched} of {rows.length} matched</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
            <button aria-label="Previous week" className="px-2 py-2 text-slate-600 hover:text-slate-900" onClick={() => { setWeek(addDays(week, -7)); setOpen(null) }}><ChevronLeft size={16} /></button>
            <input type="date" aria-label="Week" className="bg-transparent py-1.5 text-sm font-medium outline-none" value={week} onChange={(e) => { if (e.target.value) { setWeek(weekStart(e.target.value)); setOpen(null) } }} />
            <button aria-label="Next week" className="px-2 py-2 text-slate-600 hover:text-slate-900" onClick={() => { setWeek(addDays(week, 7)); setOpen(null) }}><ChevronRight size={16} /></button>
          </div>
          <select aria-label="Partner" className={sel} value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">All partners</option>{PARTNERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select aria-label="Outlet" className={sel} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">All outlets</option>{BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          {canEdit && <Button icon={Upload} onClick={() => pickFile(null)} disabled={!!reading}>Upload statement</Button>}
          <Button icon={Download} onClick={csv}>Export report</Button>
          <input ref={fileInput} type="file" hidden accept=".pdf,.csv,.xlsx,.xls,image/*" aria-label="Statement file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
        </div>
      </div>

      {reading && <p className="mb-4 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800"><ScanLine size={16} className="animate-pulse" />{reading}</p>}
      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Sales as per books" value={money(T.books)} note="Imprest Books, this week" />
        <Tile label="Deductions" value={money(r2(T.commission + T.ads + T.charges))} note={`Commission ${money(T.commission)} · Ads ${money(T.ads)}`} />
        <Tile label="Net receipts" value={money(T.net)} note="gross − all deductions" />
        <Tile label="Actually received" value={money(T.received)} note={`difference ${money(r2(T.received - T.net))}`} tone={Math.abs(T.received - T.net) > TOLERANCE ? 'red' : 'green'} />
        <Tile label="Waiting approval" value={String(pending)} note="deductions to approve" tone={pending ? 'amber' : 'green'} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[#fbf3e4] text-xs text-slate-700">
              <tr>{['Partner', 'Outlet', 'Sales (books)', 'Gross (statement)', 'Commission', 'Advertisement', 'Other charges', 'Net receipts', 'Received', 'Difference', 'Status', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-2.5">
              {rows.map((r) => (
                <tr key={r.id} className={`cursor-pointer hover:bg-slate-50 ${open === r.id ? 'bg-[#fffaf0]' : ''}`} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="font-medium text-slate-900">{partnerName(r.partner)}</td>
                  <td>{branchName(r.branch)}</td>
                  <td className="tabular-nums">{inr(r.books)}</td>
                  <td className="tabular-nums">{amt(r.gross)}{r.salesDiff != null && Math.abs(r.salesDiff) > TOLERANCE && <span className="block text-xs text-rose-600">{r.salesDiff > 0 ? '+' : ''}{inr(r.salesDiff)} vs books</span>}</td>
                  <td className="tabular-nums">{inr(r.commission)}</td>
                  <td className="tabular-nums">{inr(r.ads)}</td>
                  <td className="tabular-nums">{inr(r.charges)}</td>
                  <td className="font-semibold tabular-nums">{amt(r.net)}</td>
                  <td className="tabular-nums">{amt(r.received)}</td>
                  <td className="tabular-nums">{diffCell(r.receiptDiff)}</td>
                  <td><Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}{r.pending ? ` (${r.pending})` : ''}</Badge></td>
                  <td className="whitespace-nowrap text-right text-sm font-medium text-[#7a2228]">{r.s ? 'Open' : canEdit ? 'Enter statement' : 'View'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={12} className="!py-10 text-center text-slate-500">No partner sales in this week. Pick another week, or upload that week's Imprest Books.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold [&_td]:px-3 [&_td]:py-2.5">
                <tr><td colSpan={2}>Total</td><td className="tabular-nums">{inr(T.books)}</td><td className="tabular-nums">{inr(T.gross)}</td><td className="tabular-nums">{inr(T.commission)}</td><td className="tabular-nums">{inr(T.ads)}</td><td className="tabular-nums">{inr(T.charges)}</td><td className="tabular-nums">{inr(T.net)}</td><td className="tabular-nums">{inr(T.received)}</td><td className="tabular-nums">{diffCell(r2(T.received - T.net))}</td><td colSpan={2} /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {sel_ && <StatementEditor key={sel_.id} row={sel_} canEdit={canEdit} canApprove={canApprove} by={by} onClose={() => setOpen(null)} onUpload={() => pickFile(sel_)} />}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
        <FileCheck2 size={14} className="mt-0.5 shrink-0" />
        <span>Net receipts = gross sales on the statement − commission − advertisement − other charges (payment gateway, GST on charges, TDS/TCS, penalties). A week is <b>matched</b> when the statement's sales agree with the Imprest Books, every deduction is approved, and the money received equals the net receipts (within ₹{TOLERANCE}). Changing an approved deduction needs a fresh approval. <b>Upload statement</b> reads a PDF or CSV directly; a scanned PDF or photo is read by OCR (shares the daily reading limit with handwritten bills). Read figures always come in unapproved. These figures are for checking only and are not posted to Profit &amp; Loss.</span>
      </p>
    </div>
  )
}

