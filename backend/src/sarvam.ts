// Reads a handwritten or scanned bill with Sarvam Doc AI ("extract" job): submit, wait, fetch the result.
// Docs: https://docs.sarvam.ai (Document Intelligence). Auth header: api-subscription-key.

const BASE = 'https://api.sarvam.ai/doc-ai/v1/job'

// What we ask Sarvam to pull out of each bill.
const SCHEMA = {
  type: 'object',
  properties: {
    vendor: { type: 'string', description: 'Shop or supplier name printed at the top of the bill' },
    bill_no: { type: 'string', description: 'Bill or invoice number' },
    date: { type: 'string', description: 'Bill date exactly as written (day/month/year)' },
    items: {
      type: 'array',
      description: 'Each item line on the bill, including extra charges like coolie, hamali, transport or RMC',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item name in English (translate Kannada)' },
          qty: { type: 'number', description: 'Quantity, e.g. kilograms or count' },
          unit: { type: 'string', description: 'Unit such as kg, ltr, nos, box' },
          rate: { type: 'number', description: 'Price per unit' },
          amount: { type: 'number', description: 'Line amount in rupees' },
        },
      },
    },
    cgst: { type: 'number', description: 'CGST amount in rupees, 0 if none' },
    sgst: { type: 'number', description: 'SGST amount in rupees, 0 if none' },
    total: { type: 'number', description: 'Grand total of the bill in rupees' },
  },
}

export type SarvamBill = {
  vendor?: string | null; bill_no?: string | null; date?: string | null
  items?: { item?: string | null; qty?: number | null; unit?: string | null; rate?: number | null; amount?: number | null }[] | null
  cgst?: number | null; sgst?: number | null; total?: number | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sarvam(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(BASE + path, { ...init, headers: { 'api-subscription-key': key, ...(init.headers ?? {}) } })
  if (!res.ok) {
    let msg = ''
    try { const e = (await res.json()) as { detail?: string; message?: string }; msg = e.detail ?? e.message ?? '' } catch { /* not JSON */ }
    throw new Error(res.status === 402 ? 'Sarvam account has no credit left.' : res.status === 429 ? 'Sarvam is busy, try again in a minute.' : `Sarvam error ${res.status}${msg ? ': ' + msg : ''}`)
  }
  return res
}

/** Read one bill (image or PDF). Returns the bill and how many pages Sarvam processed. */
export async function readBillWithSarvam(key: string, file: Blob, name: string): Promise<{ bill: SarvamBill; pages: number }> {
  const form = new FormData()
  form.append('file', file, name)
  form.append('schema', JSON.stringify(SCHEMA))
  form.append('output_format', 'json')
  const { job_id } = (await (await sarvam(key, '/extract', { method: 'POST', body: form })).json()) as { job_id: string }

  // A bill usually takes 3–10 seconds.
  let status = 'pending'
  let pages = 1
  for (let i = 0; i < 40; i++) {
    await sleep(i < 5 ? 1500 : 3000)
    const s = (await (await sarvam(key, `/${job_id}/status`)).json()) as { status: string; usage?: { pages_total?: number } }
    status = s.status
    pages = s.usage?.pages_total ?? pages
    if (['completed', 'partially_completed', 'failed', 'rejected'].includes(status)) break
  }
  if (status !== 'completed' && status !== 'partially_completed') {
    throw new Error(status === 'pending' || status === 'running' ? 'Sarvam took too long. Try “Read again”.' : `Sarvam could not read this bill (${status}).`)
  }

  // Results come back gzip-compressed JSON.
  const res = await sarvam(key, `/${job_id}/results`)
  const raw = new Uint8Array(await res.arrayBuffer())
  const text = raw[0] === 0x1f && raw[1] === 0x8b
    ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(raw)
  const out = JSON.parse(text) as { result?: SarvamBill }
  return { bill: out.result ?? {}, pages }
}
