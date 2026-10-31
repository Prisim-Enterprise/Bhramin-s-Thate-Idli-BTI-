import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BookText, CheckCircle2, FileImage, FileText, History, Keyboard, PenLine, RotateCw, Paperclip, RefreshCw, RotateCcw, ScanLine, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Tabs, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { KNOWN_LEDGERS, fmtDateTime } from '../../data/entries'
import { BILL_SCRIPTS, BRANCHES, ROLES, branchName, inr, type Bill, type BillLine, type BillScript } from '../../data/mock'
import { keepFile, openReceipt, useCustomLedgers, useManualVouchers } from '../../data/ledgerStore'
import { API_ON, dataUrlToBlob, fileBlob, readUsage, type Usage } from '../../lib/api'
import { billPostings, billSums, deleteBill, getBills, lineBase, lineGst, nextBillId, postBill, saveBill, unpostBill, useBills } from '../../data/billStore'
import { ledgerFor, parseBillLines, readBillFile, type ReadOutcome } from '../../lib/readBill'
import { knownVendors, lastItemsOf, matchVendor, pastItems } from '../../data/vendorMemory'
import { pdfPageLines } from '../../lib/readImprestPdf'
import UploadBillDialog, { type UploadKind } from '../../components/UploadBillDialog'

const STEPS = ['Bill uploaded', 'Read', 'Review', 'Posted to ledger']
const MANUAL_STEPS = ['Bill entered', 'Review', 'Posted to ledger']
/** Handwritten bills that can be uploaded per day (whole company). After that, bills are entered by hand. */
export const HANDWRITTEN_PER_DAY = 10
const localDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '')
const isHandwritten = (b: Bill) => b.script === 'en-hand' || b.script === 'kn-hand'
const MAX_SAVED_FILE = 1024 * 1024 // without the cloud, files above 1 MB are not kept
const EXTRA_LEDGERS = ['Gas Expenses', 'Cleaning Expenses', 'Repairs & Maintenance', 'Fruits Purchased']
const r2 = (n: number) => Math.round(n * 100) / 100

