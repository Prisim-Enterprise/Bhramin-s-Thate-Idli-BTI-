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

// Extra charges on a bill: market cess (RMC), loading/hamali, transport.
export const CHARGE = /(\br\.?\s?m\.?\s?c\b\.?|market\s*cess|\bhamali|\bcool(ie|y|ey)\b|\b(un)?loading\b|\btransport(ation)?\b|\bfreight\b|\blorry\b|delivery\s*charges?)/i
const CHARGE_LEDGER = 'Freight & Hamali Charges'

const RULES: { ledger: string; re: RegExp }[] = [
  { ledger: 'Conveyance', re: /\bconveyance\b/i },
  { ledger: CHARGE_LEDGER, re: CHARGE },
  // Product codes from the dairy supplier app: CRDKG (curd), NSM/TMS 1000ML (milk), PNR1KG (paneer).
  { ledger: 'Milk Purchased', re: /\b(milk|curd|dahi|paneer|butter ?milk|cream|khova|khoa|nandini|toned|crd\w*|nsm\d*\w*|tms\d*\w*|pnr\d*\w*)\b/i },
  // Dry chillies are a grocery, not a vegetable.
  { ledger: 'Groceries Purchased', re: /\b(byadgi|guntur|dry ?chill?i(es)?|red ?chill?i(es)?|jaggery|avl|sunpure|sunflower)\b/i },
  { ledger: 'Vegetables Purchased', re: /\b(veg(etable)?s?|tomato(es)?|onions?|potato(es)?|chill?(i|y|ies)|coriander|kothambari|carrots?|beans|cabbage|cauliflower|ginger|garlic|curry ?leaves?|lemons?|cucumber|brinjal|drumsticks?|capsicum|beetroot|pumpkin|mint|pudina|palak|spinach|methi|greens|leaves|banana ?leaf|plantain|raw ?banana|ladies ?finger|bhindi|okra|radish|gourd|peas|sweet ?corn|mushroom|shallots?|sambar ?onion|yam|colocasia|chow ?chow|fruits?|banana|apple|orange|grapes|pineapple|mango|papaya|watermelon|pomegranate)\b/i },
  { ledger: 'Gas Expenses', re: /\b(lpg|gas|cylinders?)\b/i },
  { ledger: 'Cleaning Expenses', re: /\b(phenyl|phenol|soap|detergent|surf|vim|harpic|lizol|broom|mop|scrubber|scotch ?brite|bleach|sanitiz(er|or)|hand ?wash|dish ?wash|cleaner|garbage|dustbin)\b/i },
  { ledger: 'Water Tanker', re: /\b(water ?(tanker|can|cans|bottles?)|tanker|bisleri|drinking water)\b/i },
  { ledger: 'Repairs & Maintenance', re: /\b(repair|service ?charge|plumb|electrical|spare|bulb|tube ?light|wire|switch|motor)\b/i },
  { ledger: 'Groceries Purchased', re: /\b(rice|dal|dhal|urad|toor|moong|chana|gram|oil|ghee|sugar|salt|jaggery|bella|atta|maida|rava|sooji|semolina|flour|besan|masala|spices?|turmeric|haldi|jeera|cumin|mustard|pepper|methi ?seeds|hing|asafoetida|tamarind|coconut|cashew|raisins?|elaichi|cardamom|cloves?|cinnamon|tea|coffee|chicory|poha|avalakki|vermicelli|sabudana|idli ?rava|baking ?soda|soda|vinegar|ketchup|sauce|pickle|papad|groundnut|peanut|sesame|til|provisions?|grocer(y|ies)|kirana)\b/i },
  { ledger: 'Parcel and Disposables Items', re: /\b(covers?|carry ?bags?|bags?|containers?|boxes|box|foil|silver ?foil|butter ?paper|paper|cups?|plates?|spoons?|tissues?|napkins?|straws?|packing|parcel|disposables?|aluminium|lids?|tape|rubber ?bands?|cling ?film|wrap)\b/i },
]

/* ---------- Kannada ---------- */

