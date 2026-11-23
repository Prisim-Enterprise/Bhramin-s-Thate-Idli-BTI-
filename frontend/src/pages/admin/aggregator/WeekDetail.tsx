import { useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Lock, LockOpen, Undo2 } from 'lucide-react'
import { Badge, Button, Card, inputCls } from '../../../components/ui'
import { branchName } from '../../../data/mock'
import { openReceipt } from '../../../data/ledgerStore'
import { currentAdApproval, effectiveOf, saveSettlement, stlVoucherId } from '../../../data/settlements'
import { useManualVouchers } from '../../../data/ledgerStore'
import { inrU, toUnits, type Units } from '../../../data/aggregator/money'
import type { Line } from '../../../data/aggregator/zomatoEngine'
import { addMatch, approveAds, finalise, lineLeft, looksZomato, removeMatch, reopen, revokeAds, setReview, type WeekState } from '../../../data/aggregator/recon'
import type { Recon } from '../../../data/aggregator/useRecon'

export const STATUS_TONE = { pending: 'amber', partial: 'amber', reconciled: 'green', mismatch: 'red', review: 'violet' } as const

function Breakdown({ l, testid }: { l: Line; testid?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-3"><p className="font-semibold text-slate-900">{l.label}</p><p className="font-semibold tabular-nums">{inrU(l.amount)}</p></div>
      <p className="mb-1.5 text-xs text-slate-500">= {l.formula}</p>
      <table className="w-full text-xs tabular-nums">
        <tbody>{l.sources.map((x, i) => (
          <tr key={i} className="border-t border-slate-200/70">
            <td className="w-14 py-0.5 font-mono text-slate-500">{x.sign < 0 ? '−' : '+'} {x.item}</td>
            <td className="text-slate-700">{x.label}{x.col !== 'delivered' && <span className="text-slate-400"> ({x.col})</span>}</td>
            <td className="text-right">{inrU(Math.abs(x.amount))}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="border-t border-slate-100 pt-4">
    <p className="mb-2 text-sm font-semibold text-slate-900"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-[#7a2228] text-[11px] text-white">{n}</span>{title}</p>
    {children}
  </section>
)

/** One week: where every figure comes from, what was approved, what reached the bank, and its status. */
export default function WeekDetail({ w, R, by, canEdit, canApprove, onClose }: { w: WeekState; R: Recon; by: string; canEdit: boolean; canApprove: boolean; onClose: () => void }) {
  const s = w.s, st = s.zomato!, c = w.calc
  const locked = !!s.finalised
  const [msg, setMsg] = useState<string | null>(null)
  const [adMode, setAdMode] = useState<'pct' | 'amount'>(w.terms?.adsMode === 'pct' ? 'pct' : 'amount')
  const [adValue, setAdValue] = useState(w.terms?.adsMode === 'pct' && w.terms.adsValue != null ? String(w.terms.adsValue) : w.terms?.adsMode === 'amount' && w.terms.adsValue != null ? String(w.terms.adsValue) : '')
  const [adNote, setAdNote] = useState('')
  const [pick, setPick] = useState('')
  const [pickAmt, setPickAmt] = useState('')
  const [allCredits, setAllCredits] = useState(false)
  const posted = useManualVouchers().some((v) => v.id === stlVoucherId(s.id))
  const ad = currentAdApproval(s)
  const tryDo = (f: () => void, ok?: string) => { try { f(); setMsg(ok ?? null) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } }
  const row = (k: string) => st.rows.find((r) => r.key === k)
  const credits = R.lines.filter((l) => l.deposit > 0 && (allCredits || looksZomato(l)) && lineLeft(l, R.matches) > 0)
  const pickLine = R.lines.find((l) => l.id === pick)
  const unapprovedLines = s.deductions.filter((d) => d.amount && !d.approvedBy)

  return (
    <Card title={<span className="flex flex-wrap items-center gap-2">Zomato · {branchName(s.branch)} · week {s.date} to {s.weekEnd} <Badge tone={STATUS_TONE[w.status]}>{w.statusLabel}</Badge>{locked && <Badge tone="slate"><Lock size={11} className="mr-1" />finalised</Badge>}</span>}
      actions={<button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>}>
      <div className="space-y-4" data-testid="week-detail">
        {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">{msg}</p>}

        <Section n={1} title="Original statement">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-slate-500">Restaurant</dt><dd>{st.resName} · Zomato ID {st.resId}{st.gstin ? ` · GSTIN ${st.gstin}` : ''}</dd>
            <dt className="text-slate-500">Period on statement</dt><dd>{st.from} to {st.to}{st.orders ? ` · ${st.orders} orders` : ''}</dd>
            <dt className="text-slate-500">Imported</dt><dd>{s.import ? `${s.import.fileName} (${s.import.source}) by ${s.import.by}, ${s.import.at.slice(0, 16).replace('T', ' ')}` : '—'}
              {s.file && (s.file.key || s.file.dataUrl) && <button className="ml-2 inline-flex items-center gap-1 text-[#7a2228] hover:underline" onClick={() => openReceipt(s.file!)}><FileText size={13} />Open file</button>}</dd>
            <dt className="text-slate-500">Zomato's settlement</dt><dd>{st.settled != null ? `settled ${inrU(st.settled)}` : ''}{st.pending != null ? ` · pending ${inrU(st.pending)}` : ''}{st.utrs.length ? ` · UTR ${st.utrs.map((u) => u.utr).join(', ')}` : ' · no UTR on the statement yet'}</dd>
          </dl>
        </Section>

        <Section n={2} title="Values read from the statement (Payout breakup)">
          <details>
            <summary className="cursor-pointer text-sm text-[#7a2228]">Show all {st.rows.length} rows</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs tabular-nums" data-testid="statement-rows">
                <thead className="text-left text-slate-500"><tr><th className="py-1">S.no.</th><th>Particular</th><th className="text-right">Delivered</th><th className="text-right">Cancelled</th><th className="text-right">Total</th></tr></thead>
                <tbody>{st.rows.map((r) => (
                  <tr key={r.key} className={`border-t border-slate-100 ${/[A-J]/.test(r.key) ? 'font-semibold' : ''}`}><td className="py-0.5 font-mono">{r.key}</td><td className="max-w-[360px] truncate" title={r.label}>{r.label}</td><td className="text-right">{inrU(r.delivered)}</td><td className="text-right">{inrU(r.cancelled)}</td><td className="text-right">{inrU(r.total)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        </Section>

        <Section n={3} title="Commission (fixed, as configured)">
          <div className="grid gap-3 lg:grid-cols-2">
            <Breakdown l={c.commissionCharged} testid="commission-charged" />
            <div className="rounded-lg border border-slate-200 p-3 text-sm" data-testid="commission-check">
              <p>Agreed: <b>{c.commission.rule}</b>{w.terms && <span className="text-xs text-slate-500"> (terms from {effectiveOf(w.terms)})</span>}</p>
              <p className="mt-1">Charged {inrU(c.commission.charged)}{c.commission.ratePct != null ? ` = ${c.commission.ratePct}% of the commissionable value` : ''}</p>
              {c.commission.expected != null && <p className="mt-1">Expected {inrU(c.commission.expected)} · {(c.commission.over ?? 0) > 0 ? <span className="font-semibold text-rose-700">{inrU(c.commission.over ?? 0)} more than agreed</span> : <span className="text-emerald-700">within the agreed rule</span>}</p>}
            </div>
          </div>
        </Section>

        <Section n={4} title="Advertisement (approved by an admin)">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="text-sm">
              <p>Zomato kept <b>{inrU(c.ads.charged)}</b> for ads this week (incl. 18% GST).</p>
              {st.ads.length > 0 && <ul className="mt-1 text-xs text-slate-600">{st.ads.map((a) => <li key={a.ref}>{a.type} campaign {a.ref} · {a.period} · {inrU(a.total)} ({a.status})</li>)}</ul>}
              <p className="mt-2" data-testid="ads-status">{ad ? <>Approved <b>{inrU(ad.amount)}</b>{ad.mode === 'pct' ? ` (${ad.value}% of net order value)` : ''} by {ad.by}, {ad.at.slice(0, 10)}{(c.ads.unapproved ?? 0) > 0 && <span className="font-semibold text-rose-700"> · {inrU(c.ads.unapproved ?? 0)} not approved</span>}</> : <span className="text-amber-700">Not approved yet: nothing above an approved amount is accepted.</span>}</p>
            </div>
            {canApprove && !locked ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="mb-2 font-medium">Approve the advertisement for this week</p>
                <div className="flex flex-wrap items-end gap-2">
                  <select aria-label="Advertisement approval type" className={inputCls + ' !w-auto !py-1'} value={adMode} onChange={(e) => setAdMode(e.target.value as 'pct' | 'amount')}>
                    <option value="amount">Fixed amount (₹, incl. GST)</option><option value="pct">% of net order value</option>
                  </select>
                  <input aria-label="Advertisement approval value" className={inputCls + ' !w-28 !py-1 text-right'} placeholder={adMode === 'pct' ? '%' : '₹'} value={adValue} onChange={(e) => setAdValue(e.target.value)} />
                  <input aria-label="Approval note" className={inputCls + ' !w-48 !py-1'} placeholder="Note (campaign, reason)" value={adNote} onChange={(e) => setAdNote(e.target.value)} />
                  <Button size="sm" icon={CheckCircle2} disabled={toUnits(adValue) == null} onClick={() => tryDo(() => approveAds(s as typeof s & { zomato: typeof st }, adMode, adValue.trim(), by, adNote.trim() || undefined), 'Advertisement approved.')}>Approve</Button>
                </div>
                {adMode === 'pct' && toUnits(adValue) != null && <p className="mt-1 text-xs text-slate-500">= {adValue}% of {inrU(row('A')?.delivered ?? 0)}</p>}
                {ad && <button className="mt-2 text-xs text-slate-500 underline" onClick={() => { const r = prompt('Why withdraw this approval?'); if (r) tryDo(() => revokeAds(s, by, r)) }}>Withdraw the current approval</button>}
              </div>
            ) : !canApprove ? <p className="text-xs text-slate-500">Only someone who can approve accounts can approve advertisement.</p> : null}
          </div>
          {(s.adApprovals?.length ?? 0) > 0 && (
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-[#7a2228]">Approval history ({s.adApprovals!.length})</summary>
              <ul className="mt-1 space-y-0.5 text-slate-600" data-testid="ads-history">{s.adApprovals!.map((a) => <li key={a.id}>{a.at.slice(0, 16).replace('T', ' ')} · {a.by} approved {inrU(a.amount)}{a.mode === 'pct' ? ` (${a.value}%)` : ''}{a.note ? ` · ${a.note}` : ''}{a.revoked ? ` · withdrawn by ${a.revoked.by}: ${a.revoked.reason}` : ''}</li>)}</ul>
            </details>
          )}
        </Section>

        <Section n={5} title="The three weekly Zomato values">
          <div className="grid gap-3 lg:grid-cols-3">
            <Breakdown l={c.dynamic.growthServices} testid="dyn-growth" />
            <Breakdown l={c.dynamic.commissionableValue} testid="dyn-commissionable" />
            <Breakdown l={c.dynamic.otherOrderDeductions} testid="dyn-other" />
          </div>
        </Section>

        <Section n={6} title="Expected payable">
          <div className="grid gap-3 lg:grid-cols-2">
            <Breakdown l={c.statementPayout} testid="payout-breakdown" />
            <div className="space-y-2 text-sm">
              <p className={c.payoutCheck.ok ? 'text-emerald-700' : 'font-semibold text-rose-700'}>{c.payoutCheck.ok ? <CheckCircle2 size={14} className="mr-1 inline" /> : <AlertTriangle size={14} className="mr-1 inline" />}Zomato printed {c.printedPayout == null ? '—' : inrU(c.printedPayout)}; worked out {inrU(c.statementPayout.amount)}</p>
              <ul className="text-xs text-slate-600">{c.structure.map((x) => <li key={x.key} className={x.ok ? '' : 'font-semibold text-rose-700'}>{x.ok ? '✓' : '✗'} {x.key} {x.label} = {x.formula}: {inrU(x.computed)}</li>)}</ul>
              <Breakdown l={c.payablePerTerms} testid="per-terms" />
              {c.recoverable > 0 && <p className="font-semibold text-rose-700" data-testid="recoverable">Recoverable from Zomato: {inrU(c.recoverable)}</p>}
            </div>
          </div>
        </Section>

        <Section n={7} title="Actual bank credits">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm tabular-nums" data-testid="matches">
            <tbody className="divide-y divide-slate-100">
              {w.matches.map((m) => { const l = R.lines.find((x) => x.id === m.bankLineId); return (
                <tr key={m.id}><td className="py-1">{m.date}</td><td className="max-w-[280px] truncate text-slate-600" title={l?.narration}>{l?.ledger} · {l?.narration ?? 'bank line removed'}{l?.ref ? ` · ${l.ref}` : ''}</td><td className="text-xs text-slate-500">{m.evidence === 'utr' ? 'UTR' : m.evidence === 'amount' ? 'same amount' : 'by hand'} · {m.by}</td><td className="text-right">{inrU(m.amount)}</td>
                  <td className="pl-2 text-right">{canEdit && !locked && <button aria-label="Unmatch" className="text-slate-400 hover:text-rose-600" onClick={() => { const r = prompt('Why remove this match?'); if (r) tryDo(() => removeMatch(s, m, by, R.lines, r)) }}><Undo2 size={14} /></button>}</td></tr>
              ) })}
              {!w.matches.length && <tr><td className="whitespace-normal py-2 text-slate-500">No bank credit matched yet. Upload the bank statement in the Bank matching tab; a credit with this week's UTR or exact amount is matched by itself.</td></tr>}
            </tbody>
          </table>
          </div>
          {canEdit && !locked && (
            <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
              <select aria-label="Bank credit to match" className={inputCls + ' !w-auto max-w-[420px] !py-1'} value={pick} onChange={(e) => { setPick(e.target.value); const l = R.lines.find((x) => x.id === e.target.value); if (l) setPickAmt((Math.min(lineLeft(l, R.matches), Math.max(0, w.difference)) / 10000).toFixed(2)) }}>
                <option value="">Match a bank credit…</option>
                {credits.map((l) => <option key={l.id} value={l.id}>{l.date} · {inrU(lineLeft(l, R.matches))} left · {l.narration.slice(0, 40)}</option>)}
              </select>
              <input aria-label="Amount to match" className={inputCls + ' !w-32 !py-1 text-right'} value={pickAmt} onChange={(e) => setPickAmt(e.target.value)} />
              <Button size="sm" disabled={!pickLine || toUnits(pickAmt) == null} onClick={() => tryDo(() => { addMatch(s, pickLine!, toUnits(pickAmt) ?? 0, by, 'manual', R.lines); setPick(''); setPickAmt('') }, 'Matched.')}>Match</Button>
              <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={allCredits} onChange={(e) => setAllCredits(e.target.checked)} />show all credits</label>
            </div>
          )}
        </Section>

        <Section n={8} title="Difference">
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums" data-testid="difference">
            <dt>Expected payable (statement)</dt><dd className="text-right">{inrU(c.statementPayout.amount)}</dd>
            <dt>Received in the bank</dt><dd className="text-right">{inrU(w.received)}</dd>
            <dt className="font-semibold">Difference</dt><dd className={`text-right font-semibold ${Math.abs(w.difference) > 10000 ? 'text-rose-700' : 'text-emerald-700'}`}>{inrU(w.difference)}</dd>
            {c.recoverable > 0 && <><dt>Recoverable under BTI terms</dt><dd className="text-right text-rose-700">{inrU(c.recoverable)}</dd></>}
          </dl>
        </Section>

        <Section n={9} title="Status">
          <p className="text-sm"><Badge tone={STATUS_TONE[w.status]}>{w.statusLabel}</Badge> <span className="ml-1 text-slate-600" data-testid="status-why">{w.why}</span></p>
          {c.issues.length > 0 && <ul className="mt-1 text-xs text-amber-800" data-testid="issues">{c.issues.map((x) => <li key={x}>• {x}</li>)}</ul>}
          {s.review && <p className="mt-1 text-xs text-violet-700">Marked for review by {s.review.by}: {s.review.note}</p>}
          <p className="mt-1 text-xs text-slate-500">Books: {posted ? 'the deductions are posted (Journal on ' + s.weekEnd + ')' : `not posted yet${unapprovedLines.length ? ` — ${unapprovedLines.length} statement line(s) to approve` : ''}`}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canApprove && !locked && unapprovedLines.length > 0 && <Button size="sm" variant="secondary" onClick={() => tryDo(() => saveSettlement({ ...s, deductions: s.deductions.map((d) => (d.amount && !d.approvedBy ? { ...d, approvedBy: by, approvedAt: new Date().toISOString() } : d)), history: [...(s.history ?? []), { at: new Date().toISOString(), by, action: 'statement lines approved', detail: `${unapprovedLines.length} line(s), posted to the books` }], updatedBy: by, updatedAt: new Date().toISOString() }, by), 'Statement lines approved and posted to the books.')}>Approve statement lines for the books</Button>}
            {canEdit && !locked && (s.review
              ? <Button size="sm" variant="secondary" onClick={() => tryDo(() => setReview(s, false, by, 'checked'))}>Clear review</Button>
              : <Button size="sm" variant="secondary" onClick={() => { const r = prompt('What needs checking?'); if (r) tryDo(() => setReview(s, true, by, r)) }}>Mark for review</Button>)}
            {canApprove && !locked && <Button size="sm" icon={Lock} disabled={w.status !== 'reconciled'} title={w.status !== 'reconciled' ? 'Only a reconciled week can be finalised' : ''} onClick={() => tryDo(() => finalise(w, by), 'Finalised.')}>Finalise</Button>}
            {canApprove && locked && <Button size="sm" variant="secondary" icon={LockOpen} onClick={() => { const r = prompt('Why reopen this finalised week? (kept in its history)'); if (r) tryDo(() => reopen(s, by, r), 'Reopened.') }}>Reopen</Button>}
          </div>
          {locked && <p className="mt-2 text-xs text-slate-500">Finalised by {s.finalised!.by} on {s.finalised!.at.slice(0, 10)}: payout {inrU(s.finalised!.snapshot.statementPayout as Units)}, received {inrU(s.finalised!.snapshot.received)}. Changes need a reopen with a reason.</p>}
        </Section>

        <section className="border-t border-slate-100 pt-4">
          <details><summary className="cursor-pointer text-sm font-semibold text-slate-900">History ({s.history?.length ?? 0}){(s.revisions?.length ?? 0) > 0 ? ` · ${s.revisions!.length} revision(s)` : ''}</summary>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600" data-testid="history">{[...(s.history ?? [])].reverse().map((h, i) => <li key={i}>{h.at.slice(0, 16).replace('T', ' ')} · <b>{h.action}</b> · {h.by} · {h.detail}</li>)}</ul>
          </details>
        </section>
      </div>
    </Card>
  )
}
