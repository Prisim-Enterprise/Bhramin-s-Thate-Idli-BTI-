import { recordBankStatement } from '../../../data/uploads'
import { useRef, useState } from 'react'
import { Link2, Upload, Wand2 } from 'lucide-react'
import { Button, Card, Table, inputCls } from '../../../components/ui'
import { branchName } from '../../../data/mock'
import { useCustomLedgers } from '../../../data/ledgerStore'
import { bankLinesNow, importLines } from '../../../data/banking'
import { readBankStatement } from '../../../lib/readBankStatement'
import { inrU, toUnits } from '../../../data/aggregator/money'
import { addMatch, allocated, autoMatch, lineLeft, looksZomato } from '../../../data/aggregator/recon'
import type { Recon } from '../../../data/aggregator/useRecon'

/** Bank credits: upload a statement, see the Zomato credits, and match each one to its week(s). */
export default function BankMatching({ R, by, canEdit }: { R: Recon; by: string; canEdit: boolean }) {
  const banks = useCustomLedgers().filter((l) => l.group === 'bank' || l.group === 'bankOD')
  const [bank, setBank] = useState(banks[0]?.name ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [all, setAll] = useState(false)
  const [target, setTarget] = useState<Record<string, string>>({})
  const [amt, setAmt] = useState<Record<string, string>>({})
  const file = useRef<HTMLInputElement>(null)

  const upload = async (f: File) => {
    setMsg(null)
    try {
      const s = await readBankStatement(f)
      if (!s.lines.length) return setMsg({ ok: false, text: s.note })
      const { added, skipped } = importLines(bank, s.lines, f.name, by)
      void recordBankStatement(f, bank, s, by)
      const n = autoMatch(R.weeks, bankLinesNow(), by)
      setMsg({ ok: true, text: `${s.note} ${added} new line(s)${skipped ? `, ${skipped} already uploaded` : ''}. ${n ? `${n} Zomato credit(s) matched automatically.` : 'No credit could be matched on evidence; match by hand below.'}` })
    } catch (e) { setMsg({ ok: false, text: `Could not read this file: ${e instanceof Error ? e.message : String(e)}` }) }
  }
  const run = () => { const n = autoMatch(R.weeks, R.lines, by); setMsg({ ok: true, text: n ? `${n} credit(s) matched on UTR or exact amount.` : 'Nothing more could be matched on evidence (UTR or exact amount). Match the rest by hand.' }) }

  const credits = R.lines.filter((l) => l.deposit > 0 && (all || looksZomato(l))).sort((a, b) => b.date.localeCompare(a.date))
  const open = R.weeks.filter((w) => !w.s.finalised)
  const weekOf = (id: string) => R.weeks.find((w) => w.s.id === id)

  return (
    <Card title="Bank credits" actions={canEdit && <Button size="sm" icon={Wand2} onClick={run}>Run automatic matching</Button>}>
      {canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">Bank account
            <select aria-label="Bank account" className={inputCls + ' mt-1 !w-auto'} value={bank} onChange={(e) => setBank(e.target.value)}>
              {banks.map((b) => <option key={b.name}>{b.name}</option>)}
              {!banks.length && <option value="">No bank ledger yet</option>}
            </select>
          </label>
          <Button icon={Upload} disabled={!bank} onClick={() => file.current?.click()}>Upload bank statement (Excel / CSV)</Button>
          <input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf" aria-label="Bank statement" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
          {!banks.length && <span className="text-xs text-amber-700">Create the bank ledger first: Gateway of Tally → Create → Ledger, group Bank Accounts.</span>}
        </div>
      )}
      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role="status">{msg.text}</p>}
      <label className="mb-2 flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show all credits (not only those that look like Zomato)</label>
      <Table head={['Date', 'Bank', 'Description', 'UTR / ref.', 'Credit', 'Matched', 'Left', 'Matched to', '']}>
        {credits.map((l) => {
          const left = lineLeft(l, R.matches)
          const to = R.matches.filter((m) => m.bankLineId === l.id)
          return (
            <tr key={l.id} data-testid="credit-row">
              <td>{l.date}</td><td>{l.ledger}</td><td className="max-w-[260px] truncate" title={l.narration}>{l.narration}</td><td>{l.ref || '—'}</td>
              <td className="tabular-nums">{inrU(toUnits(String(l.deposit)) ?? 0)}</td><td className="tabular-nums">{inrU(allocated(l.id, R.matches))}</td>
              <td className={`tabular-nums ${left > 0 ? 'font-semibold text-amber-700' : 'text-emerald-700'}`}>{inrU(left)}</td>
              <td className="text-xs">{to.map((m) => { const w = weekOf(m.settlementId); return <span key={m.id} className="block">{w ? `${branchName(w.s.branch)} ${w.s.date}` : m.settlementId}: {inrU(m.amount)}</span> })}{!to.length && <span className="text-slate-400">—</span>}</td>
              <td>{canEdit && left > 0 && open.length > 0 && (
                <span className="flex items-center gap-1">
                  <select aria-label={`Week for ${l.date} ${l.deposit}`} className={inputCls + ' !w-auto !py-1 text-xs'} value={target[l.id] ?? ''} onChange={(e) => {
                    setTarget({ ...target, [l.id]: e.target.value })
                    const w = weekOf(e.target.value); if (w) setAmt({ ...amt, [l.id]: (Math.max(0, Math.min(left, w.difference)) / 10000).toFixed(2) })
                  }}>
                    <option value="">Match to week…</option>
                    {open.map((w) => <option key={w.s.id} value={w.s.id}>{branchName(w.s.branch)} {w.s.date} · {inrU(w.difference)} due</option>)}
                  </select>
                  {target[l.id] && <>
                    <input aria-label={`Amount for ${l.date} ${l.deposit}`} className={inputCls + ' !w-24 !py-1 text-right text-xs'} value={amt[l.id] ?? ''} onChange={(e) => setAmt({ ...amt, [l.id]: e.target.value })} />
                    <Button size="sm" icon={Link2} onClick={() => { try { addMatch(weekOf(target[l.id])!.s, l, toUnits(amt[l.id]) ?? 0, by, 'manual', R.lines); setTarget({ ...target, [l.id]: '' }); setMsg({ ok: true, text: 'Matched.' }) } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }) } }}>Match</Button>
                  </>}
                </span>
              )}</td>
            </tr>
          )
        })}
        {!credits.length && <tr><td colSpan={9} className="!py-8 text-center text-slate-500">No {all ? '' : 'Zomato '}credits in the uploaded bank statements yet.</td></tr>}
      </Table>
    </Card>
  )
}
