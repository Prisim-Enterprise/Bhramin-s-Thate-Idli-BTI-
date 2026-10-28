import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileUp, Loader2, X } from 'lucide-react'
import { Button, Field, inputCls } from './ui'
import { BRANCHES, inr } from '../data/mock'
import { BANK_LEDGER, GROUPS, imprestLedger, type GroupId } from '../data/books'
import { addLedger, addManualVoucher, groupOf, useCustomLedgers, type ManualType, type ReceiptFile } from '../data/ledgerStore'
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

/** Default Dr/Cr for a new voucher, based on the ledger you opened and the voucher type (like Tally). */
function defaultsFor(type: ManualType, ledger: string, group: GroupId, bank: string, imprest: string): { dr: string; cr: string } {
  const isMoney = group === 'cash' || group === 'bank'
  if (type === 'Contra') return isMoney ? { dr: ledger, cr: ledger === bank ? imprest : bank } : { dr: imprest, cr: bank }
  if (type === 'Receipt') return isMoney ? { dr: ledger, cr: '' } : { dr: bank, cr: ledger }
  if (type === 'Payment') {
    if (isMoney) return { dr: '', cr: ledger }
    return { dr: ledger, cr: group === 'creditors' ? bank : imprest }
  }
  // Journal: a vendor's bill is "Dr Groceries Purchased, Cr vendor"; anything else is debited.
  if (group === 'creditors') return { dr: 'Groceries Purchased', cr: ledger }
  return { dr: ledger, cr: imprest }
}

/** Add a voucher (with an optional receipt) to a ledger: Payment, Receipt, Journal or Contra. */
export function VoucherDialog({ ledger, names, branch: startBranch, by, pickFile, onClose, onSaved }: {
  ledger: string; names: string[]; branch: string; by: string; pickFile?: boolean; onClose: () => void; onSaved: (msg: string) => void
}) {
  const custom = useCustomLedgers()
  const input = useRef<HTMLInputElement>(null)
  const [branch, setBranch] = useState(startBranch === 'ALL' ? 'CK' : startBranch)
  const bank = custom.find((l) => l.group === 'bank')?.name ?? BANK_LEDGER
  const group = groupOf(ledger, custom)
  const startType: ManualType = group === 'creditors' || group === 'indirectExp' || group === 'directExp' ? 'Payment' : 'Journal'
  const [type, setType] = useState<ManualType>(startType)
  const [drL, setDr] = useState(() => defaultsFor(startType, ledger, group, bank, imprestLedger(branch)).dr)
  const [crL, setCr] = useState(() => defaultsFor(startType, ledger, group, bank, imprestLedger(branch)).cr)
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState(0)
  const [narration, setNarration] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Open the file picker straight away when the dialog came from "Upload receipt".
  useEffect(() => { if (pickFile) input.current?.click() }, [pickFile])

  const changeType = (t: ManualType) => {
    setType(t)
    const d = defaultsFor(t, ledger, group, bank, imprestLedger(branch))
    setDr(d.dr)
    setCr(d.cr)
  }

  const pick = async (f?: File) => {
    if (!f) return
    setFile(f)
    setReading(true)
    const found = await readAmount(f)
    setReading(false)
    if (found) { setAmount(found); setReadNote(`Read ${inr(found)} from the receipt. Check it before saving.`) }
    else setReadNote('Could not read the amount from this file. Please type it in.')
  }

  const dr = drL.trim()
  const cr = crL.trim()
  const known = (n: string) => !n || names.some((x) => x.toLowerCase() === n.toLowerCase())
  const valid = dr && cr && dr.toLowerCase() !== cr.toLowerCase() && amount > 0 && !reading

  const save = async () => {
    let receipt: ReceiptFile | undefined
    if (file) {
      receipt = { name: file.name, type: file.type, size: file.size }
      if (file.size <= MAX_SAVED_FILE) receipt.dataUrl = await toDataUrl(file)
    }
    const ok = addManualVoucher({
      id: crypto.randomUUID(), type, date, branch, drLedger: dr, crLedger: cr, amount, narration: narration.trim(), receipt,
      addedBy: by, addedAt: new Date().toISOString(),
    })
    if (!ok) return setError('The browser has no room left to save this receipt. Try a smaller file.')
    onSaved(`${type} voucher of ${inr(amount)} saved: Dr ${dr}, Cr ${cr}.`)
  }

  return (
    <Modal title={`New voucher · ${ledger}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={save}>Save {type.toLowerCase()}</Button></>}>
      <datalist id="voucher-ledgers">{names.map((n) => <option key={n} value={n} />)}</datalist>

      <div role="radiogroup" aria-label="Voucher type" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
        {(['Payment', 'Receipt', 'Journal', 'Contra'] as ManualType[]).map((t) => (
          <button key={t} role="radio" aria-checked={type === t} onClick={() => changeType(t)}
            className={`rounded-lg py-1.5 text-sm font-medium ${type === t ? 'bg-white text-[#7a2228] shadow' : 'text-slate-600 hover:text-slate-900'}`}>{t}</button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Branch">
          <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Debit (Dr)">
          <input list="voucher-ledgers" className={inputCls} value={drL} placeholder="Pick a ledger" onChange={(e) => setDr(e.target.value)} />
          {!known(dr) && <span className="mt-1 block text-xs text-amber-700">New ledger: it will be created as {GROUPS[groupOf(dr, custom)]}.</span>}
        </Field>
        <Field label="Credit (Cr)">
          <input list="voucher-ledgers" className={inputCls} value={crL} placeholder="Pick a ledger" onChange={(e) => setCr(e.target.value)} />
          {!known(cr) && <span className="mt-1 block text-xs text-amber-700">New ledger: it will be created as {GROUPS[groupOf(cr, custom)]}.</span>}
        </Field>
        <Field label="Amount (₹)">
          <input type="number" step="0.01" className={inputCls + ' text-right tabular-nums'} value={amount || ''} placeholder="0" onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Narration (optional)">
          <input className={inputCls} value={narration} placeholder="e.g. Bill no. 2231" onChange={(e) => setNarration(e.target.value)} />
        </Field>
      </div>

      <button type="button" onClick={() => input.current?.click()}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-left hover:border-[#7a2228] hover:bg-[#fbf3e4]">
        {reading ? <Loader2 className="shrink-0 animate-spin text-[#7a2228]" size={20} /> : <FileUp className="shrink-0 text-[#7a2228]" size={20} />}
        <span>
          <span className="block text-sm font-medium text-slate-800">{file ? file.name : 'Attach receipt (optional)'}</span>
          <span className="block text-xs text-slate-500">{reading ? 'Reading…' : 'PDF or photo. The amount is read automatically from PDFs.'}</span>
        </span>
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {readNote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{readNote}</p>}
      {file && file.size > MAX_SAVED_FILE && <p className="text-xs text-amber-700">This file is over 1 MB, so only its name is kept for now.</p>}

      {dr && cr && dr.toLowerCase() === cr.toLowerCase() && <p className="text-xs text-rose-600">Debit and credit must be different ledgers.</p>}
      <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
        Dr {dr || '…'} {inr(amount)}<br />&nbsp;&nbsp;&nbsp;Cr {cr || '…'} {inr(amount)}
      </p>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  )
}
