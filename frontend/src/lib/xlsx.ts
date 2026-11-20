// A small reader for .xlsx files (bank statements, payout reports), with no extra library.
// An .xlsx is a zip of XML files: we unzip with the browser's own DecompressionStream and read the first sheet.

type Entry = { name: string; method: number; size: number; offset: number }

function entries(buf: ArrayBuffer): Entry[] {
  const v = new DataView(buf)
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('This is not an .xlsx file.')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out: Entry[] = []
  const dec = new TextDecoder()
  for (let n = 0; n < count; n++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen))
    // The data starts after the local header and its own name and extra fields.
    const offset = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    out.push({ name, method, size, offset })
    p += 46 + nameLen + extra + comment
  }
  return out
}

async function read(buf: ArrayBuffer, e: Entry): Promise<string> {
  const raw = new Uint8Array(buf, e.offset, e.size)
  if (e.method === 0) return new TextDecoder().decode(raw)
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(await new Response(stream).arrayBuffer())
}

/** Excel's day number (days since 30 Dec 1899) -> yyyy-mm-dd. */
export const excelDate = (n: number) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)

/** Every sheet of an .xlsx, in the workbook's order, as rows of text cells. Numbers stay as written ("1250.5", or a day number for dates). */
export async function xlsxWorkbook(file: Blob, only?: (name: string) => boolean): Promise<{ name: string; rows: string[][] }[]> {
  const buf = await file.arrayBuffer()
  const list = entries(buf)
  const get = async (name: string) => { const e = list.find((x) => x.name === name); return e ? read(buf, e) : '' }
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
  const shared = [...xml(await get('xl/sharedStrings.xml')).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
  const wb = xml(await get('xl/workbook.xml'))
  const rels = [...xml(await get('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')]
  const col = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const sheets = [...wb.getElementsByTagName('sheet')].map((s) => {
    const target = rels.find((r) => r.getAttribute('Id') === s.getAttribute('r:id'))?.getAttribute('Target')
    return { name: s.getAttribute('name') ?? '', path: target ? 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '') : '' }
  })
  if (!sheets.length) { const p = list.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))?.name; if (p) sheets.push({ name: 'Sheet1', path: p }) }
  if (!sheets.length) throw new Error('No sheet found in this file.')
  const out: { name: string; rows: string[][] }[] = []
  for (const s of sheets) {
    if (only && !only(s.name)) continue
    const sheet = xml(await get(s.path))
    out.push({
      name: s.name,
      rows: [...sheet.getElementsByTagName('row')].map((row) => {
        const cells: string[] = []
        for (const c of row.getElementsByTagName('c')) {
          const t = c.getAttribute('t')
          const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
          const text = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent).join('') : v
          cells[col(c.getAttribute('r') ?? 'A1')] = text.trim()
        }
        return Array.from(cells, (x) => x ?? '')
      }),
    })
  }
  return out
}

/** The first sheet of an .xlsx as rows of text cells. */
export async function xlsxRows(file: Blob): Promise<string[][]> {
  let first = true
  const [s] = await xlsxWorkbook(file, () => { const f = first; first = false; return f })
  return s?.rows ?? []
}

/** An "xls" saved by many banks is really an HTML table: read its rows. */
export function htmlRows(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  return [...doc.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()))
}
