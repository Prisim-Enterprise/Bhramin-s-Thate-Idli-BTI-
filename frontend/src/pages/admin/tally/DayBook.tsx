import { useState } from 'react'
import { BRANCHES, branchName } from '../../../data/mock'
import { particulars, voucherAmount, type Voucher } from '../../../data/books'
import { T, amt, tDate } from './ui'
import type { Books } from './useBooks'

/** Day Book: every voucher in a period, in Tally's columns. Enter (or a click) opens a voucher to alter. */
export function DayBook({ books, from: f0, to: t0, onOpen }: { books: Books; from: string; to: string; onOpen: (v: Voucher) => void }) {
  const [from, setFrom] = useState(f0)
  const [to, setTo] = useState(t0)
  const [branch, setBranch] = useState('')
  const [at, setAt] = useState(0)
  const list = books.vouchers.filter((v) => v.date >= from && v.date <= to && (!branch || v.branch === branch))
  // Like Tally: the amount sits under Debit when the first ledger shown is debited.
  const side = (v: Voucher) => {
    const name = v.party ?? particulars(v)
    const p = v.postings.find((x) => x.ledger === name) ?? v.postings[0]
    return p?.cr ? 'cr' : 'dr'
  }
  return (
    <div className="p-3 sm:p-4" onKeyDown={(e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, list.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
      if (e.key === 'Enter' && list[at]) onOpen(list[at])
    }} tabIndex={-1}>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
        <label>From<input aria-label="Day Book from" type="date" className={T.input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input aria-label="Day Book to" type="date" className={T.input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Cost Centre<select aria-label="Day Book outlet" className={T.input} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All outlets</option>{BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
        <span className="ml-auto text-xs text-[#5a6b7c]">{tDate(from)} to {tDate(to)} · {list.length} voucher(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border border-[#c5d1de] bg-white text-sm">
          <thead className={T.title}><tr>
            <th className="px-2 py-1 text-left">Date</th><th className="px-2 text-left">Particulars</th><th className="px-2 text-left">Vch Type</th>
            <th className="px-2 text-right">Vch No.</th><th className="px-2 text-right">Debit Amount</th><th className="px-2 text-right">Credit Amount</th>
          </tr></thead>
          <tbody>
            {list.map((v, i) => {
              const a = voucherAmount(v)
              return (
                <tr key={v.id} onClick={() => onOpen(v)} onMouseEnter={() => setAt(i)} className={`cursor-pointer border-t border-[#e3e9ef] ${i === at ? T.sel : ''}`}>
                  <td className="px-2 py-1 tabular-nums">{tDate(v.date)}</td>
                  <td className="px-2"><span className="font-medium">{v.cancelled ? '(cancelled)' : v.party ?? particulars(v)}</span> <span className="text-xs text-[#5a6b7c]">· {branchName(v.branch)}</span></td>
                  <td className="px-2">{v.type}</td><td className="px-2 text-right tabular-nums">{v.typeNo}</td>
                  <td className="px-2 text-right tabular-nums">{side(v) === 'dr' ? amt(a) : ''}</td>
                  <td className="px-2 text-right tabular-nums">{side(v) === 'cr' ? amt(a) : ''}</td>
                </tr>
              )
            })}
            {!list.length && <tr><td colSpan={6} className="px-2 py-8 text-center text-[#5a6b7c]">No vouchers in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#5a6b7c]">Up/Down to move, Enter to alter. Imprest Book days open their day entry; posted bills open in the OCR Bill Inbox.</p>
    </div>
  )
}
