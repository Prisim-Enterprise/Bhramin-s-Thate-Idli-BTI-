import { pdfLines } from './readImprestPdf'

// Reads a vendor bill (PDF) and works out what was bought and which ledger each item goes to.
// PDFs from billing software carry real text, so we read it directly. Photos and scanned PDFs
// have no text: the bill still opens for review, and the lines are typed in.

export type ReadLine = { item: string; qty: number; unit: string; rate: number; gst: number; ledger: string }
export type BillRead = {
  textFound: boolean
  vendor?: string
  date?: string // yyyy-mm-dd
  invoiceNo?: string
  lines: ReadLine[]
  cgst?: number
  sgst?: number
  igst?: number
  total?: number
  skipped: string[] // lines that looked like items but could not be read
}

/* ---------- Which ledger an item belongs to ---------- */

const RULES: { ledger: string; re: RegExp }[] = [
  { ledger: 'Milk Purchased', re: /\b(milk|curd|dahi|paneer|butter ?milk|cream|khova|khoa|nandini)\b/i },
  { ledger: 'Vegetables Purchased', re: /\b(veg(etable)?s?|tomato(es)?|onions?|potato(es)?|chill?(i|y|ies)|coriander|kothambari|carrots?|beans|cabbage|cauliflower|ginger|garlic|curry ?leaves?|lemons?|cucumber|brinjal|drumsticks?|capsicum|beetroot|pumpkin|mint|pudina|palak|spinach|methi|greens|leaves|banana ?leaf|plantain|raw ?banana|ladies ?finger|bhindi|okra|radish|gourd|peas|sweet ?corn|mushroom|shallots?|sambar ?onion|yam|colocasia|chow ?chow|fruits?|banana|apple|orange|grapes|pineapple|mango|papaya|watermelon|pomegranate)\b/i },
  { ledger: 'Parcel and Disposables Items', re: /\b(covers?|carry ?bags?|bags?|containers?|boxes|box|foil|silver ?foil|butter ?paper|paper|cups?|plates?|spoons?|tissues?|napkins?|straws?|packing|parcel|disposables?|aluminium|lids?|tape|rubber ?bands?|cling ?film|wrap)\b/i },
  { ledger: 'Gas Expenses', re: /\b(lpg|gas|cylinders?)\b/i },
  { ledger: 'Cleaning Expenses', re: /\b(phenyl|phenol|soap|detergent|surf|vim|harpic|lizol|broom|mop|scrubber|scotch ?brite|bleach|sanitiz(er|or)|hand ?wash|dish ?wash|cleaner|garbage|dustbin)\b/i },
  { ledger: 'Water Tanker', re: /\b(water ?(tanker|can|cans|bottles?)|tanker|bisleri|drinking water)\b/i },
  { ledger: 'Repairs & Maintenance', re: /\b(repair|service ?charge|plumb|electrical|spare|bulb|tube ?light|wire|switch|motor)\b/i },
  { ledger: 'Groceries Purchased', re: /\b(rice|dal|dhal|urad|toor|moong|chana|gram|oil|ghee|sugar|salt|jaggery|bella|atta|maida|rava|sooji|semolina|flour|besan|masala|spices?|turmeric|haldi|jeera|cumin|mustard|pepper|methi ?seeds|hing|asafoetida|tamarind|coconut|cashew|raisins?|elaichi|cardamom|cloves?|cinnamon|tea|coffee|chicory|poha|avalakki|vermicelli|sabudana|idli ?rava|baking ?soda|soda|vinegar|ketchup|sauce|pickle|papad|groundnut|peanut|sesame|til|provisions?|grocer(y|ies)|kirana)\b/i },
]

/** Ledger for one item on a bill. Falls back to the vendor's kind of business, then Groceries Purchased. */
export function ledgerFor(item: string, vendor = ''): string {
  for (const r of RULES) if (r.re.test(item)) return r.ledger
  if (/vegetable|fruit|greens/i.test(vendor)) return 'Vegetables Purchased'
  if (/dairy|milk|nandini/i.test(vendor)) return 'Milk Purchased'
  if (/gas|lpg|hp |bharat|indane/i.test(vendor)) return 'Gas Expenses'
  if (/plastic|packag|disposable/i.test(vendor)) return 'Parcel and Disposables Items'
  return 'Groceries Purchased'
}

