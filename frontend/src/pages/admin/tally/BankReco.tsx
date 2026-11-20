import { useEffect, useMemo, useRef, useState } from 'react'
import { branchName } from '../../../data/mock'
import { particulars } from '../../../data/books'
import { autoMatch, bankEntries, ignoreLine, importLines, reconcile, saveMatches, setBankDate, useBankLines, useBankRecos, type BankEntry, type BankLine } from '../../../data/banking'
import { ledgerKey } from '../../../data/ledgerStore'
import { readBankStatement } from '../../../lib/readBankStatement'
import { T, amt, bal, tDate, useScreenKeys } from './ui'
import type { Books } from './useBooks'
import type { VoucherPrefill } from './VoucherForm'

/** Banking → Bank Reconciliation, as in Tally: bank dates, statement upload, auto-match, and the reconciliation. */
export function BankReco({ books, ledger, asOn: asOn0, by, canEdit, onNewVoucher }: {
  books: Books; ledger: string; asOn: string; by: string; canEdit: boolean
  onNewVoucher: (type: 'Receipt' | 'Payment', prefill: VoucherPrefill) => void
}) {
  const recos = useBankRecos()
  const allLines = useBankLines()
  const [asOn, setAsOn] = useState(asOn0)
  const [showAll, setShowAll] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const info = books.find(ledger)
  const opening = info?.custom?.opening ?? 0
  const stmt = useMemo(() => allLines.filter((l) => ledgerKey(l.ledger) === ledgerKey(ledger)), [allLines, ledger])
  const entries = useMemo(() => bankEntries(books.vouchers, ledger, recos), [books.vouchers, ledger, recos])
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
      setMsg({ tone: 'ok', text: `${s.note} ${added} new${skipped ? `, ${skipped} already uploaded` : ''}${s.from ? ` (${tDate(s.from)} to ${tDate(s.to)})` : ''}. Matching them with the books now.` })
      if (s.to && s.to > asOn) setAsOn(s.to)
    } catch (e) {
      setMsg({ tone: 'warn', text: `Could not read this file: ${e instanceof Error ? e.message : String(e)}` })
    } finally { setBusy(false) }
  }
  useScreenKeys({ 'alt+o': () => file.current?.click() })

  const shown = entries.filter((e) => e.v.date <= asOn && (showAll || !e.reco || e.reco.bankDate > asOn))
  const lineOf = new Map(stmt.map((l) => [l.id, l]))
  const name = (e: BankEntry) => e.v.party ?? (e.v.postings.find((p) => ledgerKey(p.ledger) !== ledgerKey(ledger))?.ledger ?? particulars(e.v))
  const reconciled = r.difference != null && Math.abs(r.difference) < 0.005 && r.open === 0 && !r.extra.length

  const newVoucher = (l: BankLine) => {
    const dep = l.deposit > 0
    onNewVoucher(dep ? 'Receipt' : 'Payment', {
      date: l.date, refNo: l.ref || undefined, narration: l.narration,
      lines: dep
        ? [{ side: 'Cr', ledger: '', amount: l.deposit }, { side: 'Dr', ledger, amount: l.deposit }]
        : [{ side: 'Dr', ledger: '', amount: l.withdrawal }, { side: 'Cr', ledger, amount: l.withdrawal }],
    })
  }
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
        <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf,.htm,.html" aria-label="Bank statement file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      </div>
      {msg && <p role="status" className={`mt-3 border-l-4 px-3 py-1.5 text-sm ${msg.tone === 'ok' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800'}`}>{msg.text}</p>}

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
                <th className="px-2 py-1 text-left">Date</th><th className="px-2 text-left">Particulars</th><th className="px-2 text-left">Vch Type</th><th className="px-2 text-right">No.</th>
                <th className="px-2 text-right">Deposit (Dr)</th><th className="px-2 text-right">Withdrawal (Cr)</th><th className="px-2 text-left">Bank Date</th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const l = e.reco?.lineId ? lineOf.get(e.reco.lineId) : undefined
                  return (
                    <tr key={e.v.id} className="border-t border-[#e3e9ef]">
                      <td className="px-2 py-1 tabular-nums">{tDate(e.v.date)}</td>
                      <td className="px-2"><span className="font-medium">{name(e)}</span>{e.v.refNo && <span className="text-xs text-[#5a6b7c]"> · {e.v.refNo}</span>}<span className="block text-[11px] text-[#5a6b7c]">{branchName(e.v.branch)}</span></td>
                      <td className="px-2">{e.v.type}</td><td className="px-2 text-right tabular-nums">{e.v.typeNo}</td>
                      <td className="px-2 text-right tabular-nums">{e.dir === 'dep' ? amt(e.amount) : ''}</td>
                      <td className="px-2 text-right tabular-nums">{e.dir === 'wd' ? amt(e.amount) : ''}</td>
                      <td className="px-2">
                        <input aria-label={`Bank date ${e.v.type} ${e.v.typeNo}`} type="date" disabled={!canEdit} className={T.input + ' !w-36'} value={e.reco?.bankDate ?? ''}
                          onChange={(ev) => setBankDate(e.v.id, ledger, ev.target.value || null, by, e.reco?.lineId)} />
                        {l && <span className="block text-[11px] text-emerald-700">matched to statement</span>}
                      </td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={7} className="px-2 py-6 text-center text-[#5a6b7c]">{entries.length ? 'Every entry up to this date is in the bank.' : 'No entries in this bank ledger yet.'}</td></tr>}
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
