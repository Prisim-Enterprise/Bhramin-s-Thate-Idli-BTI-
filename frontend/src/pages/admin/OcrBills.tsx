import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BookText, CheckCircle2, FileImage, Paperclip, RefreshCw, RotateCcw, ScanLine, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, Tabs, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { KNOWN_LEDGERS, fmtDateTime } from '../../data/entries'
import { BILL_SCRIPTS, ROLES, branchName, inr, type Bill, type BillLine, type BillScript } from '../../data/mock'
import { keepFile, openReceipt, useCustomLedgers, useManualVouchers } from '../../data/ledgerStore'
import { fileBlob } from '../../lib/api'
import { billPostings, billSums, deleteBill, lineBase, lineGst, nextBillId, postBill, saveBill, unpostBill, useBills } from '../../data/billStore'
import { ledgerFor, readBill } from '../../lib/readBill'
import UploadBillDialog from '../../components/UploadBillDialog'

const STEPS = ['Bill uploaded', 'Read', 'Review', 'Posted to ledger']
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

const ledgerLink = (name: string) => `/admin/accounting/books?book=ledger&ledger=${encodeURIComponent(name)}`

export default function OcrBills() {
  const { can, role } = useApp()
  const auth = useAuth()
  const by = auth.email ?? 'Demo user'
  const bills = useBills()
  const manual = useManualVouchers()
  const custom = useCustomLedgers()
  const [params] = useSearchParams()
  const [selId, setSelId] = useState(params.get('id') ?? bills[0]?.id ?? '')
  const [tab, setTab] = useState<'all' | 'review' | 'credit' | 'other'>('all')
  const [uploading, setUploading] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const sel = bills.find((b) => b.id === selId) ?? bills[0]
  const previewUrl = useFileUrl(sel?.file)
  // A bill counts as posted only while its voucher is still in Account Books.
  const isPosted = (b: Bill) => b.status === 'verified' && !!b.voucherId && manual.some((m) => m.id === b.voucherId)
  const canEdit = can('ocr', 'edit')
  const guard = (ok: boolean, action: () => void) => () => (ok ? action() : setBlocked(true))

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
  const onUpload = async ({ file, script, branch }: { file: File; script: BillScript; branch: string }) => {
    const id = nextBillId()
    const today = new Date().toISOString().slice(0, 10)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    setUploading(false)
    // The file goes to R2 (cloud). Without the cloud it's kept in the browser if it's 1 MB or less.
    const kept = await keepFile(file, MAX_SAVED_FILE).catch(() => ({ name: file.name, type: file.type, size: file.size }))
    const base: Bill = {
      id, vendor: file.name.replace(/\.[^.]+$/, ''), branch, uploadedBy: by, uploadedAt: new Date().toISOString(), date: today,
      status: 'processing', confidence: 0, type: 'credit', script, lines: [], file: kept,
    }
    // If the browser is out of room, keep the bill without its file.
    const save = (b: Bill) => saveBill(b) || saveBill({ ...b, file: b.file && { ...b.file, dataUrl: undefined } })
    save(base)
    setSelId(id)
    setTab('all')
    setMessage(null)

    const r = await readBill(file)
    const vendor = r.vendor || base.vendor
    const lines: BillLine[] = r.lines.map(({ item, qty, unit, rate, gst, ledger }) => ({ item, qty, unit, rate, gst, ledger }))
    // Total found but no item rows: keep the whole bill as one line so nothing is lost.
    if (!lines.length && r.total) {
      lines.push({ item: 'Bill total (split into items if needed)', qty: 1, unit: 'nos', rate: r2(r.total - (r.cgst ?? 0) - (r.sgst ?? 0) - (r.igst ?? 0)), gst: 0, ledger: ledgerFor('', vendor) })
    }
    const readNote = !r.textFound
      ? isPdf
        ? 'This PDF has no text inside (it is a scan or photo). Type the items in below.'
        : 'Photos are not read yet. Type the items in below — PDFs from billing software are read automatically.'
      : `Read ${r.lines.length} item${r.lines.length === 1 ? '' : 's'} from the PDF${r.total ? `, bill total ${inr(r.total)}` : ''}.` +
        (r.skipped.length ? ` ${r.skipped.length} line${r.skipped.length === 1 ? '' : 's'} could not be read: “${r.skipped.slice(0, 3).join('”, “')}”.` : '')
    save({
      ...base, vendor, date: r.date || today, invoiceNo: r.invoiceNo, lines,
      cgst: r.cgst, sgst: r.sgst, igst: r.igst || undefined, billTotal: r.total, readNote,
      status: 'extracted', confidence: r.textFound ? 100 : 0,
    })
  }

  const header = (
    <PageHeader
      title="OCR Bill Inbox"
      subtitle="Upload a vendor bill: it's read, each item is put under the right ledger, and once checked it's posted to Account Books"
      actions={
        <>
          <Button icon={Upload} onClick={guard(can('ocr', 'create'), () => setUploading(true))}>Upload bill</Button>
          {uploading && <UploadBillDialog onClose={() => setUploading(false)} onUpload={onUpload} />}
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
            text="Upload a vendor bill (PDF works best). Items are read, sorted into ledgers like Vegetables Purchased or Groceries Purchased, and posted to Account Books after you check them." />
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
  const step = sel.status === 'processing' ? 1 : posted ? 3 : 2
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

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
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
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${i <= step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {i < step && <CheckCircle2 size={12} />} {s}
                  </span>
                  {i < STEPS.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            <Card title="Bill file">
              {previewUrl ? (
                <button onClick={() => sel.file && openReceipt(sel.file)} className="block w-full">
                  <img src={previewUrl} alt={`Bill ${sel.id}`} className="w-full rounded-lg border border-slate-200" />
                </button>
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
              <span className="mt-3 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{BILL_SCRIPTS[sel.script].short}</span>
            </Card>

            <Card title={`Bill details · ${sel.id}`}>
              {sel.status === 'processing' ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
                  Reading the bill…
                </p>
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
                    <label className="text-xs text-slate-500">Vendor<input className={inputCls + ' mt-1'} value={sel.vendor} disabled={locked} onChange={(e) => update({ vendor: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">Invoice no.<input className={inputCls + ' mt-1'} value={sel.invoiceNo ?? ''} disabled={locked} onChange={(e) => update({ invoiceNo: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">Bill date<input type="date" className={inputCls + ' mt-1'} value={sel.date} disabled={locked} onChange={(e) => update({ date: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">How it's paid
                      <select className={inputCls + ' mt-1'} value={sel.type} disabled={locked} onChange={(e) => update({ type: e.target.value as Bill['type'] })}>
                        <option value="credit">On credit (owed to vendor)</option>
                        <option value="other">Paid in cash by branch</option>
                      </select>
                    </label>
                  </div>

                  <datalist id="bill-ledgers">{ledgerNames.map((n) => <option key={n} value={n} />)}</datalist>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500">
                        <tr><th className="py-2">Item</th><th>Ledger</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST %</th><th className="text-right">Amount</th><th /></tr>
                      </thead>
                      <tbody>
                        {sel.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="min-w-[150px] py-1.5 pr-2">
                              <input className={inputCls + ' !py-1'} value={l.item} disabled={locked}
                                onChange={(e) => updateLine(i, { item: e.target.value, ledger: l.ledger || ledgerFor(e.target.value, sel.vendor) })} />
                              {l.original && <span className="mt-0.5 block text-xs text-slate-500" lang="kn">On bill: {l.original}</span>}
                            </td>
                            <td className="min-w-[170px] pr-2">
                              <input list="bill-ledgers" aria-label="Ledger" className={inputCls + ' !py-1'} value={l.ledger ?? ''} disabled={locked}
                                placeholder={ledgerFor(l.item, sel.vendor)} onChange={(e) => updateLine(i, { ledger: e.target.value })} />
                            </td>
                            <td className="pr-2"><input type="number" aria-label="Quantity" className={inputCls + ' !w-20 !py-1'} value={l.qty} disabled={locked} onChange={(e) => updateLine(i, { qty: +e.target.value })} /></td>
                            <td className="pr-2"><input aria-label="Unit" className={inputCls + ' !w-16 !py-1'} value={l.unit} disabled={locked} onChange={(e) => updateLine(i, { unit: e.target.value })} /></td>
                            <td className="pr-2"><input type="number" aria-label="Rate" className={inputCls + ' !w-24 !py-1'} value={l.rate} disabled={locked} onChange={(e) => updateLine(i, { rate: +e.target.value })} /></td>
                            <td className="pr-2"><input type="number" aria-label="GST percent" className={inputCls + ' !w-16 !py-1'} value={l.gst} disabled={locked} onChange={(e) => updateLine(i, { gst: +e.target.value })} /></td>
                            <td className="whitespace-nowrap text-right tabular-nums">{inr(lineBase(l) + lineGst(l))}</td>
                            <td className="pl-2">{!locked && <button className="text-slate-400 hover:text-rose-600" aria-label="Remove line" onClick={() => update({ lines: sel.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}</td>
                          </tr>
                        ))}
                        {!sel.lines.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No items yet. Use <b>+ Add line</b>.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {!locked && (
                    <button className="mt-2 text-xs font-medium text-brand-600" onClick={() => update({ lines: [...sel.lines, { item: '', qty: 1, unit: 'kg', rate: 0, gst: 0, ledger: '' }] })}>+ Add line</button>
                  )}

                  <div className="mt-4 grid gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
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
