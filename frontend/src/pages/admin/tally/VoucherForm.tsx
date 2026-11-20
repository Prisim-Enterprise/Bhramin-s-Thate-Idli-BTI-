import { useEffect, useMemo, useState } from 'react'
import { BRANCHES, branchName } from '../../../data/mock'
import { GROUPS, imprestLedger, type GroupId } from '../../../data/books'
import { addLedger, addManualVoucher, deleteManualVoucher, sides, updateManualVoucher, type InvoiceDraft, type ManualType, type ManualVoucher, type VoucherLine } from '../../../data/ledgerStore'
import { checkVoucher, fits, invoiceLines, isInvoiceType, itemGst, partyIsDebit, type EntryLine } from '../../../data/tally'
import { isTdsLedger, withTds, workTds } from '../../../data/tds'
import { Dialog, Row, T, amt, tDate, useScreenKeys, weekday } from './ui'
import { LedgerForm, LedgerPicker } from './Masters'
import type { Books } from './useBooks'

const r2 = (n: number) => Math.round(n * 100) / 100
const blankItem = () => ({ ledger: '', amount: 0, gst: 0 })

function startLines(type: ManualType): EntryLine[] {
  if (type === 'Receipt') return [{ side: 'Cr', ledger: '', amount: 0 }, { side: 'Dr', ledger: '', amount: 0 }]
  return [{ side: 'Dr', ledger: '', amount: 0 }, { side: 'Cr', ledger: '', amount: 0 }]
}

/** Lines of a saved voucher, ready to alter. */
function linesOf(m: ManualVoucher): EntryLine[] {
  const ls: VoucherLine[] = m.lines?.length ? m.lines : (() => { const s = sides(m, imprestLedger); return [{ ledger: s.dr, dr: m.amount, cr: 0 }, { ledger: s.cr, dr: 0, cr: m.amount }] })()
  return ls.map((l) => ({ side: l.dr ? 'Dr' : 'Cr', ledger: l.ledger, amount: l.dr || l.cr }))
}

/** Accounting Voucher Creation / Alteration, as in Tally. */
export type VoucherPrefill = { date?: string; narration?: string; refNo?: string; lines?: EntryLine[] }

