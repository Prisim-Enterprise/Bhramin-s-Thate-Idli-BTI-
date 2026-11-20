import { useState } from 'react'
import { companyDefaults, fyEndOf, fyStartOf, gstinOk, panOk, saveCompany, type Company } from '../../../data/company'
import { Row, Section, T, tDate, useScreenKeys } from './ui'

/** Tally's Company Creation / Alteration. */
export function CompanyForm({ company, today, by, onDone, onCancel }: {
  company: Company | null; today: string; by: string; onDone: (note: string) => void; onCancel: () => void
}) {
  const [c, setC] = useState(() => company ?? { ...companyDefaults(today), updatedBy: by, updatedAt: '' })
  const [err, setErr] = useState<string | null>(null)
  const set = (p: Partial<Company>) => setC((x) => ({ ...x, ...p }))

  const save = () => {
    if (!c.name.trim()) return setErr('Enter the company name.')
    if (!gstinOk(c.gstin)) return setErr('GSTIN does not look right (15 characters, e.g. 29AAQFP6766L1Z5).')
    if (!panOk(c.pan)) return setErr('PAN does not look right (10 characters, e.g. AAQFP6766L).')
    if (!/^\d{4}-04-01$/.test(c.fyFrom)) return setErr('The financial year begins on 1 April.')
    if (c.booksFrom < c.fyFrom) return setErr('Books cannot begin before the financial year.')
    saveCompany({ ...c, name: c.name.trim(), gstin: c.gstin.trim().toUpperCase(), pan: c.pan.trim().toUpperCase(), updatedBy: by, updatedAt: new Date().toISOString() })
    onDone(company ? 'Company altered.' : `Company “${c.name.trim()}” created.`)
  }
  useScreenKeys({ 'ctrl+a': save, 'escape': onCancel })

  return (
    <div className="p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Section title={company ? 'Company Alteration' : 'Company Creation'}>
            <Row label="Company name"><input autoFocus aria-label="Company name" className={T.input} value={c.name} onChange={(e) => set({ name: e.target.value })} /></Row>
            <Row label="Mailing name"><input aria-label="Mailing name" className={T.input} value={c.mailingName} onChange={(e) => set({ mailingName: e.target.value })} /></Row>
            <Row label="Address"><textarea aria-label="Address" rows={3} className={T.input} value={c.address} onChange={(e) => set({ address: e.target.value })} /></Row>
            <Row label="State"><input aria-label="State" className={T.input} value={c.state} onChange={(e) => set({ state: e.target.value })} /></Row>
            <Row label="Country"><input aria-label="Country" className={T.input} value={c.country} onChange={(e) => set({ country: e.target.value })} /></Row>
            <Row label="Pincode"><input aria-label="Pincode" className={T.input} value={c.pincode} onChange={(e) => set({ pincode: e.target.value })} /></Row>
            <Row label="Telephone"><input aria-label="Telephone" className={T.input} value={c.phone} onChange={(e) => set({ phone: e.target.value })} /></Row>
            <Row label="E-mail"><input aria-label="E-mail" className={T.input} value={c.email} onChange={(e) => set({ email: e.target.value })} /></Row>
          </Section>
        </div>
        <div className="space-y-3">
          <Section title="Books and financial year">
            <Row label="Base currency"><span className="text-sm">₹ Indian Rupees</span></Row>
            <Row label="Financial year beginning from">
              <input aria-label="Financial year from" type="date" className={T.input} value={c.fyFrom}
                onChange={(e) => { const fy = e.target.value ? fyStartOf(e.target.value) : c.fyFrom; set({ fyFrom: fy, booksFrom: c.booksFrom < fy ? fy : c.booksFrom }) }} />
            </Row>
            <p className="pl-1 text-[11px] text-[#5a6b7c]">{tDate(c.fyFrom)} to {tDate(fyEndOf(c.fyFrom))}</p>
            <Row label="Books beginning from"><input aria-label="Books from" type="date" className={T.input} value={c.booksFrom} onChange={(e) => set({ booksFrom: e.target.value })} /></Row>
          </Section>
          <Section title="GST details">
            <Row label="Registration type">
              <select aria-label="GST registration type" className={T.input} value={c.gstRegType} onChange={(e) => set({ gstRegType: e.target.value as Company['gstRegType'] })}><option>Regular</option><option>Composition</option></select>
            </Row>
            <Row label="GSTIN/UIN"><input aria-label="GSTIN" className={T.input} value={c.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} /></Row>
            <Row label="PAN/IT No."><input aria-label="PAN" className={T.input} value={c.pan} onChange={(e) => set({ pan: e.target.value.toUpperCase() })} /></Row>
          </Section>
          <Section title="Cost centres">
            <p className="text-sm text-[#33475b]">Each outlet and the Central Kitchen is a cost centre. Every voucher is allocated to one, so reports work for one outlet or all.</p>
          </Section>
        </div>
      </div>
      {err && <p role="alert" className="mt-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} className={`${T.head} px-4 py-1.5 text-sm font-semibold`}>Accept (Ctrl+A)</button>
        <button type="button" onClick={onCancel} className="border border-[#9db3c8] px-4 py-1.5 text-sm">Quit (Esc)</button>
      </div>
    </div>
  )
}
