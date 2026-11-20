import { useMemo, useRef, useState, type ReactNode } from 'react'
import { BRANCHES } from '../../../data/mock'
import { GROUPS, GROUP_INFO, type GroupId } from '../../../data/books'
import { addLedger, alterLedger, deleteLedger, ledgerKey, type CustomLedger } from '../../../data/ledgerStore'
import { gstinOk, panOk } from '../../../data/company'
import { NO_PAN_RATE, TDS_NATURES, canHaveTds, guessNature, natureById } from '../../../data/tds'
import { Row, Section, T, amt, bal, tDate, useScreenKeys } from './ui'
import type { Books, LedgerInfo } from './useBooks'

/* ---------- Ledger picker: Tally's "List of Ledger Accounts" ---------- */

export function LedgerPicker({ books, value, onChange, fits, onCreate, label, autoFocus }: {
  books: Books; value: string; onChange: (name: string) => void; fits: (g: GroupId) => boolean
  onCreate: (typed: string) => void; label: string; autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const q = value.trim().toLowerCase()
  // Exact match first, then names starting with what was typed, then the rest.
  const rank = (n: string) => (n.toLowerCase() === q ? 0 : n.toLowerCase().startsWith(q) ? 1 : 2)
  const list = useMemo(() => books.ledgers.filter((l) => fits(l.group) && (!q || l.name.toLowerCase().includes(q) || (l.custom?.alias ?? '').toLowerCase().includes(q)))
    .sort((x, y) => rank(x.name) - rank(y.name) || x.name.localeCompare(y.name)).slice(0, 40), [books.ledgers, fits, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const exact = books.find(value)
  const pick = (l: LedgerInfo) => { onChange(l.name); setOpen(false) }
  return (
    <div className="relative">
      <input aria-label={label} autoFocus={autoFocus} className={T.input + (value && !exact ? ' text-rose-700' : '')} value={value} placeholder="Select ledger"
        onFocus={() => { setOpen(true); setAt(0) }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setAt(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, list.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open && list[at]) { e.preventDefault(); pick(list[at]) }
          else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
          else if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); e.stopPropagation(); onCreate(value) }
        }} />
      {value && exact && <span className="block text-[11px] text-[#5a6b7c]">Cur Bal: {bal(exact.balance)}</span>}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-64 min-w-[260px] overflow-y-auto border border-[#1f5f99] bg-white shadow-xl">
          <p className={`${T.head} px-2 py-1 text-xs font-semibold`}>List of Ledger Accounts</p>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); onCreate(value) }} className="block w-full border-b border-[#e3e9ef] px-2 py-1 text-left text-xs font-semibold text-[#1f5f99] hover:bg-[#fff6d6]">
            Alt+C: Create{value.trim() && !exact ? ` “${value.trim()}”` : ''}
          </button>
          {list.map((l, i) => (
            <button key={l.name} type="button" onMouseDown={(e) => { e.preventDefault(); pick(l) }} onMouseEnter={() => setAt(i)}
              className={`flex w-full items-baseline justify-between gap-3 px-2 py-1 text-left text-sm ${i === at ? T.sel : ''}`}>
              <span className="truncate">{l.name}</span>
              <span className="shrink-0 text-[11px] text-[#5a6b7c]">{GROUPS[l.group]}</span>
            </button>
          ))}
          {!list.length && <p className="px-2 py-2 text-xs text-[#5a6b7c]">No ledger fits here. Use Alt+C to create one.</p>}
        </div>
      )}
    </div>
  )
}

/* ---------- Ledger Creation / Alteration ---------- */

const PARTY: GroupId[] = ['debtors', 'creditors']
const TAXABLE: GroupId[] = ['sales', 'purchase', 'directExp', 'indirectExp', 'directInc', 'indirectInc', 'fixedAssets']
const BANKS: GroupId[] = ['bank', 'bankOD']