export function VoucherForm({ books, type, alter, prefill, date: startDate, branch: startBranch, lockBranch, by, can, onSaved, onCancel }: {
  books: Books; type: ManualType; alter?: ManualVoucher; prefill?: VoucherPrefill; date: string; branch: string; lockBranch: boolean; by: string
  can: { create: boolean; edit: boolean; delete: boolean }
  onSaved: (note: string, stay: boolean) => void; onCancel: () => void
}) {
  const inv0 = alter?.inv
  const invoice = isInvoiceType(type)
  const [date, setDate] = useState(alter?.date ?? prefill?.date ?? startDate)
  const [branch, setBranch] = useState(alter?.branch ?? startBranch)
  const [narration, setNarration] = useState(alter?.narration ?? prefill?.narration ?? '')
  const [refNo, setRefNo] = useState(alter?.refNo ?? prefill?.refNo ?? '')
  const [party, setParty] = useState(inv0?.party ?? '')
  const [items, setItems] = useState(inv0?.items?.length ? inv0.items : [blankItem()])
  // A filled last line gets a fresh one below it straight away (not on leaving the box, which moved the page under a click).
  useEffect(() => { const last = items[items.length - 1]; if (last && last.ledger.trim() && last.amount > 0) setItems((xs) => [...xs, blankItem()]) }, [items])
  const [roundOff, setRoundOff] = useState(inv0?.roundOff ?? true)
  const [tdsOn, setTdsOn] = useState(!alter?.tdsOff)
  const [lines, setLines] = useState<EntryLine[]>(alter && !inv0 ? linesOf(alter) : prefill?.lines ?? startLines(type))
  const [err, setErr] = useState<string | null>(null)
  const [creating, setCreating] = useState<null | { name: string; put: (n: string) => void }>(null)
  const [dateBox, setDateBox] = useState(false)
  const [dirty, setDirty] = useState(false)
  const touch = () => { setDirty(true); setErr(null) }

  // GST and Round Off lines are worked out by the voucher; their ledgers are made on first use.
  // So are Bank Charges and Bank Interest Received, suggested from a bank statement line.
  const isAuto = (n: string) => /^(Input GST|Output GST @ \d+(\.\d+)?%|Round Off|Bank Charges|Bank Interest Received)$/.test(n.trim()) || isTdsLedger(n)
  const autoGroup = (n: string): GroupId => (/GST/.test(n) || isTdsLedger(n) ? 'duties' : /^Bank Charges$/.test(n.trim()) ? 'indirectExp' : 'indirectInc')
  const groupOfName = (n: string): GroupId | null => books.find(n)?.group ?? (isAuto(n) ? autoGroup(n) : null)
  const draft: InvoiceDraft = { party, items, roundOff }
  const calc = useMemo(() => (invoice ? invoiceLines(type, draft) : null), [invoice, type, party, items, roundOff]) // eslint-disable-line react-hooks/exhaustive-deps
  // Purchase of services: TDS held back from the supplier (goods: none). Worked out on amounts before GST.
  const tds = useMemo(() => (type === 'Purchase' && party.trim()
    ? workTds({ party: books.find(party)?.name ?? party, date, items: items.map((i) => ({ ledger: i.ledger.trim(), amount: i.amount })), custom: books.custom, vouchers: books.manual, selfId: alter?.id })
    : { lines: [], notes: [], total: 0 }), [type, party, date, items, books, alter?.id])
  const tdsUse = tdsOn ? tds.lines : []
  const tdsTotal = tdsUse.reduce((t, l) => t + l.amount, 0)
  const posted: VoucherLine[] = invoice ? withTds(calc!.lines, party.trim(), tdsUse) : lines.filter((l) => l.ledger.trim()).map((l) => ({ ledger: l.ledger.trim(), dr: l.side === 'Dr' ? r2(l.amount) : 0, cr: l.side === 'Cr' ? r2(l.amount) : 0 }))
  const totDr = r2(posted.reduce((t, l) => t + l.dr, 0)), totCr = r2(posted.reduce((t, l) => t + l.cr, 0))
  // Numbers run in date order: a back-dated voucher takes its place among the others.
  const number = alter ? books.vouchers.find((v) => v.manualId === alter.id)?.typeNo : books.vouchers.filter((v) => v.type === type && v.date <= date).length + 1

  const save = () => {
    if (!(alter ? can.edit : can.create)) return setErr('Your role can only view. Ask an admin for Accounts → Create / Edit.')
    if (!date) return setErr('Enter the voucher date.')
    if (invoice) {
      if (!party.trim()) return setErr('Enter the Party A/c name.')
      const pg = groupOfName(party)
      if (!pg) return setErr(`Ledger “${party}” does not exist. Create it first (Alt+C).`)
      if (!fits(type, 'party', pg)) return setErr(`“${party}” is under ${GROUPS[pg]}. The party must be a customer, supplier, cash or bank ledger.`)
      const bad = items.find((i) => i.ledger.trim() && groupOfName(i.ledger) && !fits(type, 'item', groupOfName(i.ledger)!))
      if (bad) return setErr(`“${bad.ledger}” is under ${GROUPS[groupOfName(bad.ledger)!]}, which doesn't fit a ${type} voucher.`)
      if (!items.some((i) => i.ledger.trim() && i.amount > 0)) return setErr('Enter at least one ledger with an amount.')
    }
    const problem = checkVoucher(type, posted, groupOfName)
    if (problem) return setErr(problem)
    const now = new Date().toISOString()
    const used = posted.filter((l) => l.dr || l.cr)
    const v: ManualVoucher = {
      ...(alter ?? {}),
      id: alter?.id ?? crypto.randomUUID(), type, date, branch, amount: totDr, lines: used,
      drLedger: used.find((l) => l.dr)?.ledger, crLedger: used.find((l) => l.cr)?.ledger,
      inv: invoice ? { party: party.trim(), items: items.filter((i) => i.ledger.trim() && i.amount > 0).map((i) => ({ ...i, ledger: i.ledger.trim() })), roundOff } : undefined,
      tds: tdsUse.length ? tdsUse : undefined, tdsOff: tds.lines.length && !tdsOn ? true : undefined,
      refNo: refNo.trim() || undefined, narration: narration.trim(),
      addedBy: alter?.addedBy ?? by, addedAt: alter?.addedAt ?? now, ...(alter ? { updatedBy: by, updatedAt: now } : {}),
    }
    for (const l of used) if (isAuto(l.ledger) && !books.find(l.ledger)) addLedger({ name: l.ledger.trim(), group: autoGroup(l.ledger), opening: 0, addedBy: by, addedAt: now })
    const ok = alter ? updateManualVoucher(v) : addManualVoucher(v)
    if (!ok) return setErr('Could not save. Check the connection and try again.')
    onSaved(`${type} No. ${number} ${alter ? 'altered' : 'saved'}: ${amt(totDr)} · ${tDate(date)} · ${branchName(branch)}`, !alter && !prefill)
  }
  const cancelVoucher = () => {
    if (!alter || !can.edit) return
    if (!confirm(`Cancel ${type} No. ${number}? It keeps its number but posts nothing.`)) return
    updateManualVoucher({ ...alter, cancelled: true, updatedBy: by, updatedAt: new Date().toISOString() })
    onSaved(`${type} No. ${number} cancelled.`, false)
  }
  const remove = () => {
    if (!alter || !can.delete) return
    if (!confirm(`Delete ${type} No. ${number}? Later ${type} vouchers are renumbered.`)) return
    deleteManualVoucher(alter.id)
    onSaved(`${type} No. ${number} deleted.`, false)
  }
  const quit = () => { if (!dirty || confirm('Quit without saving this voucher?')) onCancel() }

  useScreenKeys({
    'ctrl+a': save, 'alt+x': alter && can.edit && !alter.cancelled ? cancelVoucher : undefined, 'alt+d': alter && can.delete ? remove : undefined,
    'f2': () => setDateBox(true), 'escape': quit,
    'alt+c': () => setCreating({ name: '', put: () => {} }),
  })

  /* ----- line editing (double entry) ----- */
  const setLine = (i: number, p: Partial<EntryLine>) => { touch(); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l))) }
  const balanceAfter = () => {
    // Like Tally: when Debit and Credit don't match, a new line comes ready with the difference.
    // The balancing line always shows the current difference; once the voucher balances, it goes away.
    setLines((ls) => {
      const filled = ls.filter((l) => l.ledger.trim())
      const d = r2(filled.reduce((t, l) => t + (l.side === 'Dr' ? l.amount : -l.amount), 0))
      const blanks = ls.filter((l) => !l.ledger.trim())
      const keep = [...filled]
      if (d) keep.push({ side: d > 0 ? 'Cr' : 'Dr', ledger: '', amount: Math.abs(d) })
      while (keep.length < 2) keep.push(blanks.shift() ?? { side: keep.some((l) => l.side === 'Dr') ? 'Cr' : 'Dr', ledger: '', amount: 0 })
      return keep
    })
  }
  const lineFits = (g: GroupId) => fits(type, 'line', g)

  return (
    <div className="p-3 sm:p-4">
      {/* Voucher header: type and number on the left, date on the right */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`${T.head} px-3 py-1 text-sm font-bold`}>{type}</span>
          <span className="text-sm">No. <b>{number}</b></span>
          {alter?.cancelled && <span className="border border-rose-400 px-2 text-xs font-semibold text-rose-700">CANCELLED</span>}
        </div>
        <button type="button" onClick={() => setDateBox(true)} className="text-right" aria-label="Voucher date (F2)">
          <span className="block text-base font-bold">{tDate(date)}</span>
          <span className="block text-xs text-[#5a6b7c]">{date && weekday(date)}</span>
        </button>
      </div>
      <div className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <Row label="Cost Centre (outlet)">
          <select aria-label="Cost Centre" className={T.input} value={branch} disabled={lockBranch} onChange={(e) => { touch(); setBranch(e.target.value) }}>
            {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Row>
        {(invoice || type === 'Payment' || type === 'Receipt') && (
          <Row label={type === 'Purchase' || type === 'Debit Note' ? 'Supplier Invoice No.' : 'Reference No.'}>
            <input aria-label="Reference No." className={T.input} value={refNo} onChange={(e) => { touch(); setRefNo(e.target.value) }} />
          </Row>
        )}
      </div>

      {invoice ? (
        <>
          <div className="mt-3 max-w-xl">
            <Row label="Party A/c name">
              <LedgerPicker books={books} label="Party A/c name" autoFocus value={party} onChange={(n) => { touch(); setParty(n) }} fits={(g) => fits(type, 'party', g)}
                onCreate={(n) => setCreating({ name: n, put: setParty })} />
            </Row>
          </div>
          <table className="mt-3 w-full border border-[#c5d1de] bg-white text-sm">
            <thead className={T.title}><tr>
              <th className="px-2 py-1 text-left">Particulars ({type === 'Sales' || type === 'Credit Note' ? 'sales' : 'purchase / expense'} ledger)</th>
              <th className="w-24 px-2 text-right">GST %</th><th className="w-28 px-2 text-right">GST ₹</th><th className="w-36 px-2 text-right">Amount</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-[#e3e9ef] align-top">
                  <td className="px-2 py-1">
                    <LedgerPicker books={books} label={`Item ledger ${i + 1}`} value={it.ledger} fits={(g) => fits(type, 'item', g)}
                      onChange={(n) => { touch(); const r = books.find(n)?.custom?.gstRate; setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ledger: n, gst: r ?? x.gst } : x))) }}
                      onCreate={(n) => setCreating({ name: n, put: (nm) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ledger: nm } : x))) })} />
                  </td>
                  <td className="px-2 py-1">
                    {/* Any rate can be typed; the usual ones are offered. */}
                    <input aria-label={`GST % ${i + 1}`} type="number" step="0.01" min="0" list="gst-rates" className={T.input + ' text-right tabular-nums'} value={it.gst || ''} placeholder="0"
                      onChange={(e) => { touch(); setItems((xs) => xs.map((x, j) => (j === i ? { ...x, gst: Math.max(0, Number(e.target.value) || 0), gstAmt: undefined } : x))) }} />
                  </td>
                  <td className="px-2 py-1">
                    {/* GST in rupees, as printed on the bill: the % is worked out from it. */}
                    <input aria-label={`GST in rupees ${i + 1}`} type="number" step="0.01" min="0" className={T.input + ' text-right tabular-nums'} value={itemGst(it) || ''} placeholder="0.00"
                      onChange={(e) => {
                        touch()
                        const v = e.target.value
                        setItems((xs) => xs.map((x, j) => (j !== i ? x : v === '' ? { ...x, gst: 0, gstAmt: undefined }
                          : { ...x, gstAmt: Math.max(0, Number(v) || 0), gst: x.amount > 0 ? r2(Math.max(0, Number(v) || 0) / x.amount * 100) : x.gst })))
                      }} />
                  </td>
                  <td className="px-2 py-1">
                    <input aria-label={`Amount ${i + 1}`} type="number" step="0.01" className={T.input + ' text-right tabular-nums'} value={it.amount || ''}
                      onChange={(e) => { touch(); setItems((xs) => xs.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0, gstAmt: undefined } : x))) }} />
                  </td>
                  <td className="text-center">{items.length > 1 && <button type="button" aria-label={`Remove line ${i + 1}`} className="text-[#9aa7b4] hover:text-rose-600" onClick={() => { touch(); setItems((xs) => xs.filter((_, j) => j !== i)) }}>×</button>}</td>
                </tr>
              ))}
              {calc!.lines.filter((l) => /GST|Round Off/.test(l.ledger) && !items.some((it) => it.ledger.trim() === l.ledger)).map((l) => (
                <tr key={l.ledger} className="border-t border-[#e3e9ef] italic text-[#33475b]">
                  <td className="px-2 py-1 pl-6">{l.ledger}</td><td /><td />
                  <td className="px-2 text-right tabular-nums">{(l.ledger === 'Round Off' && (partyIsDebit(type) ? l.dr : l.cr)) ? '−' : ''}{amt(l.dr || l.cr)}</td><td />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[#9db3c8] font-bold">
              <tr><td className="px-2 py-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs font-normal"><input type="checkbox" checked={roundOff} onChange={(e) => { touch(); setRoundOff(e.target.checked) }} /> Round off to the rupee</label>
              </td><td /><td className="px-2 text-right text-xs font-normal">GST {amt(calc!.gst) || '0.00'}</td><td className="px-2 text-right tabular-nums">{amt(calc!.total) || '0.00'}</td><td /></tr>
              {tdsUse.map((t) => (
                <tr key={t.ledger} className="font-normal italic text-[#33475b]">
                  <td className="px-2 py-1 pl-6" title={t.note}>Less: {t.ledger}</td><td className="px-2 text-right text-xs">@ {t.rate}%</td><td />
                  <td className="px-2 text-right tabular-nums">−{amt(t.amount)}</td><td />
                </tr>
              ))}
              {tdsTotal > 0 && <tr><td className="px-2 py-1">Payable to {party.trim()}</td><td /><td /><td className="px-2 text-right tabular-nums">{amt(r2(calc!.total - tdsTotal))}</td><td /></tr>}
            </tfoot>
          </table>
          <datalist id="gst-rates">{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r} />)}</datalist>
          {(tds.lines.length > 0 || tds.notes.length > 0) && (
            <div data-testid="voucher-tds" className="mt-2 border-l-4 border-[#1f5f99] bg-[#eef4fa] px-3 py-2 text-xs text-[#1c2b3a]">
              {tds.lines.length > 0 && (
                <label className="mb-1 inline-flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={tdsOn} onChange={(e) => { touch(); setTdsOn(e.target.checked) }} /> Deduct TDS (services)</label>
              )}
              {tds.lines.map((t) => <p key={t.ledger}>{t.note}.</p>)}
              {tds.notes.map((n) => <p key={n}>{n}</p>)}
            </div>
          )}
        </>
      ) : (
        <table className="mt-3 w-full border border-[#c5d1de] bg-white text-sm">
          <thead className={T.title}><tr><th className="w-16 px-2 py-1 text-left">Dr/Cr</th><th className="px-2 text-left">Particulars</th><th className="w-32 px-2 text-right">Debit</th><th className="w-32 px-2 text-right">Credit</th><th className="w-8" /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-[#e3e9ef] align-top">
                <td className="px-2 py-1">
                  <select aria-label={`Dr or Cr ${i + 1}`} className={T.input} value={l.side} onChange={(e) => setLine(i, { side: e.target.value as 'Dr' | 'Cr' })}><option>Dr</option><option>Cr</option></select>
                </td>
                <td className="px-2 py-1">
                  <LedgerPicker books={books} label={`Ledger ${i + 1}`} autoFocus={i === 0 && !alter && !l.ledger} value={l.ledger} fits={lineFits}
                    onChange={(n) => setLine(i, { ledger: n })} onCreate={(n) => setCreating({ name: n, put: (nm) => setLine(i, { ledger: nm }) })} />
                </td>
                {(['Dr', 'Cr'] as const).map((s) => (
                  <td key={s} className="px-2 py-1">
                    {l.side === s && <input aria-label={`${s === 'Dr' ? 'Debit' : 'Credit'} ${i + 1}`} type="number" step="0.01" className={T.input + ' text-right tabular-nums'} value={l.amount || ''}
                      onChange={(e) => setLine(i, { amount: Number(e.target.value) || 0 })} onBlur={balanceAfter} />}
                  </td>
                ))}
                <td className="text-center">{lines.length > 2 && <button type="button" aria-label={`Remove line ${i + 1}`} className="text-[#9aa7b4] hover:text-rose-600" onClick={() => { touch(); setLines((ls) => ls.filter((_, j) => j !== i)) }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[#9db3c8] font-bold">
            <tr>
              <td className="px-2 py-1.5" colSpan={2}><button type="button" className="text-xs font-semibold text-[#1f5f99]" onClick={() => { touch(); setLines((ls) => [...ls, { side: totDr > totCr ? 'Cr' : 'Dr', ledger: '', amount: Math.abs(totDr - totCr) }]) }}>+ Add line</button></td>
              <td className="px-2 text-right tabular-nums">{amt(totDr) || '0.00'}</td><td className="px-2 text-right tabular-nums">{amt(totCr) || '0.00'}</td><td />
            </tr>
          </tfoot>
        </table>
      )}

      <div className="mt-3 max-w-2xl">
        <Row label="Narration"><textarea aria-label="Narration" rows={2} className={T.input} value={narration} onChange={(e) => { touch(); setNarration(e.target.value) }} /></Row>
      </div>
      {!invoice && Math.abs(totDr - totCr) >= 0.005 && <p className="mt-2 text-xs font-semibold text-amber-700">Difference: {amt(totDr - totCr)} {totDr > totCr ? 'Dr' : 'Cr'}</p>}
      {err && <p role="alert" className="mt-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={`${T.head} px-4 py-1.5 text-sm font-semibold`}>Accept (Ctrl+A)</button>
        {alter && can.edit && !alter.cancelled && <button type="button" onClick={cancelVoucher} className="border border-amber-500 px-4 py-1.5 text-sm text-amber-800">Cancel Vch (Alt+X)</button>}
        {alter && can.delete && <button type="button" onClick={remove} className="border border-rose-400 px-4 py-1.5 text-sm text-rose-700">Delete (Alt+D)</button>}
        <button type="button" onClick={quit} className="border border-[#9db3c8] px-4 py-1.5 text-sm">Quit (Esc)</button>
      </div>

      {dateBox && (
        <Dialog title="Change voucher date (F2)" onClose={() => setDateBox(false)}>
          <input autoFocus aria-label="New voucher date" type="date" className={T.input} value={date} onChange={(e) => { touch(); setDate(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); setDateBox(false) } }} />
          <button type="button" className={`${T.head} mt-3 px-4 py-1 text-sm`} onClick={() => setDateBox(false)}>OK</button>
        </Dialog>
      )}
      {creating && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4" onMouseDown={() => setCreating(null)}>
          <div className="mx-auto max-w-4xl border border-[#1f5f99] bg-[#f6f8fb] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <p className={`${T.head} px-3 py-1.5 text-sm font-semibold`}>Ledger Creation (from voucher)</p>
            <LedgerForm books={books} prefill={creating.name} by={by} fyFrom={date} canDelete={false}
              onDone={(name) => { if (name) creating.put(name); setCreating(null) }} onCancel={() => setCreating(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
