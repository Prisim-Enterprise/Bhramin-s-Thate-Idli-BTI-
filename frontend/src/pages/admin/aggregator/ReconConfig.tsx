import { useState } from 'react'
import { History, Save } from 'lucide-react'
import { Button, Card, Table, inputCls } from '../../../components/ui'
import { BRANCHES, branchName } from '../../../data/mock'
import { effectiveOf, saveTerms, termsFor, versionsOf, weekStart, type PartnerTerms } from '../../../data/settlements'
import { DEFAULT_ZRULES, type Col, type Term, type ZRules } from '../../../data/aggregator/zomatoEngine'
import { inrU, toUnits } from '../../../data/aggregator/money'
import type { Recon } from '../../../data/aggregator/useRecon'

// "+9 +10 +11", "+12 -15", "+24:total" ⇄ terms
export const termsText = (ts: Term[]) => ts.map((x) => `${x.sign < 0 ? '-' : '+'}${x.item}${x.col !== 'delivered' ? ':' + x.col : ''}`).join(' ')
export function parseTerms(s: string): Term[] | null {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return null
  const out: Term[] = []
  for (const p of parts) {
    const m = p.match(/^([+-]?)(\d{1,2}|[A-J])(?::(delivered|cancelled|total))?$/i)
    if (!m) return null
    out.push({ item: m[2].toUpperCase(), sign: m[1] === '-' ? -1 : 1, col: ((m[3] ?? 'delivered').toLowerCase()) as Col })
  }
  return out
}
const RULE_FIELDS: { key: keyof Omit<ZRules, 'tolerance'>; label: string }[] = [
  { key: 'growthServices', label: 'Investment in growth services' },
  { key: 'commissionableValue', label: 'Total commissionable value' },
  { key: 'otherOrderDeductions', label: 'Other order-level deductions' },
  { key: 'commissionCharged', label: 'Commission charged by Zomato' },
]

