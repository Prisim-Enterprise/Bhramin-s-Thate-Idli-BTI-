import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bike, Store } from 'lucide-react'
import { EmptyReport, ReportHeader, ScopePicker, Tile, downloadCsv, money } from '../../../components/report'
import { Badge } from '../../../components/ui'
import { monthName, useReportData } from '../../../data/analytics'
import { niceDate } from '../../../data/entries'
import { BRANCHES, branchName, inr } from '../../../data/mock'
import { useBankLines } from '../../../data/banking'
import {
  DEDUCTION_KINDS, PARTNERS, PAYER, TOLERANCE, addDays, partnerName, statementRow, usePartnerTerms, useSettlements, weekStart,
  type PartnerId, type StatementRow,
} from '../../../data/settlements'

// One partner (Swiggy, Zomato, Rapido) on one page, month by month: sales through it as per the Imprest Books,
// its weekly statements and what it kept (commission, ads, charges, GST, TDS), what reached the bank, what is
// still to come, and every bank credit from it — matched to its week or not.

const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (a: number, b: number) => (b ? `${r2((a / b) * 100)}%` : '—')
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }
const STATUS: Record<StatementRow['status'], { text: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  matched: { text: 'Matched', tone: 'green' }, difference: { text: 'Difference', tone: 'red' }, 'not received': { text: 'Not received', tone: 'amber' },
  'waiting approval': { text: 'To approve', tone: 'amber' }, 'no statement': { text: 'No statement', tone: 'slate' },
}

