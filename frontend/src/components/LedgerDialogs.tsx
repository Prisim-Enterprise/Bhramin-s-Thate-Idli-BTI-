import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileUp, Loader2, X } from 'lucide-react'
import { Button, Field, inputCls } from './ui'
import { BRANCHES, inr } from '../data/mock'
import { GROUPS, type GroupId } from '../data/books'
import { addLedger, addManualVoucher, groupOf, useCustomLedgers, type ReceiptFile } from '../data/ledgerStore'
import { pdfLines } from '../lib/readImprestPdf'

const today = () => new Date().toISOString().slice(0, 10)
const MAX_SAVED_FILE = 1_000_000 // bigger receipts keep only their name until the backend stores files

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}

/** Create a new ledger under a group, like Tally's Ledger Creation. */
export function AddLedgerDialog({ existing, by, onClose, onAdded }: {
  existing: string[]; by: string; onClose: () => void; onAdded: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState<GroupId>('indirectExp')
  const [opening, setOpening] = useState(0)
  const [side, setSide] = useState<'Dr' | 'Cr'>('Dr')
  const clean = name.trim().replace(/\s+/g, ' ')
  const taken = existing.some((n) => n.toLowerCase() === clean.toLowerCase())

  const save = () => {
    addLedger({ name: clean, group, opening: side === 'Dr' ? opening : -opening, addedBy: by, addedAt: new Date().toISOString() })
    onAdded(clean)
  }

  return (
    <Modal title="Add ledger" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!clean || taken} onClick={save}>Create ledger</Button></>}>
      <Field label="Ledger name">
        <input autoFocus className={inputCls} value={name} placeholder="e.g. Gas Cylinder" onChange={(e) => setName(e.target.value)} />
        {taken && <span className="mt-1 block text-xs text-rose-600">A ledger with this name already exists.</span>}
      </Field>
      <Field label="Under (group)">
        <select className={inputCls} value={group} onChange={(e) => setGroup(e.target.value as GroupId)}>
          {(Object.keys(GROUPS) as GroupId[]).map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Opening balance (optional)">
          <input type="number" step="0.01" className={inputCls + ' text-right'} value={opening || ''} placeholder="0" onChange={(e) => setOpening(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Dr / Cr">
          <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value as 'Dr' | 'Cr')}><option>Dr</option><option>Cr</option></select>
        </Field>
      </div>
    </Modal>
  )
}

/** Find the bill total in a receipt PDF's text. Images need OCR, so their amount is typed in. */
async function readAmount(file: File): Promise<number | null> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return null
  try {
    const lines = await pdfLines(file)
    const nums = (l: string) => (l.match(/\d[\d,]*\.\d{2}|\d[\d,]{2,}/g) ?? []).map((x) => Number(x.replace(/,/g, ''))).filter((n) => n > 0)
    const pick = (re: RegExp) => lines.filter((l) => re.test(l)).flatMap(nums).pop()
    return pick(/grand\s*total|net\s*(amount|payable)|amount\s*payable/i) ?? pick(/total/i) ?? Math.max(0, ...lines.flatMap(nums)) ?? null
  } catch {
    return null
  }
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

/** Upload a receipt for a ledger: posts today's payment (or journal) to that ledger. */
export function UploadReceiptDialog({ ledger, branch: startBranch, by, onClose, onSaved }: {
  ledger: string; branch: string; by: string; onClose: () => void; onSaved: (msg: string) => void
}) {
  const custom = useCustomLedgers()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [branch, setBranch] = useState(startBranch === 'ALL' ? 'B1' : startBranch)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState(0)
  const [type, setType] = useState<'Payment' | 'Journal'>('Payment')
  const [paidFrom, setPaidFrom] = useState<'imprest' | 'bank'>('imprest')
  const [narration, setNarration] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pick = async (f?: File) => {
    if (!f) return
    setFile(f)
    setReading(true)
    const found = await readAmount(f)
    setReading(false)
    if (found) { setAmount(found); setReadNote(`Read ${inr(found)} from the receipt. Check it before saving.`) }
    else setReadNote('Could not read the amount from this file. Please type it in.')
  }

  const save = async () => {
    let receipt: ReceiptFile | undefined
    if (file) {
      receipt = { name: file.name, type: file.type, size: file.size }
      if (file.size <= MAX_SAVED_FILE) receipt.dataUrl = await toDataUrl(file)
    }
    const ok = addManualVoucher({
      id: crypto.randomUUID(), type, date, branch, ledger, paidFrom, amount, narration: narration.trim(), receipt,
      addedBy: by, addedAt: new Date().toISOString(),
    })
    if (!ok) return setError('The browser has no room left to save this receipt. Try a smaller file.')
    onSaved(`${type} of ${inr(amount)} posted to ${ledger}.`)
  }

  return (
    <Modal title={`Upload receipt · ${ledger}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!amount || amount < 0 || reading} onClick={save}>Save {type.toLowerCase()}</Button></>}>
      <button type="button" onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-[#7a2228] hover:bg-[#fbf3e4]">
        {reading ? <Loader2 className="animate-spin text-[#7a2228]" size={24} /> : <FileUp className="text-[#7a2228]" size={24} />}
        <span className="mt-2 text-sm font-medium text-slate-800">{file ? file.name : 'Choose the receipt (PDF or photo)'}</span>
        <span className="text-xs text-slate-500">{reading ? 'Reading…' : 'The amount is read automatically from PDFs'}</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {readNote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{readNote}</p>}
      {file && file.size > MAX_SAVED_FILE && <p className="text-xs text-amber-700">This file is over 1 MB, so only its name is kept for now.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Branch">
          <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Amount (₹)">
          <input type="number" step="0.01" className={inputCls + ' text-right tabular-nums'} value={amount || ''} placeholder="0" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Post as">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as 'Payment' | 'Journal')}>
            <option value="Payment">Payment voucher</option><option value="Journal">Journal voucher</option>
          </select>
        </Field>
        <Field label="Paid from">
          <select className={inputCls} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as 'imprest' | 'bank')}>
            <option value="imprest">Branch imprest (cash)</option><option value="bank">Bank</option>
          </select>
        </Field>
        <Field label="Group"><input className={inputCls + ' bg-slate-50'} readOnly value={GROUPS[groupOf(ledger, custom)]} /></Field>
      </div>
      <Field label="Narration (optional)">
        <input className={inputCls} value={narration} placeholder="e.g. Water tanker for 2 days" onChange={(e) => setNarration(e.target.value)} />
      </Field>
      <p className="text-xs text-slate-500">Dr <b>{ledger}</b> · Cr <b>{paidFrom === 'bank' ? 'Bank Account' : `${BRANCHES.find((b) => b.id === branch)?.name} - Imprest`}</b> · {inr(amount)}</p>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  )
}
