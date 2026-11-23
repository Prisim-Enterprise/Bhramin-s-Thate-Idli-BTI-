import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Download, FileCheck2, FileText, Handshake, Link2, Plus, ScanLine, Trash2, Undo2, Upload, XCircle } from 'lucide-react'
import { Tile, downloadCsv, money } from '../../../components/report'
import { Badge, Button, inputCls } from '../../../components/ui'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { fmtDateTime, niceDate, useEntries } from '../../../data/entries'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { keepFile, openReceipt, useManualVouchers } from '../../../data/ledgerStore'
import { API_ON, importGoogleSheet } from '../../../lib/api'
import { useBankLines } from '../../../data/banking'
import { readStatementFile, type StatementRead } from '../../../lib/readStatement'
import {
  DEDUCTION_KINDS, PARTNERS, TOLERANCE, addDays, partnerName, payoutCredit, saveSettlement, saveTerms, settlementId, settlementLines, statementRow, stlVoucherId,
  FROM_START, effectiveOf, termsFor, usePartnerTerms, useSettlements, versionsOf, weekEndOf, weekRows, weekStart,
  type PartnerId, type PartnerTerms,
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
function StatementEditor({ row, terms, canEdit, canApprove, by, onClose, onUpload }: { row: StatementRow; terms: PartnerTerms | null; canEdit: boolean; canApprove: boolean; by: string; onClose: () => void; onUpload: () => void }) {
  const posted = useManualVouchers().find((v) => v.id === stlVoucherId(row.id))
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
    { ok: row.receiptDiff != null && Math.abs(row.receiptDiff) <= TOLERANCE, wait: row.received == null, text: row.received == null ? 'Enter what reached the bank, or upload the bank statement in Banking: the payout is matched by itself' : `Received ${inr(row.received)} vs net receipts ${row.net != null ? inr(row.net) : 'N/A'}${row.receiptDiff != null && Math.abs(row.receiptDiff) > TOLERANCE ? ` (off by ${inr(row.receiptDiff)})` : ''}` },
  ]
  // The two checks against what was agreed: commission (fixed by contract) and advertisement (approved budget).
  if (row.gross != null) {
    checks.splice(1, 0,
      row.commissionExtra == null
        ? { ok: false, wait: true, text: `Commission ${inr(row.commission)}${row.commissionPct != null ? ` (${row.commissionPct}% of ${inr(row.commissionBase ?? 0)})` : ''}: set the agreed % in Partner terms to check it` }
        : { ok: (row.commissionExtra ?? 0) <= TOLERANCE, wait: false, text: `Commission ${inr(row.commission)} = ${row.commissionPct}% of ${inr(row.commissionBase ?? 0)} vs ${row.agreedPct != null ? row.agreedPct + "% agreed" : "the agreed amount"}${(row.commissionExtra ?? 0) > TOLERANCE ? `: ${inr(row.commissionExtra!)} more than agreed` : ''}` },
      row.adsLimit == null
        ? { ok: false, wait: true, text: `Advertisement ${inr(row.ads)}${row.adsPct != null ? ` (${row.adsPct}% of sales)` : ''}: set the approved budget in Partner terms to check it` }
        : { ok: (row.adsOver ?? 0) <= TOLERANCE, wait: false, text: `Advertisement ${inr(row.ads)} (${row.adsPct}% of sales) vs approved ${inr(row.adsLimit)}${terms?.adsMode === 'pct' ? ` (${terms.adsValue}% of sales)` : ' for the week'}${(row.adsOver ?? 0) > TOLERANCE ? `: ${inr(row.adsOver!)} over budget` : ''}` },
    )
  }

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

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <label className="block text-xs font-semibold text-slate-600">Gross sales as per {partnerName(row.partner)} statement
            <input type="number" step="0.01" aria-label="Statement gross sales" className={inputCls + ' mt-1 !w-48 text-right placeholder:text-amber-600'} placeholder="N/A" disabled={!canEdit}
              value={s.gross ?? ''} onChange={(e) => save({ gross: num(e.target.value) })} />
            <span className="ml-2 text-xs font-normal text-slate-500">Books (Imprest): {inr(row.books)}</span>
          </label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">Commission is charged on
            <input type="number" step="0.01" aria-label="Commission charged on" className={inputCls + ' mt-1 !w-48 text-right'} placeholder={row.gross != null ? String(row.gross) : 'gross sales'} disabled={!canEdit}
              value={s.commissionBase ?? ''} onChange={(e) => save({ commissionBase: num(e.target.value) })} />
            <span className="ml-2 text-xs font-normal text-slate-500">e.g. Zomato's “commissionable value”; empty = gross sales</span>
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
                        : canApprove && d.amount !== 0
                          ? <button onClick={() => approve(i, true)} className="rounded-md border border-emerald-600 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Approve</button>
                          : <span className="text-xs text-amber-700">{d.amount !== 0 ? 'waiting approval' : '—'}</span>}
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
          {s.bankLineId && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700" data-testid="bank-matched">
              <CheckCircle2 size={14} /> Matched to the bank statement{s.receivedFrom ? ` (${s.receivedFrom})` : ''}: {inr(s.received ?? 0)} on {s.receivedOn ? niceDate(s.receivedOn) : '—'}
              {canEdit && <button className="ml-1 text-slate-500 underline" onClick={() => save({ bankLineId: undefined, receivedFrom: undefined, received: null, receivedOn: undefined })}>undo</button>}
            </p>
          )}
          <label className="mt-3 block text-xs text-slate-500">Note<input className={inputCls + ' mt-1'} disabled={!canEdit} value={s.note} onChange={(e) => save({ note: e.target.value })} placeholder="e.g. penalty for a cancelled order, claimed back" /></label>
        </div>

        {/* The working */}
        <div className="min-w-0 space-y-4">
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
          {/* What goes into the books once every deduction is approved */}
          {row.gross != null && s.deductions.some((d) => d.amount) && (
            <div className="rounded-xl border border-slate-200 p-3 text-xs" data-testid="statement-posting">
              <p className="mb-1.5 font-semibold text-slate-700">{posted ? `Posted to the books: Journal on ${niceDate(posted.date)}` : 'Will post to the books when every deduction is approved'}</p>
              <table className="w-full tabular-nums">
                <tbody>
                  {settlementLines(s).map((l) => (
                    <tr key={l.ledger}><td className="w-6 font-mono text-slate-500">{l.dr ? 'Dr' : 'Cr'}</td><td className="text-slate-700">{l.ledger}</td><td className="text-right">{inr(l.dr || l.cr)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Partner terms: the commission agreed in each contract and the advertisement budget management approved. */
function TermsPanel({ all, canEdit, by, onClose }: { all: PartnerTerms[]; canEdit: boolean; by: string; onClose: () => void }) {
  const [extra, setExtra] = useState<string[]>([]) // outlet rows added on screen before anything is typed in them
  const outlets = BRANCHES.filter((b) => b.id !== 'CK')
  const keys = PARTNERS.flatMap((p) => ['*', ...outlets.map((b) => b.id)]
    .filter((b) => b === '*' || all.some((t) => t.partner === p.id && t.branch === b) || extra.includes(`${p.id}:${b}`))
    .map((b) => ({ partner: p.id as PartnerId, branch: b })))
  const put = (partner: PartnerId, branch: string, p: Partial<PartnerTerms>) => {
    const t = versionsOf(all, partner, branch)[0]
    // A change here starts a new version from this week, carrying everything else over; earlier weeks keep their terms.
    const base: Omit<PartnerTerms, 'id'> = t ? (({ id: _id, effectiveFrom: _from, ...rest }) => rest)(t) : { partner, branch, commissionPct: null, adsMode: null, adsValue: null, by, at: '' }
    // The first terms set for a partner / outlet cover every week; a change on a later day applies from that week on.
    // Changes on the same day as the version was saved (filling in several boxes) correct that version.
    const today = new Date().toLocaleDateString('en-CA')
    const from = !t ? FROM_START : new Date(t.at).toLocaleDateString('en-CA') === today ? effectiveOf(t) : undefined
    saveTerms({ ...base, partner, branch, ...p, effectiveFrom: from, by, at: new Date().toISOString() })
  }
  const num = (v: string) => (v === '' ? null : Math.max(0, +v))
  return (
    <div className="mb-5 rounded-2xl border-2 border-[#7a2228]/20 bg-white shadow-sm" data-testid="partner-terms">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <p className="font-semibold text-slate-900">Partner terms</p>
          <p className="text-xs text-slate-500">Commission is fixed by each contract; advertisement is what management approved. Every statement is checked against these, and anything above them raises an alert.</p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
      </div>
      <div className="overflow-x-auto px-5 py-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="py-1.5">Partner</th><th>Outlet</th><th>Agreed commission %</th><th>Approved advertisement</th><th /><th /></tr></thead>
          <tbody>
            {keys.map(({ partner, branch }) => {
              const t = versionsOf(all, partner, branch)[0]
              const label = `${partnerName(partner)} ${branch === '*' ? 'all outlets' : branchName(branch)}`
              return (
                <tr key={partner + branch} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 font-medium">{branch === '*' ? partnerName(partner) : ''}</td>
                  <td className="pr-2 text-slate-600">{branch === '*' ? 'All outlets' : branchName(branch)}</td>
                  <td className="pr-2"><input type="number" step="0.01" min="0" aria-label={`Commission % ${label}`} className={inputCls + ' !w-24 !py-1 text-right'} disabled={!canEdit} placeholder="—"
                    defaultValue={t?.commissionPct ?? ''} onBlur={(e) => { if (num(e.target.value) !== (t?.commissionPct ?? null)) put(partner, branch, { commissionPct: num(e.target.value) }) }} /></td>
                  <td className="pr-2">
                    <select aria-label={`Advertisement budget type ${label}`} className={inputCls + ' !w-40 !py-1'} disabled={!canEdit} value={t?.adsMode ?? ''}
                      onChange={(e) => put(partner, branch, { adsMode: (e.target.value || null) as PartnerTerms['adsMode'] })}>
                      <option value="">Not set</option><option value="pct">% of the week's sales</option><option value="amount">₹ per week</option>
                    </select>
                  </td>
                  <td className="pr-2">{t?.adsMode && <input type="number" step="0.01" min="0" aria-label={`Advertisement budget ${label}`} className={inputCls + ' !w-28 !py-1 text-right'} disabled={!canEdit}
                    defaultValue={t.adsValue ?? ''} placeholder={t.adsMode === 'pct' ? '%' : '₹'} onBlur={(e) => { if (num(e.target.value) !== (t.adsValue ?? null)) put(partner, branch, { adsValue: num(e.target.value) }) }} />}</td>
                  <td className="text-right text-xs text-slate-400">{t ? `by ${t.by}` : branch === '*' ? '' : 'uses all-outlet terms'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {canEdit && (
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">Different terms for one outlet:
            <select aria-label="Add outlet terms" className={inputCls + ' !w-auto !py-1'} value="" onChange={(e) => { if (e.target.value) setExtra((x) => [...x, e.target.value]) }}>
              <option value="">Pick partner and outlet…</option>
              {PARTNERS.flatMap((p) => outlets.map((b) => <option key={p.id + b.id} value={`${p.id}:${b.id}`}>{p.name} · {b.name}</option>))}
            </select>
          </label>
        )}
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
  const terms = usePartnerTerms()
  const bankLines = useBankLines()
  const [showTerms, setShowTerms] = useState(false)

  // Payouts in the bank: a credit from the partner for the net receipts (or with the statement's UTR) fills "received" by itself.
  useEffect(() => {
    if (!canEdit) return
    const taken = new Set(all.map((s) => s.bankLineId).filter(Boolean) as string[])
    for (const s of all) {
      if (s.received != null || s.bankLineId) continue
      const net = statementRow(s.partner, s.branch, s.date, entries, s, terms).net
      const l = payoutCredit(s, net, bankLines, taken)
      if (!l) continue
      taken.add(l.id)
      saveSettlement({ ...s, received: l.deposit, receivedOn: l.date, utr: s.utr ?? (l.ref || undefined), bankLineId: l.id, receivedFrom: l.ledger, updatedBy: by, updatedAt: new Date().toISOString() }, by)
    }
  }, [bankLines.length, all.length, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start on the latest week that has partner sales.
  const latest = useMemo(() => entries.filter((e) => e.swiggy || e.zomato || e.rapido || e.mobikwik).map((e) => e.date).sort().pop(), [entries])
  const [picked, setWeek] = useState<string | null>(null)
  const week = picked ?? weekStart(latest ?? new Date().toLocaleDateString('en-CA'))
  const [branch, setBranch] = useState('')
  const [partner, setPartner] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const fetchSheet = async () => {
    setReading('Fetching the Google Sheet…'); setMsg(null)
    try { target.current = null; await onFile(await importGoogleSheet(sheetUrl.trim())); setSheetUrl('') }
    catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }) }
    finally { setReading(null) }
  }
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  // Opened from an alert: ?week=2026-08-17&open=zomato:B8:2026-08-17 shows that week with the statement open.
  const [params] = useSearchParams()
  useEffect(() => {
    const w = params.get('week'), o = params.get('open')
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) { setWeek(weekStart(w)); setBranch(''); setPartner('') }
    if (o) setOpen(o)
  }, [params])
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
      note: old?.note ?? '', statementNet: r.netPayout ?? null, commissionBase: r.commissionBase ?? old?.commissionBase ?? null, file: kept,
      bankLineId: old?.bankLineId, receivedFrom: old?.receivedFrom,
      readNote: r.note + (r.from ? ` Period on statement: ${niceDate(r.from)}${r.to ? ' – ' + niceDate(r.to) : ''}.` : ''),
      addedBy: old?.addedBy ?? by, addedAt: old?.addedAt ?? now, updatedBy: by, updatedAt: now,
    }
    saveSettlement(s)
    if (w !== week) setWeek(w)
    setOpen(id)
    const row = statementRow(p, b, w, entries, s, terms)
    setMsg({ tone: 'ok', text: `${partnerName(p)} · ${branchName(b)}, week of ${niceDate(w)}: read ${row.gross != null ? 'gross ' + inr(row.gross) : 'no gross'}, ${s.deductions.length} deduction(s)${s.statementNet != null ? ', net payout ' + inr(s.statementNet) : ''}${r.orders ? ` (${r.orders} orders)` : ''}.${r.pending != null && r.pending > 0.5 ? ` ${partnerName(p)} had not paid it yet when the report was made (${inr(r.pending)} pending): enter what reaches the bank when it arrives.` : ''} Check the figures and approve the deductions.` })
  }

  const rows = useMemo(() => weekRows(week, entries, all, branch, partner, terms), [week, entries, all, branch, partner, terms])
  const sum = (f: (r: StatementRow) => number | null) => r2(rows.reduce((s, r) => s + (f(r) ?? 0), 0))
  const T = { books: sum((r) => r.books), gross: sum((r) => r.gross), commission: sum((r) => r.commission), ads: sum((r) => r.ads), charges: sum((r) => r.charges), net: sum((r) => r.net), received: sum((r) => r.received) }
  const pending = rows.reduce((s, r) => s + r.pending, 0)
  const matched = rows.filter((r) => r.status === 'matched').length
  const sel_ = rows.find((r) => r.id === open)

  const csv = () => downloadCsv(`BTI-Reconcile-${week}.csv`, [
    ['Week', 'Partner', 'Outlet', 'Sales (books)', 'Gross (statement)', 'Commission', 'Advertisement', 'Other charges', 'Net receipts', 'Received', 'Difference', 'Deductions waiting approval', 'Status', 'Received on', 'UTR'],
    ...rows.map((r) => [`${week} to ${weekEndOf(week)}`, partnerName(r.partner), branchName(r.branch), r.books, r.gross ?? 'N/A', r.commission, r.ads, r.charges, r.net ?? 'N/A', r.received ?? 'N/A', r.receiptDiff ?? '', r.pending, r.status, r.s?.receivedOn ?? '', r.s?.utr ?? '']),
    ['', 'Total', '', T.books, T.gross, T.commission, T.ads, T.charges, T.net, T.received, r2(T.received - T.net), pending, '', '', ''],
  ])

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reconcile</h1>
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
          <Button icon={Handshake} onClick={() => setShowTerms((x) => !x)}>Partner terms</Button>
          {canEdit && <Button icon={Upload} onClick={() => pickFile(null)} disabled={!!reading}>Upload statement</Button>}
          <Button icon={Download} onClick={csv}>Export report</Button>
          <input ref={fileInput} type="file" hidden accept=".pdf,.csv,.xlsx,.xls,image/*" aria-label="Statement file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
        </div>
      </div>

      {/* A statement kept in Google Sheets: fetched by the server as Excel, then read like an uploaded file. */}
      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-xs text-slate-500">Or a Google Sheet link (shared “anyone with the link can view”)
            <input aria-label="Google Sheet link" className={inputCls + ' mt-1'} placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} disabled={!API_ON} onChange={(e) => setSheetUrl(e.target.value)} />
          </label>
          <Button icon={Link2} disabled={!API_ON || !sheetUrl.trim() || !!reading} onClick={() => void fetchSheet()}>Fetch sheet</Button>
          {!API_ON && <span className="text-xs text-slate-400">Works on the live dashboard (it needs the server).</span>}
        </div>
      )}
      {reading && <p className="mb-4 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800"><ScanLine size={16} className="animate-pulse" />{reading}</p>}
      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{msg.text}</p>}
      {showTerms && <TermsPanel all={terms} canEdit={can('settings', 'edit')} by={by} onClose={() => setShowTerms(false)} />}

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

      {sel_ && <StatementEditor key={sel_.id} row={sel_} terms={termsFor(terms, sel_.partner, sel_.branch, sel_.week)} canEdit={canEdit} canApprove={canApprove} by={by} onClose={() => setOpen(null)} onUpload={() => pickFile(sel_)} />}

      <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
        <FileCheck2 size={14} className="mt-0.5 shrink-0" />
        <span>Net receipts = gross sales on the statement − commission − advertisement − other charges (payment gateway, GST on charges, TDS/TCS, penalties). A week is <b>matched</b> when the statement's sales agree with the Imprest Books, every deduction is approved, and the money received equals the net receipts (within ₹{TOLERANCE}). Changing an approved deduction needs a fresh approval. <b>Upload statement</b> reads a PDF, CSV or Excel file directly (Zomato's weekly Settlement Report .xlsx as it is). Money a partner adds back, like Zomato's cancellation refund, is a minus deduction; a scanned PDF or photo is read by OCR (shares the daily reading limit with handwritten bills). Read figures always come in unapproved. Commission is checked against the % agreed in <b>Partner terms</b> and advertisement against the approved budget; anything above them is a difference and raises an alert with a sound. When every deduction is approved, one Journal posts them to the books (commission, advertisement and charges as expenses, GST on charges as Input GST, TDS as TDS Receivable) against the partner's ledger for the outlet, so that ledger is left with what reaches the bank. A payout in an uploaded bank statement (Banking → Bank Reconciliation) fills <b>received</b> by itself.</span>
      </p>
    </div>
  )
}