/** A link the page can show for a stored bill image (from R2 or from this browser). */
function useFileUrl(f: Bill['file']) {
  const [url, setUrl] = useState<string | null>(null)
  const key = f?.key
  const dataUrl = f?.dataUrl
  const isImage = !!f?.type.startsWith('image/')
  useEffect(() => {
    setUrl(null)
    if (!isImage) return
    if (dataUrl) { setUrl(dataUrl); return }
    if (!key) return
    let gone = false
    let made = ''
    fileBlob(key).then((b) => { if (!gone) { made = URL.createObjectURL(b); setUrl(made) } }).catch(() => {})
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [key, dataUrl, isImage])
  return url
}

/** Fill a bill from what the reader found. */
function fromRead(base: Bill, r: ReadOutcome, fallbackDate: string): Bill {
  const vendor = r.vendor || base.vendor
  const lines: BillLine[] = r.lines.map(({ item, qty, unit, rate, gst, ledger }, i) => ({
    item, qty, unit, rate, gst, ledger, original: r.originals?.[i] ?? undefined, unsure: r.unsure?.[i] || undefined,
  }))
  // Total found but no item rows: keep the whole bill as one line so nothing is lost.
  if (!lines.length && r.total) {
    lines.push({ item: 'Bill total (split into items if needed)', qty: 1, unit: 'nos', rate: r2(r.total - (r.cgst ?? 0) - (r.sgst ?? 0) - (r.igst ?? 0)), gst: 0, ledger: ledgerFor('', vendor) })
  }
  const found = r.textFound
    ? ` Found ${r.lines.length} item${r.lines.length === 1 ? '' : 's'}${r.total ? `, bill total ${inr(r.total)}` : ''}.` +
      (r.skipped.length ? ` ${r.skipped.length} line${r.skipped.length === 1 ? '' : 's'} could not be read: “${r.skipped.slice(0, 3).join('”, “')}”.` : '')
    : ''
  return {
    ...base, vendor, date: r.date || fallbackDate, invoiceNo: r.invoiceNo ?? base.invoiceNo, lines,
    cgst: r.cgst, sgst: r.sgst, igst: r.igst || undefined, billTotal: r.total, readNote: r.note + found,
    status: 'extracted', confidence: r.method === 'none' ? 0 : r.confidence,
  }
}

const ledgerLink = (name: string) => `/admin/accounting/books?book=ledger&ledger=${encodeURIComponent(name)}`

export default function OcrBills() {
  const { can, role } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const bills = useBills()
  const latestBills = () => getBills()
  const manual = useManualVouchers()
  const custom = useCustomLedgers()
  const [params] = useSearchParams()
  const [selId, setSelId] = useState(params.get('id') ?? bills[0]?.id ?? '')
  const [tab, setTab] = useState<'all' | 'review' | 'credit' | 'other'>('all')
  const [uploading, setUploading] = useState<UploadKind | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [steps, setSteps] = useState<Record<string, string>>({}) // what's happening while a bill is read

  const sel = bills.find((b) => b.id === selId) ?? bills[0]
  const previewUrl = useFileUrl(sel?.file)
  // A bill counts as posted only while its voucher is still in Account Books.
  const isPosted = (b: Bill) => b.status === 'verified' && !!b.voucherId && manual.some((m) => m.id === b.voucherId)
  const canEdit = can('ocr', 'edit')
  const today = new Date().toLocaleDateString('en-CA')
  const handwrittenToday = bills.filter((b) => isHandwritten(b) && localDay(b.uploadedAt) === today).length
  const [usage, setUsage] = useState<Usage | null>(null)
  const refreshUsage = () => { if (API_ON) readUsage().then(setUsage).catch(() => {}) }
  useEffect(refreshUsage, [])
  const handwrittenLeft = usage ? Math.max(0, usage.limit - usage.used) : Math.max(0, HANDWRITTEN_PER_DAY - handwrittenToday)
  const guard = (ok: boolean, action: () => void) => () => (ok ? action() : setBlocked(true))

  const vendorNames = useMemo(() => knownVendors(bills, custom), [bills, custom])
  const itemMemory = useMemo(() => pastItems(bills), [bills])
  const [rotation, setRotation] = useState<Record<string, number>>({})

  const ledgerNames = useMemo(() => {
    const set = new Map<string, string>()
    for (const n of [...KNOWN_LEDGERS.map((k) => k.name), ...EXTRA_LEDGERS, ...custom.filter((c) => !['cash', 'bank', 'creditors', 'debtors'].includes(c.group)).map((c) => c.name)]) set.set(n.toLowerCase(), n)
    return [...set.values()].sort()
  }, [custom])

  const filtered = bills.filter((b) =>
    tab === 'all' ? true : tab === 'review' ? !isPosted(b) : isPosted(b) && b.type === tab,
  )

  const update = (patch: Partial<Bill>) => sel && saveBill({ ...sel, ...patch })

  /** Save the bill straight away, then read the PDF and fill in what was found. */
  /**
   * Use what we know from earlier bills: recognise the vendor from the letterhead, and for a handwritten
   * bill fill in that vendor's usual items (rates, units, ledgers) so only the quantities need typing.
   */
  const withMemory = (b: Bill, r: ReadOutcome): Bill => {
    if (r.method !== 'sarvam') return b
    const all = latestBills()
    const vendors = knownVendors(all.filter((x) => x.id !== b.id), custom)
    const vendor = matchVendor([r.vendor ?? ''], vendors)
    if (!vendor) return b
    const usual = lastItemsOf(vendor, all, b.id)
    const useUsual = usual.length > 0 && !b.lines.length
    return {
      ...b, vendor,
      lines: useUsual ? usual : b.lines,
      readNote: (b.readNote ?? '') + ` Vendor matched to “${vendor}”.` + (useUsual ? ` No items could be read, so ${usual.length} item${usual.length === 1 ? '' : 's'} were filled from their last bill — type the quantities.` : ''),
      confidence: Math.max(b.confidence, 60),
    }
  }

  // If the browser is out of room, keep the bill without its file.
  const save = (b: Bill) => saveBill(b) || saveBill({ ...b, file: b.file && { ...b.file, dataUrl: undefined } })

  /** Store the file and add the bill to the list (status "reading"). */
  const addBill = async (file: File, script: BillScript, branch: string): Promise<Bill> => {
    const id = nextBillId()
    // The file goes to R2 (cloud). Without the cloud it's kept in the browser if it's 1 MB or less.
    const kept = await keepFile(file, MAX_SAVED_FILE).catch(() => ({ name: file.name, type: file.type, size: file.size }))
    const base: Bill = {
      id, vendor: file.name.replace(/\.[^.]+$/, ''), branch, uploadedBy: by, uploadedAt: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10), status: 'processing', confidence: 0, type: 'credit', script, lines: [], file: kept,
    }
    save(base)
    return base
  }

  /** Read one bill and fill it in. `pageText` = the page's own text, when a text PDF was split. */
  const readInto = async (base: Bill, file: Blob & { name?: string }, pageText?: string[]) => {
    const id = base.id
    setSteps((m) => ({ ...m, [id]: 'Reading the bill…' }))
    let r: ReadOutcome
    if (pageText) {
      const t = parseBillLines(pageText)
      r = t.textFound
        ? { ...t, method: 'pdf-text', confidence: 100, note: 'Read from the text inside the PDF.' }
        : { textFound: false, lines: [], skipped: [], method: 'none', confidence: 0, note: 'This page is a scan, so it has no text to read. Upload scanned bills with “Upload handwritten / scanned bill”, or use “Read again with AI”.' }
    } else {
      r = await readBillFile(file, base.script, (t) => setSteps((m) => ({ ...m, [id]: t })))
    }
    setSteps((m) => { const n = { ...m }; delete n[id]; return n })
    save(withMemory(fromRead(base, r, base.date), r))
    refreshUsage()
  }

  const onUpload = async ({ file, script, branch, split }: { file: File; script: BillScript; branch: string; split: boolean }) => {
    setUploading(null)
    setTab('all')
    setMessage(null)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const handwritten = script === 'en-hand' || script === 'kn-hand'
    const limitMsg = (n: number) => `Only ${handwrittenLeft} handwritten upload${handwrittenLeft === 1 ? '' : 's'} left today (limit ${HANDWRITTEN_PER_DAY} a day)` +
      (n > 1 ? `, but this PDF has ${n} bills` : '') + '. Use “Enter bill manually” for the rest.'
    if (handwritten && handwrittenLeft === 0) return setMessage({ tone: 'error', text: limitMsg(1) })
    if (!split || !isPdf) {
      const b = await addBill(file, script, branch)
      setSelId(b.id)
      return readInto(b, file)
    }
    // A stack of bills in one PDF: each page becomes its own bill.
    setMessage({ tone: 'ok', text: 'Splitting the PDF into one bill per page…' })
    try {
      const { pdfPagesToImages } = await import('../../lib/ocr')
      const texts = script === 'en-typed' ? await pdfPageLines(file).catch(() => null) : null
      const images = await pdfPagesToImages(file, 40)
      if (images.length <= 1) {
        setMessage(null)
        const b = await addBill(file, script, branch)
        setSelId(b.id)
        return readInto(b, file)
      }
      if (handwritten && images.length > handwrittenLeft) return setMessage({ tone: 'error', text: limitMsg(images.length) })
      const stem = file.name.replace(/\.[^.]+$/, '')
      const pages: { bill: Bill; file: File }[] = []
      for (let i = 0; i < images.length; i++) {
        const pageFile = new File([images[i]], `${stem} - page ${i + 1}.jpg`, { type: 'image/jpeg' })
        pages.push({ bill: await addBill(pageFile, script, branch), file: pageFile })
        if (i === 0) setSelId(pages[0].bill.id)
      }
      setMessage({ tone: 'ok', text: `Split into ${pages.length} bills (one per page). Reading them one by one…` })
      for (let i = 0; i < pages.length; i++) await readInto(pages[i].bill, pages[i].file, texts?.[i])
      setMessage({ tone: 'ok', text: `Done: ${pages.length} bills read. Check each one in “Needs review”, then post it.` })
    } catch (e) {
      setMessage({ tone: 'error', text: `Could not split this PDF: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  /** A blank bill to type in from a paper bill (no reading, doesn't count toward the daily limit). */
  const newManualBill = () => {
    const id = nextBillId()
    const b: Bill = {
      id, vendor: '', branch: 'CK', uploadedBy: by, uploadedAt: new Date().toISOString(), date: new Date().toISOString().slice(0, 10),
      status: 'extracted', confidence: 0, type: 'credit', script: 'manual',
      lines: [{ item: '', qty: 1, unit: 'kg', rate: 0, gst: 0, ledger: '' }],
      readNote: 'Typed in by hand. Pick the vendor first: if they billed before, their usual items and rates fill in.',
    }
    save(b)
    setSelId(id)
    setTab('all')
    setMessage(null)
  }

  /** Attach a photo/PDF of the paper bill to a bill entered by hand (kept as proof; not read). */
  const attachFile = async (b: Bill, file?: File) => {
    if (!file) return
    const kept = await keepFile(file, MAX_SAVED_FILE).catch(() => ({ name: file.name, type: file.type, size: file.size }))
    saveBill({ ...b, file: kept })
  }

  /** The stored file of a bill, from R2 or from this browser. */
  const fileOf = async (b: Bill): Promise<Blob & { name: string }> => {
    const blob = b.file!.key ? await fileBlob(b.file!.key) : await dataUrlToBlob(b.file!.dataUrl!)
    return Object.assign(new Blob([blob], { type: b.file!.type || blob.type }), { name: b.file!.name })
  }

  /** Read an existing bill again the same way it was uploaded (PDF text, or Sarvam for handwriting). */
  const reread = async (b: Bill) => {
    if (!b.file) return
    setMessage(null)
    setSteps((m) => ({ ...m, [b.id]: 'Reading the bill…' }))
    try {
      const r = await readBillFile(await fileOf(b), b.script, (t) => setSteps((m) => ({ ...m, [b.id]: t })))
      saveBill(withMemory(fromRead({ ...b, status: 'processing' }, r, b.date), r))
    } catch (e) {
      setMessage({ tone: 'error', text: `Reading failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSteps((m) => { const n = { ...m }; delete n[b.id]; return n })
    }
  }

  const header = (
    <PageHeader
      title="OCR Bill Inbox"
      subtitle="Handwritten and scanned bills (English or Kannada) are read by Sarvam, 10 a day; printed PDFs are read from their text; anything else is entered by hand. Check, then post to Account Books"
      actions={
        <>
          <Button variant="secondary" icon={PenLine} disabled={handwrittenLeft === 0}
            title={handwrittenLeft === 0 ? `Today's ${HANDWRITTEN_PER_DAY} handwritten uploads are used. Use “Enter bill manually”.` : undefined}
            onClick={guard(can('ocr', 'create'), () => setUploading('handwritten'))}>
            Upload handwritten / scanned bill <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">{handwrittenLeft} left today</span>
          </Button>
          <Button icon={FileText} onClick={guard(can('ocr', 'create'), () => setUploading('pdf'))}>Upload PDF bill</Button>
          <Button variant="secondary" icon={Keyboard} onClick={guard(can('ocr', 'create'), () => newManualBill())}>Enter bill manually</Button>
          {uploading && <UploadBillDialog kind={uploading} onClose={() => setUploading(null)} onUpload={onUpload} />}
        </>
      }
    />
  )
  const blockedNote = blocked && (
    <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>You're signed in as <b>{ROLES.find((x) => x.id === role)?.name}</b>, which can only view. Ask an admin for the Accountant or Admin role, then sign in again.</span>
    </p>
  )

  if (!sel) {
    return (
      <>
        {header}
        {blockedNote}
        <Card>
          <EmptyState icon={ScanLine} title="No bills yet"
            text="Use “Upload handwritten bill” for a photo of a handwritten bill (English or Kannada), or “Upload PDF bill” for a printed PDF. Items are sorted into ledgers like Vegetables Purchased or Groceries Purchased, and posted to Account Books after you check them." />
        </Card>
      </>
    )
  }

  const posted = isPosted(sel)
  const hasFile = !!(sel.file?.key || sel.file?.dataUrl)
  const locked = posted || !canEdit || sel.status === 'processing'
  const updateLine = (i: number, patch: Partial<BillLine>) => update({ lines: sel.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const sums = billSums(sel)
  const postings = billPostings(sel)
  const flow = sel.script === 'manual' ? MANUAL_STEPS : STEPS
  const step = sel.script === 'manual' ? (posted ? 2 : 1) : sel.status === 'processing' ? 1 : posted ? 3 : 2
  const taxInput = (k: 'cgst' | 'sgst' | 'igst', v: number) => (
    <input type="number" step="0.01" aria-label={k.toUpperCase()} className={inputCls + ' !w-28 !py-1 text-right'} value={v} disabled={locked}
      onChange={(e) => update({ [k]: e.target.value === '' ? undefined : +e.target.value })} />
  )

  const doPost = () => {
    const err = postBill(sel, by, custom)
    setMessage(err ? { tone: 'error', text: err } : { tone: 'ok', text: `Posted ${sel.id} to Account Books as a Purchase voucher.` })
  }

  return (
    <>
      {header}
      {blockedNote}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: bills.length },
          { id: 'review', label: 'Needs review', count: bills.filter((b) => !isPosted(b)).length },
          { id: 'credit', label: 'Credit bills', count: bills.filter((b) => isPosted(b) && b.type === 'credit').length },
          { id: 'other', label: 'Paid in cash', count: bills.filter((b) => isPosted(b) && b.type === 'other').length },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card pad={false}>
          <ul className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
            {filtered.map((b) => (
              <li key={b.id}>
                <button onClick={() => { setSelId(b.id); setMessage(null) }} className={`w-full px-4 py-3 text-left ${b.id === sel.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{b.id}</span>
                    <Badge tone={isPosted(b) ? 'green' : b.status === 'processing' ? 'blue' : 'amber'}>
                      {isPosted(b) ? 'posted' : b.status === 'processing' ? 'reading' : 'to check'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-600">{b.vendor}</p>
                  <p className="text-xs text-slate-400">{branchName(b.branch)} · {inr(billSums(b).total)}</p>
                  <p className="text-xs text-slate-400">Uploaded by {b.uploadedBy}{b.uploadedAt && <> · {fmtDateTime(b.uploadedAt)}</>}</p>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="p-4 text-sm text-slate-500">Nothing here.</li>}
          </ul>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <ol className="flex flex-wrap items-center gap-2 text-xs">
              {flow.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${i <= step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {i < step && <CheckCircle2 size={12} />} {s}
                  </span>
                  {i < flow.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(320px,38%)_minmax(0,1fr)]">
            <Card title="Bill file" actions={previewUrl && (
              <Button size="sm" variant="secondary" icon={RotateCw} onClick={() => setRotation((m) => ({ ...m, [sel.id]: ((m[sel.id] ?? 0) + 90) % 360 }))}>Rotate</Button>
            )}>
              {previewUrl ? (
                <div className="max-h-[80vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                  <img src={previewUrl} alt={`Bill ${sel.id}`} onClick={() => sel.file && openReceipt(sel.file)}
                    style={{ transform: `rotate(${rotation[sel.id] ?? 0}deg)` }}
                    className={`w-full cursor-zoom-in transition-transform ${(rotation[sel.id] ?? 0) % 180 ? 'my-[20%] scale-[0.75]' : ''}`} />
                </div>
              ) : (
                <div className="grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 text-slate-400">
                  <div className="text-center">
                    <FileImage className="mx-auto" size={32} />
                    <p className="mt-2 break-all text-xs">{sel.file?.name ?? sel.id}</p>
                  </div>
                </div>
              )}
              {hasFile ? (
                <button onClick={() => sel.file && openReceipt(sel.file)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#7a2228] hover:underline">
                  <Paperclip size={13} /> Open bill
                </button>
              ) : sel.file && <p className="mt-2 text-[11px] text-slate-400">File is over 1 MB, so it isn't kept in this browser.</p>}
              {sel.file?.key && <p className="mt-1 text-[11px] text-slate-400">Stored in the cloud</p>}
              {!sel.file && !posted && (
                <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#7a2228] hover:underline">
                  <Paperclip size={13} /> Attach photo of the bill (optional)
                  <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => void attachFile(sel, e.target.files?.[0])} />
                </label>
              )}
              <span className="mt-3 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{BILL_SCRIPTS[sel.script].short}</span>
            </Card>

            <Card title={`Bill details · ${sel.id}`}>
              {sel.status === 'processing' && steps[sel.id] ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
                  {steps[sel.id]}
                </p>
              ) : sel.status === 'processing' ? (
                // Reading started but this page isn't doing it (page was reloaded or closed mid-read).
                <div className="py-8 text-center text-sm text-slate-600">
                  <AlertTriangle className="mx-auto mb-2 text-amber-500" size={22} />
                  <p className="font-medium text-slate-800">Reading stopped before it finished</p>
                  <p className="mt-1 text-slate-500">The page was reloaded or closed while the bill was being read.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {hasFile ? (
                      <Button icon={RefreshCw} onClick={guard(can('ocr', 'create'), () => void reread(sel))}>Read again</Button>
                    ) : (
                      <p className="text-xs text-rose-600">The file didn't finish uploading, so it can't be read again. Delete this bill and upload it once more.</p>
                    )}
                    <Button variant="ghost" icon={Trash2} onClick={guard(can('ocr', 'delete'), () => { if (confirm(`Delete ${sel.id}?`)) { deleteBill(sel); setSelId('') } })}>Delete bill</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs text-slate-500">Uploaded by <b className="text-slate-700">{sel.uploadedBy}</b>{sel.uploadedAt && <> on {fmtDateTime(sel.uploadedAt)}</>} · {branchName(sel.branch)}</p>
                  {sel.readNote && (
                    <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${sel.confidence ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{sel.readNote}</p>
                  )}
                  {sel.status === 'verified' && !posted && (
                    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Its voucher was deleted in Account Books, so this bill is open again. Post it once more if needed.</p>
                  )}

                  <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs text-slate-500">Vendor
                      <input list="bill-vendors" className={inputCls + ' mt-1'} value={sel.vendor} disabled={locked}
                        onChange={(e) => {
                          const v = e.target.value
                          const empty = !sel.lines.some((l) => l.qty > 0 && l.rate > 0)
                          const usual = vendorNames.includes(v) && empty ? lastItemsOf(v, bills, sel.id) : []
                          update(usual.length ? { vendor: v, lines: usual, readNote: `Filled ${usual.length} item(s) from ${v}'s last bill — type the quantities.` } : { vendor: v })
                        }} />
                    </label>
                    <label className="text-xs text-slate-500">Branch
                      <select aria-label="Branch" className={inputCls + ' mt-1'} value={sel.branch} disabled={locked} onChange={(e) => update({ branch: e.target.value })}>
                        {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">Invoice no.<input className={inputCls + ' mt-1'} value={sel.invoiceNo ?? ''} disabled={locked} onChange={(e) => update({ invoiceNo: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">Bill date<input type="date" className={inputCls + ' mt-1'} value={sel.date} disabled={locked} onChange={(e) => update({ date: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">How it's paid
                      <select aria-label="How it's paid" className={inputCls + ' mt-1'} value={sel.type} disabled={locked} onChange={(e) => update({ type: e.target.value as Bill['type'] })}>
                        <option value="credit">On credit (owed to vendor)</option>
                        <option value="other">Paid in cash by branch</option>
                      </select>
                    </label>
                  </div>

                  <datalist id="bill-ledgers">{ledgerNames.map((n) => <option key={n} value={n} />)}</datalist>
                  <datalist id="bill-vendors">{vendorNames.map((n) => <option key={n} value={n} />)}</datalist>
                  <datalist id="bill-items">{[...itemMemory.values()].map((l) => <option key={l.item} value={l.item} />)}</datalist>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500">
                        <tr><th className="py-2">Item</th><th>Ledger</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST %</th><th className="text-right">Amount</th><th /></tr>
                      </thead>
                      <tbody>
                        {sel.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="min-w-[150px] py-1.5 pr-2">
                              <input list="bill-items" aria-label="Item" className={inputCls + ' !py-1'} value={l.item} disabled={locked}
                                onChange={(e) => {
                                  const known = itemMemory.get(e.target.value.trim().toLowerCase())
                                  updateLine(i, known && !l.rate
                                    ? { item: e.target.value, unit: known.unit, rate: known.rate, gst: known.gst, ledger: known.ledger }
                                    : { item: e.target.value, ledger: l.ledger || ledgerFor(e.target.value, sel.vendor) })
                                }} />
                              {l.original && <span className="mt-0.5 block text-xs text-slate-500" lang="kn">On bill: {l.original}</span>}
                              {l.unsure && <span className="mt-0.5 block text-xs font-medium text-amber-700">? Hard to read — check this line</span>}
                            </td>
                            <td className="min-w-[170px] pr-2">
                              <input list="bill-ledgers" aria-label="Ledger" className={inputCls + ' !py-1'} value={l.ledger ?? ''} disabled={locked}
                                placeholder={ledgerFor(l.item, sel.vendor)} onChange={(e) => updateLine(i, { ledger: e.target.value })} />
                            </td>
                            <td className="pr-2"><input type="number" aria-label="Quantity" className={inputCls + ' !w-20 !py-1'} value={l.qty} disabled={locked} onChange={(e) => updateLine(i, { qty: +e.target.value })} /></td>
                            <td className="pr-2"><input aria-label="Unit" className={inputCls + ' !w-16 !py-1'} value={l.unit} disabled={locked} onChange={(e) => updateLine(i, { unit: e.target.value })} /></td>
                            <td className="pr-2"><input type="number" aria-label="Rate" className={inputCls + ' !w-24 !py-1'} value={l.rate} disabled={locked} onChange={(e) => updateLine(i, { rate: +e.target.value })} /></td>
                            <td className="pr-2"><input type="number" aria-label="GST percent" className={inputCls + ' !w-16 !py-1'} value={l.gst} disabled={locked} onChange={(e) => updateLine(i, { gst: +e.target.value })} /></td>
                            <td className="text-right">
                              <input type="number" step="0.01" aria-label="Amount" title="Type the amount from the bill; the rate is worked out"
                                className={inputCls + ' !w-28 !py-1 text-right'} disabled={locked}
                                value={Math.round((lineBase(l) + lineGst(l)) * 100) / 100}
                                onChange={(e) => { const amt = +e.target.value; const q = l.qty || 1; updateLine(i, { qty: q, rate: Math.round((amt / q / (1 + l.gst / 100)) * 10000) / 10000 }) }} />
                            </td>
                            <td className="pl-2">{!locked && <button className="text-slate-400 hover:text-rose-600" aria-label="Remove line" onClick={() => update({ lines: sel.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}</td>
                          </tr>
                        ))}
                        {!sel.lines.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No items yet. Use <b>+ Add line</b>.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {!locked && (
                    <div className="mt-2 flex flex-wrap gap-4">
                      <button className="text-xs font-medium text-brand-600" onClick={() => update({ lines: [...sel.lines, { item: '', qty: 1, unit: 'kg', rate: 0, gst: 0, ledger: '' }] })}>+ Add line</button>
                      {lastItemsOf(sel.vendor, bills, sel.id).length > 0 && (
                        <button className="inline-flex items-center gap-1 text-xs font-medium text-brand-600"
                          onClick={() => { if (!sel.lines.length || confirm('Replace these lines with the items from this vendor’s last bill?')) update({ lines: lastItemsOf(sel.vendor, bills, sel.id) }) }}>
                          <History size={13} /> Fill from {sel.vendor}'s last bill
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
                    <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1.5 text-sm">
                      <dt className="text-slate-500">Items (before tax)</dt><dd className="text-right tabular-nums">{inr(sums.subtotal)}</dd>
                      <dt className="text-slate-500">CGST</dt><dd className="text-right">{taxInput('cgst', sums.cgst)}</dd>
                      <dt className="text-slate-500">SGST</dt><dd className="text-right">{taxInput('sgst', sums.sgst)}</dd>
                      {(sums.igst > 0 || sel.igst != null) && <><dt className="text-slate-500">IGST</dt><dd className="text-right">{taxInput('igst', sums.igst)}</dd></>}
                      {sums.roundOff !== 0 && <><dt className="text-slate-500">Round off</dt><dd className="text-right tabular-nums">{inr(sums.roundOff)}</dd></>}
                      <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums">{inr(sums.total)}</dd>
                      <dt className="text-slate-500">Total printed on bill</dt>
                      <dd className="text-right">
                        <input type="number" step="0.01" aria-label="Total printed on bill" className={inputCls + ' !w-28 !py-1 text-right'} value={sel.billTotal ?? ''} disabled={locked}
                          onChange={(e) => update({ billTotal: e.target.value === '' ? undefined : +e.target.value })} />
                      </dd>
                    </dl>

                    {/* What will go into Account Books */}
                    <div className="rounded-lg bg-slate-50 p-3 text-xs">
                      <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-700"><BookText size={14} /> {posted ? 'Posted' : 'Will post'} as a Purchase voucher</p>
                      <table className="w-full">
                        <tbody>
                          {postings.map((p, i) => (
                            <tr key={i}>
                              <td className="py-0.5 pr-2 font-mono text-slate-500">{p.dr ? 'Dr' : 'Cr'}</td>
                              <td className="py-0.5 pr-2">
                                {posted ? <Link to={ledgerLink(p.ledger)} className="font-medium text-[#7a2228] hover:underline">{p.ledger}</Link> : <span className="font-medium text-slate-800">{p.ledger}</span>}
                              </td>
                              <td className="py-0.5 text-right tabular-nums">{inr(p.dr || p.cr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {sums.mismatch !== 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      Items and tax add up to {inr(sums.total)}, but the bill says {inr(sel.billTotal ?? 0)} (difference {inr(sums.mismatch)}). Check the lines before posting.
                    </p>
                  )}
                  {message && (
                    <p className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
                      {message.tone === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {message.text}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    {!posted && hasFile && sel.script !== 'manual' && (
                      <Button variant="secondary" icon={RefreshCw} disabled={!!steps[sel.id]} onClick={guard(can('ocr', 'create'), () => void reread(sel))}>
                        {steps[sel.id] ? steps[sel.id] : sel.script === 'en-typed' ? 'Read PDF again' : 'Read again (uses 1 of today’s 10)'}
                      </Button>
                    )}
                    <Button variant="ghost" icon={Trash2} onClick={guard(can('ocr', 'delete'), () => { if (confirm(`Delete ${sel.id}${posted ? ' and its voucher in Account Books' : ''}?`)) { deleteBill(sel); setSelId(''); setMessage(null) } })}>Delete bill</Button>
                    {posted ? (
                      <>
                        <Button variant="secondary" icon={RotateCcw} onClick={guard(canEdit, () => { unpostBill(sel); setMessage(null) })}>Undo posting</Button>
                        <Link to={ledgerLink(postings[0]?.ledger ?? '')}><Button icon={BookText}>Open in Account Books</Button></Link>
                      </>
                    ) : (
                      <Button icon={CheckCircle2} disabled={!sel.lines.length} onClick={guard(can('ocr', 'approve'), doPost)}>Verify &amp; post to ledger</Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