export function LedgerForm({ books, alter, prefill, by, fyFrom, canDelete, onDone, onCancel }: {
  books: Books; alter?: string; prefill?: string; by: string; fyFrom: string; canDelete: boolean
  onDone: (name: string, note: string) => void; onCancel: () => void
}) {
  const old = alter ? books.find(alter) : null
  const start: CustomLedger = old?.custom ?? { name: old?.name ?? prefill ?? '', group: old?.group ?? 'indirectExp', opening: 0, addedBy: by, addedAt: new Date().toISOString() }
  const [l, setL] = useState<CustomLedger>(start)
  const [side, setSide] = useState<'Dr' | 'Cr'>((start.opening ?? 0) < 0 ? 'Cr' : 'Dr')
  const [openAmt, setOpenAmt] = useState(Math.abs(start.opening ?? 0))
  const [err, setErr] = useState<string | null>(null)
  const set = (p: Partial<CustomLedger>) => setL((x) => ({ ...x, ...p }))
  const first = useRef<HTMLInputElement>(null)
  const name = l.name.trim().replace(/\s+/g, ' ')
  const taken = !!name && books.ledgers.some((x) => ledgerKey(x.name) === ledgerKey(name) && (!old || ledgerKey(x.name) !== ledgerKey(old.name)))
  const renameBlocked = !!old?.fixed && ledgerKey(name) !== ledgerKey(old.name)

  const save = () => {
    if (!name) return setErr('Enter the ledger name.')
    if (taken) return setErr(`A ledger called “${name}” already exists.`)
    if (renameBlocked) return setErr('This ledger is made by the Imprest Book, so its name cannot be changed.')
    if (!gstinOk(l.gstin ?? '')) return setErr('GSTIN does not look right (15 characters, e.g. 29AAQFP6766L1Z5).')
    if (!panOk(l.pan ?? '')) return setErr('PAN does not look right (10 characters, e.g. AAQFP6766L).')
    const next: CustomLedger = {
      ...l, name, opening: side === 'Dr' ? openAmt : -openAmt,
      gstin: l.gstin?.trim().toUpperCase() || undefined, pan: l.pan?.trim().toUpperCase() || undefined,
      ...(old ? { updatedBy: by, updatedAt: new Date().toISOString() } : { addedBy: by, addedAt: new Date().toISOString() }),
    }
    if (old) alterLedger(old.name, next)
    else addLedger(next)
    onDone(name, old ? `Ledger “${name}” altered.` : `Ledger “${name}” created under ${GROUPS[next.group]}.`)
  }
  const remove = () => {
    if (!old) return
    if (old.used) return setErr('This ledger has vouchers, so it cannot be deleted. Delete or alter those vouchers first.')
    if (old.fixed) return setErr('This ledger is made by the Imprest Book and cannot be deleted.')
    if (!confirm(`Delete ledger “${old.name}”?`)) return
    deleteLedger(old.name)
    onDone('', `Ledger “${old.name}” deleted.`)
  }
  useScreenKeys({ 'ctrl+a': save, 'alt+d': old && canDelete ? remove : undefined, 'escape': onCancel })

  return (
    <div className="p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Section title={old ? 'Ledger Alteration' : 'Ledger Creation'}>
            <Row label="Name"><input ref={first} autoFocus aria-label="Ledger name" className={T.input} value={l.name} onChange={(e) => set({ name: e.target.value })} disabled={!!old?.fixed} /></Row>
            <Row label="(alias)"><input aria-label="Alias" className={T.input} value={l.alias ?? ''} onChange={(e) => set({ alias: e.target.value || undefined })} /></Row>
            <Row label="Under">
              <select aria-label="Under" className={T.input} value={l.group} onChange={(e) => set({ group: e.target.value as GroupId })}>
                {(Object.keys(GROUPS) as GroupId[]).map((g) => <option key={g} value={g}>{GROUP_INFO[g].parent ? '  ' : ''}{GROUPS[g]}</option>)}
              </select>
            </Row>
            <p className="pl-1 text-[11px] text-[#5a6b7c]">{GROUP_INFO[l.group].parent ? `${GROUPS[GROUP_INFO[l.group].parent!]} › ` : ''}{GROUPS[l.group]} · {GROUP_INFO[l.group].nature}</p>
          </Section>
          {PARTY.includes(l.group) && (
            <Section title="Credit details">
              <Row label="Maintain balances bill-by-bill">
                <select aria-label="Bill-by-bill" className={T.input} value={l.billWise ? 'Yes' : 'No'} onChange={(e) => set({ billWise: e.target.value === 'Yes' })}><option>Yes</option><option>No</option></select>
              </Row>
              <Row label="Default credit period"><input aria-label="Credit days" type="number" min="0" className={T.input} value={l.creditDays ?? ''} placeholder="days" onChange={(e) => set({ creditDays: e.target.value ? Number(e.target.value) : undefined })} /></Row>
            </Section>
          )}
          {BANKS.includes(l.group) && (
            <Section title="Bank details">
              <Row label="A/c No."><input aria-label="Account number" className={T.input} value={l.bankAcNo ?? ''} onChange={(e) => set({ bankAcNo: e.target.value || undefined })} /></Row>
              <Row label="IFS Code"><input aria-label="IFSC" className={T.input} value={l.ifsc ?? ''} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() || undefined })} /></Row>
            </Section>
          )}
          {TAXABLE.includes(l.group) && (
            <Section title="Statutory details">
              <Row label="GST rate (%)">
                <select aria-label="GST rate" className={T.input} value={l.gstRate ?? ''} onChange={(e) => set({ gstRate: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">Not applicable</option>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </Row>
              {canHaveTds(l.group) ? (() => {
                const guess = natureById(guessNature(name) ?? undefined)
                return (
                  <>
                    <Row label="TDS (services)">
                      <select aria-label="TDS nature" className={T.input} value={l.tdsNature ?? ''} onChange={(e) => set({ tdsNature: (e.target.value || undefined) as CustomLedger['tdsNature'] })}>
                        <option value="">Automatic: {guess ? `${guess.section} ${guess.label}` : 'no TDS'}</option>
                        <option value="none">No TDS on this ledger</option>
                        {TDS_NATURES.map((n) => <option key={n.id} value={n.id}>{n.section} {n.label} ({n.rateInd === n.rateOther ? `${n.rateInd}%` : `${n.rateInd}% / ${n.rateOther}%`})</option>)}
                      </select>
                    </Row>
                    <p className="pl-1 text-[11px] text-[#5a6b7c]">TDS is held back from the supplier on Purchase vouchers and bills, once the yearly limit is crossed.</p>
                  </>
                )
              })() : l.group === 'purchase' && <p className="pl-1 text-[11px] text-[#5a6b7c]">Purchase of goods: no TDS.</p>}
            </Section>
          )}
        </div>
        <div className="space-y-3">
          <Section title="Mailing details">
            <Row label="Name"><input aria-label="Mailing name" className={T.input} value={l.mailingName ?? ''} onChange={(e) => set({ mailingName: e.target.value || undefined })} /></Row>
            <Row label="Address"><textarea aria-label="Address" rows={2} className={T.input} value={l.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} /></Row>
            <Row label="State"><input aria-label="State" className={T.input} value={l.state ?? ''} placeholder="Karnataka" onChange={(e) => set({ state: e.target.value || undefined })} /></Row>
            <Row label="Pincode"><input aria-label="Pincode" className={T.input} value={l.pincode ?? ''} onChange={(e) => set({ pincode: e.target.value || undefined })} /></Row>
            <Row label="Phone / E-mail"><input aria-label="Phone" className={T.input} value={l.phone ?? ''} onChange={(e) => set({ phone: e.target.value || undefined })} /></Row>
          </Section>
          {(PARTY.includes(l.group) || l.gstin) && (
            <Section title="Tax registration details">
              <Row label="Registration type">
                <select aria-label="Registration type" className={T.input} value={l.gstRegType ?? 'Regular'} onChange={(e) => set({ gstRegType: e.target.value as CustomLedger['gstRegType'] })}>
                  {['Regular', 'Composition', 'Unregistered', 'Consumer'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </Row>
              <Row label="GSTIN/UIN"><input aria-label="GSTIN" className={T.input} value={l.gstin ?? ''} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} /></Row>
              <Row label="PAN/IT No."><input aria-label="PAN" className={T.input} value={l.pan ?? ''} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} /></Row>
              {l.group === 'creditors' && (
                <>
                  <Row label="TDS on this party">
                    <select aria-label="TDS on this party" className={T.input} value={l.tdsExempt ? 'no' : 'yes'} onChange={(e) => set({ tdsExempt: e.target.value === 'no' || undefined })}>
                      <option value="yes">Deduct TDS on services</option>
                      <option value="no">Don't deduct (nil / lower deduction certificate, transporter)</option>
                    </select>
                  </Row>
                  <p className="pl-1 text-[11px] text-[#5a6b7c]">
                    {!l.pan?.trim() ? `No PAN: TDS at ${NO_PAN_RATE}%.` : /^...[PH]/i.test(l.pan.trim()) ? 'PAN of an individual / HUF: contractor TDS 1%.' : 'PAN of a firm / company: contractor TDS 2%.'}
                  </p>
                </>
              )}
            </Section>
          )}
        </div>
      </div>
      <div className={`mt-5 flex flex-wrap items-center gap-3 border-t ${T.line} pt-3 text-sm`}>
        <span className="text-[#33475b]">Opening Balance (on {tDate(fyFrom)})</span>
        <input aria-label="Opening balance" type="number" step="0.01" className={T.input + ' !w-36 text-right'} value={openAmt || ''} placeholder="0.00" onChange={(e) => setOpenAmt(Math.abs(Number(e.target.value) || 0))} />
        <select aria-label="Opening Dr or Cr" className={T.input + ' !w-16'} value={side} onChange={(e) => setSide(e.target.value as 'Dr' | 'Cr')}><option>Dr</option><option>Cr</option></select>
      </div>
      {err && <p role="alert" className="mt-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={`${T.head} px-4 py-1.5 text-sm font-semibold`}>Accept (Ctrl+A)</button>
        {old && canDelete && <button type="button" onClick={remove} className="border border-rose-400 px-4 py-1.5 text-sm text-rose-700">Delete (Alt+D)</button>}
        <button type="button" onClick={onCancel} className="border border-[#9db3c8] px-4 py-1.5 text-sm">Quit (Esc)</button>
      </div>
    </div>
  )
}

/* ---------- Lists ---------- */

/** Pick a ledger to alter (Tally's "List of Ledgers"). */
export function LedgerList({ books, onPick }: { books: Books; onPick: (name: string) => void }) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = books.ledgers.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="mx-auto max-w-xl p-4">
      <input autoFocus aria-label="Find ledger" className={T.input} placeholder="Type to find a ledger, Enter to alter" value={q}
        onChange={(e) => { setQ(e.target.value); setAt(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, list.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && list[at]) onPick(list[at].name)
        }} />
      <p className={`${T.head} mt-3 px-2 py-1 text-xs font-semibold`}>List of Ledgers ({list.length})</p>
      <ul className="max-h-[60vh] overflow-y-auto border border-t-0 border-[#c5d1de] bg-white">
        {list.map((l, i) => (
          <li key={l.name}><button type="button" onClick={() => onPick(l.name)} onMouseEnter={() => setAt(i)}
            className={`flex w-full justify-between gap-3 px-3 py-1 text-left text-sm ${i === at ? T.sel : ''}`}>
            <span className="truncate">{l.name}</span><span className="shrink-0 text-xs text-[#5a6b7c]">{GROUPS[l.group]}</span>
          </button></li>
        ))}
      </ul>
    </div>
  )
}

