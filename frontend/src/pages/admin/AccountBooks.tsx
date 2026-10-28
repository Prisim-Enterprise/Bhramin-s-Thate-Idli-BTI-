import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BookText, CheckCircle2, ChevronDown, ChevronRight, FileUp, Paperclip, Plus, Search, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, inputCls } from '../../components/ui'
import { AddLedgerDialog, UploadReceiptDialog } from '../../components/LedgerDialogs'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { BRANCHES, branchName } from '../../data/mock'
import { KNOWN_LEDGERS, cashIn, closing, fmtDateTime, niceDate, useEntries, type DayEntry } from '../../data/entries'
import { deleteManualVoucher, groupOf, openReceipt, useCustomLedgers, useManualVouchers, type CustomLedger } from '../../data/ledgerStore'
import {
  GROUPS, VCH_TYPES, amt, buildVouchers, drCr, imprestLedger, ledgerTotals, particulars, voucherAmount,
  type GroupId, type VchType, type Voucher,
} from '../../data/books'

type BookId = 'cash' | 'ledger' | 'groupSummary' | 'groupVouchers' | VchType | 'clarify'

// Same menu as Tally's Account Books screen.
const MENU: { title: string; items: { id: BookId; label: string }[] }[] = [
  { title: 'Summary', items: [
    { id: 'cash', label: 'Cash/Bank Book(s)' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'groupSummary', label: 'Group Summary' },
    { id: 'groupVouchers', label: 'Group Vouchers' },
  ] },
  { title: 'Registers', items: VCH_TYPES.map((t) => ({ id: t, label: `${t} Register` })) },
  { title: 'Checks', items: [{ id: 'clarify', label: 'Voucher Clarification' }] },
]
const LABEL = Object.fromEntries(MENU.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<BookId, string>

export default function AccountBooks() {
  const all = useEntries()
  const [branch, setBranch] = useState('ALL')
  const [book, setBook] = useState<BookId>('cash')
  const [ledger, setLedger] = useState('')
  const [group, setGroup] = useState<GroupId>('indirectExp')

  const manualAll = useManualVouchers()
  const custom = useCustomLedgers()
  const entries = useMemo(() => (branch === 'ALL' ? all : all.filter((e) => e.branch === branch)), [all, branch])
  const vouchers = useMemo(
    () => buildVouchers(entries, branch === 'ALL' ? manualAll : manualAll.filter((m) => m.branch === branch), custom),
    [entries, manualAll, custom, branch],
  )
  const allVouchers = useMemo(() => buildVouchers(all, manualAll, custom), [all, manualAll, custom])
  const counts = useMemo(() => Object.fromEntries(BRANCHES.map((b) => [b.id, all.filter((e) => e.branch === b.id).length + manualAll.filter((m) => m.branch === b.id).length])), [all, manualAll])

  const openLedger = (name: string) => { setLedger(name); setBook('ledger') }
  const scope = branch === 'ALL' ? 'All branches' : branchName(branch)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">Account Books</h1>
        <p className="mt-1 text-sm text-slate-500">Cash book, ledgers and registers for every branch, built from the day entries.</p>
      </div>

      {/* Branch picker */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 pb-1">
          {[{ id: 'ALL', name: 'All branches', n: all.length + manualAll.length }, ...BRANCHES.map((b) => ({ id: b.id, name: b.name, n: counts[b.id] }))].map((b) => (
            <button key={b.id} onClick={() => setBranch(b.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${branch === b.id ? 'bg-[#7a2228] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-[#fbf3e4]'}`}>
              {b.name}{b.n ? <span className={`ml-1.5 text-xs ${branch === b.id ? 'text-white/80' : 'text-slate-400'}`}>{b.n}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Tally-style menu */}
        <nav aria-label="Account books" className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="bg-[#1f3a8a] px-4 py-2 text-sm font-semibold text-white">Account Books</p>
          <div className="grid grid-cols-2 gap-x-2 p-2 sm:grid-cols-3 lg:block">
            {MENU.map((g) => (
              <div key={g.title} className="col-span-full lg:mb-2">
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:block">
                  {g.items.map((i) => (
                    <button key={i.id} onClick={() => setBook(i.id)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${book === i.id ? 'bg-[#d9a441] font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}>
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {!all.length && !manualAll.length && book !== 'ledger' ? (
            <Card>
              <EmptyState icon={BookText} title="No books yet"
                text={<>Books fill in from day entries. Add one from <Link to="/admin/accounting" className="font-medium text-[#7a2228] underline">Accounting</Link> with <b>Enter manually</b> or <b>Upload PDF</b>.</>} />
            </Card>
          ) : (
            <Card title={`${LABEL[book]} · ${scope}`} pad={false}>
              {book === 'cash' && <CashBook branch={branch} entries={all} vouchers={vouchers} onBranch={setBranch} />}
              {book === 'ledger' && <LedgerBook vouchers={vouchers} allVouchers={allVouchers} custom={custom} branch={branch} ledger={ledger} setLedger={setLedger} />}
              {book === 'groupSummary' && <GroupSummary vouchers={vouchers} onLedger={openLedger} />}
              {book === 'groupVouchers' && <GroupVouchers vouchers={vouchers} group={group} setGroup={setGroup} />}
              {VCH_TYPES.includes(book as VchType) && <Register type={book as VchType} vouchers={vouchers} showBranch={branch === 'ALL'} />}
              {book === 'clarify' && <Clarify entries={entries} all={all} />}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- shared table bits ---------- */

function T({ head, children, right = [] }: { head: string[]; children: ReactNode; right?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className={`whitespace-nowrap px-4 py-2.5 font-medium ${right.includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  )
}
const R = 'text-right tabular-nums'
const Empty = ({ text }: { text: ReactNode }) => <p className="px-4 py-10 text-center text-sm text-slate-500">{text}</p>

/* ---------- Cash/Bank Book: the branch imprest book ---------- */

// Opening cash for a branch: from its earliest day entry.
const openingOf = (branch: string, entries: DayEntry[]) =>
  [...entries].filter((e) => e.branch === branch).sort((a, b) => a.date.localeCompare(b.date))[0]?.opening ?? 0

const otherSide = (v: Voucher, ledger: string) =>
  v.postings.length > 2 ? '(as per details)' : v.postings.find((x) => x.ledger !== ledger)?.ledger ?? ''

function CashBook({ branch, entries, vouchers, onBranch }: { branch: string; entries: DayEntry[]; vouchers: Voucher[]; onBranch: (b: string) => void }) {
  const moves = (b: string) => vouchers.flatMap((v) => v.postings.filter((p) => p.ledger === imprestLedger(b)).map((p) => ({ v, p })))

  if (branch === 'ALL') {
    return (
      <T head={['Branch', 'Vouchers', 'Opening', 'Cash in (Dr)', 'Paid out (Cr)', 'Closing']} right={[1, 2, 3, 4, 5]}>
        {BRANCHES.map((b) => {
          const m = moves(b.id)
          const open = openingOf(b.id, entries)
          const d = m.reduce((s, x) => s + x.p.dr, 0)
          const c = m.reduce((s, x) => s + x.p.cr, 0)
          return (
            <tr key={b.id} onClick={() => onBranch(b.id)} className="cursor-pointer hover:bg-[#fbf3e4]">
              <td className="font-medium text-slate-900">{imprestLedger(b.id)}</td>
              <td className={R}>{m.length || '—'}</td>
              <td className={R}>{m.length ? amt(open) : ''}</td>
              <td className={R}>{amt(d)}</td><td className={R}>{amt(c)}</td>
              <td className={R + ' font-medium'}>{m.length ? drCr(open + d - c) : ''}</td>
            </tr>
          )
        })}
      </T>
    )
  }

  const m = moves(branch)
  if (!m.length) return <Empty text={`No cash movements for ${branchName(branch)} yet.`} />
  let bal = openingOf(branch, entries)
  return (
    <T head={['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit', 'Balance']} right={[3, 4, 5, 6]}>
      <tr className="bg-slate-50/60">
        <td>{niceDate(m[0].v.date)}</td><td className="font-semibold">Opening Balance</td><td /><td /><td className={R}>{amt(bal)}</td><td /><td className={R}>{drCr(bal)}</td>
      </tr>
      {m.map(({ v, p }) => {
        bal += p.dr - p.cr
        return (
          <tr key={v.id}>
            <td>{niceDate(v.date)}</td><td>{otherSide(v, p.ledger)}</td><td>{v.type}</td><td className={R}>{v.no}</td>
            <td className={R}>{amt(p.dr)}</td><td className={R}>{amt(p.cr)}</td><td className={R}>{drCr(bal)}</td>
          </tr>
        )
      })}
      <tr className="bg-slate-50 font-semibold">
        <td colSpan={4}>Closing Balance</td>
        <td className={R}>{amt(m.reduce((s, x) => s + x.p.dr, 0))}</td><td className={R}>{amt(m.reduce((s, x) => s + x.p.cr, 0))}</td><td className={R}>{drCr(bal)}</td>
      </tr>
    </T>
  )
}

/* ---------- Ledger: search, add, upload receipt ---------- */

function LedgerBook({ vouchers, allVouchers, custom, branch, ledger, setLedger }: {
  vouchers: Voucher[]; allVouchers: Voucher[]; custom: CustomLedger[]; branch: string; ledger: string; setLedger: (l: string) => void
}) {
  const { can } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Every ledger: used in any branch, created by hand, or a common one from the Imprest Book.
  const names = useMemo(() => {
    const set = new Map<string, string>()
    for (const n of [...ledgerTotals(allVouchers).map((l) => l.ledger), ...custom.map((c) => c.name), ...KNOWN_LEDGERS.map((k) => k.name)]) set.set(n.toLowerCase(), n)
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [allVouchers, custom])
  const shown = names.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()))
  const current = names.includes(ledger) ? ledger : ''

  const rows = vouchers.flatMap((v) => v.postings.filter((p) => p.ledger === current).map((p) => ({ v, p })))
  const opening = custom.find((c) => c.name === current)?.opening ?? 0
  let bal = opening

  return (
    <div className="grid lg:grid-cols-[260px_1fr]">
      {/* Ledger list with search */}
      <div className="border-b border-slate-100 p-3 lg:border-b-0 lg:border-r">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Search ledger" aria-label="Search ledger" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {can('accounts', 'create') && (
          <Button variant="secondary" icon={Plus} className="mt-2 w-full justify-center" onClick={() => setAdding(true)}>Add ledger</Button>
        )}
        <ul className="mt-2 max-h-72 overflow-y-auto lg:max-h-[520px]">
          {shown.map((n) => (
            <li key={n}>
              <button onClick={() => { setLedger(n); setNotice(null) }}
                className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${n === current ? 'bg-[#d9a441] font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'}`}>
                {n}
              </button>
            </li>
          ))}
          {!shown.length && (
            <li className="px-2 py-3 text-sm text-slate-500">
              No ledger matches &ldquo;{q}&rdquo;.{' '}
              {can('accounts', 'create') && <button className="font-medium text-[#7a2228] underline" onClick={() => setAdding(true)}>Add it</button>}
            </li>
          )}
        </ul>
      </div>

      {/* Selected ledger */}
      <div className="min-w-0">
        {!current ? (
          <Empty text={<>Search and select a ledger on the left, or <b>Add ledger</b> to create one.</>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <p className="text-lg font-semibold text-slate-900">{current}</p>
                <p className="text-xs text-slate-500">Under {GROUPS[groupOf(current, custom)]} · Closing {drCr(opening + rows.reduce((s, r) => s + r.p.dr - r.p.cr, 0))}</p>
              </div>
              {can('accounts', 'create') && <Button icon={FileUp} onClick={() => setUploading(true)}>Upload receipt</Button>}
            </div>
            {notice && <p className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 size={16} />{notice}</p>}
            {!rows.length && !opening ? (
              <Empty text={<>No entries in this ledger yet. Use <b>Upload receipt</b> to post today&rsquo;s payment.</>} />
            ) : (
              <T head={['Date', 'Branch', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit', 'Balance', 'Added by', '']} right={[4, 5, 6, 7]}>
                {opening !== 0 && (
                  <tr className="bg-slate-50/60">
                    <td /><td /><td className="font-semibold">Opening Balance</td><td /><td />
                    <td className={R}>{opening > 0 ? amt(opening) : ''}</td><td className={R}>{opening < 0 ? amt(-opening) : ''}</td><td className={R}>{drCr(opening)}</td><td /><td />
                  </tr>
                )}
                {rows.map(({ v, p }) => {
                  bal += p.dr - p.cr
                  return (
                    <tr key={v.id + p.ledger}>
                      <td>{niceDate(v.date)}</td><td>{branchName(v.branch)}</td>
                      <td>{otherSide(v, current)}{v.narration && <span className="block text-xs text-slate-400">{v.narration}</span>}</td>
                      <td>{v.type}</td><td className={R}>{v.no}</td>
                      <td className={R}>{amt(p.dr)}</td><td className={R}>{amt(p.cr)}</td><td className={R}>{drCr(bal)}</td>
                      <td className="text-xs"><span className="block text-slate-700">{v.addedBy ?? '—'}</span><span className="text-slate-400">{fmtDateTime(v.addedAt)}</span></td>
                      <td className="text-right">
                        {v.receipt && (
                          <button title={v.receipt.dataUrl ? 'View receipt' : `${v.receipt.name} (not stored)`} disabled={!v.receipt.dataUrl}
                            onClick={() => v.receipt && openReceipt(v.receipt)} className="mr-2 align-middle text-slate-500 hover:text-[#7a2228] disabled:opacity-40">
                            <Paperclip size={16} />
                          </button>
                        )}
                        {v.manualId && can('accounts', 'delete') && (
                          <button title="Delete voucher" onClick={() => { if (confirm(`Delete ${v.type} voucher ${v.no}?`)) deleteManualVoucher(v.manualId!) }}
                            className="align-middle text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={5}>Closing Balance</td>
                  <td className={R}>{amt(rows.reduce((s, r) => s + r.p.dr, 0))}</td><td className={R}>{amt(rows.reduce((s, r) => s + r.p.cr, 0))}</td><td className={R}>{drCr(bal)}</td><td /><td />
                </tr>
              </T>
            )}
          </>
        )}
      </div>

      {adding && (
        <AddLedgerDialog existing={names} by={by} onClose={() => setAdding(false)}
          onAdded={(n) => { setAdding(false); setQ(''); setLedger(n); setNotice(`Ledger "${n}" created.`) }} />
      )}
      {uploading && current && (
        <UploadReceiptDialog ledger={current} branch={branch} by={by} onClose={() => setUploading(false)}
          onSaved={(msg) => { setUploading(false); setNotice(msg) }} />
      )}
    </div>
  )
}

/* ---------- Group Summary ---------- */

function GroupSummary({ vouchers, onLedger }: { vouchers: Voucher[]; onLedger: (l: string) => void }) {
  const ledgers = ledgerTotals(vouchers)
  const [open, setOpen] = useState<GroupId | null>(null)
  const groups = (Object.keys(GROUPS) as GroupId[])
    .map((g) => ({ g, list: ledgers.filter((l) => l.group === g) }))
    .filter((x) => x.list.length)
  const net = (l: { dr: number; cr: number }[]) => l.reduce((s, x) => s + x.dr - x.cr, 0)
  return (
    <T head={['Particulars', 'Debit', 'Credit', 'Closing Balance']} right={[1, 2, 3]}>
      {groups.map(({ g, list }) => (
        <Fragment key={g}>
          <tr onClick={() => setOpen(open === g ? null : g)} className="cursor-pointer font-semibold hover:bg-[#fbf3e4]">
            <td><span className="inline-flex items-center gap-1">{open === g ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{GROUPS[g]}</span></td>
            <td className={R}>{amt(list.reduce((s, x) => s + x.dr, 0))}</td><td className={R}>{amt(list.reduce((s, x) => s + x.cr, 0))}</td><td className={R}>{drCr(net(list))}</td>
          </tr>
          {open === g && list.map((l) => (
            <tr key={l.ledger} onClick={() => onLedger(l.ledger)} className="cursor-pointer text-slate-600 hover:bg-slate-50">
              <td className="pl-10 underline decoration-slate-300 underline-offset-2">{l.ledger}</td>
              <td className={R}>{amt(l.dr)}</td><td className={R}>{amt(l.cr)}</td><td className={R}>{drCr(l.dr - l.cr)}</td>
            </tr>
          ))}
        </Fragment>
      ))}
      <tr className="bg-slate-50 font-semibold">
        <td>Grand Total</td><td className={R}>{amt(ledgers.reduce((s, x) => s + x.dr, 0))}</td><td className={R}>{amt(ledgers.reduce((s, x) => s + x.cr, 0))}</td><td />
      </tr>
    </T>
  )
}

/* ---------- Group Vouchers ---------- */

function GroupVouchers({ vouchers, group, setGroup }: { vouchers: Voucher[]; group: GroupId; setGroup: (g: GroupId) => void }) {
  const rows = vouchers.flatMap((v) => v.postings.filter((p) => p.group === group).map((p) => ({ v, p })))
  return (
    <>
      <div className="border-b border-slate-100 p-4">
        <label className="block max-w-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Group</span>
          <select className={inputCls} value={group} onChange={(e) => setGroup(e.target.value as GroupId)}>
            {(Object.keys(GROUPS) as GroupId[]).map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}
          </select>
        </label>
      </div>
      {!rows.length ? <Empty text={`No vouchers in ${GROUPS[group]}.`} /> : (
        <T head={['Date', 'Branch', 'Ledger', 'Vch Type', 'Vch No.', 'Debit', 'Credit']} right={[4, 5, 6]}>
          {rows.map(({ v, p }, i) => (
            <tr key={i}>
              <td>{niceDate(v.date)}</td><td>{branchName(v.branch)}</td><td>{p.ledger}</td><td>{v.type}</td><td className={R}>{v.no}</td>
              <td className={R}>{amt(p.dr)}</td><td className={R}>{amt(p.cr)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td colSpan={5}>Total</td><td className={R}>{amt(rows.reduce((s, r) => s + r.p.dr, 0))}</td><td className={R}>{amt(rows.reduce((s, r) => s + r.p.cr, 0))}</td>
          </tr>
        </T>
      )}
    </>
  )
}

/* ---------- Registers ---------- */

function Register({ type, vouchers, showBranch }: { type: VchType; vouchers: Voucher[]; showBranch: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const list = vouchers.filter((v) => v.type === type)
  if (!list.length) {
    return <Empty text={<>No {type.toLowerCase()} vouchers yet.{type !== 'Journal' && <><br />Day entries are posted as <b>Journal</b> vouchers, the same way they are in Tally.</>}</>} />
  }
  const head = ['Date', ...(showBranch ? ['Branch'] : []), 'Particulars', 'Vch Type', 'Vch No.', 'Debit Amount', 'Credit Amount']
  const n = head.length
  return (
    <T head={head} right={[n - 3, n - 2, n - 1]}>
      {list.map((v) => (
        <Fragment key={v.id}>
          <tr onClick={() => setOpen(open === v.id ? null : v.id)} className="cursor-pointer hover:bg-[#fbf3e4]">
            <td>{niceDate(v.date)}</td>
            {showBranch && <td>{branchName(v.branch)}</td>}
            <td className="font-medium text-slate-900"><span className="inline-flex items-center gap-1">{open === v.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{particulars(v)}</span></td>
            <td>{v.type}</td><td className={R}>{v.no}</td><td className={R}>{amt(voucherAmount(v))}</td><td className={R}>{amt(voucherAmount(v))}</td>
          </tr>
          {open === v.id && v.postings.map((p, i) => (
            <tr key={i} className="bg-slate-50/60 text-slate-600">
              <td />{showBranch && <td />}
              <td className="pl-10">{p.dr ? 'Dr' : 'Cr'} {p.ledger}</td><td colSpan={2} className="text-xs text-slate-400">{GROUPS[p.group]}</td>
              <td className={R}>{amt(p.dr)}</td><td className={R}>{amt(p.cr)}</td>
            </tr>
          ))}
        </Fragment>
      ))}
      <tr className="bg-slate-50 font-semibold">
        <td colSpan={n - 2}>Total ({list.length} vouchers)</td>
        <td className={R}>{amt(list.reduce((s, v) => s + voucherAmount(v), 0))}</td><td className={R}>{amt(list.reduce((s, v) => s + voucherAmount(v), 0))}</td>
      </tr>
    </T>
  )
}

/* ---------- Voucher Clarification: things to look at before trusting the books ---------- */

function Clarify({ entries, all }: { entries: DayEntry[]; all: DayEntry[] }) {
  const known = new Set(KNOWN_LEDGERS.map((l) => l.name.toLowerCase()))
  const issues: { e: DayEntry; text: string }[] = []
  for (const e of entries) {
    if (cashIn(e) < 0) issues.push({ e, text: 'Apps and UPI add up to more than the bill, so cash is negative.' })
    if (all.some((x) => x.id !== e.id && x.branch === e.branch && x.date === e.date)) issues.push({ e, text: 'Two entries for the same branch and day. One may be a duplicate.' })
    for (const p of e.payouts) if (!known.has(p.ledger.toLowerCase())) issues.push({ e, text: `New ledger "${p.ledger}". Check it went to the right report (${p.type}).` })
    if (closing(e) < 0) issues.push({ e, text: 'Closing cash balance is below zero.' })
  }
  if (!issues.length) {
    return <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-emerald-700"><CheckCircle2 size={18} /> Nothing to clarify. All vouchers look fine.</p>
  }
  return (
    <ul className="divide-y divide-slate-100">
      {issues.map(({ e, text }, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span className="flex-1"><b>{branchName(e.branch)} · {niceDate(e.date)}</b> — {text}</span>
          <Link to={`/admin/accounting/entry/${e.id}`} className="shrink-0 font-medium text-[#7a2228] hover:underline">Open</Link>
        </li>
      ))}
    </ul>
  )
}
