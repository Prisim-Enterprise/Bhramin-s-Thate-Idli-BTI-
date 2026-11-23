// Money without floating point. Amounts are whole numbers of 1/10,000 of a rupee ("units"): Zomato prints
// four decimals, so every figure on a statement is held exactly. Shown and compared at the paisa.
// Safe up to about ₹90 crore per figure (2^53 units).

export type Units = number // integer, 1 unit = ₹0.0001

export const UNIT = 10_000
const PAISA = 100 // units in one paisa

/** "1,37,047.0459", "(218.87)", "-5", 137047.05 → units. Anything that isn't a number → null. */
export function toUnits(v: string | number | null | undefined): Units | null {
  if (v == null) return null
  let s = String(v).trim().replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '')
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  // Scientific notation (Excel sometimes writes 6E-4): expand it exactly.
  const sci = s.match(/^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i)
  if (sci) {
    const digits = sci[1] + (sci[2] ?? ''), exp = Number(sci[3]) - (sci[2]?.length ?? 0)
    s = exp >= 0 ? digits + '0'.repeat(exp) : (digits.length > -exp ? digits.slice(0, exp) + '.' + digits.slice(exp) : '0.' + '0'.repeat(-exp - digits.length) + digits)
  }
  const m = s.match(/^(\d*)(?:\.(\d*))?$/)
  if (!m || (!m[1] && !m[2])) return null
  const whole = Number(m[1] || '0')
  const frac = (m[2] ?? '').padEnd(5, '0')
  let u = whole * UNIT + Number(frac.slice(0, 4))
  if (Number(frac[4]) >= 5) u += 1 // round half up at the fifth decimal
  return neg ? -u : u
}

/** Units → rupees rounded to the paisa (half away from zero), as a number for display only. */
export function rupees(u: Units): number {
  const p = Math.sign(u) * Math.round(Math.abs(u) / PAISA)
  return p / 100
}

/** Round to whole paise, staying in units. */
export const toPaisa = (u: Units): Units => Math.sign(u) * Math.round(Math.abs(u) / PAISA) * PAISA

/** ₹1,37,047.05 (Indian grouping), from units. */
export function inrU(u: Units, sign = false): string {
  const r = rupees(u)
  const s = Math.abs(r).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (r < 0 ? '−' : sign && r > 0 ? '+' : '') + '₹' + s
}

/** % with two decimals from a ratio of units (e.g. commission ÷ commissionable value). */
export const pct = (part: Units, whole: Units) => (whole ? Math.round((part / whole) * 10_000) / 100 : null)

/** units × (rate% as a decimal string, e.g. "17" or "17.5") → units, rounded to the unit. */
export function applyPct(base: Units, ratePct: string): Units {
  const r = toUnits(ratePct) // rate in 1/10,000 of a percent point
  if (r == null) return 0
  return Math.round((base * r) / (100 * UNIT))
}

export const sum = (xs: Units[]) => xs.reduce((t, x) => t + x, 0)