export default function PartnerPayouts({ partner }: { partner: Exclude<PartnerId, 'mobikwik'> }) {
  const R = useReportData()
  const all = useSettlements(), terms = usePartnerTerms(), lines = useBankLines()
  const P = partnerName(partner), field = PARTNERS.find((p) => p.id === partner)!.field
  const mine = useMemo(() => all.filter((s) => s.partner === partner), [all, partner])
  const credits = useMemo(() => lines.filter((l) => !l.ignored && l.deposit > 0 && PAYER[partner].test(`${l.narration} ${l.ref}`)), [lines, partner])

  // Months with anything for this partner: sales in the books, a statement, or a bank credit.
  const months = useMemo(() => [...new Set([
    ...R.d.entries.filter((e) => e[field] > 0).map((e) => e.date.slice(0, 7)),
    ...mine.map((s) => s.date.slice(0, 7)), ...credits.map((l) => l.date.slice(0, 7)),
  ])].sort().reverse(), [R.d.entries, mine, credits, field])
  const [picked, setMonth] = useState<string | null>(null)
  const month = picked && months.includes(picked) ? picked : months[0] ?? ''
  const [branch, setBranch] = useState('')
  const from = month + '-01', to = month ? monthEnd(month) : ''

  // Weekly rows: every outlet-week starting in the month with sales through the partner or a statement.
  const rows = useMemo(() => {
    if (!month) return []
    const weeks: string[] = []
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) if (w >= from) weeks.push(w)
    const out: StatementRow[] = []
    for (const w of weeks) {
      const end = addDays(w, 6), keys = new Set<string>()
      for (const e of R.d.entries) if (e.date >= w && e.date <= end && e[field] > 0) keys.add(e.branch)
      for (const s of mine) if (s.date === w) keys.add(s.branch)
      for (const b of keys) if (!branch || b === branch) out.push(statementRow(partner, b, w, R.d.entries, mine.find((s) => s.date === w && s.branch === b) ?? null, terms))
    }
    return out.sort((a, b) => b.week.localeCompare(a.week) || branchName(a.branch).localeCompare(branchName(b.branch)))
  }, [month, from, to, R.d.entries, mine, branch, field, partner, terms])

  const withStmt = rows.filter((r) => r.gross != null)
  const sum = (f: (r: StatementRow) => number | null) => r2(rows.reduce((t, r) => t + (f(r) ?? 0), 0))
  const sales = r2(R.d.entries.filter((e) => e.date >= from && e.date <= to && (!branch || e.branch === branch)).reduce((t, e) => t + e[field], 0))
  const gross = sum((r) => r.gross), commission = sum((r) => r.commission), ads = sum((r) => r.ads), charges = sum((r) => r.charges)
  const net = sum((r) => r.net), received = sum((r) => r.received)
  const toCome = r2(withStmt.filter((r) => r.received == null).reduce((t, r) => t + (r.net ?? 0), 0))
  const noStmt = rows.filter((r) => r.gross == null)
  const issues = rows.filter((r) => r.status === 'difference')

  // What the partner kept, by kind, over the month's statements.
  const kinds = useMemo(() => {
    // GST the partner pays the government for you on customers' bills (sec 9(5)) is shown apart from GST on its fees.
    const keyOf = (d: { kind: string; label: string }) => (d.kind === 'gst' && /9\s*\(\s*5\s*\)/.test(d.label) ? 'gst95' : d.kind)
    const t = new Map<string, number>()
    for (const r of withStmt) for (const d of r.s?.deductions ?? []) t.set(keyOf(d), r2((t.get(keyOf(d)) ?? 0) + d.amount))
    const labels: [string, string][] = [...Object.entries(DEDUCTION_KINDS).map(([id, label]): [string, string] => [id, id === 'gst' ? 'GST on fees (input credit)' : label]), ['gst95', 'Customer GST paid by the partner (sec 9(5))']]
    return labels.map(([id, label]) => ({ id, label, amount: t.get(id) ?? 0 })).filter((k) => Math.abs(k.amount) >= 0.01)
  }, [withStmt])

  // Outlet totals for the month.
  const outlets = useMemo(() => {
    const m = new Map<string, { sales: number; gross: number; kept: number; net: number; received: number; weeks: number; open: number }>()
    for (const r of rows) {
      const o = m.get(r.branch) ?? { sales: 0, gross: 0, kept: 0, net: 0, received: 0, weeks: 0, open: 0 }
      o.sales = r2(o.sales + r.books); o.gross = r2(o.gross + (r.gross ?? 0)); o.kept = r2(o.kept + (r.gross != null ? r.deductions : 0))
      o.net = r2(o.net + (r.net ?? 0)); o.received = r2(o.received + (r.received ?? 0)); o.weeks++; if (r.status !== 'matched') o.open++
      m.set(r.branch, o)
    }
    return [...m].sort((a, b) => b[1].sales - a[1].sales)
  }, [rows])

  // The partner's credits in the bank this month, and the week each one paid.
  const monthCredits = credits.filter((l) => l.date >= from && l.date <= to).sort((a, b) => b.date.localeCompare(a.date))
  const paidWeek = (id: string) => mine.find((s) => s.bankLineId === id)
  const unmatched = monthCredits.filter((l) => !paidWeek(l.id))

  const csv = () => downloadCsv(`BTI-${P}-${month}.csv`, [
    ['Week', 'Outlet', 'Sales in books', 'Statement gross', 'Commission', 'Ads', 'Other charges', 'Net receipts', 'Received', 'Received on', 'Difference', 'Status'],
    ...rows.map((r) => [r.week, branchName(r.branch), r.books, r.gross ?? '', r.commission, r.ads, r.charges, r.net ?? '', r.received ?? '', r.s?.receivedOn ?? '', r.receiptDiff ?? '', STATUS[r.status].text]),
  ])
  const picker = <ScopePicker months={months} month={month} setMonth={setMonth} branch={branch} setBranch={setBranch} monthName={monthName} branches={BRANCHES.filter((b) => b.id !== 'CK')} />
  const upload = <Link to="/admin/accounting/reconcile" className="inline-flex items-center rounded-xl bg-[#7a2228] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5a1a1f]">Upload {P} statement</Link>
  const label = month ? monthName(month) : ''

  if (!months.length) return <EmptyReport title={`${P} Payouts`} period="" icon={partner === 'rapido' ? Bike : Store} actions={upload} text={`Nothing for ${P} yet. Its sales appear once Imprest Books are uploaded, its weekly statements once they are uploaded on Reconcile, and its payouts once the bank statement is uploaded.`} />

  return (
    <div className="mx-auto max-w-7xl">
      <ReportHeader title={`${P} Payouts`} period={label + (branch ? ` · ${branchName(branch)}` : '')} actions={<>{picker}{upload}</>} onCsv={rows.length ? csv : undefined} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={`Sales through ${P} (Imprest Books)`} value={money(sales)} note={`${label}, ${rows.length} outlet-week(s)`} />
        <Tile label={`${P} kept`} value={money(r2(commission + ads + charges))} note={`${pct(commission + ads + charges, gross)} of statement sales ${money(gross)}`} />
        <Tile label="Received in the bank" value={money(received)} note={`of net receipts ${money(net)}`} tone={issues.length ? 'red' : 'green'} />
        <Tile label="Still to come" value={money(toCome)} note={noStmt.length ? `${noStmt.length} outlet-week(s) have no statement yet` : 'every week has its statement'} tone={toCome > TOLERANCE || noStmt.length ? 'amber' : 'slate'} />
      </div>

      {(issues.length > 0 || unmatched.length > 0) && (
        <div data-testid="partner-alerts" className="mb-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {issues.length > 0 && <p><b>{issues.length} week(s) don't tally:</b> {issues.slice(0, 4).map((r) => `${branchName(r.branch)} ${niceDate(r.week)}`).join(', ')}{issues.length > 4 ? ' …' : ''}. Open them on Reconcile.</p>}
          {unmatched.length > 0 && <p><b>{unmatched.length} {P} credit(s) in the bank not matched to a week</b> ({inr(r2(unmatched.reduce((t, l) => t + l.deposit, 0)))}): upload those weeks' statements.</p>}
        </div>
      )}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">What {P} kept · {label}</p>
          {kinds.length ? (
            <table className="w-full text-sm" data-testid="kept">
              <tbody className="divide-y divide-slate-100 [&_td]:py-1.5">
                {kinds.map((k) => <tr key={k.id}><td className="text-slate-700">{k.label}</td><td className="text-right tabular-nums">{inr(k.amount)}</td><td className="w-16 text-right text-xs text-slate-500">{pct(k.amount, gross)}</td></tr>)}
                <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{inr(r2(kinds.reduce((t, k) => t + k.amount, 0)))}</td><td className="text-right text-xs text-slate-500">{pct(kinds.reduce((t, k) => t + k.amount, 0), gross)}</td></tr>
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">No {P} statements for {label} yet.</p>}
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-semibold text-slate-900">By outlet · {label}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="by-outlet">
              <thead className="text-xs uppercase text-slate-500"><tr>{['Outlet', 'Sales (books)', 'Statement', `${P} kept`, 'Net', 'Received', ''].map((h) => <th key={h} className="py-1.5 pr-3 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 [&_td]:py-1.5 [&_td]:pr-3">
                {outlets.map(([b, o]) => (
                  <tr key={b}><td>{branchName(b)}</td><td className="tabular-nums">{inr(o.sales)}</td><td className="tabular-nums">{o.gross ? inr(o.gross) : '—'}</td>
                    <td className="tabular-nums">{o.gross ? <>{inr(o.kept)} <span className="text-xs text-slate-500">{pct(o.kept, o.gross)}</span></> : '—'}</td>
                    <td className="tabular-nums">{o.net ? inr(o.net) : '—'}</td><td className="tabular-nums">{o.received ? inr(o.received) : '—'}</td>
                    <td>{o.open ? <Badge tone="amber">{o.open} open</Badge> : <Badge tone="green">all matched</Badge>}</td></tr>
                ))}
                {!outlets.length && <tr><td colSpan={7} className="!py-4 text-center text-slate-500">No {P} sales or statements in {label}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Week by week</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm" data-testid="weeks">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{['Week', 'Outlet', 'Sales (books)', 'Statement', 'Commission', 'Ads', 'Other', 'Net receipts', 'Received', 'Difference', 'Status', ''].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-2">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{niceDate(r.s?.periodFrom ?? r.week)}<span className="block text-xs text-slate-400">to {niceDate(r.s?.periodTo ?? addDays(r.week, 6))}</span></td>
                  <td className="whitespace-nowrap">{branchName(r.branch)}</td>
                  <td className="tabular-nums">{inr(r.books)}</td>
                  <td className="tabular-nums">{r.gross != null ? <>{inr(r.gross)}{r.salesDiff != null && Math.abs(r.salesDiff) > TOLERANCE && <span className="block text-xs text-rose-600">{r.salesDiff > 0 ? '+' : ''}{inr(r.salesDiff)} vs books</span>}</> : <span className="text-slate-400">—</span>}</td>
                  <td className="tabular-nums">{r.gross != null ? <>{inr(r.commission)}{r.commissionPct != null && <span className={`block text-xs ${r.commissionExtra ? 'text-rose-600' : 'text-slate-400'}`}>{r2(r.commissionPct)}%{r.agreedPct != null ? ` (agreed ${r.agreedPct}%)` : ''}</span>}</> : ''}</td>
                  <td className="tabular-nums">{r.gross != null ? inr(r.ads) : ''}</td>
                  <td className="tabular-nums">{r.gross != null ? inr(r.charges) : ''}</td>
                  <td className="tabular-nums">{r.net != null ? inr(r.net) : ''}</td>
                  <td className="tabular-nums">{r.received != null ? <>{inr(r.received)}<span className="block text-xs text-slate-400">{r.s?.receivedOn ? niceDate(r.s.receivedOn) : ''}{r.s?.receivedFrom ? ` · ${r.s.receivedFrom.replace(/ A\/c.*$/, '')}` : ''}</span></> : <span className="text-slate-400">—</span>}</td>
                  <td className={`tabular-nums ${r.receiptDiff != null && Math.abs(r.receiptDiff) > TOLERANCE ? 'font-semibold text-rose-600' : ''}`}>{r.receiptDiff != null ? inr(r.receiptDiff) : ''}</td>
                  <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge></td>
                  <td><Link className="font-medium text-[#7a2228] hover:underline" to={`/admin/accounting/reconcile?week=${r.week}${r.s ? `&open=${encodeURIComponent(r.s.id)}` : ''}`}>{r.s ? 'Open' : 'Upload'}</Link></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={12} className="!py-8 text-center text-slate-500">No {P} weeks in {label}.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 font-semibold [&_td]:px-3 [&_td]:py-2.5">
                <tr><td colSpan={2}>Total</td><td className="tabular-nums">{inr(sum((r) => r.books))}</td><td className="tabular-nums">{inr(gross)}</td><td className="tabular-nums">{inr(commission)}</td><td className="tabular-nums">{inr(ads)}</td><td className="tabular-nums">{inr(charges)}</td><td className="tabular-nums">{inr(net)}</td><td className="tabular-nums">{inr(received)}</td><td colSpan={3} /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">{P} credits in the bank · {label}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm" data-testid="credits">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Date', 'Bank', 'Description', 'Amount', 'Paid for'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 [&_td]:px-4 [&_td]:py-2">
              {monthCredits.map((l) => {
                const s = paidWeek(l.id)
                return (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{niceDate(l.date)}</td>
                    <td className="whitespace-nowrap">{l.ledger.replace(/ A\/c.*$/, '')}</td>
                    <td className="text-xs text-slate-600">{l.narration}{l.ref ? <span className="block text-slate-400">Ref {l.ref}</span> : null}</td>
                    <td className="tabular-nums font-medium">{inr(l.deposit)}</td>
                    <td>{s ? <Link className="text-[#7a2228] hover:underline" to={`/admin/accounting/reconcile?week=${s.date}&open=${encodeURIComponent(s.id)}`}>{branchName(s.branch)}, week of {niceDate(s.date)}</Link> : <Badge tone="amber">not matched</Badge>}</td>
                  </tr>
                )
              })}
              {!monthCredits.length && <tr><td colSpan={5} className="!py-6 text-center text-slate-500">No {P} credits in the bank statements uploaded for {label}.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Weeks are Monday to Sunday ({P === 'Swiggy' ? 'Swiggy statements run Sunday to Saturday and are checked against the same days in the books' : 'as on the statements'}). Statements are uploaded and approved on Reconcile; payouts are matched when the bank statement is uploaded.</p>
    </div>
  )
}
