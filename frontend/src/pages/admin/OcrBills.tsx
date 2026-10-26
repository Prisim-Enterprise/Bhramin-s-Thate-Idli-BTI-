import { useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, FileImage, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Tabs, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BILLS, branchName, inr, type Bill, type BillLine } from '../../data/mock'

const STEPS = ['Bill from Kitchen', 'OCR extract', 'Review', 'Bill created']
const stepOf = (s: Bill['status']) => ({ queued: 1, processing: 1, failed: 1, extracted: 2, verified: 3 })[s]

const lineTotal = (l: BillLine) => l.qty * l.rate * (1 + l.gst / 100)

export default function OcrBills() {
  const { can, ocrEnabled } = useApp()
  const [bills, setBills] = useState<Bill[]>(BILLS)
  const [selId, setSelId] = useState(BILLS[0].id)
  const [tab, setTab] = useState<'all' | 'review' | 'credit' | 'other'>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const sel = bills.find((b) => b.id === selId)!
  const canEdit = can('ocr', 'edit')

  const filtered = bills.filter((b) =>
    tab === 'all' ? true : tab === 'review' ? b.status !== 'verified' : b.status === 'verified' && b.type === tab,
  )

  const update = (patch: Partial<Bill>) => setBills((bs) => bs.map((b) => (b.id === selId ? { ...b, ...patch } : b)))
  const updateLine = (i: number, patch: Partial<BillLine>) =>
    update({ lines: sel.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const onUpload = (files: FileList | null) => {
    if (!files?.length) return
    const id = 'BL-' + (1043 + bills.length - BILLS.length)
    const nb: Bill = { id, vendor: files[0].name.replace(/\.[^.]+$/, ''), branch: 'CK', uploadedBy: 'You', date: '2026-10-26', status: 'processing', confidence: 0, type: 'credit', lines: [] }
    setBills((bs) => [nb, ...bs])
    setSelId(id)
    // Simulated OCR result – the backend will replace this.
    setTimeout(() => {
      setBills((bs) => bs.map((b) => b.id === id ? { ...b, status: 'extracted', confidence: 89, lines: [{ item: 'Item 1', qty: 1, unit: 'nos', rate: 100, gst: 5 }] } : b))
    }, 1800)
  }

  const subtotal = sel.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const gst = sel.lines.reduce((s, l) => s + l.qty * l.rate * (l.gst / 100), 0)
  const step = stepOf(sel.status)

  return (
    <>
      <PageHeader
        title="OCR Bill Inbox"
        subtitle="Bills uploaded by kitchen managers are read by OCR, reviewed here, then posted as bills"
        actions={
          <>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => onUpload(e.target.files)} />
            <Button icon={Upload} disabled={!can('ocr', 'create')} onClick={() => fileRef.current?.click()}>Upload bill</Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All', count: bills.length },
          { id: 'review', label: 'Needs review', count: bills.filter((b) => b.status !== 'verified').length },
          { id: 'credit', label: 'Credited bills', count: bills.filter((b) => b.status === 'verified' && b.type === 'credit').length },
          { id: 'other', label: 'Other purchase exp.', count: bills.filter((b) => b.status === 'verified' && b.type === 'other').length },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card pad={false}>
          <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
            {filtered.map((b) => (
              <li key={b.id}>
                <button onClick={() => setSelId(b.id)} className={`w-full px-4 py-3 text-left ${b.id === selId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{b.id}</span>
                    <Badge>{b.status}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-600">{b.vendor}</p>
                  <p className="text-xs text-slate-400">{branchName(b.branch)} · {b.uploadedBy} · {b.date}</p>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="p-4 text-sm text-slate-500">Nothing here.</li>}
          </ul>
        </Card>

        <div className="space-y-4">
          {/* Flow stepper */}
          <Card>
            <ol className="flex flex-wrap items-center gap-2 text-xs">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${i <= step ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'} ${sel.status === 'failed' && i === 1 ? '!bg-rose-600' : ''}`}>
                    {i < step && <CheckCircle2 size={12} />} {s}
                  </span>
                  {i < STEPS.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
                </li>
              ))}
            </ol>
            {!ocrEnabled[sel.branch] && <p className="mt-3 text-xs text-amber-600">OCR is switched off for {branchName(sel.branch)} — enter lines manually or enable it in Control Panel → OCR Status.</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <Card title="Scanned copy">
              <div className="grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                <div className="text-center">
                  <FileImage className="mx-auto" size={32} />
                  <p className="mt-2 text-xs">{sel.id}.jpg</p>
                  {sel.confidence > 0 && <p className="mt-1 text-xs">OCR confidence <b className={sel.confidence > 85 ? 'text-emerald-600' : 'text-rose-600'}>{sel.confidence}%</b></p>}
                </div>
              </div>
            </Card>

            <Card
              title={`Bill details · ${sel.id}`}
              actions={sel.status === 'failed' && <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => update({ status: 'processing' })}>Re-run OCR</Button>}
            >
              {sel.status === 'processing' || sel.status === 'queued' ? (
                <p className="py-10 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-2 animate-spin" size={20} />OCR is reading this bill…</p>
              ) : (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <label className="text-xs text-slate-500">Vendor<input className={inputCls + ' mt-1'} value={sel.vendor} disabled={!canEdit} onChange={(e) => update({ vendor: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">Bill date<input type="date" className={inputCls + ' mt-1'} value={sel.date} disabled={!canEdit} onChange={(e) => update({ date: e.target.value })} /></label>
                    <label className="text-xs text-slate-500">Post as
                      <select className={inputCls + ' mt-1'} value={sel.type} disabled={!canEdit} onChange={(e) => update({ type: e.target.value as Bill['type'] })}>
                        <option value="credit">Credited bill (vendor credit)</option>
                        <option value="other">Other purchase expense</option>
                      </select>
                    </label>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-slate-500">
                        <tr><th className="py-2">Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST %</th><th className="text-right">Amount</th><th /></tr>
                      </thead>
                      <tbody>
                        {sel.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="py-1.5 pr-2"><input className={inputCls + ' !py-1'} value={l.item} disabled={!canEdit} onChange={(e) => updateLine(i, { item: e.target.value })} /></td>
                            <td className="pr-2"><input type="number" className={inputCls + ' !w-20 !py-1'} value={l.qty} disabled={!canEdit} onChange={(e) => updateLine(i, { qty: +e.target.value })} /></td>
                            <td className="pr-2 text-slate-500">{l.unit}</td>
                            <td className="pr-2"><input type="number" className={inputCls + ' !w-24 !py-1'} value={l.rate} disabled={!canEdit} onChange={(e) => updateLine(i, { rate: +e.target.value })} /></td>
                            <td className="pr-2"><input type="number" className={inputCls + ' !w-16 !py-1'} value={l.gst} disabled={!canEdit} onChange={(e) => updateLine(i, { gst: +e.target.value })} /></td>
                            <td className="text-right tabular-nums">{inr(lineTotal(l))}</td>
                            <td className="pl-2">{canEdit && <button className="text-slate-400 hover:text-rose-600" aria-label="Remove line" onClick={() => update({ lines: sel.lines.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {canEdit && (
                    <button className="mt-2 text-xs font-medium text-brand-600" onClick={() => update({ lines: [...sel.lines, { item: '', qty: 1, unit: 'kg', rate: 0, gst: 0 }] })}>+ Add line</button>
                  )}

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <dt className="text-slate-500">Subtotal</dt><dd className="text-right tabular-nums">{inr(subtotal)}</dd>
                      <dt className="text-slate-500">GST</dt><dd className="text-right tabular-nums">{inr(gst)}</dd>
                      <dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums">{inr(subtotal + gst)}</dd>
                    </dl>
                    {sel.status === 'verified' ? (
                      <Badge tone="green">Posted to ledger as {sel.type === 'credit' ? 'credited bill' : 'other purchase expense'}</Badge>
                    ) : (
                      <Button icon={CheckCircle2} disabled={!can('ocr', 'approve') || !sel.lines.length} onClick={() => update({ status: 'verified' })}>
                        Verify &amp; create bill
                      </Button>
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
