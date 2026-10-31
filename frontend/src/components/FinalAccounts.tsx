import { Fragment } from 'react'
import { Card } from './ui'
import { Big, ShareBar, Summary, Tile, downloadCsv, money, per100 } from './report'
import { BRANCHES, branchName, inr } from '../data/mock'
import { cashIn, inMonth } from '../data/entries'
import { GROUPS, buildVouchers, imprestLedger, ledgerTotals, type GroupId } from '../data/books'
import { ledgerKey } from '../data/ledgerStore'
import { byBranch, profitLoss, type Data, type Scope } from '../data/analytics'

// The tabs inside Profit & Loss:
//   Income + Expenses  → the Profit & Loss account
//   Assets + Liabilities → the Balance Sheet
//   all of them together → the Trial Balance
// Everything comes from Account Books (day entries from the Imprest Books, posted bills and vouchers).

const amt = (n: number) => (n ? Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
const PNL_GROUPS: GroupId[] = ['sales', 'indirectInc', 'purchase', 'directExp', 'indirectExp']
const lastDay = (month?: string) => (month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toLocaleDateString('en-CA') : '9999-12-31')

/* ---------- Income ---------- */

export function IncomeReport({ d, scope }: { d: Data; scope: Scope }) {
  const p = profitLoss(d, scope)
  const s = p.sales
  const entries = inMonth(d.entries, scope.month).filter((e) => !scope.branch || e.branch === scope.branch)
  const lines = [
    { label: 'Food sales (without GST)', v: s.food },
    { label: 'Container charges', v: s.container },
    ...(s.roundOff ? [{ label: 'Round off', v: s.roundOff }] : []),
    { label: 'Less: settlement discounts', v: -s.discount },
  ]
  const how = [
    { label: 'Cash at the counter', v: s.cash },
    { label: 'Mobikwik / UPI', v: s.mobikwik },
    { label: 'Swiggy', v: s.swiggy },
    { label: 'Zomato', v: s.zomato },
    { label: 'Rapido', v: s.rapido },
  ].filter((x) => x.v)
  const billed = how.reduce((t, x) => t + x.v, 0)
  const outlets = scope.branch ? [] : byBranch(d, scope).filter((x) => x.p.income).sort((a, b) => b.p.income - a.p.income)
  const csv = () => downloadCsv(`BTI-Income-${scope.month || 'all'}.csv`, [['Income', 'Amount'], ...lines.map((l) => [l.label, l.v]), ['Net income', p.income]])

  return (
    <>
      <Summary points={[
        <>Net income was <Big>{money(p.income)}</Big> from {s.days} day(s) of sales.</>,
        <>Food sales (without GST) were <Big>{money(s.food)}</Big>; container charges added <Big>{money(s.container)}</Big>; settlement discounts took off <Big>{money(s.discount)}</Big>.</>,
        <>GST collected ({money(s.gst)}) is not income: it is paid on to the government.</>,
        outlets.length > 1 ? <><Big>{outlets[0].b.name}</Big> brought in the most ({money(outlets[0].p.income)}).</> : null,
      ].filter(Boolean)} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Net income" value={money(p.income)} tone="green" />
        <Tile label="Food sales" value={money(s.food)} note="Without GST" />
        <Tile label="Container charges" value={money(s.container)} />
        <Tile label="GST collected" value={money(s.gst)} note="Not income · owed to government" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Income statement" pad={false} actions={<button className="text-xs font-medium text-[#7a2228] hover:underline" onClick={csv}>Download</button>}>
          <table className="w-full text-sm"><tbody>
            {lines.map((l) => <tr key={l.label} className="border-b border-slate-100"><td className="px-4 py-2.5">{l.label}</td><td className={`px-4 text-right tabular-nums ${l.v < 0 ? 'text-rose-600' : ''}`}>{money(l.v, false)}</td></tr>)}
            <tr className="bg-[#fdf8ee] font-bold"><td className="px-4 py-3">Net income</td><td className="px-4 text-right tabular-nums">{money(p.income, false)}</td></tr>
          </tbody></table>
        </Card>
        <Card title="How customers paid (total billed, with GST)" pad={false}>
          <ul className="divide-y divide-slate-100">
            {how.map((h) => (
              <li key={h.label} className="px-4 py-2.5">
                <div className="mb-1.5 flex justify-between text-sm"><span>{h.label}</span><span className="tabular-nums"><b>{money(h.v, false)}</b> <span className="text-xs text-slate-500">{billed ? Math.round((h.v / billed) * 100) : 0}%</span></span></div>
                <ShareBar value={h.v} max={Math.max(...how.map((x) => x.v))} color="#d9a441" />
              </li>
            ))}
            {!how.length && <li className="px-4 py-3 text-sm text-slate-500">No sales in this period.</li>}
          </ul>
        </Card>
      </div>
      {outlets.length > 0 && (
        <Card title="Income by outlet" className="mt-4" pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Outlet', 'Food sales', 'Container', 'Discounts', 'Net income'].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {outlets.map(({ b, p: q }) => (
                <tr key={b.id}><td className="px-4 py-2.5 font-medium">{b.name}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(q.sales.food))}</td>
                  <td className="px-4 text-right tabular-nums">{inr(Math.round(q.sales.container))}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(q.sales.discount))}</td>
                  <td className="px-4 text-right font-semibold tabular-nums">{inr(Math.round(q.income))}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
      {entries.length > 0 && <p className="mt-3 text-xs text-slate-500">Cash collected at the counter: {inr(Math.round(entries.reduce((t, e) => t + cashIn(e), 0)))}.</p>}
    </>
  )
}