/** Admin-only: commission, advertisement budget and the statement rows behind each value, as versions from a date. */
export default function ReconConfig({ R, by, canConfig }: { R: Recon; by: string; canConfig: boolean }) {
  const today = new Date().toLocaleDateString('en-CA')
  const cur = termsFor(R.terms, 'zomato', '*', today)
  const [branch, setBranch] = useState('*')
  const [from, setFrom] = useState(weekStart(today))
  const [cMode, setCMode] = useState<'pct' | 'fixed' | ''>(cur?.commissionMode ?? (cur?.commissionPct != null ? 'pct' : ''))
  const [cValue, setCValue] = useState(cur?.commissionMode === 'fixed' ? cur.commissionAmount ?? '' : cur?.commissionPct != null ? String(cur.commissionPct) : '')
  const [aMode, setAMode] = useState<'pct' | 'amount' | ''>(cur?.adsMode ?? '')
  const [aValue, setAValue] = useState(cur?.adsValue != null ? String(cur.adsValue) : '')
  const rules0 = cur?.zRules ?? DEFAULT_ZRULES
  const [rules, setRules] = useState<Record<string, string>>(Object.fromEntries(RULE_FIELDS.map((f) => [f.key, termsText(rules0[f.key])])))
  const [tol, setTol] = useState(String((rules0.tolerance / 10000).toFixed(2)))
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const finalisedAfter = R.weeks.filter((w) => w.s.finalised && w.s.date >= from && (branch === '*' || w.s.branch === branch))
  const save = () => {
    const parsed: Partial<ZRules> = {}
    for (const f of RULE_FIELDS) { const t = parseTerms(rules[f.key]); if (!t) return setMsg({ ok: false, text: `${f.label}: write rows like “+24:total +25:total”.` }); parsed[f.key] = t }
    const tolU = toUnits(tol)
    if (tolU == null || tolU < 0) return setMsg({ ok: false, text: 'Tolerance must be an amount, e.g. 1.00.' })
    if (cMode && toUnits(cValue) == null) return setMsg({ ok: false, text: 'Enter the commission % or amount.' })
    if (aMode && toUnits(aValue) == null) return setMsg({ ok: false, text: 'Enter the advertisement % or amount.' })
    if (note.trim().length < 3) return setMsg({ ok: false, text: 'Say why the terms change (contract, email, approval).' })
    const t: Omit<PartnerTerms, 'id'> = {
      partner: 'zomato', branch, effectiveFrom: weekStart(from),
      commissionMode: cMode || null, commissionPct: cMode === 'pct' ? Number(cValue) : null, commissionAmount: cMode === 'fixed' ? cValue.trim() : null,
      adsMode: aMode || null, adsValue: aMode ? Number(aValue) : null,
      zRules: { ...(parsed as Omit<ZRules, 'tolerance'>), tolerance: tolU }, note: note.trim(), by, at: new Date().toISOString(),
    }
    saveTerms(t)
    setMsg({ ok: true, text: `Saved: version for ${branch === '*' ? 'all outlets' : branchName(branch)} from ${t.effectiveFrom}.${finalisedAfter.length ? ` ${finalisedAfter.length} finalised week(s) after that date keep the terms they were finalised with.` : ''}` })
    setNote('')
  }
  const versions = [...versionsOf(R.terms, 'zomato', '*'), ...BRANCHES.flatMap((b) => versionsOf(R.terms, 'zomato', b.id))]

  return (
    <div className="space-y-4">
      <Card title="Zomato terms and calculation rules">
        {!canConfig && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Only an admin can change these. They are shown for reference.</p>}
        <fieldset disabled={!canConfig} className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="block text-xs text-slate-500">Applies to
              <select aria-label="Applies to outlet" className={inputCls + ' mt-1'} value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="*">All outlets</option>{BRANCHES.filter((b) => b.id !== 'CK').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <label className="block text-xs text-slate-500">In force from the week of
              <input type="date" aria-label="Effective from" className={inputCls + ' mt-1'} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              <span className="text-[11px]">Monday {weekStart(from)}. Earlier weeks keep their own terms; finalised weeks never change.</span></label>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="text-xs text-slate-500">Commission (agreed in the contract)
                <select aria-label="Commission method" className={inputCls + ' mt-1'} value={cMode} onChange={(e) => setCMode(e.target.value as typeof cMode)}>
                  <option value="">Not set (not checked)</option><option value="pct">% of the commissionable value</option><option value="fixed">Fixed ₹ per week</option>
                </select></label>
              <input aria-label="Commission value" className={inputCls + ' !w-28 text-right'} placeholder={cMode === 'pct' ? '%' : '₹'} disabled={!cMode} value={cValue} onChange={(e) => setCValue(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="text-xs text-slate-500">Advertisement budget (suggested when approving each week)
                <select aria-label="Advertisement method" className={inputCls + ' mt-1'} value={aMode} onChange={(e) => setAMode(e.target.value as typeof aMode)}>
                  <option value="">Not set</option><option value="pct">% of net order value</option><option value="amount">Fixed ₹ per week (incl. GST)</option>
                </select></label>
              <input aria-label="Advertisement value" className={inputCls + ' !w-28 text-right'} placeholder={aMode === 'pct' ? '%' : '₹'} disabled={!aMode} value={aValue} onChange={(e) => setAValue(e.target.value)} />
            </div>
            <label className="block text-xs text-slate-500">Rounding tolerance (₹)
              <input aria-label="Tolerance" className={inputCls + ' mt-1 !w-28 text-right'} value={tol} onChange={(e) => setTol(e.target.value)} /></label>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">Statement rows behind each value (S.no. on Zomato's Payout breakup; “:total” = the Total column, otherwise Delivered).</p>
            {RULE_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs text-slate-500">{f.label}
                <input aria-label={`Rows for ${f.label}`} className={inputCls + ' mt-1 font-mono'} value={rules[f.key]} onChange={(e) => setRules({ ...rules, [f.key]: e.target.value })} /></label>
            ))}
            <p className="text-[11px] text-slate-500">Zomato labels row E “(16 + 17 + 18)” in its own sub-numbering; on the Payout breakup those are rows 21, 22 and 23. Rows 16–18 there are the payment fee, GST on fees and TCS.</p>
            <label className="block text-xs text-slate-500">Why (contract, email, approval)
              <input aria-label="Reason for the change" className={inputCls + ' mt-1'} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <Button icon={Save} onClick={save}>Save as a new version</Button>
          </div>
        </fieldset>
        {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`} role="status">{msg.text}</p>}
      </Card>

      <Card title={<span className="flex items-center gap-2"><History size={16} />Versions</span>} pad={false}>
        <Table head={['From', 'Outlet', 'Commission', 'Ad budget', 'Rows', 'Why', 'By']}>
          {versions.map((v) => (
            <tr key={v.id} data-testid="terms-version">
              <td>{effectiveOf(v) === '2000-01-01' ? 'the start' : effectiveOf(v)}</td><td>{v.branch === '*' ? 'All outlets' : branchName(v.branch)}</td>
              <td>{v.commissionMode === 'fixed' ? `${inrU(toUnits(v.commissionAmount ?? '') ?? 0)} / week` : v.commissionPct != null ? `${v.commissionPct}%` : '—'}</td>
              <td>{v.adsMode === 'pct' ? `${v.adsValue}% of sales` : v.adsMode === 'amount' ? `₹${v.adsValue} / week` : '—'}</td>
              <td className="font-mono text-xs">{v.zRules ? 'custom' : 'standard'}</td><td className="max-w-[220px] truncate" title={v.note}>{v.note ?? '—'}</td><td className="text-xs">{v.by} · {v.at.slice(0, 10)}</td>
            </tr>
          ))}
          {!versions.length && <tr><td colSpan={7} className="!py-6 text-center text-slate-500">No terms yet: commission and advertisement aren't checked until they are set.</td></tr>}
        </Table>
      </Card>

      <Card title="Zomato restaurant IDs" pad={false}>
        <Table head={['Zomato ID', 'Outlet', 'Linked by']}>
          {R.outlets.filter((o) => o.partner === 'zomato').map((o) => <tr key={o.id}><td className="font-mono">{o.resId}</td><td>{branchName(o.branch)}</td><td className="text-xs">{o.by} · {o.at.slice(0, 10)}</td></tr>)}
          {!R.outlets.some((o) => o.partner === 'zomato') && <tr><td colSpan={3} className="!py-6 text-center text-slate-500">Linked when the first statement of each outlet is imported.</td></tr>}
        </Table>
      </Card>
    </div>
  )
}
