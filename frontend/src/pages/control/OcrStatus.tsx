import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Keyboard, PenLine, ScanLine } from 'lucide-react'
import { Card, PageHeader, Stat, Table } from '../../components/ui'
import { BRANCHES } from '../../data/mock'
import { useBills } from '../../data/billStore'
import { useManualVouchers } from '../../data/ledgerStore'
import { API_ON, readUsage, type Usage } from '../../lib/api'

// Bill reading: how bills come in and today's use of the handwritten reader (Sarvam).
export default function OcrStatus() {
  const bills = useBills()
  const manual = useManualVouchers()
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => { if (API_ON) readUsage().then(setUsage).catch(() => {}) }, [])

  const month = new Date().toISOString().slice(0, 7)
  const inMonth = bills.filter((b) => (b.uploadedAt ?? b.date).startsWith(month))
  const posted = (id?: string) => !!id && manual.some((m) => m.id === id)
  const kind = (s: string) => (s === 'manual' ? 'manual' : s === 'en-typed' ? 'pdf' : 'handwritten')
  const count = (list: typeof bills, k: string) => list.filter((b) => kind(b.script) === k).length
  const toCheck = bills.filter((b) => !posted(b.voucherId)).length

  return (
    <>
      <PageHeader title="Bill Reading" subtitle="How bills are read, and today's use of the handwritten reader" />

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Handwritten today (Sarvam)" value={usage ? `${usage.used} / ${usage.limit}` : '—'} hint={usage ? `${Math.max(0, usage.limit - usage.used)} left today` : 'sign in to see'} icon={PenLine}
          tone={usage && usage.used >= usage.limit ? 'amber' : 'green'} />
        <Stat label="Bills this month" value={String(inMonth.length)} hint={`${count(inMonth, 'handwritten')} handwritten · ${count(inMonth, 'pdf')} PDF · ${count(inMonth, 'manual')} manual`} icon={ScanLine} />
        <Stat label="Waiting to be checked" value={String(toCheck)} hint="not yet posted to Account Books" icon={CheckCircle2} tone={toCheck ? 'amber' : 'green'} />
        <Stat label="Posted this month" value={String(inMonth.filter((b) => posted(b.voucherId)).length)} icon={CheckCircle2} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Bills by branch · this month" pad={false} className="xl:col-span-2">
          <Table head={['Branch', 'Handwritten', 'PDF', 'Manual', 'Posted', 'To check']}>
            {BRANCHES.map((br) => {
              const list = inMonth.filter((b) => b.branch === br.id)
              return (
                <tr key={br.id}>
                  <td className="font-medium">{br.name}</td>
                  <td>{count(list, 'handwritten')}</td>
                  <td>{count(list, 'pdf')}</td>
                  <td>{count(list, 'manual')}</td>
                  <td>{list.filter((b) => posted(b.voucherId)).length}</td>
                  <td className={list.some((b) => !posted(b.voucherId)) ? 'font-medium text-amber-700' : ''}>{list.filter((b) => !posted(b.voucherId)).length}</td>
                </tr>
              )
            })}
          </Table>
        </Card>

        <Card title="How bills are read">
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2"><PenLine size={16} className="mt-0.5 shrink-0 text-[#7a2228]" />
              <span><b>Handwritten / scanned</b> (English, Kannada): read by <b>Sarvam</b>. Limit <b>{usage?.limit ?? 10} a day</b> for the whole company, checked by the server. Each PDF page counts as one.</span></li>
            <li className="flex gap-2"><FileText size={16} className="mt-0.5 shrink-0 text-[#7a2228]" />
              <span><b>Printed PDF</b>: read from the text inside the PDF. Free and exact, no limit.</span></li>
            <li className="flex gap-2"><Keyboard size={16} className="mt-0.5 shrink-0 text-[#7a2228]" />
              <span><b>Manual entry</b>: for anything else, or after the daily limit. The vendor's usual items and rates fill in.</span></li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">The Sarvam key is kept as a hidden secret on the server. Check credits in your Sarvam dashboard.</p>
          <Link to="/admin/accounting/bills" className="mt-3 inline-block text-sm font-medium text-[#7a2228] hover:underline">Open the OCR Bill Inbox →</Link>
        </Card>
      </div>
    </>
  )
}
