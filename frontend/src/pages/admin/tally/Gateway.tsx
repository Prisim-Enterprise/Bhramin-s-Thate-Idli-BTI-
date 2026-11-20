import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../../context/AppContext'
import { useAuth } from '../../../context/AuthContext'
import { BRANCHES } from '../../../data/mock'
import { fyEndOf, fyStartOf, useCompany } from '../../../data/company'
import type { Voucher } from '../../../data/books'
import type { ManualType } from '../../../data/ledgerStore'
import { VOUCHER_KEYS } from '../../../data/tally'
import { ButtonBar, Dialog, Hot, KeysProvider, T, bal, comboOf, tDate, useScreenKeys, weekday, type BarButton, type Handlers } from './ui'
import { useBooks } from './useBooks'
import { CompanyForm } from './CompanyForm'
import { ChartOfAccounts, LedgerForm, LedgerList } from './Masters'
import { VoucherForm, type VoucherPrefill } from './VoucherForm'
import { BankReco } from './BankReco'
import { DayBook } from './DayBook'

type Screen =
  | { s: 'gateway' } | { s: 'company' } | { s: 'create' } | { s: 'alter' } | { s: 'chart' } | { s: 'ledgers' }
  | { s: 'ledger'; name?: string } | { s: 'voucher'; type: ManualType; id?: string; n: number; prefill?: VoucherPrefill } | { s: 'daybook' }
  | { s: 'banking' } | { s: 'brs'; ledger: string }

const today = () => new Date().toLocaleDateString('en-CA')
type MenuItem = { label: string; hot?: string; on?: () => void; note?: string } | { caption: string }

/** A Tally menu: arrow keys move the yellow bar, Enter or the hot key opens. */
function Menu({ title, items, width = 'max-w-sm' }: { title: string; items: MenuItem[]; width?: string }) {
  const live = items.filter((i): i is Extract<MenuItem, { label: string }> => 'label' in i)
  const [at, setAt] = useState(() => Math.max(0, live.findIndex((i) => i.on)))
  const keys: Handlers = {
    arrowdown: () => setAt((a) => { for (let j = a + 1; j < live.length; j++) if (live[j].on) return j; return a }),
    arrowup: () => setAt((a) => { for (let j = a - 1; j >= 0; j--) if (live[j].on) return j; return a }),
    enter: () => live[at]?.on?.(),
  }
  for (const i of live) if (i.hot && i.on) keys[i.hot.toLowerCase()] = i.on
  useScreenKeys(keys)
  return (
    <div className={`mx-auto w-full ${width} border border-[#1f5f99] bg-white shadow`}>
      <p className={`${T.head} px-3 py-1.5 text-center text-sm font-semibold`}>{title}</p>
      <ul className="py-2 text-sm">
        {items.map((it, k) => 'caption' in it
          ? <li key={k} className="px-4 pb-0.5 pt-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a8b9c]">{it.caption}</li>
          : (() => { const idx = live.indexOf(it); return (
            <li key={k}>
              <button type="button" disabled={!it.on} onClick={it.on} onMouseEnter={() => it.on && setAt(idx)}
                className={`block w-full px-4 py-1 text-center ${idx === at && it.on ? T.sel : ''} ${it.on ? '' : 'text-[#a3afbb]'}`}>
                <Hot text={it.label} hot={it.on ? it.hot : undefined} />{it.note && <span className="ml-1 text-[11px] text-[#9aa7b4]">({it.note})</span>}
              </button>
            </li>) })())}
      </ul>
    </div>
  )
}

