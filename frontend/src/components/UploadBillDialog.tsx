import { useRef, useState } from 'react'
import { CheckCircle2, FileImage, FileText, Upload, X } from 'lucide-react'
import { Button, Field, inputCls } from './ui'
import { BRANCHES, type BillScript } from '../data/mock'

// Upload window for the OCR Bill Inbox. Two kinds:
//  - handwritten: a photo or scan of a handwritten bill, English or Kannada (read by Tesseract OCR)
//  - pdf: a printed/typed PDF from billing software (read from the text inside the PDF)

export type UploadKind = 'handwritten' | 'pdf'

const LANGS: { id: BillScript; label: string; sample: string; lang?: string }[] = [
  { id: 'en-hand', label: 'English', sample: 'Tomato 10 kg – ₹320' },
  { id: 'kn-hand', label: 'Kannada', sample: 'ಟೊಮೆಟೊ 10 ಕೆಜಿ – ₹320', lang: 'kn' },
]

const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

export default function UploadBillDialog({ kind, onClose, onUpload }: {
  kind: UploadKind
  onClose: () => void
  onUpload: (u: { file: File; script: BillScript; branch: string; split: boolean }) => void
}) {
  const handwritten = kind === 'handwritten'
  const [script, setScript] = useState<BillScript | null>(handwritten ? null : 'en-typed')
  const [branch, setBranch] = useState('CK')
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [wrongType, setWrongType] = useState(false)
  const [split, setSplit] = useState(true) // a PDF of scanned bills: one bill per page
  const input = useRef<HTMLInputElement>(null)

  const pick = (f: File | null | undefined) => {
    if (!f) return
    const ok = handwritten ? f.type.startsWith('image/') || f.type === 'application/pdf' : f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    setWrongType(!ok)
    setFile(ok ? f : null)
  }
  const ready = script && file

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="upload-bill-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-bill-title" className="text-lg font-semibold text-slate-900">{handwritten ? 'Upload handwritten / scanned bill' : 'Upload PDF bill'}</h2>
            <p className="text-sm text-slate-500">
              {handwritten
                ? 'A photo, or a scanned PDF of one or many bills (handwritten or printed). Tesseract OCR reads it; check each line after.'
                : 'A printed or typed PDF from the vendor’s billing software. Items and totals are read exactly from the PDF.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        {handwritten && (
          <>
            <p className="mb-2 text-sm font-semibold text-slate-800">1. Language on the bill</p>
            <div role="radiogroup" aria-label="Bill language" className="mb-5 grid grid-cols-2 gap-3">
              {LANGS.map((o) => {
                const on = script === o.id
                return (
                  <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setScript(o.id)}
                    className={`relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition ${on ? 'border-[#7a2228] bg-[#fdf8ee]' : 'border-slate-200 hover:border-slate-300'}`}>
                    {on && <CheckCircle2 size={18} className="absolute right-3 top-3 text-[#7a2228]" />}
                    <span className="text-sm font-semibold text-slate-900">{o.label}</span>
                    <span lang={o.lang} className="mt-2 w-full truncate rounded-md bg-white px-2 py-1 text-xs italic text-slate-600 ring-1 ring-slate-200">{o.sample}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <p className="mb-2 text-sm font-semibold text-slate-800">{handwritten ? '2. Choose the bill' : 'Choose the bill'}</p>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Bill from">
            <select id="upload-bill-branch" className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
              {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">{handwritten ? 'Photo or scanned PDF' : 'PDF file'}</span>
            <input ref={input} id="upload-bill-file" type="file" hidden
              accept={handwritten ? 'image/*,application/pdf' : 'application/pdf,.pdf'}
              capture={handwritten ? 'environment' : undefined}
              onChange={(e) => pick(e.target.files?.[0])} />
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
              className={`flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition ${drag ? 'border-[#d9a441] bg-[#fdf8ee]' : 'border-slate-300 hover:border-slate-400'}`}>
              {file ? (handwritten ? <FileImage size={26} className="shrink-0 text-[#7a2228]" /> : <FileText size={26} className="shrink-0 text-[#7a2228]" />) : <Upload size={26} className="shrink-0 text-slate-400" />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{file ? file.name : 'Drag the bill here, or click to choose'}</span>
                <span className="block text-xs text-slate-500">
                  {file ? `${fmtSize(file.size)} · click to change` : handwritten ? 'Flat, well-lit photo, whole bill in frame' : 'PDF only'}
                </span>
              </span>
            </button>
            {file && /pdf/i.test(file.type || file.name) && (
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                <span><b>One bill per page.</b> Tick this when the PDF is a stack of different bills (each page becomes its own bill).</span>
              </label>
            )}
            {wrongType && (
              <p className="mt-1 text-xs text-rose-600">
                {handwritten ? 'Choose a photo or a PDF.' : 'Only PDF files here. For a photo of a bill, use “Upload handwritten / scanned bill”.'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {!ready && <span className="mr-auto text-xs text-slate-500">{!script ? 'Pick the language first.' : 'Now choose the bill file.'}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={Upload} disabled={!ready} onClick={() => ready && onUpload({ file, script, branch, split })}>Upload &amp; read bill</Button>
        </div>
      </div>
    </div>
  )
}
