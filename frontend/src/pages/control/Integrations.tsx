import { useState } from 'react'
import { Brain, Network, Plug, Wifi, WifiOff } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Table, Toggle } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BRANCHES } from '../../data/mock'

export default function Integrations() {
  const { can } = useApp()
  const edit = can('settings', 'edit')
  const [conns, setConns] = useState([
    { name: 'POS (Petpooja)', desc: 'Pulls bills and item sales every 5 min', on: false },
    { name: 'Swiggy', desc: 'Orders, payouts and commission', on: false },
    { name: 'Zomato', desc: 'Orders, payouts and commission', on: false },
    { name: 'Tally Prime export', desc: 'Push vouchers and ledgers nightly', on: false },
    { name: 'Bank feed (HDFC)', desc: 'Match payments to bills', on: false },
    { name: 'WhatsApp alerts', desc: 'Low stock and approval alerts to managers', on: false },
  ])
  const [models, setModels] = useState([
    { name: 'Bill OCR', model: 'Prisim Vision v2', on: false, note: 'Reads vendor bills uploaded by kitchen' },
    { name: 'Demand forecast', model: 'Prisim Forecast', on: false, note: 'Suggests tomorrow’s indent per branch' },
    { name: 'Food cost anomaly', model: 'Prisim Watch', on: false, note: 'Flags dishes whose cost jumps suddenly' },
    { name: 'Ask Prisim (chat)', model: 'Claude', on: false, note: 'Ask questions about sales and costs in plain English' },
  ])

  return (
    <>
      <PageHeader title="Integrations & AI" subtitle="Connections, AI models and the branch network" />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Plug size={16} /> Connections</span>} pad={false}>
          <ul className="divide-y divide-slate-100">
            {conns.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.desc}</p>
                </div>
                <Badge>{c.on ? 'connected' : 'disconnected'}</Badge>
                <Button size="sm" variant={c.on ? 'secondary' : 'primary'} disabled={!edit} onClick={() => setConns(conns.map((x, j) => j === i ? { ...x, on: !x.on } : x))}>
                  {c.on ? 'Disconnect' : 'Connect'}
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Brain size={16} /> AI models</span>} pad={false}>
          <ul className="divide-y divide-slate-100">
            {models.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.name} <span className="font-normal text-slate-400">· {m.model}</span></p>
                  <p className="text-xs text-slate-500">{m.note}</p>
                </div>
                <Toggle checked={m.on} disabled={!edit} label={m.name} onChange={() => setModels(models.map((x, j) => j === i ? { ...x, on: !x.on } : x))} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><Network size={16} /> Branch network</span>} className="mt-4" pad={false}>
        <Table head={['Branch', 'Connection', 'Last sync', 'Device', 'Latency']}>
          {BRANCHES.map((b, i) => (
            <tr key={b.id}>
              <td className="font-medium">{b.name}</td>
              <td>
                <span className={`flex items-center gap-1.5 ${b.status === 'online' ? 'text-emerald-600' : b.status === 'offline' ? 'text-rose-600' : 'text-slate-500'}`}>
                  {b.status === 'online' ? <Wifi size={14} /> : <WifiOff size={14} />} {b.status.replace('_', ' ')}
                </span>
              </td>
              <td className="text-slate-500">—</td>
              <td className="text-slate-500">{b.id === 'CK' ? 'Kitchen tablet + scanner' : 'POS terminal'}</td>
              <td className="tabular-nums">—</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
