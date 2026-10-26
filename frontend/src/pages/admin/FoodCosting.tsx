import { Fragment, useEffect, useMemo, useState } from 'react'
import { BILLS, BRANCHES, RECIPES, branchName } from '../../data/mock'

// Tally-like number format: 1,23,456.00
const n2 = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type View = 'costing' | 'purchase'

// Tally-style view, shown inside the Food Cost Report.
export default function TallyFoodCosting() {
  const [view, setView] = useState<View>('costing')
  const [branch, setBranch] = useState('ALL')
  const [detailed, setDetailed] = useState(true)
  const [cursor, setCursor] = useState(0)

  // Branch factor is a stand-in until real per-branch sales are wired up.
  const factor = branch === 'ALL' ? 1 : 0.2

  const groups = useMemo(() => {
    const g: Record<string, typeof RECIPES> = {}
    RECIPES.forEach((r) => (g[r.category] ??= []).push(r))
    return Object.entries(g)
  }, [])

  const purchaseRows = useMemo(() => {
    const verified = BILLS.filter((b) => b.status === 'verified' && (branch === 'ALL' || b.branch === branch))
    const sum = (b: (typeof BILLS)[number]) => b.lines.reduce((s, l) => s + l.qty * l.rate * (1 + l.gst / 100), 0)
    return [
      { group: 'Credited Bills (Sundry Creditors)', rows: verified.filter((b) => b.type === 'credit').map((b) => ({ name: `${b.vendor} · ${b.id}`, date: b.date, amt: sum(b) })) },
      { group: 'Other Purchase Expenses', rows: verified.filter((b) => b.type === 'other').map((b) => ({ name: `${b.vendor} · ${b.id}`, date: b.date, amt: sum(b) })) },
    ]
  }, [branch])

  const rowCount = view === 'costing' ? RECIPES.length : purchaseRows.reduce((s, g) => s + g.rows.length, 0)

  // Keyboard shortcuts, Tally style.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rowCount - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      if (e.key === 'F5') { e.preventDefault(); setView((v) => (v === 'costing' ? 'purchase' : 'costing')); setCursor(0) }
      if (e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setDetailed((d) => !d) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rowCount])

  let idx = -1
  const tot = RECIPES.reduce(
    (a, r) => ({ sale: a.sale + r.price * r.sold * factor, cost: a.cost + r.cost * r.sold * factor, qty: a.qty + Math.round(r.sold * factor) }),
    { sale: 0, cost: 0, qty: 0 },
  )

  const keys: [string, string, () => void][] = [
    ['F2', 'Period', () => {}],
    ['F4', 'Branch', () => document.getElementById('tally-branch')?.focus()],
    ['F5', view === 'costing' ? 'Purchase Reg.' : 'Food Costing', () => { setView(view === 'costing' ? 'purchase' : 'costing'); setCursor(0) }],
    ['Alt+F', detailed ? 'Condensed' : 'Detailed', () => setDetailed((d) => !d)],
  ]

  return (
    <>
    <div className="tally flex min-h-[600px] overflow-hidden rounded-md border border-[#0f4a5c] bg-[#fdfdf5] text-[13px] text-black shadow">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title bar */}
        <div className="flex items-center justify-between bg-[#0f4a5c] px-3 py-1 text-white">
          <span className="font-bold">{view === 'costing' ? 'Food Costing & Gross Margin' : 'Purchase Register'}</span>
          <span>Prisim Restaurants</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0f4a5c]/40 bg-[#e6eff1] px-3 py-1">
          <span>
            Branch:{' '}
            <select id="tally-branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="bg-transparent font-bold outline-none focus:bg-yellow-200">
              <option value="ALL">All Branches</option>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </span>
          <span className="font-bold">1-Oct-26 to 26-Oct-26</span>
        </div>

        <div className="flex-1 overflow-x-auto">
          {view === 'costing' ? (
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="px-3 py-1 text-left font-bold">Particulars</th>
                  <th className="px-3 text-right font-bold">Qty Sold</th>
                  <th className="px-3 text-right font-bold">Sale Value</th>
                  <th className="px-3 text-right font-bold">Food Cost</th>
                  <th className="px-3 text-right font-bold">Gross Profit</th>
                  <th className="px-3 text-right font-bold">Cost %</th>
                  <th className="px-3 text-right font-bold">GP %</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([cat, rows]) => {
                  const g = rows.reduce((a, r) => ({ sale: a.sale + r.price * r.sold * factor, cost: a.cost + r.cost * r.sold * factor, qty: a.qty + Math.round(r.sold * factor) }), { sale: 0, cost: 0, qty: 0 })
                  return (
                    <Fragment key={cat}>
                      <tr className="font-bold">
                        <td className="px-3 pt-2">{cat}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : g.qty}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : n2(g.sale)}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : n2(g.cost)}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : n2(g.sale - g.cost)}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : ((g.cost / g.sale) * 100).toFixed(2)}</td>
                        <td className="px-3 pt-2 text-right">{detailed ? '' : (((g.sale - g.cost) / g.sale) * 100).toFixed(2)}</td>
                      </tr>
                      {rows.map((r) => {
                        idx++
                        const i = idx
                        if (!detailed) return null
                        const sale = r.price * r.sold * factor, cost = r.cost * r.sold * factor
                        const pct = (r.cost / r.price) * 100
                        return (
                          <tr key={r.dish} onClick={() => setCursor(i)} className={`cursor-default ${cursor === i ? 'bg-[#fde68a]' : ''}`}>
                            <td className="py-0.5 pl-8 pr-3 italic">{r.dish}</td>
                            <td className="px-3 text-right">{Math.round(r.sold * factor)}</td>
                            <td className="px-3 text-right">{n2(sale)}</td>
                            <td className="px-3 text-right">{n2(cost)}</td>
                            <td className="px-3 text-right">{n2(sale - cost)}</td>
                            <td className={`px-3 text-right ${pct > 35 ? 'font-bold text-red-700' : ''}`}>{pct.toFixed(2)}</td>
                            <td className="px-3 text-right">{(100 - pct).toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-y border-black font-bold">
                  <td className="px-3 py-1">Grand Total</td>
                  <td className="px-3 text-right">{tot.qty}</td>
                  <td className="px-3 text-right">{n2(tot.sale)}</td>
                  <td className="px-3 text-right">{n2(tot.cost)}</td>
                  <td className="px-3 text-right">{n2(tot.sale - tot.cost)}</td>
                  <td className="px-3 text-right">{((tot.cost / tot.sale) * 100).toFixed(2)}</td>
                  <td className="px-3 text-right">{(((tot.sale - tot.cost) / tot.sale) * 100).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="px-3 py-1 text-left font-bold">Particulars</th>
                  <th className="px-3 text-left font-bold">Date</th>
                  <th className="px-3 text-right font-bold">Debit</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRows.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="font-bold">
                      <td className="px-3 pt-2">{g.group}</td>
                      <td />
                      <td className="px-3 pt-2 text-right">{n2(g.rows.reduce((s, r) => s + r.amt, 0))}</td>
                    </tr>
                    {detailed && g.rows.map((r) => {
                      idx++
                      const i = idx
                      return (
                        <tr key={r.name} onClick={() => setCursor(i)} className={cursor === i ? 'bg-[#fde68a]' : ''}>
                          <td className="py-0.5 pl-8 pr-3 italic">{r.name}</td>
                          <td className="px-3">{r.date}</td>
                          <td className="px-3 text-right">{n2(r.amt)}</td>
                        </tr>
                      )
                    })}
                    {detailed && !g.rows.length && <tr><td className="pl-8 italic text-slate-500">— no entries for {branch === 'ALL' ? 'any branch' : branchName(branch)} —</td></tr>}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-y border-black font-bold">
                  <td className="px-3 py-1">Grand Total</td>
                  <td />
                  <td className="px-3 text-right">{n2(purchaseRows.flatMap((g) => g.rows).reduce((s, r) => s + r.amt, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div className="border-t border-[#0f4a5c]/40 bg-[#e6eff1] px-3 py-1 text-[11px]">
          ↑↓ move · F5 switch report · Alt+F detailed/condensed · Food cost above 35% shown in red
        </div>
      </div>

      {/* Right-hand button bar, like Tally */}
      <aside className="hidden w-40 shrink-0 border-l border-[#0f4a5c] bg-[#d7e6ea] sm:block">
        {keys.map(([k, label, fn]) => (
          <button key={k} onClick={fn} className="flex w-full items-baseline gap-2 border-b border-[#0f4a5c]/20 px-2 py-1.5 text-left hover:bg-[#fde68a]">
            <span className="w-12 font-bold text-[#0f4a5c]">{k}:</span>
            <span>{label}</span>
          </button>
        ))}
      </aside>
    </div>
    </>
  )
}