/* ---------- Expenses ---------- */

export function ExpensesTab({ d, scope }: { d: Data; scope: Scope }) {
  const p = profitLoss(d, scope)
  const total = p.food + p.running + p.staff
  const sections = [
    { title: 'Cost of food (ingredients bought)', items: p.purchasesByLedger, sum: p.food },
    { title: 'Running costs', items: p.expensesByLedger, sum: p.running },
    { title: 'Staff', items: p.salariesByLedger, sum: p.staff },
  ]
  const max = Math.max(1, ...sections.flatMap((s) => s.items.map((i) => i.v)))
  const outlets = scope.branch ? [] : byBranch(d, scope).map(({ b, p: q }) => ({ b, food: q.food, run: q.running, staff: q.staff, all: q.food + q.running + q.staff, sold: q.sales.food })).filter((x) => x.all).sort((a, b) => b.all - a.all)
  const csv = () => downloadCsv(`BTI-Expenses-${scope.month || 'all'}.csv`, [['Section', 'Ledger', 'Amount'], ...sections.flatMap((s) => s.items.map((i) => [s.title, i.k, i.v])), ['', 'Total expenses', total]])

  return (
    <>
      <Summary points={[
        <>Total expenses were <Big>{money(total)}</Big>{p.sales.food ? <>, or <Big>{per100(total, p.sales.food)}</Big> of every ₹100 of food sold</> : null}.</>,
        <>Ingredients <Big>{money(p.food)}</Big> · running costs <Big>{money(p.running)}</Big> · staff <Big>{money(p.staff)}</Big>.</>,
        <>GST paid on bills is not an expense: it is claimed back as input credit.</>,
      ]} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Total expenses" value={money(total)} tone="red" />
        <Tile label="Ingredients" value={money(p.food)} note={p.sales.food ? `${per100(p.food, p.sales.food)} of ₹100 sold` : undefined} />
        <Tile label="Running costs" value={money(p.running)} note={p.sales.food ? `${per100(p.running, p.sales.food)} of ₹100 sold` : undefined} />
        <Tile label="Staff" value={money(p.staff)} note={p.sales.food ? `${per100(p.staff, p.sales.food)} of ₹100 sold` : undefined} />
      </div>
      <Card title="Expenses statement" className="mt-4" pad={false} actions={<button className="text-xs font-medium text-[#7a2228] hover:underline" onClick={csv}>Download</button>}>
        {sections.map((s) => (
          <div key={s.title} className="border-b border-slate-100">
            <p className="flex justify-between px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-[#7a2228]"><span>{s.title}</span><span className="tabular-nums">{money(s.sum, false)}</span></p>
            {s.items.map((i) => (
              <div key={i.k} className="px-4 py-2 pl-8">
                <div className="mb-1 flex justify-between text-sm"><span>{i.k}</span><b className="tabular-nums">{money(i.v, false)}</b></div>
                <ShareBar value={i.v} max={max} />
              </div>
            ))}
            {!s.items.length && <p className="px-8 pb-3 text-sm text-slate-400">None in this period.</p>}
          </div>
        ))}
        <p className="flex justify-between bg-[#fdf8ee] px-4 py-3 font-bold"><span>Total expenses</span><span className="tabular-nums">{money(total, false)}</span></p>
      </Card>
      {outlets.length > 0 && (
        <Card title="Expenses by outlet" className="mt-4" pad={false}>
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Outlet', 'Ingredients', 'Running costs', 'Staff', 'Total', 'Of ₹100 sold'].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {outlets.map((o) => (
                <tr key={o.b.id}><td className="px-4 py-2.5 font-medium">{o.b.name}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(o.food))}</td><td className="px-4 text-right tabular-nums">{inr(Math.round(o.run))}</td>
                  <td className="px-4 text-right tabular-nums">{inr(Math.round(o.staff))}</td><td className="px-4 text-right font-semibold tabular-nums">{inr(Math.round(o.all))}</td><td className="px-4 text-right tabular-nums">{o.sold ? per100(o.all, o.sold) : '—'}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
    </>
  )
}

