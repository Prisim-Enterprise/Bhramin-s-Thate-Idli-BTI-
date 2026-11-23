import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Link2, Upload } from 'lucide-react'
import { Button, Card, inputCls } from '../../../components/ui'
import { BRANCHES, branchName } from '../../../data/mock'
import { keepFile } from '../../../data/ledgerStore'
import { API_ON, importGoogleSheet } from '../../../lib/api'
import { readZomatoFile, type ZRead } from '../../../lib/readZomato'
import { inrU } from '../../../data/aggregator/money'
import { DEFAULT_ZRULES, calcZomato } from '../../../data/aggregator/zomatoEngine'
import { checkImport, importStatement } from '../../../data/aggregator/recon'
import type { Recon } from '../../../data/aggregator/useRecon'

type Preview = ZRead & { hash: string; file: File; source: 'xlsx' | 'csv' | 'gsheet' }

/** Upload (Excel / CSV) or fetch (Google Sheet) a Zomato statement, preview what was read, then import it. */
export default function StatementImport({ R, by, canEdit, onImported }: { R: Recon; by: string; canEdit: boolean; onImported: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [p, setP] = useState<Preview | null>(null)
  const [branch, setBranch] = useState('')
  const [sheet, setSheet] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const read = async (file: File, source: Preview['source']) => {
    setBusy('Reading ' + file.name + '…'); setErr(null); setP(null)
    try {
      const r = await readZomatoFile(file)
      setP({ ...r, file, source: source === 'gsheet' ? 'gsheet' : /\.csv$/i.test(file.name) ? 'csv' : 'xlsx' })
      // Outlet: remembered for this restaurant ID, otherwise found in the name / address.
      const st = r.statement
      const known = st && R.outlets.find((o) => o.partner === 'zomato' && o.resId === st.resId)?.branch
      const byText = st && BRANCHES.find((b) => b.id !== 'CK' && new RegExp(b.name.replace(/\s+/g, '\\s*'), 'i').test(`${st.resName} ${st.address}`))?.id
      setBranch(known || byText || '')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }
  const fetchSheet = async () => {
    setBusy('Fetching the Google Sheet…'); setErr(null)
    try { await read(await importGoogleSheet(sheet.trim()), 'gsheet') } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null) }
  }

  const st = p?.statement ?? null
  const check = st && p ? checkImport(st, branch || null, p.hash, R.settlements) : null
  const calc = st ? calcZomato(st, DEFAULT_ZRULES, { mode: null, value: null }, null) : null
  const row = (k: string) => st?.rows.find((r) => r.key === k)

  const doImport = async () => {
    if (!st || !p || !check?.ok || !branch) return
    if (check.replaces && !confirm(`${branchName(branch)}, week of ${check.replaces.date} already has a statement. Replace it with ${p.file.name}? The earlier import stays in the week's history.`)) return
    setBusy('Saving…')
    try {
      const kept = await keepFile(p.file, 2 * 1024 * 1024).catch(() => ({ name: p.file.name, type: p.file.type, size: p.file.size }))
      const s = importStatement({ st, branch, hash: p.hash, fileName: p.file.name, source: p.source, file: kept, by, replaces: check.replaces, all: R.terms })
      setP(null); onImported(s.id)
    } finally { setBusy(null) }
  }

  return (
    <Card title="Import a weekly Zomato statement">
      <div className="flex flex-wrap items-end gap-3">
        <Button icon={Upload} disabled={!canEdit || !!busy} onClick={() => input.current?.click()}>Upload Excel or CSV</Button>
        <input ref={input} type="file" hidden accept=".xlsx,.csv" aria-label="Zomato statement file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f, 'xlsx') }} />
        <span className="text-xs text-slate-400">or</span>
        <label className="min-w-[260px] flex-1 text-xs text-slate-500">Google Sheet link (shared “anyone with the link can view”)
          <input aria-label="Google Sheet link" className={inputCls + ' mt-1'} placeholder="https://docs.google.com/spreadsheets/d/…" value={sheet} disabled={!canEdit || !API_ON} onChange={(e) => setSheet(e.target.value)} />
        </label>
        <Button variant="secondary" icon={Link2} disabled={!canEdit || !API_ON || !sheet.trim() || !!busy} onClick={() => void fetchSheet()}>Fetch sheet</Button>
      </div>
      {!API_ON && <p className="mt-2 text-xs text-slate-400">Google Sheets import works on the live dashboard (it needs the server).</p>}
      {busy && <p className="mt-3 text-sm text-sky-700">{busy}</p>}
      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}

      {p && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4" data-testid="import-preview">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><FileSpreadsheet size={16} /> Preview: {p.file.name}</p>
          {p.errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="import-errors">
              {p.errors.map((e) => <li key={e} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{e}</li>)}
            </ul>
          )}
          {p.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-700">{w}</p>)}
          {st && calc && (
            <>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <dt className="text-slate-500">Period</dt><dd>{st.from} to {st.to}</dd>
                <dt className="text-slate-500">Restaurant</dt><dd>{st.resName} · ID {st.resId}</dd>
                <dt className="text-slate-500">Orders</dt><dd>{st.orders ?? '—'}</dd>
                <dt className="text-slate-500">Outlet</dt>
                <dd><select aria-label="Outlet" className={inputCls + ' !w-auto !py-1'} value={branch} onChange={(e) => setBranch(e.target.value)}>
                  <option value="">Pick the outlet…</option>{BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select></dd>
              </dl>
              <table className="mt-3 w-full text-sm tabular-nums" data-testid="preview-values">
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-1 text-slate-600">A · Net order value (delivered)</td><td className="text-right">{inrU(row('A')?.delivered ?? 0)}</td></tr>
                  <tr><td className="py-1 text-slate-600">Total commissionable value (items 9 + 10 + 11)</td><td className="text-right">{inrU(calc.dynamic.commissionableValue.amount)}</td></tr>
                  <tr><td className="py-1 text-slate-600">Investment in growth services (items 24 + 25 + 26)</td><td className="text-right">{inrU(calc.dynamic.growthServices.amount)}</td></tr>
                  <tr><td className="py-1 text-slate-600">Other order-level deductions (items 21 + 22 + 23)</td><td className="text-right">{inrU(calc.dynamic.otherOrderDeductions.amount)}</td></tr>
                  <tr><td className="py-1 text-slate-600">Net payout worked out from the statement</td><td className="text-right font-semibold">{inrU(calc.statementPayout.amount)}</td></tr>
                  <tr><td className="py-1 text-slate-600">Net payout printed by Zomato</td><td className="text-right">{st.printedNetPayout == null ? '—' : inrU(st.printedNetPayout)} {calc.payoutCheck.ok ? <CheckCircle2 size={14} className="inline text-emerald-600" /> : <AlertTriangle size={14} className="inline text-rose-600" />}</td></tr>
                </tbody>
              </table>
              {calc.structure.filter((c) => !c.ok).map((c) => <p key={c.key} className="mt-1 text-xs text-rose-700">Row {c.key} doesn't add up: printed {inrU(c.printed ?? 0)}, rows give {inrU(c.computed)}.</p>)}
            </>
          )}
          {check && check.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-amber-800" data-testid="import-problems">{check.problems.map((x) => <li key={x}>• {x}</li>)}</ul>
          )}
          {check?.ok && check.replaces && <p className="mt-3 text-sm text-amber-800">This week already has a statement: importing replaces its figures (the earlier import stays in its history).</p>}
          <div className="mt-4 flex gap-2">
            <Button icon={CheckCircle2} disabled={!st || !check?.ok || !!busy} onClick={() => void doImport()}>Import statement</Button>
            <Button variant="secondary" onClick={() => setP(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