/** Gateway of Tally: masters, vouchers, Day Book and reports, keyboard first, in the Tally Prime layout. */
export default function Gateway() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { can } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const myBranch = (() => { const b = auth.session?.user.app_metadata?.branch as string | undefined; return b && b !== 'HO' ? b : null })()
  const company = useCompany()
  const books = useBooks()
  const [date, setDate] = useState(today())
  const [stack, setStack] = useState<Screen[]>(() => {
    const v = params.get('v') as ManualType | null
    return v && VOUCHER_KEYS.some((k) => k.type === v) ? [{ s: 'gateway' }, { s: 'voucher', type: v, n: 0 }] : [{ s: 'gateway' }]
  })
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  const [box, setBox] = useState<null | 'date' | 'goto' | 'help'>(null)
  const top = stack[stack.length - 1]
  const go = useCallback((s: Screen) => { setNote(null); setStack((st) => [...st, s]) }, [])
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), [])
  const replace = (s: Screen) => setStack((st) => [...st.slice(0, -1), s])
  const fyFrom = company?.fyFrom ?? fyStartOf(date)
  const permits = { create: can('accounts', 'create'), edit: can('accounts', 'edit'), delete: can('accounts', 'delete') }
  const blocked = (what: string) => setNote({ text: `Your role can only view ${what}. Ask an admin for Accounts → Create / Edit.`, tone: 'warn' })

  // Voucher entry: F4–F9 (and Ctrl+F8 / Ctrl+F9) open that voucher type from anywhere, as in Tally.
  const openVoucher = (type: ManualType) => {
    if (!company) return setNote({ text: 'Create the company first (Alt+K or F3).', tone: 'warn' })
    if (!permits.create) return blocked('vouchers')
    const s: Screen = { s: 'voucher', type, n: Date.now() }
    if (top.s === 'voucher' && !top.id) replace(s); else go(s)
  }
  const openVoucherFrom = (v: Voucher) => {
    if (v.entryId) return nav(`/admin/accounting/entry/${v.entryId}`)
    if (v.billId) return nav(`/admin/accounting/bills?id=${v.billId}`)
    if (v.manualId) go({ s: 'voucher', type: v.type as ManualType, id: v.manualId, n: Date.now() })
  }

  /* ---------- Keys: the screen on top first, then the frame ---------- */
  const keyStack = useRef<{ current: Handlers }[]>([])
  const topKeys = (): Handlers => keyStack.current[keyStack.current.length - 1]?.current ?? {}
  const keysCtx = useMemo(() => ({ push: (h: { current: Handlers }) => { keyStack.current.push(h); return () => { keyStack.current = keyStack.current.filter((x) => x !== h) } } }), [])
  const frameKeys: Handlers = {
    f2: () => setBox('date'), f3: () => go({ s: 'company' }), 'alt+k': () => go({ s: 'company' }), 'alt+g': () => setBox('goto'), f1: () => setBox('help'),
    'ctrl+p': () => window.print(), 'alt+p': () => window.print(),
    escape: () => (box ? setBox(null) : stack.length > 1 ? back() : nav('/admin/accounting')),
    f4: () => openVoucher('Contra'), f5: () => openVoucher('Payment'), f6: () => openVoucher('Receipt'), f7: () => openVoucher('Journal'),
    f8: () => openVoucher('Sales'), f9: () => openVoucher('Purchase'), 'ctrl+f8': () => openVoucher('Credit Note'), 'ctrl+f9': () => openVoucher('Debit Note'),
  }
  const frameRef = useRef(frameKeys)
  frameRef.current = frameKeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = comboOf(e)
      const el = e.target as HTMLElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      // Letters, Enter and arrows belong to the field being typed in.
      if (typing && (c.length === 1 || c === 'enter' || c.startsWith('arrow'))) return
      const screen = keyStack.current[keyStack.current.length - 1]?.current
      // With a small box open (date, Go To, help), only Esc acts: it closes the box.
      const fn = box ? (c === 'escape' ? frameRef.current.escape : undefined) : (screen && c in screen ? screen[c] : undefined) ?? frameRef.current[c]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [box])

  /* ---------- Screens ---------- */
  const title: Record<Screen['s'], string> = {
    gateway: 'Gateway of Tally', company: company ? 'Company Alteration' : 'Company Creation', create: 'Masters: Create', alter: 'Masters: Alter',
    chart: 'Chart of Accounts', ledgers: 'Alter: List of Ledgers', ledger: top.s === 'ledger' && top.name ? 'Ledger Alteration' : 'Ledger Creation',
    voucher: top.s === 'voucher' && top.id ? 'Accounting Voucher Alteration' : 'Accounting Voucher Creation', daybook: 'Day Book',
    banking: 'Banking', brs: 'Bank Reconciliation',
  }
  const needCompany = (fn: () => void) => () => (company ? fn() : setNote({ text: 'Create the company first (Alt+K).', tone: 'warn' }))
  const lastMonthStart = (date.slice(0, 8) + '01')

  let body: ReactNode
  if (top.s === 'gateway') {
    body = (
      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="space-y-4 text-sm">
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a8b9c]">Current period</p><p className="font-semibold">{tDate(fyFrom)} to {tDate(fyEndOf(fyFrom))}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a8b9c]">Current date</p><p className="font-semibold">{weekday(date)}, {tDate(date)}</p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a8b9c]">Name of company</p><p className="font-semibold">{company?.name ?? <span className="text-rose-700">No company yet: press Alt+K to create</span>}</p>{company?.gstin && <p className="text-xs text-[#5a6b7c]">GSTIN {company.gstin}</p>}</div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#7a8b9c]">Date of last entry</p><p className="font-semibold">{books.lastEntry ? tDate(books.lastEntry) : 'No vouchers yet'}</p></div>
        </div>
        <Menu title="Gateway of Tally" items={[
          { caption: 'Masters' },
          { label: 'Create', hot: 'C', on: () => (permits.create ? go({ s: 'create' }) : blocked('masters')) },
          { label: 'Alter', hot: 'A', on: () => go({ s: 'alter' }) },
          { label: 'Chart of Accounts', hot: 'H', on: () => go({ s: 'chart' }) },
          { caption: 'Transactions' },
          { label: 'Vouchers', hot: 'V', on: () => openVoucher('Payment') },
          { label: 'Day Book', hot: 'K', on: () => go({ s: 'daybook' }) },
          { caption: 'Utilities' },
          { label: 'Banking', hot: 'N', on: needCompany(() => go({ s: 'banking' })) },
          { caption: 'Reports' },
          { label: 'Balance Sheet', hot: 'B', on: () => nav('/admin/accounting/pnl?tab=bs') },
          { label: 'Profit & Loss A/c', hot: 'P', on: () => nav('/admin/accounting/pnl?tab=pnl') },
          { label: 'Trial Balance', hot: 'T', on: () => nav('/admin/accounting/pnl?tab=tb') },
          { label: 'Stock Summary', hot: 'S', on: () => nav('/admin/inventory/stock') },
          { label: 'Ratio Analysis', note: 'next part' },
          { caption: '' },
          { label: 'Display More Reports', hot: 'D', on: () => nav('/admin/accounting/books') },
          { label: 'Quit', hot: 'Q', on: () => nav('/admin/accounting') },
        ]} />
      </div>
    )
  } else if (top.s === 'create' || top.s === 'alter') {
    const create = top.s === 'create'
    body = (
      <div className="p-4">
        <Menu title={create ? 'Create' : 'Alter'} items={[
          { caption: 'Accounting masters' },
          { label: 'Ledger', hot: 'L', on: needCompany(() => (create ? go({ s: 'ledger' }) : go({ s: 'ledgers' }))) },
          { label: 'Group', note: "Tally's 28 groups are built in" },
          { label: 'Cost Centre', note: 'outlets, from Control Panel' },
          { caption: 'Company' },
          { label: create ? 'Company' : 'Company', hot: 'K', on: () => go({ s: 'company' }) },
          { caption: 'Inventory masters' },
          { label: 'Stock Item', note: 'next part' },
          { label: 'Unit / Godown', note: 'next part' },
        ]} />
      </div>
    )
  } else if (top.s === 'company') {
    body = <CompanyForm key="company" company={company} today={date} by={by} onCancel={back}
      onDone={(t) => { back(); setNote({ text: t, tone: 'ok' }) }} />
  } else if (top.s === 'ledger') {
    body = <LedgerForm key={top.name ?? 'new'} books={books} alter={top.name} by={by} fyFrom={fyFrom} canDelete={permits.delete} onCancel={back}
      onDone={(_, t) => { back(); setNote({ text: t, tone: 'ok' }) }} />
  } else if (top.s === 'ledgers') {
    body = <LedgerList books={books} onPick={(name) => (permits.edit ? go({ s: 'ledger', name }) : blocked('ledgers'))} />
  } else if (top.s === 'chart') {
    body = <ChartOfAccounts books={books} onLedger={(name) => (permits.edit ? go({ s: 'ledger', name }) : blocked('ledgers'))} />
  } else if (top.s === 'banking') {
    const banks = books.ledgers.filter((l) => l.group === 'bank' || l.group === 'bankOD')
    body = (
      <div className="p-4">
        <Menu title="Banking: Bank Reconciliation" items={[
          { caption: 'Select bank' },
          ...banks.map((l) => ({ label: `${l.name}   (${bal(l.balance)})`, on: () => go({ s: 'brs', ledger: l.name }) })),
          ...(banks.length ? [] : [{ label: 'No bank ledger yet: Create → Ledger under Bank Accounts' }]),
        ]} />
      </div>
    )
  } else if (top.s === 'brs') {
    body = <BankReco key={top.ledger} books={books} ledger={top.ledger} asOn={date} by={by} canEdit={permits.edit || permits.create}
      onNewVoucher={(type, prefill) => (permits.create ? go({ s: 'voucher', type, n: Date.now(), prefill }) : blocked('vouchers'))} />
  } else if (top.s === 'daybook') {
    body = <DayBook books={books} from={lastMonthStart} to={date} onOpen={openVoucherFrom} />
  } else {
    const alter = top.id ? books.manual.find((m) => m.id === top.id) : undefined
    body = top.id && !alter
      ? <p className="p-6 text-sm">This voucher no longer exists.</p>
      : <VoucherForm key={`${top.type}:${top.id ?? 'new'}:${top.n}`} books={books} type={top.type} alter={alter} prefill={top.prefill} date={date}
          branch={myBranch ?? 'CK'} lockBranch={!!myBranch} by={by} can={permits}
          onCancel={back}
          onSaved={(t, stay) => { setNote({ text: t, tone: 'ok' }); if (stay) replace({ s: 'voucher', type: top.type, n: Date.now() }); else back() }} />
  }

  /* ---------- Button bar ---------- */
  const inVoucher = top.s === 'voucher'
  const buttons: BarButton[] = [
    { k: 'F2', label: 'Date', on: () => setBox('date') },
    { k: 'F3', label: 'Company', on: () => go({ s: 'company' }) },
    ...VOUCHER_KEYS.map((v, i) => ({ k: v.key, label: v.label, on: () => openVoucher(v.type), gap: i === 0 })),
    { k: 'Alt+G', label: 'Go To', on: () => setBox('goto'), gap: true },
    { k: 'Ctrl+A', label: 'Accept', off: !['voucher', 'ledger', 'company'].includes(top.s), on: () => topKeys()['ctrl+a']?.() },
    ...(inVoucher ? [
      { k: 'Alt+C', label: 'Create Ledger', on: () => topKeys()['alt+c']?.() },
      { k: 'Alt+X', label: 'Cancel Vch', off: !top.id, on: () => topKeys()['alt+x']?.() },
      { k: 'Alt+D', label: 'Delete', off: !top.id, on: () => topKeys()['alt+d']?.() },
    ] : []),
    { k: 'F1', label: 'Help', on: () => setBox('help'), gap: true },
    { k: 'Esc', label: stack.length > 1 ? 'Back' : 'Quit', on: () => frameRef.current.escape?.() },
  ]

  const gotoList: { label: string; on: () => void }[] = [
    { label: 'Gateway of Tally', on: () => setStack([{ s: 'gateway' }]) },
    { label: 'Company Alteration', on: () => go({ s: 'company' }) },
    { label: 'Ledger Creation', on: needCompany(() => go({ s: 'ledger' })) },
    { label: 'Ledger Alteration', on: () => go({ s: 'ledgers' }) },
    { label: 'Chart of Accounts', on: () => go({ s: 'chart' }) },
    { label: 'Day Book', on: () => go({ s: 'daybook' }) },
    { label: 'Bank Reconciliation', on: needCompany(() => go({ s: 'banking' })) },
    ...VOUCHER_KEYS.map((v) => ({ label: `${v.label} Voucher`, on: () => openVoucher(v.type) })),
    { label: 'Balance Sheet', on: () => nav('/admin/accounting/pnl?tab=bs') },
    { label: 'Profit & Loss A/c', on: () => nav('/admin/accounting/pnl?tab=pnl') },
    { label: 'Trial Balance', on: () => nav('/admin/accounting/pnl?tab=tb') },
    { label: 'Account Books (Cash Book, Ledgers, Registers)', on: () => nav('/admin/accounting/books') },
  ]

  return (
    <KeysProvider value={keysCtx}>
      <div className="-mx-4 -mb-4 flex min-h-[calc(100vh-8rem)] flex-col border-t border-[#c5d1de] bg-[#f6f8fb] text-[#1b2a3a] lg:-mx-6 lg:-mb-6 print:m-0">
        {/* Top bar */}
        <div className={`${T.top} flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-1.5 text-xs print:hidden`}>
          <span className="text-sm font-bold tracking-wide">BTI Books</span>
          <button type="button" onClick={() => go({ s: 'company' })}><b>K</b>: Company</button>
          <button type="button" onClick={() => setBox('goto')}><b>G</b>: Go To</button>
          <button type="button" onClick={() => window.print()}><b>P</b>: Print</button>
          <button type="button" onClick={() => setBox('help')}><b>F1</b>: Help</button>
          <span className="ml-auto opacity-70">Alt + letter for the top menu</span>
        </div>
        {/* Title bar */}
        <div className={`${T.title} flex items-center justify-between gap-3 border-b ${T.line} px-4 py-1 text-sm`}>
          <span className="font-semibold">{title[top.s]}</span>
          <span className="truncate text-xs">{company?.name ?? 'No company'}{myBranch ? ` · ${BRANCHES.find((b) => b.id === myBranch)?.name}` : ''}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-w-0 flex-1 overflow-y-auto" aria-label="Tally screen">
            {note && <p role="status" className={`mx-4 mt-3 border-l-4 px-3 py-1.5 text-sm ${note.tone === 'ok' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800'}`}>{note.text}</p>}
            {body}
          </div>
          <ButtonBar buttons={buttons} />
        </div>
      </div>

      {box === 'date' && (
        <Dialog title="Change current date (F2)" onClose={() => setBox(null)}>
          <input autoFocus aria-label="Current date" type="date" className={T.input} value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBox(null) }} />
          <p className="mt-2 text-xs text-[#5a6b7c]">New vouchers take this date. Change one voucher's date with F2 inside the voucher.</p>
        </Dialog>
      )}
      {box === 'goto' && <GoTo items={gotoList} onClose={() => setBox(null)} />}
      {box === 'help' && (
        <Dialog title="Keys (F1: Help)" onClose={() => setBox(null)}>
          <table className="w-full text-sm"><tbody>
            {[['F2', 'Change date'], ['F3 / Alt+K', 'Company'], ['F4 … F9', 'Contra, Payment, Receipt, Journal, Sales, Purchase'], ['Ctrl+F8 / Ctrl+F9', 'Credit Note / Debit Note'],
              ['Alt+G', 'Go To any screen'], ['Ctrl+A', 'Accept (save)'], ['Alt+C', 'Create a ledger while entering a voucher'], ['Alt+X', 'Cancel a voucher (number kept)'],
              ['Alt+D', 'Delete a voucher or ledger'], ['Esc', 'Back / quit'], ['Arrows + Enter', 'Move and open in menus and the Day Book']].map(([k, d]) => (
              <tr key={k} className="border-b border-[#e3e9ef]"><td className="py-1 pr-3 font-bold text-[#1f5f99]">{k}</td><td>{d}</td></tr>
            ))}
          </tbody></table>
        </Dialog>
      )}
    </KeysProvider>
  )
}

function GoTo({ items, onClose }: { items: { label: string; on: () => void }[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
  const pick = (i: { on: () => void }) => { onClose(); i.on() }
  return (
    <Dialog title="Go To (Alt+G)" onClose={onClose}>
      <input autoFocus aria-label="Go to" className={T.input} placeholder="Type a screen name" value={q} onChange={(e) => { setQ(e.target.value); setAt(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, list.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && list[at]) { e.preventDefault(); pick(list[at]) }
        }} />
      <ul className="mt-2 max-h-72 overflow-y-auto text-sm">
        {list.map((i, k) => <li key={i.label}><button type="button" onClick={() => pick(i)} onMouseEnter={() => setAt(k)} className={`block w-full px-2 py-1 text-left ${k === at ? T.sel : ''}`}>{i.label}</button></li>)}
      </ul>
    </Dialog>
  )
}
