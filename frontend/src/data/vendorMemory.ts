import type { Bill, BillLine } from './mock'
import type { CustomLedger } from './ledgerStore'

// Learns from bills already entered, so handwritten bills are quick to type:
//  - recognises the vendor from the printed letterhead (OCR reads that part well, even when it misspells it)
//  - remembers each vendor's items, units, rates, GST and ledgers from their last bill
// No AI: plain text matching over your own past bills.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** How alike two strings are, 0..1 (letter-pair overlap). "vaishgkenterprises" vs "vaishakenterprises" ≈ 0.8. */
function similar(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const pairs = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1) } return m }
  const pa = pairs(a), pb = pairs(b)
  let hit = 0
  for (const [p, n] of pa) hit += Math.min(n, pb.get(p) ?? 0)
  return (2 * hit) / (a.length - 1 + b.length - 1)
}

const looksLikeFileName = (v: string) => /page \d+$|\.(pdf|jpe?g|png)$|scan(n)?ed|invoice as on/i.test(v)

/** Every vendor seen before: from bills and from vendor ledgers (Sundry Creditors). */
export function knownVendors(bills: Bill[], custom: CustomLedger[]): string[] {
  const set = new Map<string, string>()
  for (const b of bills) if (b.vendor && b.lines.length && !looksLikeFileName(b.vendor)) set.set(norm(b.vendor), b.vendor.trim())
  for (const c of custom) if (c.group === 'creditors') set.set(norm(c.name), c.name)
  return [...set.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Find which known vendor a scanned bill is from, using the text OCR read near the top.
 * Each top line, and each pair of neighbouring lines, is compared with every known vendor.
 */
export function matchVendor(topText: string[], vendors: string[]): string | null {
  const candidates: string[] = []
  const lines = topText.slice(0, 15).map(norm).filter((l) => l.length >= 4)
  for (let i = 0; i < lines.length; i++) { candidates.push(lines[i]); if (i + 1 < lines.length) candidates.push(lines[i] + lines[i + 1]) }
  // Best match of `needle` anywhere in `hay` (letterheads carry extra words around the name).
  const bestIn = (needle: string, hay: string) => {
    let score = similar(needle, hay)
    if (hay.length > needle.length + 2) for (let k = 0; k + needle.length <= hay.length; k++) score = Math.max(score, similar(needle, hay.slice(k, k + needle.length)))
    return score
  }
  let best: { v: string; score: number } | null = null
  for (const v of vendors) {
    const nv = norm(v)
    if (nv.length < 4) continue
    // The distinctive part of the name ("vaishak", "ckm") must match too, not just "traders".
    const core = norm(v.replace(GENERIC, ' '))
    for (const c of candidates) {
      const full = bestIn(nv, c)
      const coreScore = core.length >= 3 ? bestIn(core, c) : full
      if (full >= 0.7 && coreScore >= 0.5) {
        const score = full + coreScore
        if (!best || score > best.score) best = { v, score }
      }
    }
  }
  return best?.v ?? null
}

const GENERIC = /\b(traders?|trading|enterprises?|co|company|pvt|private|ltd|limited|llp|import|export|and|&|stores?|suppliers?|agenc(y|ies)|mart|merchants?|wholesale|retail|dealers?|sons)\b\.?/gi

/** The items on the vendor's most recent bill, with quantities cleared, ready to fill in. */
export function lastItemsOf(vendor: string, bills: Bill[], exceptId?: string): BillLine[] {
  const nv = norm(vendor)
  const prev = bills
    .filter((b) => b.id !== exceptId && norm(b.vendor) === nv && b.lines.some((l) => l.rate > 0))
    .sort((a, b) => (b.date + (b.uploadedAt ?? '')).localeCompare(a.date + (a.uploadedAt ?? '')))[0]
  return prev ? prev.lines.filter((l) => l.rate > 0).map((l) => ({ item: l.item, qty: 0, unit: l.unit, rate: l.rate, gst: l.gst, ledger: l.ledger, original: l.original })) : []
}

/** Last known unit/rate/GST/ledger for every item name, for filling a line as you type the item. */
export function pastItems(bills: Bill[]): Map<string, BillLine> {
  const m = new Map<string, BillLine>()
  const sorted = [...bills].sort((a, b) => (a.date + (a.uploadedAt ?? '')).localeCompare(b.date + (b.uploadedAt ?? '')))
  for (const b of sorted) for (const l of b.lines) if (l.item.trim() && l.rate > 0) m.set(l.item.trim().toLowerCase(), l)
  return m
}
