import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload, X } from 'lucide-react'
import { Button, Card, Field, inputCls } from './ui'
import { BRANCHES, branchName } from '../data/mock'

// Upload books (Cashbook, Imprest Book) with branch + month.
// No backend yet: we keep the file details in the browser so the list survives a refresh.

export type BookKind = 'cashbook' | 'imprest'
export type BookUploadRecord = {
  id: string; kind: BookKind; fileName: string; size: number; branch: string; month: string
  uploadedAt: string; status: 'processing' | 'received'; rows?: number
}

const BOOKS: Record<BookKind, { title: string; hint: string }> = {
  cashbook: { title: 'Cashbook', hint: 'Daily cash received and paid out' },
  imprest: { title: 'Imprest Book', hint: 'Petty cash given to the branch and how it was spent' },
}
const ACCEPT = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png'
const KEY = 'prisim.bookUploads'

// --- tiny shared store so the button and the list stay in sync ---
const listeners = new Set<() => void>()
function readAll(): BookUploadRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
function writeAll(list: BookUploadRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
  memory = list
  listeners.forEach((l) => l())
}
let memory: BookUploadRecord[] = readAll()

function useUploads(kind: BookKind) {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return memory.filter((u) => u.kind === kind)
}

const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const fmtMonth = (m: string) => new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/** Big upload button + the upload window. */
export function UploadBookButton({ kind, disabled }: { kind: BookKind; disabled?: boolean }) {
  const book = BOOKS[kind]
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [branch, setBranch] = useState(kind === 'cashbook' ? 'ALL' : 'B1')
  const [month, setMonth] = useState('2026-10')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const close = () => { setOpen(false); setFile(null) }

  const submit = async () => {
    if (!file) return
    // For CSV files, count the rows so the list can show "120 entries".
    let rows: number | undefined
    if (file.name.toLowerCase().endsWith('.csv')) {
      try { rows = Math.max(0, (await file.text()).trim().split(/\r?\n/).length - 1) } catch { /* ignore */ }
    }
    const rec: BookUploadRecord = {
      id: Date.now().toString(36), kind, fileName: file.name, size: file.size, branch, month,
      uploadedAt: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      status: 'processing', rows,
    }
    writeAll([rec, ...memory])
    // Stand-in for server processing.
    setTimeout(() => writeAll(memory.map((u) => (u.id === rec.id ? { ...u, status: 'received' } : u))), 1500)
    close()
  }

  return (
    <>
      <Button icon={Upload} disabled={disabled} onClick={() => setOpen(true)} className="!bg-[#7a2228] hover:!bg-[#5a1a1f]">
        Upload {book.title}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label={`Upload ${book.title}`} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Upload {book.title}</h2>
                <p className="text-sm text-slate-500">{book.hint}</p>
              </div>
              <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Branch">
                <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {kind === 'cashbook' && <option value="ALL">All branches (combined)</option>}
                  {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="For the month of">
                <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
              </Field>
            </div>

            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files?.[0] ?? null) }}
              className={`mt-4 flex w-full flex-col items-center rounded-xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-[#d9a441] bg-[#fdf8ee]' : 'border-slate-300 hover:border-slate-400'}`}
            >
              {file ? (
                <>
                  <FileSpreadsheet size={32} className="text-[#7a2228]" />
                  <span className="mt-2 text-sm font-medium text-slate-900">{file.name}</span>
                  <span className="text-xs text-slate-500">{fmtSize(file.size)} · click to choose a different file</span>
                </>
              ) : (
                <>
                  <Upload size={32} className="text-slate-400" />
                  <span className="mt-2 text-sm font-medium text-slate-800">Drag the file here, or click to choose</span>
                  <span className="text-xs text-slate-500">Excel, CSV, PDF or a photo of the book</span>
                </>
              )}
            </button>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button icon={Upload} disabled={!file} onClick={submit}>Upload</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** List of what has been uploaded for this book. */
export function UploadedBooks({ kind, canDelete }: { kind: BookKind; canDelete?: boolean }) {
  const list = useUploads(kind)
  const book = BOOKS[kind]
  return (
    <Card title={`Uploaded ${book.title.toLowerCase()}s`} pad={false}>
      {list.length ? (
        <ul className="divide-y divide-slate-100">
          {list.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileSpreadsheet size={20} className="shrink-0 text-[#7a2228]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.fileName}</span>
                <span className="block text-xs text-slate-500">
                  {u.branch === 'ALL' ? 'All branches' : branchName(u.branch)} · {fmtMonth(u.month)} · {fmtSize(u.size)}
                  {u.rows !== undefined && ` · ${u.rows} entries`} · uploaded {u.uploadedAt}
                </span>
              </span>
              {u.status === 'processing'
                ? <span className="flex items-center gap-1 text-xs text-sky-600"><Loader2 size={14} className="animate-spin" />Processing</span>
                : <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={14} />Received</span>}
              {canDelete && (
                <button aria-label={`Remove ${u.fileName}`} className="text-slate-400 hover:text-rose-600" onClick={() => writeAll(memory.filter((x) => x.id !== u.id))}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-slate-500">No {book.title.toLowerCase()} uploaded yet. Use the “Upload {book.title}” button.</p>
      )}
    </Card>
  )
}
