import { useRef, useState } from 'react'
import { CheckCircle2, FileImage, PenLine, Printer, Upload, X, type LucideIcon } from 'lucide-react'
import { Button, Field, inputCls } from './ui'
import { BILL_SCRIPTS, BRANCHES, type BillScript } from '../data/mock'

// Upload window for the OCR Bill Inbox: first pick what kind of bill it is, then the file.

const OPTIONS: { id: BillScript; icon: LucideIcon | null; sample: string }[] = [
  { id: 'en-hand', icon: PenLine, sample: 'Tomato 10 kg – ₹320' },
  { id: 'kn-hand', icon: null, sample: 'ಟೊಮೆಟೊ 10 ಕೆಜಿ – ₹320' },
  { id: 'en-typed', icon: Printer, sample: 'TOMATO   10.00 KG   320.00' },
]

const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

export default function UploadBillDialog({ onClose, onUpload }: {
  onClose: () => void
  onUpload: (u: { file: File; script: BillScript; branch: string }) => void
}) {
  const [script, setScript] = useState<BillScript | null>(null)
  const [branch, setBranch] = useState('CK')
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const ready = script && file

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="upload-bill-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-bill-title" className="text-lg font-semibold text-slate-900">Upload bill</h2>
            <p className="text-sm text-slate-500">Tell us how the bill is written so OCR reads it correctly.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        {/* Step 1: bill type */}
        <p className="mb-2 text-sm font-semibold text-slate-800">1. What kind of bill is this?</p>
        <div role="radiogroup" aria-label="Bill type" className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const meta = BILL_SCRIPTS[o.id]
            const on = script === o.id
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setScript(o.id)}
                className={`relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition ${on ? 'border-[#7a2228] bg-[#fdf8ee]' : 'border-slate-200 hover:border-slate-300'}`}>
                {on && <CheckCircle2 size={18} className="absolute right-3 top-3 text-[#7a2228]" />}
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${on ? 'bg-[#7a2228] text-[#f6e3b8]' : 'bg-slate-100 text-slate-600'}`}>
                  {o.icon ? <o.icon size={20} /> : <span className="text-lg font-semibold leading-none">ಕ</span>}
                </span>
                <span className="mt-3 text-sm font-semibold text-slate-900">{meta.label}</span>
                <span className={`mt-2 w-full truncate rounded-md bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200 ${o.id === 'en-typed' ? 'font-mono' : 'italic'}`}>
                  {o.sample}
                </span>
              </button>
            )
          })}
        </div>
        {script && <p className="mt-2 text-xs text-slate-500">{BILL_SCRIPTS[script].hint}</p>}

        {/* Step 2: branch + file */}
        <p className="mb-2 mt-5 text-sm font-semibold text-slate-800">2. Choose the bill</p>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <Field label="Bill from">
            <select id="upload-bill-branch" className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Photo or PDF</span>
            <input ref={input} id="upload-bill-file" type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files?.[0] ?? null) }}
              className={`flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition ${drag ? 'border-[#d9a441] bg-[#fdf8ee]' : 'border-slate-300 hover:border-slate-400'}`}>
              {file ? <FileImage size={26} className="shrink-0 text-[#7a2228]" /> : <Upload size={26} className="shrink-0 text-slate-400" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{file ? file.name : 'Drag the bill here, or click to choose'}</span>
                <span className="block text-xs text-slate-500">{file ? `${fmtSize(file.size)} · click to change` : 'A clear photo or a PDF works best'}</span>
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {!ready && <span className="mr-auto text-xs text-slate-500">{!script ? 'Pick the bill type first.' : 'Now choose the bill file.'}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={Upload} disabled={!ready} onClick={() => ready && onUpload({ file, script, branch })}>Upload &amp; read bill</Button>
        </div>
      </div>
    </div>
  )
}
