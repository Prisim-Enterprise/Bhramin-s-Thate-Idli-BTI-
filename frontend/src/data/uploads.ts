import { cloudStore } from './cloudStore'
import { fileToCloud, keepFile, type ReceiptFile } from './ledgerStore'

// Every file uploaded for the books that isn't already kept with its own record: Imprest Books, Cash Books,
// bank statements and Mobikwik reports. (Supplier bills, partner statements and voucher receipts keep their
// file on their own record; the Documents page lists those from there.)
// One record per document: uploading the same outlet-day, the same Cash Book day or the same statement
// period again replaces the record, so the list never fills with copies.

export type UploadKind = 'imprest' | 'cashbook' | 'bank' | 'mobikwik'
export type Upload = {
  id: string
  kind: UploadKind
  name: string // file name as uploaded
  file?: ReceiptFile // the original: in R2 (key) or, offline, in this browser (dataUrl)
  date: string // the day the document is for (an Imprest Book's day; a statement's last day)
  from?: string // a statement's first day, when it covers several
  branch?: string // outlet, when the document is for one
  ledger?: string // bank ledger, for a bank statement
  amount?: number // headline figure: day's sales, total payments …
  summary: string // one line on what it held
  link?: string // where it was used in the dashboard
  uploadedBy: string
  uploadedAt: string
}

const uploads = cloudStore<Upload>('prisim.uploads', {
  kind: 'uploads',
  idOf: (u) => u.id,
  prepare: async (u) => { const f = await fileToCloud(u.file); return f === u.file ? u : { ...u, file: f } },
})
export const useUploads = uploads.use
export const uploadsNow = () => uploads.get()

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const r2 = (n: number) => Math.round(n * 100) / 100

/** A bank statement: one record per bank and period. */
export function recordBankStatement(file: File, ledger: string, s: { lines: { deposit: number; withdrawal: number }[]; from?: string; to?: string }, by: string) {
  if (!s.to) return Promise.resolve()
  const dep = r2(s.lines.reduce((t, l) => t + l.deposit, 0)), wd = r2(s.lines.reduce((t, l) => t + l.withdrawal, 0))
  return recordUpload(file, {
    id: `bank:${slug(ledger)}:${s.from ?? s.to}:${s.to}`, kind: 'bank', date: s.to, from: s.from !== s.to ? s.from : undefined, ledger,
    amount: dep, summary: `${ledger}: ${s.lines.length} line(s), credits ₹${dep.toLocaleString('en-IN')}, debits ₹${wd.toLocaleString('en-IN')}`,
    link: '/admin/accounting/tally', uploadedBy: by,
  })
}

/** Keep the original file and record it. Never fails the upload it belongs to: a file that can't be kept is listed without it. */
export async function recordUpload(file: File, u: Omit<Upload, 'file' | 'name' | 'uploadedAt'>): Promise<void> {
  try {
    const kept = await keepFile(file, 2 * 1024 * 1024).catch(() => undefined)
    const rec: Upload = { ...u, name: file.name, file: kept, uploadedAt: new Date().toISOString() }
    uploads.set([rec, ...uploads.get().filter((x) => x.id !== rec.id)])
  } catch { /* the document itself was already read and saved */ }
}