/* ---------- Trial Balance and Balance Sheet (from Account Books) ---------- */

/** Ledger balances up to the end of the chosen month, for the chosen branch. */
function balances(d: Data, scope: Scope) {
  const until = lastDay(scope.month)
  const vouchers = buildVouchers(d.entries, d.manual, d.custom).filter((v) => v.date <= until && (!scope.branch || v.branch === scope.branch))
  const rows = ledgerTotals(vouchers).map((l) => ({ ...l, bal: Math.round((l.dr - l.cr) * 100) / 100 }))
  // Opening balances: ledgers created with one, and each branch's cash in hand on its first Imprest Book day.
  const open = new Map<string, number>()
  if (!scope.branch) for (const c of d.custom) if (c.opening) open.set(ledgerKey(c.name), c.opening)
  for (const b of BRANCHES) {
    if (scope.branch && scope.branch !== b.id) continue
    const first = d.entries.filter((e) => e.branch === b.id && e.date <= until).sort((a, z) => a.date.localeCompare(z.date))[0]
    if (first?.opening) open.set(ledgerKey(imprestLedger(b.id)), (open.get(ledgerKey(imprestLedger(b.id))) ?? 0) + first.opening)
  }
  for (const r of rows) { const o = open.get(ledgerKey(r.ledger)); if (o) { r.bal = Math.round((r.bal + o) * 100) / 100; open.delete(ledgerKey(r.ledger)) } }
  const cashGroup = (name: string): GroupId => (/imprest/i.test(name) ? 'cash' : (d.custom.find((c) => ledgerKey(c.name) === name)?.group ?? 'liabilities'))
  for (const [k, o] of open) rows.push({ ledger: d.custom.find((c) => ledgerKey(c.name) === k)?.name ?? BRANCHES.map((b) => imprestLedger(b.id)).find((n) => ledgerKey(n) === k) ?? k, group: cashGroup(k), dr: 0, cr: 0, bal: o })
  const openingTotal = [...d.custom].reduce((t, c) => t + (scope.branch ? 0 : c.opening), 0) +
    BRANCHES.filter((b) => !scope.branch || b.id === scope.branch).reduce((t, b) => t + (d.entries.filter((e) => e.branch === b.id && e.date <= until).sort((a, z) => a.date.localeCompare(z.date))[0]?.opening ?? 0), 0)
  return { rows: rows.filter((r) => Math.abs(r.bal) >= 0.005), openingTotal: Math.round(openingTotal * 100) / 100, until }
}

