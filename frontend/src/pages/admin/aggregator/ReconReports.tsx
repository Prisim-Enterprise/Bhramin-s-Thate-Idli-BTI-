import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Table } from '../../../components/ui'
import { branchName } from '../../../data/mock'
import { rupees } from '../../../data/aggregator/money'
import { lineLeft, looksZomato, type WeekState } from '../../../data/aggregator/recon'
import { downloadXlsx, type XSheet } from '../../../lib/xlsxWrite'
import type { Recon } from '../../../data/aggregator/useRecon'

type Rep = 'weekly' | 'statements' | 'bank' | 'unmatched' | 'discrepancy' | 'history'
const NAMES: Record<Rep, string> = { weekly: 'Weekly reconciliation', statements: 'Statement-wise', bank: 'Bank matching', unmatched: 'Unmatched transactions', discrepancy: 'Discrepancies', history: 'Historical' }
const r = (u: number | null | undefined) => (u == null ? null : rupees(u))

/** Every report as rows (first row = headings), so the same rows fill the table and the Excel file. */
export function reportRows(rep: Rep, weeks: WeekState[], R: Recon): XSheet['rows'] {
  const row = (w: WeekState, k: string) => w.s.zomato!.rows.find((x) => x.key === k)
  switch (rep) {
    case 'weekly': return [
      ['Week from', 'Week to', 'Outlet', 'Zomato ID', 'Orders', 'Net order value (A)', 'Commissionable value (9+10+11)', 'Commission charged', 'Commission agreed', 'Commission over', 'Growth services (24+25+26)', 'Ads approved', 'Ads not approved', 'Other order-level deductions (21+22+23)', 'Expected payable (statement)', 'Printed by Zomato', 'Received in bank', 'Difference', 'Recoverable under terms', 'Status', 'Why'],
      ...weeks.map((w) => [w.s.date, w.s.weekEnd, branchName(w.s.branch), w.s.zomato!.resId, w.s.zomato!.orders ?? null, r(row(w, 'A')?.delivered), r(w.calc.dynamic.commissionableValue.amount), r(w.calc.commission.charged), r(w.calc.commission.expected), r(w.calc.commission.over), r(w.calc.dynamic.growthServices.amount), r(w.calc.ads.approved), r(w.calc.ads.unapproved), r(w.calc.dynamic.otherOrderDeductions.amount), r(w.calc.statementPayout.amount), r(w.calc.printedPayout), r(w.received), r(w.difference), r(w.calc.recoverable), w.statusLabel, w.why]),
    ]
    case 'statements': return [
      ['Week from', 'Outlet', 'Zomato ID', 'Period on statement', 'File', 'Source', 'Imported by', 'Imported at', 'Statement rows', 'Ad campaigns', 'UTRs on statement', 'Finalised by', 'Finalised at', 'Revisions'],
      ...weeks.map((w) => [w.s.date, branchName(w.s.branch), w.s.zomato!.resId, `${w.s.zomato!.from} to ${w.s.zomato!.to}`, w.s.import?.fileName ?? '', w.s.import?.source ?? '', w.s.import?.by ?? '', w.s.import?.at ?? '', w.s.zomato!.rows.length, w.s.zomato!.ads.length, w.s.zomato!.utrs.map((u) => u.utr).join(', '), w.s.finalised?.by ?? '', w.s.finalised?.at ?? '', w.s.revisions?.length ?? 0]),
    ]
    case 'bank': return [
      ['Week from', 'Outlet', 'Bank date', 'Bank', 'Description', 'UTR / ref.', 'Credit', 'Allocated to this week', 'Evidence', 'Matched by', 'Matched at'],
      ...weeks.flatMap((w) => w.matches.map((m) => { const l = R.lines.find((x) => x.id === m.bankLineId); return [w.s.date, branchName(w.s.branch), m.date, l?.ledger ?? '', l?.narration ?? '(line removed)', l?.ref ?? '', l?.deposit ?? null, r(m.amount), m.evidence, m.by, m.at] })),
    ]
    case 'unmatched': return [
      ['Bank date', 'Bank', 'Description', 'UTR / ref.', 'Credit', 'Not yet matched'],
      ...R.lines.filter((l) => looksZomato(l) && lineLeft(l, R.matches) > 0).map((l) => [l.date, l.ledger, l.narration, l.ref, l.deposit, r(lineLeft(l, R.matches))]),
    ]
    case 'discrepancy': return [
      ['Week from', 'Outlet', 'Status', 'Expected payable', 'Received', 'Difference', 'Recoverable under terms', 'Problems'],
      ...weeks.filter((w) => w.status !== 'reconciled' || w.calc.issues.length).map((w) => [w.s.date, branchName(w.s.branch), w.statusLabel, r(w.calc.statementPayout.amount), r(w.received), r(w.difference), r(w.calc.recoverable), [w.why, ...w.calc.issues].filter((x, i, a) => a.indexOf(x) === i).join(' | ')]),
    ]
    case 'history': return [
      ['Week from', 'Outlet', 'When', 'Who', 'What', 'Detail'],
      ...weeks.flatMap((w) => (w.s.history ?? []).map((h) => [w.s.date, branchName(w.s.branch), h.at, h.by, h.action, h.detail])),
    ]
  }
}

export default function ReconReports({ R, weeks, period }: { R: Recon; weeks: WeekState[]; period: string }) {
  const [rep, setRep] = useState<Rep>('weekly')
  const rows = reportRows(rep, weeks, R)
  const book = (which: Rep[]) => which.map((k) => ({ name: NAMES[k], rows: reportRows(k, weeks, R) }))
  return (
    <Card title="Reports" actions={<div className="flex gap-2">
      <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadXlsx(`BTI-Zomato-${NAMES[rep].replace(/\s+/g, '-')}-${period}.xlsx`, book([rep]))}>This report (Excel)</Button>
      <Button size="sm" icon={Download} onClick={() => downloadXlsx(`BTI-Zomato-Reconciliation-${period}.xlsx`, book(Object.keys(NAMES) as Rep[]))}>All reports (Excel)</Button>
    </div>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(NAMES) as Rep[]).map((k) => <button key={k} onClick={() => setRep(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${rep === k ? 'bg-[#7a2228] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{NAMES[k]}</button>)}
      </div>
      <Table head={rows[0].map(String)}>
        {rows.slice(1).map((x, i) => <tr key={i} data-testid="report-row">{x.map((v, j) => <td key={j} className={typeof v === 'number' ? 'tabular-nums' : 'max-w-[280px] truncate'} title={typeof v === 'string' ? v : undefined}>{typeof v === 'number' ? v.toLocaleString('en-IN', { minimumFractionDigits: j === 4 && rep === 'weekly' ? 0 : 2, maximumFractionDigits: 2 }) : v ?? '—'}</td>)}</tr>)}
        {rows.length === 1 && <tr><td colSpan={rows[0].length} className="!py-8 text-center text-slate-500">Nothing in this period.</td></tr>}
      </Table>
    </Card>
  )
}