/* ---------- Reading the text ---------- */

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12' }
const UNITS = /^(kg|kgs|g|gm|gms|grams?|ltr|ltrs|lt|l|litres?|liters?|ml|nos|no|pcs|pc|pieces?|pkt|pkts|packets?|pack|packs|box|bag|bags|dozen|doz|bundles?|units?|tray|trays|cans?|bottles?|btl|bunch|sack|tin|tins|roll|rolls|set|sets|qtl|quintal)\.?$/i
const NUM = /^(?:₹|rs\.?|inr)?\(?-?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\)?$/i
const toNum = (s: string) => Number(s.replace(/₹|rs\.?|inr|[(),]/gi, ''))
const r2 = (n: number) => Math.round(n * 100) / 100

/** dd/mm/yyyy, dd-mm-yy, 12-Oct-26, 12 Oct 2026 -> yyyy-mm-dd */
function findDate(text: string): string | undefined {
  const y = (s: string) => (s.length === 2 ? '20' + s : s)
  let m = text.match(/\b(\d{1,2})\s*[-/.\s]\s*([A-Za-z]{3,4})[a-z]*\s*[-/.,\s]\s*(\d{2,4})\b/)
  if (m && MONTHS[m[2].toLowerCase()]) return `${y(m[3])}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return undefined
}

/** Numbers on a line, leaving out percentages ("5%") and things like phone numbers. */
function amounts(line: string): number[] {
  return line.split(/\s+/).filter((t) => NUM.test(t) && !/%$/.test(t)).map(toNum).filter((n) => Number.isFinite(n))
}

const NOT_ITEM = /total|sub ?total|cgst|sgst|igst|utgst|\bgst\b|gstin|round|\btax|invoice|bill ?no|\bdate\b|phone|\bph\b|mob(ile)?|e-?mail|amount in|words|rupees|balance|discount|thank|hsn|particulars|description|\bqty\b|\brate\b|\bs\.? ?no\b|payable|received|signature|authori[sz]ed|terms|bank|ifsc|a\/c|account|address|state code|place of supply|net amount|\bpaid\b|\bcash\b|\bupi\b|fssai|pan\b/i
const BUYER = /brahmin|bti\b|thatte|pep hospitality/i

/** Try to read one item row: "1 Tomato 10 kg 32.00 320.00", "TOMATO 10.00 KG 32 5% 336.00" … */
function readItem(line: string): ReadLine | null {
  if (NOT_ITEM.test(line) || BUYER.test(line)) return null
  // Split glued quantities like "10kg" into "10 kg".
  const tokens = line.replace(/(\d)(kg|kgs|g|gm|gms|ltr|l|ml|nos|pcs|pkt)\b/gi, '$1 $2').split(/\s+/).filter(Boolean)
  let i = 0
  if (tokens.length > 2 && /^\d{1,3}[.)]?$/.test(tokens[0]) && !NUM.test(tokens[1])) i = 1 // serial number
  const name: string[] = []
  while (i < tokens.length && !NUM.test(tokens[i])) name.push(tokens[i++])
  const item = name.join(' ').replace(/[-:|]+$/, '').trim()
  if (!/[a-z]{2,}/i.test(item)) return null

  let unit = ''
  let gstTok: number | null = null
  const nums: { v: number; dec: boolean; unitAfter: string }[] = []
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^\d+(\.\d+)?%$/.test(t)) { gstTok = parseFloat(t); continue }
    if (UNITS.test(t)) {
      const u = t.replace(/\.$/, '').toLowerCase()
      unit ||= u
      if (nums.length && !nums[nums.length - 1].unitAfter) nums[nums.length - 1].unitAfter = u
      continue
    }
    if (NUM.test(t)) {
      const raw = t.replace(/₹|rs\.?|inr|[(),]/gi, '')
      // HSN codes (4–8 plain digits) are not quantities or prices.
      if (/^\d{4,8}$/.test(raw) && nums.length === 0) continue
      nums.push({ v: toNum(t), dec: raw.includes('.'), unitAfter: '' })
    }
  }
  if (!nums.length) return null
  const amount = nums[nums.length - 1].v
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.005)

  // Find a quantity and rate that multiply to the line amount (with or without GST).
  for (let a = 0; a < nums.length - 1; a++) {
    for (let b = a + 1; b < nums.length - 1; b++) {
      // The number followed by a unit is the quantity.
      const [qn, rn] = nums[b].unitAfter && !nums[a].unitAfter ? [nums[b], nums[a]] : [nums[a], nums[b]]
      const [q, r] = [qn.v, rn.v]
      const u = qn.unitAfter || unit || 'nos'
      const base = q * r
      if (!base) continue
      if (close(base, amount)) return { item, qty: q, unit: u, rate: r, gst: gstTok ?? 0, ledger: ledgerFor(item) }
      for (const g of [gstTok, 5, 12, 18, 28].filter((x): x is number => x != null)) {
        if (close(base * (1 + g / 100), amount)) return { item, qty: q, unit: u, rate: r, gst: g, ledger: ledgerFor(item) }
      }
    }
  }
  // Just a name and an amount ("Tomato 320.00"): one lot at that price.
  if (nums.length <= 2 && nums[nums.length - 1].dec && amount > 0) {
    return { item, qty: 1, unit: unit || 'nos', rate: amount, gst: gstTok ?? 0, ledger: ledgerFor(item) }
  }
  return null
}

/** Last amount on the lines that match, e.g. the "Grand Total" line. */
function lastOn(lines: string[], re: RegExp): number | undefined {
  const hit = lines.filter((l) => re.test(l)).map(amounts).filter((n) => n.length)
  return hit.length ? hit[hit.length - 1][hit[hit.length - 1].length - 1] : undefined
}

/** Tax of one kind: a "Total CGST" line if there is one, otherwise all CGST lines added up. */
function taxOf(lines: string[], kind: string): number | undefined {
  const re = new RegExp(`\\b${kind}\\b`, 'i')
  const rows = lines.filter((l) => re.test(l) && !/gstin/i.test(l))
  const totalRow = rows.filter((l) => /total/i.test(l)).map(amounts).find((n) => n.length)
  if (totalRow) return r2(totalRow[totalRow.length - 1])
  const vals = rows.map(amounts).filter((n) => n.length).map((n) => n[n.length - 1])
  return vals.length ? r2(vals.reduce((s, v) => s + v, 0)) : undefined
}

/** Works on the text lines of a bill. Kept separate from the PDF reading so it can be tested. */
export function parseBillLines(lines: string[]): BillRead {
  const text = lines.join('\n')
  if (text.replace(/\s/g, '').length < 15) return { textFound: false, lines: [], skipped: [] }

  // Vendor: the first business-looking line near the top (not the buyer, not "Tax Invoice").
  const top = lines.slice(0, 10).map((l) => l.replace(/\s+(gstin|ph|phone|mob)\b.*$/i, '').trim()).filter((l) => /[a-z]{3,}/i.test(l) && !BUYER.test(l) && !/^(tax\s*)?invoice|^bill\b|cash\s*memo|estimate|gstin|original|duplicate|^to\b|bill\s*to|ship\s*to|phone|mob|e-?mail|^\d/i.test(l))
  const vendor = (top.find((l) => /traders|enterprises?|stores?|agenc(y|ies)|suppliers?|mart|& ?co\b|pvt|ltd|llp|dairy|vegetables|provisions|distributors?|foods?|industries|sons\b|company|shop|centre|center/i.test(l)) ?? top[0])

  const dateLine = lines.find((l) => /date|dt\.?/i.test(l) && findDate(l))
  const date = findDate(dateLine ?? text)
  const inv = text.match(/(?:invoice|inv|bill)\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i)

  const items: ReadLine[] = []
  const skipped: string[] = []
  for (const l of lines) {
    const it = readItem(l)
    if (it) items.push({ ...it, ledger: ledgerFor(it.item, vendor) })
    else if (/[a-z]{3,}/i.test(l) && /\d+\.\d{2}\b/.test(l) && !NOT_ITEM.test(l) && !BUYER.test(l)) skipped.push(l)
  }

  const total = lastOn(lines, /grand\s*total|net\s*(amount|payable|total)|total\s*amount|bill\s*amount|invoice\s*(total|value)|amount\s*payable/i) ?? lastOn(lines.filter((l) => !/sub\s*total|cgst|sgst|igst/i.test(l)), /\btotal\b/i)

  return {
    textFound: true,
    vendor,
    date,
    invoiceNo: inv?.[1],
    lines: items,
    cgst: taxOf(lines, 'cgst'),
    sgst: taxOf(lines, 'sgst'),
    igst: taxOf(lines, 'igst'),
    total,
    skipped,
  }
}

export async function readBill(file: File): Promise<BillRead> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return { textFound: false, lines: [], skipped: [] }
  try {
    return parseBillLines(await pdfLines(file))
  } catch {
    return { textFound: false, lines: [], skipped: [] }
  }
}