export function TrialBalance({ d, scope }: { d: Data; scope: Scope }) {
  const { rows, openingTotal, until } = balances(d, scope)
  const order = Object.keys(GROUPS) as GroupId[]
  const groups = order.map((g) => ({ g, items: rows.filter((r) => r.group === g).sort((a, b) => a.ledger.localeCompare(b.ledger)) })).filter((x) => x.items.length)
  const dr = rows.reduce((t, r) => t + Math.max(0, r.bal), 0)
  const cr = rows.reduce((t, r) => t + Math.max(0, -r.bal), 0)
  const diff = Math.round((dr - cr) * 100) / 100
  const csv = () => downloadCsv(`BTI-Trial-Balance-${until}.csv`, [['Group', 'Ledger', 'Debit', 'Credit'], ...groups.flatMap((x) => x.items.map((r) => [GROUPS[x.g], r.ledger, r.bal > 0 ? r.bal : '', r.bal < 0 ? -r.bal : '']))])

  return (
    <Card title={`Trial Balance · as on ${until === '9999-12-31' ? 'today' : new Date(until + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${scope.branch ? ` · ${branchName(scope.branch)}` : ''}`} pad={false}
      actions={<button className="text-xs font-medium text-[#7a2228] hover:underline" onClick={csv}>Download</button>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-300 text-xs font-semibold text-slate-600"><tr><th className="px-4 py-2 text-left">Particulars</th><th className="px-4 text-right">Debit</th><th className="px-4 text-right">Credit</th></tr></thead>
          <tbody>
            {groups.map(({ g, items }) => {
              const gd = items.reduce((t, r) => t + Math.max(0, r.bal), 0)
              const gc = items.reduce((t, r) => t + Math.max(0, -r.bal), 0)
              return (
                <Fragment key={g}>
                  <tr className="bg-slate-50 font-semibold"><td className="px-4 py-1.5">{GROUPS[g]}</td><td className="px-4 text-right tabular-nums">{amt(gd)}</td><td className="px-4 text-right tabular-nums">{amt(gc)}</td></tr>
                  {items.map((r) => <tr key={r.ledger}><td className="px-4 py-1 pl-8 text-slate-700">{r.ledger}</td><td className="px-4 text-right tabular-nums">{r.bal > 0 ? amt(r.bal) : ''}</td><td className="px-4 text-right tabular-nums">{r.bal < 0 ? amt(r.bal) : ''}</td></tr>)}
                </Fragment>
              )
            })}
            {Math.abs(diff) >= 0.01 && (
              <tr className="text-amber-700"><td className="px-4 py-1.5 italic">Difference in opening balances</td><td className="px-4 text-right tabular-nums">{diff < 0 ? amt(diff) : ''}</td><td className="px-4 text-right tabular-nums">{diff > 0 ? amt(diff) : ''}</td></tr>
            )}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-400 font-bold"><td className="px-4 py-2">Grand Total</td><td className="px-4 text-right tabular-nums">{amt(Math.max(dr, cr))}</td><td className="px-4 text-right tabular-nums">{amt(Math.max(dr, cr))}</td></tr></tfoot>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        Every ledger's closing balance from Account Books. Debits and credits of all vouchers always match; any difference comes only from opening balances
        (cash in hand on the first Imprest Book day{openingTotal ? `, ${inr(openingTotal)} here` : ''}), shown as "Difference in opening balances", the same way Tally does.
      </p>
    </Card>
  )
}

export function BalanceSheet({ d, scope }: { d: Data; scope: Scope }) {
  const { rows, until } = balances(d, scope)
  // Profit so far = income − expenses in the ledgers. Salary paid from branch cash (debited to Salary Payable) is counted
  // as a staff cost, the same as in Profit & Loss.
  const pnlRows = rows.filter((r) => PNL_GROUPS.includes(r.group))
  const salaryPaid = rows.filter((r) => r.group === 'liabilities' && r.bal > 0)
  const profit = -pnlRows.reduce((t, r) => t + r.bal, 0) - salaryPaid.reduce((t, r) => t + r.bal, 0)
  const side = (pick: (r: (typeof rows)[number]) => boolean, sign: 1 | -1) => rows.filter((r) => !PNL_GROUPS.includes(r.group) && pick(r) && r.bal * sign > 0)
  const assetRows = side((r) => !(r.group === 'liabilities' && r.bal > 0), 1)
  const liabRows = side(() => true, -1)
  const groupSum = (list: typeof rows, sign: number) => (Object.keys(GROUPS) as GroupId[]).map((g) => ({ g, items: list.filter((r) => r.group === g), v: list.filter((r) => r.group === g).reduce((t, r) => t + r.bal * sign, 0) })).filter((x) => x.items.length)
  const assets = groupSum(assetRows, 1)
  const liabs = groupSum(liabRows, -1)
  const totA = assets.reduce((t, x) => t + x.v, 0)
  const totL = liabs.reduce((t, x) => t + x.v, 0) + profit
  const diff = Math.round((totA - totL) * 100) / 100

  const Side = ({ title, list, extra }: { title: string; list: typeof assets; extra?: React.ReactNode }) => (
    <Card title={title} pad={false}>
      <table className="w-full text-sm"><tbody>
        {list.map(({ g, items, v }) => (
          <Fragment key={g}>
            <tr className="font-semibold"><td className="px-4 pt-2.5">{GROUPS[g]}</td><td className="px-4 pt-2.5 text-right tabular-nums">{amt(v)}</td></tr>
            {items.map((r) => <tr key={r.ledger} className="text-slate-600"><td className="px-4 py-0.5 pl-8">{r.ledger}</td><td className="px-4 text-right tabular-nums">{amt(r.bal)}</td></tr>)}
          </Fragment>
        ))}
        {extra}
        {!list.length && !extra && <tr><td className="px-4 py-3 text-slate-400">Nothing yet.</td></tr>}
      </tbody></table>
    </Card>
  )

  return (
    <>
      <Summary points={[
        <>As on {until === '9999-12-31' ? 'today' : new Date(until + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}, BTI{scope.branch ? ` (${branchName(scope.branch)})` : ''} has <Big>{money(totA)}</Big> in assets (cash, money due from Swiggy/Zomato and others).</>,
        <>It owes <Big>{money(totL - profit)}</Big> (vendors, GST and other dues), and the profit kept so far is <Big>{money(profit)}</Big>.</>,
      ]} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Side title="Liabilities (what we owe)" list={liabs} extra={<>
          <tr className="font-semibold"><td className="px-4 pt-2.5">Profit &amp; Loss A/c</td><td className={`px-4 pt-2.5 text-right tabular-nums ${profit < 0 ? 'text-rose-600' : ''}`}>{profit < 0 ? '−' : ''}{amt(profit)}</td></tr>
          {Math.abs(diff) >= 0.01 && <tr className="text-amber-700"><td className="px-4 pt-2.5 italic">Difference in opening balances</td><td className="px-4 pt-2.5 text-right tabular-nums">{amt(diff)}</td></tr>}
        </>} />
        <Side title="Assets (what we have)" list={assets} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <p className="flex justify-between rounded-xl bg-[#fdf8ee] px-4 py-3 font-bold"><span>Total</span><span className="tabular-nums">{amt(totL + (Math.abs(diff) >= 0.01 ? diff : 0))}</span></p>
        <p className="flex justify-between rounded-xl bg-[#fdf8ee] px-4 py-3 font-bold"><span>Total</span><span className="tabular-nums">{amt(totA)}</span></p>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Built from Account Books. Cash in hand includes each branch's opening cash from its first Imprest Book day; the matching opening entry (capital) isn't recorded yet,
        so it shows as "Difference in opening balances". Salary paid from branch cash is counted as a staff cost in the profit, as in Profit &amp; Loss.
      </p>
    </>
  )
}