/** Kannada digits ೦-೯ -> 0-9, so amounts on Kannada bills are read as numbers. */
export const kannadaDigits = (s: string) => s.replace(/[೦-೯]/g, (d) => String(d.charCodeAt(0) - 0x0ce6))

// Common items on kitchen bills, Kannada -> English. Longest names are checked first.
const KN_WORDS: [string, string][] = ([
  ['ಉದ್ದಿನ ಬೇಳೆ', 'Urad Dal'], ['ಉದ್ದು', 'Urad Dal'], ['ತೊಗರಿ ಬೇಳೆ', 'Toor Dal'], ['ಹೆಸರು ಬೇಳೆ', 'Moong Dal'], ['ಕಡಲೆ ಬೇಳೆ', 'Chana Dal'], ['ಬೇಳೆ', 'Dal'],
  ['ಇಡ್ಲಿ ಅಕ್ಕಿ', 'Idli Rice'], ['ಅಕ್ಕಿ', 'Rice'], ['ಅವಲಕ್ಕಿ', 'Poha'], ['ರವೆ', 'Rava'], ['ಮೈದಾ', 'Maida'], ['ಗೋಧಿ ಹಿಟ್ಟು', 'Atta'],
  ['ಸಕ್ಕರೆ', 'Sugar'], ['ಬೆಲ್ಲ', 'Jaggery'], ['ಉಪ್ಪು', 'Salt'], ['ಎಣ್ಣೆ', 'Oil'], ['ತುಪ್ಪ', 'Ghee'], ['ಹುಣಸೆ', 'Tamarind'],
  ['ತೆಂಗಿನಕಾಯಿ', 'Coconut'], ['ಕಾಯಿ', 'Coconut'], ['ಸಾಸಿವೆ', 'Mustard'], ['ಜೀರಿಗೆ', 'Jeera'], ['ಮೆಣಸು', 'Pepper'], ['ಅರಿಶಿನ', 'Turmeric'], ['ಕಡಲೆಕಾಯಿ', 'Groundnut'],
  ['ಹಾಲು', 'Milk'], ['ಮೊಸರು', 'Curd'], ['ಪನೀರ್', 'Paneer'], ['ಬೆಣ್ಣೆ', 'Butter'],
  ['ಟೊಮೆಟೊ', 'Tomato'], ['ಟೊಮ್ಯಾಟೊ', 'Tomato'], ['ಈರುಳ್ಳಿ', 'Onion'], ['ಆಲೂಗಡ್ಡೆ', 'Potato'], ['ಹಸಿಮೆಣಸಿನಕಾಯಿ', 'Green Chilli'], ['ಮೆಣಸಿನಕಾಯಿ', 'Chilli'],
  ['ಕೊತ್ತಂಬರಿ', 'Coriander'], ['ಕರಿಬೇವು', 'Curry Leaves'], ['ಪುದೀನ', 'Mint'], ['ಶುಂಠಿ', 'Ginger'], ['ಬೆಳ್ಳುಳ್ಳಿ', 'Garlic'], ['ನಿಂಬೆ', 'Lemon'],
  ['ಕ್ಯಾರೆಟ್', 'Carrot'], ['ಬೀನ್ಸ್', 'Beans'], ['ಎಲೆಕೋಸು', 'Cabbage'], ['ಹೂಕೋಸು', 'Cauliflower'], ['ಬದನೆಕಾಯಿ', 'Brinjal'], ['ನುಗ್ಗೆಕಾಯಿ', 'Drumstick'],
  ['ಸೌತೆಕಾಯಿ', 'Cucumber'], ['ಕುಂಬಳಕಾಯಿ', 'Pumpkin'], ['ಬಾಳೆ ಎಲೆ', 'Banana Leaf'], ['ಬಾಳೆಹಣ್ಣು', 'Banana'], ['ಸೊಪ್ಪು', 'Greens'], ['ತರಕಾರಿ', 'Vegetables'],
  ['ಕವರ್', 'Covers'], ['ಗ್ಯಾಸ್', 'Gas'], ['ಸಿಲಿಂಡರ್', 'Cylinder'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length)

/** English name for a Kannada item name, or null if it isn't a known item. */
export function kannadaToEnglish(name: string): string | null {
  for (const [kn, en] of KN_WORDS) if (name.includes(kn)) return en
  return null
}

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
export function findDate(text: string): string | undefined {
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

const NOT_ITEM = /total|ಒಟ್ಟು|ಮೊತ್ತ|ದಿನಾಂಕ|sub ?total|cgst|sgst|igst|utgst|\bgst\b|gstin|\bround ?off\b|\btax|invoice|bill ?no|\bdate\b|phone|\bph\b|mob(ile)?|e-?mail|amount in|words|rupees|balance|discount|thank|hsn|particulars|description|\bqty\b|\brate\b|\bs\.? ?no\b|payable|received|signature|authori[sz]ed|terms|bank|ifsc|a\/c|account|address|state code|place of supply|net amount|\bpaid\b|\bcash\b|\bupi\b|fssai|pan\b/i
const BUYER = /brahmin|bti\b|thatte|pep hospitality/i

/** Try to read one item row: "1 Tomato 10 kg 32.00 320.00", "TOMATO 10.00 KG 32 5% 336.00" … */
function readItem(line: string): ReadLine | null {
  if (NOT_ITEM.test(line) || BUYER.test(line)) return null
  // Scan noise (table lines, ticks) out; split glued quantities like "10kg" into "10 kg".
  const tokens = line.replace(/[|_~»«‘’“”`<>{}\[\]]/g, ' ').replace(/(\d)(kg|kgs|g|gm|gms|ltr|l|ml|nos|pcs|pkt)\b/gi, '$1 $2').split(/\s+/).filter(Boolean)
  let i = 0
  if (tokens.length > 2 && /^\d{1,3}[.)]?$/.test(tokens[0]) && !NUM.test(tokens[1])) i = 1 // serial number
  const name: string[] = []
  while (i < tokens.length && !NUM.test(tokens[i])) name.push(tokens[i++])
  const item = name.join(' ').replace(/[-:|]+$/, '').trim()
  if (!/[a-zಀ-೿]{2,}/i.test(item)) return null

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

/** Biggest amount on the lines that match. */
function lastOnMax(lines: string[], re: RegExp): number | undefined {
  const all = lines.filter((l) => re.test(l)).flatMap(amounts)
  return all.length ? Math.max(...all) : undefined
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
export function parseBillLines(raw: string[]): BillRead {
  const lines = raw.map(kannadaDigits)
  const text = lines.join('\n')
  if (text.replace(/\s/g, '').length < 15) return { textFound: false, lines: [], skipped: [] }

  // Vendor: the first business-looking line near the top (not the buyer, not "Tax Invoice").
  const top = lines.slice(0, 10).map((l) => l.replace(/\s+(gstin|ph|phone|mob)\b.*$/i, '').trim()).filter((l) => /[a-zಀ-೿]{3,}/i.test(l) && !BUYER.test(l) && !/^(tax\s*)?invoice|^bill\b|cash\s*memo|estimate|gstin|original|duplicate|^to\b|bill\s*to|ship\s*to|phone|mob|e-?mail|^\d/i.test(l))
  const vendor = (top.find((l) => /traders|enterprises?|stores?|agenc(y|ies)|suppliers?|mart|& ?co\b|pvt|ltd|llp|dairy|vegetables|provisions|distributors?|foods?|industries|sons\b|company|shop|centre|center/i.test(l)) ?? top[0])

  const dateLine = lines.find((l) => /date|dt\.?/i.test(l) && findDate(l))
  const date = findDate(dateLine ?? text)
  // "Invoice No: AH/26-27/215", "Bill No.: CR01657", or a plain "No. 2710" printed near the top of a bill book.
  const inv = text.match(/(?:invoice|inv|bill)\s*(?:no|number|#)\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/\-]*)/i)
    ?? lines.slice(0, 12).join('\n').match(/\bNo\s*[.:]?\s*(\d[\d\s]{1,6}\d)\b/)

  const items: ReadLine[] = []
  const skipped: string[] = []
  for (const l of lines) {
    // Extra charges (RMC, hamali, transport) become their own line under Freight & Hamali Charges.
    if (CHARGE.test(l) && !/total/i.test(l)) {
      const a = amounts(l)
      const label = (l.match(CHARGE)?.[0] ?? 'Charges').replace(/\s+/g, ' ').toUpperCase().replace(/\.$/, '')
      if (a.length && a[a.length - 1] > 0) {
        items.push({ item: label === 'RMC' || label.startsWith('R.M') ? 'Market cess (RMC)' : label.charAt(0) + label.slice(1).toLowerCase(), qty: 1, unit: 'nos', rate: a[a.length - 1], gst: 0, ledger: CHARGE_LEDGER })
        continue
      }
    }
    const it = readItem(l)
    if (it) items.push({ ...it, ledger: ledgerFor(it.item, vendor) })
    else if (/[a-z]{3,}/i.test(l) && /\d+\.\d{2}\b/.test(l) && !NOT_ITEM.test(l) && !BUYER.test(l)) skipped.push(l)
  }

  // The grand total is the biggest of the "total" figures (tax summaries also say "Total").
  const totals = lines.filter((l) => /ಒಟ್ಟು|grand\s*total|net\s*(amount|payable|total)|total\s*amount|bill\s*amount|invoice\s*(total|value)|amount\s*payable/i.test(l)).flatMap(amounts)
  const total = (totals.length ? Math.max(...totals) : undefined) ?? lastOnMax(lines.filter((l) => !/sub\s*total|cgst|sgst|igst/i.test(l)), /\btotal\b/i) ?? lastOn(lines, /ಒಟ್ಟು|grand\s*total|net\s*(amount|payable|total)|total\s*amount|bill\s*amount|invoice\s*(total|value)|amount\s*payable/i) ?? lastOn(lines.filter((l) => !/sub\s*total|cgst|sgst|igst/i.test(l)), /\btotal\b/i)

  return {
    textFound: true,
    vendor,
    date,
    invoiceNo: inv?.[1]?.replace(/\s+/g, ''),
    lines: items,
    cgst: taxOf(lines, 'cgst'),
    sgst: taxOf(lines, 'sgst'),
    igst: taxOf(lines, 'igst'),
    total,
    skipped,
  }
}

/* ---------- Choosing how to read a bill ---------- */

export type ReadMethod = 'pdf-text' | 'sarvam' | 'none'
export type ReadOutcome = BillRead & { method: ReadMethod; confidence: number; note: string; originals?: (string | null)[]; unsure?: boolean[]; rawLines?: string[] }
export type BillScriptId = 'en-hand' | 'kn-hand' | 'en-typed' | 'manual'

const empty: BillRead = { textFound: false, lines: [], skipped: [] }

/**
 * Read a bill by how it was uploaded:
 *  - "Upload PDF bill" (en-typed): the text inside the PDF only (exact, free). No OCR.
 *  - "Upload handwritten / scanned bill" (en-hand / kn-hand): Sarvam on the server, English or Kannada (10 a day).
 */
export async function readBillFile(file: Blob & { name?: string }, script: BillScriptId, onStep?: (s: string) => void): Promise<ReadOutcome> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')
  const isImage = file.type.startsWith('image/')

  // Printed / typed PDF: read its text.
  if (script === 'en-typed') {
    if (!isPdf) return { ...empty, method: 'none', confidence: 0, note: 'Only PDF files can be read here. For a photo, use “Upload handwritten bill”.' }
    try {
      onStep?.('Reading the PDF…')
      const r = parseBillLines(await pdfLines(file as File))
      if (r.textFound) return { ...r, method: 'pdf-text', confidence: 100, note: 'Read from the text inside the PDF.' }
    } catch { /* falls through */ }
    return {
      ...empty, method: 'none', confidence: 0,
      note: 'This PDF has no text inside (it is a scan or photo). Upload it with “Upload handwritten / scanned bill”, or type the items in below.',
    }
  }

  // Handwritten or scanned: read by Sarvam on the server (counts toward the daily limit).
  if (!isPdf && !isImage) return { ...empty, method: 'none', confidence: 0, note: 'Upload a photo or a scanned PDF of the bill.' }
  try {
    const { readBillOnline } = await import('./api')
    const { shrinkImage, pdfPageCount } = await import('./ocr')
    onStep?.('Reading the bill with Sarvam… (usually 5–15 seconds)')
    const send = isPdf ? file : await shrinkImage(file)
    const pages = isPdf ? await pdfPageCount(file) : 1
    const { bill } = await readBillOnline(send, file.name ?? 'bill.jpg', pages)
    return fromSarvam(bill)
  } catch (e) {
    return { ...empty, method: 'none', confidence: 0, note: `Could not read this bill: ${e instanceof Error ? e.message : String(e)} Type the items in below.` }
  }
}

/** Kept for older callers: PDF text only. */
export async function readBill(file: File): Promise<BillRead> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return empty
  try {
    return parseBillLines(await pdfLines(file))
  } catch {
    return empty
  }
}

/* ---------- Sarvam result -> bill lines ---------- */

const GST_RATES = [0, 5, 12, 18, 28]
const r2s = (n: number) => Math.round(n * 100) / 100

/**
 * Turn what Sarvam read into bill lines, and check it:
 *  - qty x rate is checked against the line amount; a GST-inclusive amount sets the line's GST %
 *  - if they disagree, qty x rate is used and the line is marked "check this"
 *  - Kannada item names get their English name, with the Kannada kept underneath
 *  - a date far from today is left for the person to enter
 */
export function fromSarvam(b: import('./api').SarvamBill): ReadOutcome {
  const vendor = b.vendor?.trim() || undefined
  const lines: ReadLine[] = []
  const originals: (string | null)[] = []
  const unsure: boolean[] = []
  for (const it of b.items ?? []) {
    let name = (it.item ?? '').trim()
    const qty = it.qty ?? null, rate = it.rate ?? null, amount = it.amount ?? null
    if (!name && !amount) continue
    let original: string | null = null
    if (/[\u0C80-\u0CFF]/.test(name)) { original = name; name = kannadaToEnglish(name) ?? name }
    const unit = (it.unit ?? '').toLowerCase().replace(/\.$/, '').replace(/^kgs$/, 'kg') || (qty && rate ? 'kg' : 'nos')
    let line: ReadLine
    let doubt = false
    if (qty && rate) {
      const base = qty * rate
      const g = amount ? GST_RATES.find((x) => Math.abs(amount - base * (1 + x / 100)) <= Math.max(1, amount * 0.004)) : 0
      if (amount && g === undefined) doubt = true // amount doesn't match qty x rate: use qty x rate, ask to check
      line = { item: name || 'Item', qty, unit, rate, gst: g ?? 0, ledger: '' }
    } else if (qty && amount) {
      line = { item: name || 'Item', qty, unit, rate: r2s(amount / qty), gst: 0, ledger: '' }
    } else {
      line = { item: name || 'Charges', qty: 1, unit: 'nos', rate: amount ?? 0, gst: 0, ledger: '' }
      doubt = !amount
    }
    line.ledger = ledgerFor(line.item, vendor)
    lines.push(line)
    originals.push(original)
    unsure.push(doubt)
  }
  // Dates: accept "21/8/2026", "Aug 20, 2026", "21-Aug-26"; anything more than a year away is likely misread.
  let date = b.date ? findDate(b.date) ?? findDate(b.date.replace(/^([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})$/, '$2 $1 $3')) : undefined
  const dateOff = date && Math.abs(Date.parse(date) - Date.now()) > 366 * 86_400_000
  if (dateOff) date = undefined
  const doubts = unsure.filter(Boolean).length
  return {
    textFound: true, method: 'sarvam', confidence: doubts ? 80 : 95,
    vendor, date, invoiceNo: b.bill_no?.trim() || undefined,
    lines, originals, unsure,
    cgst: b.cgst || undefined, sgst: b.sgst || undefined, total: b.total ?? undefined,
    skipped: [],
    note: 'Read by Sarvam. Check every line before posting.'
      + (doubts ? ` ${doubts} line${doubts === 1 ? '' : 's'} marked “check” (amount and qty × rate didn't agree).` : '')
      + (dateOff ? ` The date on the bill (“${b.date}”) looks wrong, so please enter it.` : ''),
  }
}