/** Chart of Accounts: every group with its ledgers and closing balances, and the cost centres (outlets). */
export function ChartOfAccounts({ books, onLedger }: { books: Books; onLedger: (name: string) => void }) {
  const groups = Object.keys(GROUPS) as GroupId[]
  const primary = groups.filter((g) => !GROUP_INFO[g].parent)
  const sum = (g: GroupId): number => books.ledgers.filter((l) => l.group === g).reduce((t, l) => t + l.balance, 0) + groups.filter((c) => GROUP_INFO[c].parent === g).reduce((t, c) => t + sum(c), 0)
  const Ledgers = ({ g, pad }: { g: GroupId; pad: string }) => <>{books.ledgers.filter((l) => l.group === g).map((l) => (
    <tr key={l.name} className="cursor-pointer hover:bg-[#fff6d6]" onClick={() => onLedger(l.name)}>
      <td className={`${pad} py-0.5 text-[#1b2a3a]`}>{l.name}</td><td className="px-3 text-right tabular-nums">{bal(l.balance)}</td>
    </tr>
  ))}</>
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
      <table className="w-full border border-[#c5d1de] bg-white text-sm">
        <thead className={T.head}><tr><th className="px-3 py-1.5 text-left">Groups and ledgers</th><th className="px-3 text-right">Closing balance</th></tr></thead>
        <tbody>
          {primary.map((g) => (
            <FragmentRows key={g}>
              <tr className="border-t border-[#dbe3ec] bg-[#eef3f9] font-semibold"><td className="px-3 py-1">{GROUPS[g]}</td><td className="px-3 text-right tabular-nums">{bal(sum(g))}</td></tr>
              {groups.filter((c) => GROUP_INFO[c].parent === g).map((c) => (
                <FragmentRows key={c}>
                  <tr className="font-medium text-[#1f5f99]"><td className="py-0.5 pl-7">{GROUPS[c]}</td><td className="px-3 text-right tabular-nums">{sum(c) ? bal(sum(c)) : ''}</td></tr>
                  <Ledgers g={c} pad="pl-12" />
                </FragmentRows>
              ))}
              <Ledgers g={g} pad="pl-7" />
            </FragmentRows>
          ))}
        </tbody>
      </table>
      <div>
        <p className={`${T.head} px-3 py-1.5 text-sm font-semibold`}>Cost Centres</p>
        <ul className="border border-t-0 border-[#c5d1de] bg-white text-sm">
          {BRANCHES.map((b) => <li key={b.id} className="flex justify-between px-3 py-1"><span>{b.name}</span><span className="text-xs text-[#5a6b7c]">{b.id}</span></li>)}
        </ul>
        <p className="mt-2 text-xs text-[#5a6b7c]">Every voucher is allocated to one outlet, so any report can be shown for one outlet or all of them.</p>
        <p className="mt-3 text-xs text-[#5a6b7c]">{books.ledgers.length} ledgers · total of all balances {amt(books.ledgers.reduce((t, l) => t + l.balance, 0)) || '0.00'} (opening differences)</p>
      </div>
    </div>
  )
}
const FragmentRows = ({ children }: { children: ReactNode }) => <>{children}</>
