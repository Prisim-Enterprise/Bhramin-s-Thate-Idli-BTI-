import { recordBankStatement } from '../../../data/uploads'
import { useEffect, useMemo, useRef, useState } from 'react'
import { branchName } from '../../../data/mock'
import { particulars } from '../../../data/books'
import {
  addOpeningItem, autoMatch, bankDateError, bankEntries, deleteOpeningItem, guessBankLedger, ignoreLine, importLines, openingEntries, reconcile,
  saveMatches, setBankDate, useBankLines, useBankOpening, useBankRecos, type BankEntry, type BankLine,
} from '../../../data/banking'
import { ledgerKey } from '../../../data/ledgerStore'
import { readBankStatement } from '../../../lib/readBankStatement'
import { useCompany } from '../../../data/company'
import { partnerLedger, useSettlements } from '../../../data/settlements'
import { T, amt, bal, tDate, useScreenKeys } from './ui'
import type { Books } from './useBooks'
import type { VoucherPrefill } from './VoucherForm'

/** Banking → Bank Reconciliation, as in Tally: bank dates, statement upload, auto-match, and the reconciliation. */
export function BankReco({ books, ledger, asOn: asOn0, by, canEdit, onNewVoucher }: {
  books: Books; ledger: string; asOn: string; by: string; canEdit: boolean
  onNewVoucher: (type: 'Receipt' | 'Payment', prefill: VoucherPrefill) => void
}) {
  const recos = useBankRecos()
  const settlements = useSettlements()
  const allLines = useBankLines()
  const openItems = useBankOpening()
  const company = useCompany()
  const [asOn, setAsOn] = useState(asOn0)
  const [showAll, setShowAll] = useState(false)
  const [showOpening, setShowOpening] = useState(false)
  const blankOb = { date: '', particulars: '', instrumentNo: '', dir: 'wd' as 'dep' | 'wd', amount: '' }
  const [ob, setOb] = useState(blankOb)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const info = books.find(ledger)
  const opening = info?.custom?.opening ?? 0
  const stmt = useMemo(() => allLines.filter((l) => ledgerKey(l.ledger) === ledgerKey(ledger)), [allLines, ledger])
  const obHere = useMemo(() => openItems.filter((o) => ledgerKey(o.ledger) === ledgerKey(ledger)), [openItems, ledger])
  const entries = useMemo(
    () => [...openingEntries(obHere, ledger, recos), ...bankEntries(books.vouchers, ledger, recos)].sort((a, b) => a.v.date.localeCompare(b.v.date)),
    [books.vouchers, ledger, recos, obHere])
  const r = reconcile(entries, stmt, recos, opening, asOn)

  // Match whatever can be matched: after an upload, and when a missing voucher has just been entered.
  // Not when a bank date is cleared by hand: that choice stays.
  useEffect(() => {
    if (!canEdit || !stmt.length) return
    const found = autoMatch(entries, stmt, recos)
    if (found.length) saveMatches(ledger, found, by)
  }, [entries.length, stmt.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (f: File) => {
    setBusy(true); setMsg(null)
    try {
      const s = await readBankStatement(f)
      if (!s.lines.length) return setMsg({ tone: 'warn', text: s.note })
      const { added, skipped } = importLines(ledger, s.lines, f.name, by)
      void recordBankStatement(f, ledger, s, by)
      setMsg({ tone: 'ok', text: `${s.note} ${added} new${skipped ? `, ${skipped} already uploaded` : ''}${s.from ? ` (${tDate(s.from)} to ${tDate(s.to)})` : ''}. Matching them with the books now.` })
      if (s.to && s.to > asOn) setAsOn(s.to)
    } catch (e) {
      setMsg({ tone: 'warn', text: `Could not read this file: ${e instanceof Error ? e.message : String(e)}` })
    } finally { setBusy(false) }
  }
  useScreenKeys({ 'alt+o': () => file.current?.click(), 'ctrl+p': () => printBrs() })

  // Tally won't take a bank date before the voucher date.
  const changeBankDate = (e: BankEntry, d: string) => {
    const bad = bankDateError(e.v.date, d)
    if (bad) return setMsg({ tone: 'warn', text: `${bad} (${e.v.type} of ${tDate(e.v.date)})` })
    setBankDate(e.v.id, ledger, d || null, by, d ? e.reco?.lineId : undefined)
  }

  const saveOpening = () => {
    const amount = Math.round(Number(ob.amount) * 100) / 100
    if (!ob.date || !ob.particulars.trim() || !(amount > 0)) return setMsg({ tone: 'warn', text: 'Opening BRS: give the date, particulars and amount.' })
    addOpeningItem({ ledger, date: ob.date, particulars: ob.particulars.trim(), instrumentNo: ob.instrumentNo.trim() || undefined, dir: ob.dir, amount, by })
    setOb(blankOb)
    setMsg({ tone: 'ok', text: `Opening BRS: ${ob.dir === 'wd' ? 'cheque issued' : 'deposit'} of ${amt(amount)} added. Give it a bank date once it shows on the statement.` })
  }

  // The reconciliation statement on paper (Tally's Ctrl+P).
  const printBrs = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const open = entries.filter((e) => e.v.date <= asOn && (!e.reco || e.reco.bankDate > asOn))
    const row = (e: BankEntry) => `<tr><td>${tDate(e.v.date)}</td><td>${esc(name(e))}</td><td>${esc(e.v.type)}</td><td>${esc(e.v.refNo ?? '')}</td><td class="n">${amt(e.amount)}</td></tr>`
    const part = (title: string, list: BankEntry[]) => list.length ? `<h3>${title}</h3><table><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th>Instrument No.</th><th class="n">Amount</th></tr>${list.map(row).join('')}</table>` : ''
    const line = (l: BankLine) => `<tr><td>${tDate(l.date)}</td><td>${esc(l.narration)}</td><td class="n">${amt(l.withdrawal)}</td><td class="n">${amt(l.deposit)}</td></tr>`
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Bank Reconciliation ${esc(ledger)}</title>
<style>body{font:13px Arial,sans-serif;margin:24px;color:#111}h2{margin:0}h3{margin:18px 0 4px;font-size:13px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:3px 6px;text-align:left}.n{text-align:right}.s td{border:0;padding:2px 6px}.b td{font-weight:bold;border-top:1px solid #111}</style>
<h2>${esc(company?.name ?? '')}</h2><p>Bank Reconciliation Statement: <b>${esc(ledger)}</b> as on ${tDate(asOn)}</p>
<table class="s">
<tr><td>Balance as per Company Books</td><td class="n">${bal(r.books)}</td></tr>
<tr><td>Less: Deposits not yet credited by the bank</td><td class="n">${amt(r.notInBankDep) || '0.00'}</td></tr>
<tr><td>Add: Cheques issued, not yet debited by the bank</td><td class="n">${amt(r.notInBankWd) || '0.00'}</td></tr>
<tr class="b"><td>Balance as per Bank</td><td class="n">${bal(r.asPerBank)}</td></tr>
${stmt.length ? `<tr><td>Add: Credits in the bank, not in the books</td><td class="n">${amt(r.notInBooksDep) || '0.00'}</td></tr>
<tr><td>Less: Debits in the bank, not in the books</td><td class="n">${amt(r.notInBooksWd) || '0.00'}</td></tr>
<tr class="b"><td>Closing balance on the statement</td><td class="n">${r.statementClosing == null ? 'not shown' : bal(r.statementClosing)}</td></tr>
${r.difference != null ? `<tr><td>Difference</td><td class="n">${Math.abs(r.difference) < 0.005 ? '0.00' : bal(r.difference)}</td></tr>` : ''}` : ''}
</table>
${part('Deposits not yet credited by the bank', open.filter((e) => e.dir === 'dep'))}
${part('Cheques issued, not yet debited by the bank', open.filter((e) => e.dir === 'wd'))}
${r.extra.length ? `<h3>On the bank statement, not in the books</h3><table><tr><th>Date</th><th>Narration</th><th class="n">Withdrawal</th><th class="n">Deposit</th></tr>${r.extra.map(line).join('')}</table>` : ''}
<p style="margin-top:24px;color:#666">Printed ${new Date().toLocaleString('en-IN')} by ${esc(by)}</p>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const shown = entries.filter((e) => e.v.date <= asOn && (showAll || !e.reco || e.reco.bankDate > asOn))
  const lineOf = new Map(stmt.map((l) => [l.id, l]))
  const name = (e: BankEntry) => e.v.party ?? (e.v.postings.find((p) => ledgerKey(p.ledger) !== ledgerKey(ledger))?.ledger ?? particulars(e.v))
  const reconciled = r.difference != null && Math.abs(r.difference) < 0.005 && r.open === 0 && !r.extra.length

  const newVoucher = (l: BankLine) => {
    const dep = l.deposit > 0
    onNewVoucher(dep ? 'Receipt' : 'Payment', {
      date: l.date, refNo: l.ref || undefined, narration: l.narration,
      lines: dep
        ? [{ side: 'Cr', ledger: payoutOf(l) ?? guessBankLedger(l), amount: l.deposit }, { side: 'Dr', ledger, amount: l.deposit }]
        : [{ side: 'Dr', ledger: guessBankLedger(l), amount: l.withdrawal }, { side: 'Cr', ledger, amount: l.withdrawal }],
    })
  }
  // A Swiggy / Zomato payout already matched to its weekly statement goes to that partner's ledger for the outlet.
  function payoutOf(l: BankLine) { const st = settlements.find((x) => x.bankLineId === l.id); return st ? partnerLedger(st.partner, st.branch) : undefined }
  const matchTo = (l: BankLine, voucherId: string) => { setBankDate(voucherId, ledger, l.date, by, l.id); setMsg({ tone: 'ok', text: `Matched with the statement line of ${tDate(l.date)}.` }) }
  const open = entries.filter((e) => !e.reco)

  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-[#5a6b7c]">Bank ledger</p>
          <p className="text-lg font-bold">{ledger}</p>
          <p className="text-xs text-[#5a6b7c]">{info?.custom?.bankAcNo ? `A/c ${info.custom.bankAcNo}` : ''}{info?.custom?.ifsc ? ` · ${info.custom.ifsc}` : ''}</p>
        </div>
        <label className="ml-auto text-sm">Reconcile as on<input aria-label="Reconcile as on" type="date" className={T.input} value={asOn} onChange={(e) => e.target.value && setAsOn(e.target.value)} /></label>
        {canEdit && <button type="button" disabled={busy} onClick={() => file.current?.click()} className={`${T.head} px-3 py-1.5 text-sm font-semibold disabled:opacity-60`}>{busy ? 'Reading…' : 'Upload bank statement (Alt+O)'}</button>}
        <button type="button" onClick={() => setShowOpening((x) => !x)} className="border border-[#1f5f99] bg-white px-3 py-1.5 text-sm font-semibold text-[#1f5f99]">Opening BRS{obHere.length ? ` (${obHere.length})` : ''}</button>
        <button type="button" onClick={printBrs} className="border border-[#1f5f99] bg-white px-3 py-1.5 text-sm font-semibold text-[#1f5f99]">Print (Ctrl+P)</button>
        <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf,.htm,.html" aria-label="Bank statement file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      </div>
      {msg && <p role="status" className={`mt-3 border-l-4 px-3 py-1.5 text-sm ${msg.tone === 'ok' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800'}`}>{msg.text}</p>}

      {showOpening && (
        <section aria-label="Opening BRS" className="mt-3 border border-[#c5d1de] bg-white p-3 text-sm">
          <p className="font-semibold text-[#1f5f99]">Opening BRS: entries from before the books started that the bank hadn't cleared</p>
          <p className="mb-2 text-xs text-[#5a6b7c]">For example a cheque issued in March that the bank paid in April. It is already inside this ledger's opening balance, so only the reconciliation uses it.</p>
          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">Date<input aria-label="Opening BRS date" type="date" className={T.input + ' !w-36'} value={ob.date} onChange={(e) => setOb({ ...ob, date: e.target.value })} /></label>
              <label className="text-xs">Particulars<input aria-label="Opening BRS particulars" className={T.input + ' !w-48'} value={ob.particulars} onChange={(e) => setOb({ ...ob, particulars: e.target.value })} /></label>
              <label className="text-xs">Instrument No.<input aria-label="Opening BRS instrument no" className={T.input + ' !w-28'} value={ob.instrumentNo} onChange={(e) => setOb({ ...ob, instrumentNo: e.target.value })} /></label>
              <label className="text-xs">Type<select aria-label="Opening BRS type" className={T.input + ' !w-44'} value={ob.dir} onChange={(e) => setOb({ ...ob, dir: e.target.value as 'dep' | 'wd' })}>
                <option value="wd">Cheque issued (withdrawal)</option><option value="dep">Deposited (not yet credited)</option></select></label>
              <label className="text-xs">Amount<input aria-label="Opening BRS amount" inputMode="decimal" className={T.input + ' !w-28 text-right'} value={ob.amount} onChange={(e) => setOb({ ...ob, amount: e.target.value })} /></label>
              <button type="button" onClick={saveOpening} className={`${T.head} px-3 py-1.5 text-sm font-semibold`}>Add</button>
            </div>
          )}
          {obHere.length > 0 ? (
            <table className="mt-3 w-full border border-[#e3e9ef] text-sm">
              <thead className="bg-[#eef3f9]"><tr><th className="px-2 py-1 text-left">Date</th><th className="px-2 text-left">Particulars</th><th className="px-2 text-left">Instrument No.</th><th className="px-2 text-right">Deposit</th><th className="px-2 text-right">Withdrawal</th><th className="px-2 text-left">Bank Date</th><th /></tr></thead>
              <tbody>{entries.filter((e) => e.opening).map((e) => (
                <tr key={e.v.id} className="border-t border-[#e3e9ef]">
                  <td className="px-2 py-1">{tDate(e.v.date)}</td><td className="px-2">{e.v.party}</td><td className="px-2">{e.v.refNo}</td>
                  <td className="px-2 text-right tabular-nums">{e.dir === 'dep' ? amt(e.amount) : ''}</td><td className="px-2 text-right tabular-nums">{e.dir === 'wd' ? amt(e.amount) : ''}</td>
                  <td className="px-2">{e.reco ? tDate(e.reco.bankDate) : <span className="text-amber-700">not cleared</span>}</td>
                  <td className="px-2 text-right">{canEdit && <button type="button" className="text-xs text-rose-700 hover:underline" onClick={() => { if (confirm('Remove this Opening BRS entry?')) deleteOpeningItem(e.v.id) }}>Remove</button>}</td>
                </tr>))}</tbody>
            </table>
          ) : <p className="mt-2 text-xs text-[#5a6b7c]">None entered.</p>}
        </section>
      )}

      {/* The reconciliation, as Tally prints it under the table */}
      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="order-2 min-w-0 xl:order-1">
          <div className="mb-2 flex items-center justify-between text-sm">
            <p className="font-semibold text-[#1f5f99]">Entries in the books {showAll ? '' : 'not yet in the bank'} ({shown.length})</p>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show reconciled too</label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border border-[#c5d1de] bg-white text-sm">
              <thead className={T.title}><tr>
                <th className="px-2 py-1 text-left">Date</th><th className="px-2 text-left">Particulars</th><th className="px-2 text-left">Vch Type</th><th className="px-2 text-right">No.</th><th className="px-2 text-left">Instrument No.</th>
                <th className="px-2 text-right">Deposit (Dr)</th><th className="px-2 text-right">Withdrawal (Cr)</th><th className="px-2 text-left">Bank Date</th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const l = e.reco?.lineId ? lineOf.get(e.reco.lineId) : undefined
                  return (
                    <tr key={e.v.id} className="border-t border-[#e3e9ef]">
                      <td className="px-2 py-1 tabular-nums">{tDate(e.v.date)}</td>
                      <td className="px-2"><span className="font-medium">{name(e)}</span>{e.v.branch && <span className="block text-[11px] text-[#5a6b7c]">{branchName(e.v.branch)}</span>}</td>
                      <td className="px-2">{e.v.type}</td><td className="px-2 text-right tabular-nums">{e.opening ? '' : e.v.typeNo}</td><td className="px-2">{e.v.refNo}</td>
                      <td className="px-2 text-right tabular-nums">{e.dir === 'dep' ? amt(e.amount) : ''}</td>
                      <td className="px-2 text-right tabular-nums">{e.dir === 'wd' ? amt(e.amount) : ''}</td>
                      <td className="px-2">
                        <input aria-label={`Bank date ${e.v.type} ${e.v.typeNo}`} type="date" disabled={!canEdit} className={T.input + ' !w-36'} value={e.reco?.bankDate ?? ''}
                          onChange={(ev) => changeBankDate(e, ev.target.value)} />
                        {l && <span className="block text-[11px] text-emerald-700">matched to statement</span>}
                      </td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={8} className="px-2 py-6 text-center text-[#5a6b7c]">{entries.length ? 'Every entry up to this date is in the bank.' : 'No entries in this bank ledger yet.'}</td></tr>}
              </tbody>
            </table>
          </div>

          {r.extra.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-sm font-semibold text-[#b45309]">On the bank statement but not in the books ({r.extra.length})</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border border-amber-300 bg-white text-sm">
                  <thead className="bg-amber-50"><tr>
                    <th className="px-2 py-1 text-left">Date</th><th className="px-2 text-left">Narration</th><th className="px-2 text-right">Withdrawal</th><th className="px-2 text-right">Deposit</th><th className="px-2 text-left">Action</th>
                  </tr></thead>
                  <tbody>
                    {r.extra.map((l) => {
                      const same = open.filter((e) => e.dir === (l.deposit ? 'dep' : 'wd') && Math.abs(e.amount - (l.deposit || l.withdrawal)) < 0.005)
                      return (
                        <tr key={l.id} className="border-t border-amber-100 align-top">
                          <td className="px-2 py-1 tabular-nums">{tDate(l.date)}</td>
                          <td className="px-2"><span className="block max-w-[360px] truncate" title={l.narration}>{l.narration || '—'}</span>{l.ref && <span className="text-[11px] text-[#5a6b7c]">Ref {l.ref}</span>}</td>
                          <td className="px-2 text-right tabular-nums">{amt(l.withdrawal)}</td><td className="px-2 text-right tabular-nums">{amt(l.deposit)}</td>
                          <td className="px-2 py-1">
                            {canEdit && <div className="flex flex-wrap gap-2 text-xs">
                              <button type="button" className="font-semibold text-[#1f5f99] hover:underline" onClick={() => newVoucher(l)}>Enter {l.deposit ? 'Receipt' : 'Payment'}</button>
                              {same.length > 0 && (
                                <select aria-label={`Match ${tDate(l.date)} ${l.deposit || l.withdrawal}`} className="border border-[#c5d1de] px-1" value="" onChange={(e) => e.target.value && matchTo(l, e.target.value)}>
                                  <option value="">Match to…</option>
                                  {same.map((e) => <option key={e.v.id} value={e.v.id}>{tDate(e.v.date)} {e.v.type} {e.v.typeNo} · {name(e)}</option>)}
                                </select>
                              )}
                              <button type="button" className="text-[#5a6b7c] hover:underline" onClick={() => ignoreLine(l.id, true)}>Ignore</button>
                            </div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {stmt.some((l) => l.ignored) && (
            <p className="mt-2 text-xs text-[#5a6b7c]">{stmt.filter((l) => l.ignored).length} statement line(s) ignored. <button type="button" className="underline" onClick={() => stmt.filter((l) => l.ignored).forEach((l) => ignoreLine(l.id, false))}>Bring them back</button></p>
          )}
        </div>

        <aside className="order-1 h-fit min-w-0 border border-[#1f5f99] bg-white text-sm xl:order-2">
          <p className={`${T.head} px-3 py-1.5 font-semibold`}>Reconciliation as on {tDate(asOn)}</p>
          <dl className="divide-y divide-[#e3e9ef]">
            <div className="flex justify-between px-3 py-1.5"><dt>Balance as per Company Books</dt><dd className="font-semibold tabular-nums">{bal(r.books)}</dd></div>
            <div className="px-3 py-1.5">
              <dt className="text-[#33475b]">Amounts not reflected in Bank</dt>
              <dd className="flex justify-between pl-3 text-xs"><span>Deposits not yet credited</span><span className="tabular-nums">{r.notInBankDep ? '− ' + amt(r.notInBankDep) : '0.00'}</span></dd>
              <dd className="flex justify-between pl-3 text-xs"><span>Payments not yet debited</span><span className="tabular-nums">{r.notInBankWd ? '+ ' + amt(r.notInBankWd) : '0.00'}</span></dd>
            </div>
            <div className="flex justify-between bg-[#eef3f9] px-3 py-1.5 font-semibold"><dt>Balance as per Bank</dt><dd className="tabular-nums">{bal(r.asPerBank)}</dd></div>
            {stmt.length > 0 && <>
              <div className="px-3 py-1.5">
                <dt className="text-[#33475b]">Amounts not reflected in Company Books</dt>
                <dd className="flex justify-between pl-3 text-xs"><span>Credits in bank, not in books</span><span className="tabular-nums">{r.notInBooksDep ? '+ ' + amt(r.notInBooksDep) : '0.00'}</span></dd>
                <dd className="flex justify-between pl-3 text-xs"><span>Debits in bank, not in books</span><span className="tabular-nums">{r.notInBooksWd ? '− ' + amt(r.notInBooksWd) : '0.00'}</span></dd>
              </div>
              <div className="flex justify-between px-3 py-1.5"><dt>Closing balance on the statement</dt><dd className="font-semibold tabular-nums">{r.statementClosing == null ? 'not shown' : bal(r.statementClosing)}</dd></div>
              {r.difference != null && <div className={`flex justify-between px-3 py-1.5 font-semibold ${Math.abs(r.difference) < 0.005 ? 'text-emerald-700' : 'text-rose-700'}`}><dt>Difference</dt><dd className="tabular-nums">{Math.abs(r.difference) < 0.005 ? '0.00 ✓' : bal(r.difference)}</dd></div>}
            </>}
          </dl>
          <p className={`px-3 py-2 text-xs ${reconciled ? 'bg-emerald-50 text-emerald-800' : 'text-[#5a6b7c]'}`}>
            {reconciled ? 'Reconciled: the books and the bank statement agree.'
              : stmt.length ? `${r.open} entr${r.open === 1 ? 'y' : 'ies'} not yet in the bank · ${r.extra.length} statement line(s) not in the books.`
                : 'Upload the bank statement to match it automatically, or type the bank date against each entry.'}
          </p>
        </aside>
      </div>
    </div>
  )
}
