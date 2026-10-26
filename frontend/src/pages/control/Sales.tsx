import { useState } from 'react'
import { Card, Field, PageHeader, Table, Toggle, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES, inr } from '../../data/mock'

export default function Sales() {
  const { can } = useApp()
  const edit = can('sales', 'edit')
  const [modes, setModes] = useState({ Cash: true, Card: true, UPI: true, 'Credit (on account)': false, Wallet: false })
  const [channels, setChannels] = useState([
    { name: 'Dine-in', on: true, commission: 0 },
    { name: 'Takeaway', on: true, commission: 0 },
    { name: 'Swiggy', on: true, commission: 22 },
    { name: 'Zomato', on: true, commission: 24 },
    { name: 'Own website', on: false, commission: 3 },
  ])
  const [tax, setTax] = useState({ gst: 5, service: 0, roundOff: true, dayClose: '23:30' })
  const outlets = BRANCHES.filter((b) => b.id !== 'CK')
  const total = outlets.reduce((s, b) => s + b.sales, 0)

  return (
    <>
      <PageHeader title="Sales" subtitle="Payment modes, channels, taxes and day-close for all branches" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Tax & billing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="GST on food (%)"><input type="number" className={inputCls} disabled={!edit} value={tax.gst} onChange={(e) => setTax({ ...tax, gst: +e.target.value })} /></Field>
            <Field label="Service charge (%)"><input type="number" className={inputCls} disabled={!edit} value={tax.service} onChange={(e) => setTax({ ...tax, service: +e.target.value })} /></Field>
            <Field label="Day close time"><input type="time" className={inputCls} disabled={!edit} value={tax.dayClose} onChange={(e) => setTax({ ...tax, dayClose: e.target.value })} /></Field>
            <div className="flex items-end gap-2 pb-2 text-sm">
              <Toggle checked={tax.roundOff} disabled={!edit} onChange={() => setTax({ ...tax, roundOff: !tax.roundOff })} label="Round off" /> Round off bills
            </div>
          </div>
        </Card>

        <Card title="Payment modes">
          <ul className="space-y-2.5">
            {Object.entries(modes).map(([m, on]) => (
              <li key={m} className="flex items-center justify-between text-sm">
                {m}
                <Toggle checked={on} disabled={!edit} label={m} onChange={() => setModes({ ...modes, [m]: !on })} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sales channels">
          <ul className="space-y-2">
            {channels.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <Toggle checked={c.on} disabled={!edit} label={c.name} onChange={() => setChannels(channels.map((x, j) => j === i ? { ...x, on: !x.on } : x))} />
                <span className="flex-1">{c.name}</span>
                <input type="number" className={inputCls + ' !w-16 !py-1 text-right'} disabled={!edit} value={c.commission}
                  onChange={(e) => setChannels(channels.map((x, j) => j === i ? { ...x, commission: +e.target.value } : x))} />
                <span className="text-xs text-slate-400">% fee</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Sales by branch (month to date)" className="mt-4" pad={false}>
        <Table head={['Branch', 'Gross sales', 'GST collected', 'Share', 'Food cost %']}>
          {outlets.map((b) => (
            <tr key={b.id}>
              <td className="font-medium">{b.name}</td>
              <td className="tabular-nums">{inr(b.sales)}</td>
              <td className="tabular-nums">{inr(Math.round(b.sales * tax.gst / (100 + tax.gst)))}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded bg-slate-100"><div className="h-1.5 rounded bg-brand-500" style={{ width: (b.sales / total) * 100 + '%' }} /></div>
                  <span className="text-xs text-slate-500">{((b.sales / total) * 100).toFixed(1)}%</span>
                </div>
              </td>
              <td className={b.foodCost > 32 ? 'text-rose-600' : ''}>{b.foodCost}%</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold"><td>Total</td><td>{inr(total)}</td><td>{inr(Math.round(total * tax.gst / (100 + tax.gst)))}</td><td /><td /></tr>
        </Table>
      </Card>
    </>
  )
}
