import { useState } from 'react'
import { Activity, CheckCircle2, Clock, Gauge } from 'lucide-react'
import { Badge, Card, Field, PageHeader, Stat, Table, Toggle, inputCls } from '../../components/ui'
import { useApp } from '../../context/AppContext'
import { BILLS, BRANCHES } from '../../data/mock'

export default function OcrStatus() {
  const { ocrEnabled, toggleOcr, can } = useApp()
  const edit = can('settings', 'edit')
  const [cfg, setCfg] = useState({ engine: 'Prisim Vision v2', autoApprove: 95, language: 'English + Kannada + Hindi', retries: 2 })
  const active = Object.values(ocrEnabled).filter(Boolean).length
  const done = BILLS.filter((b) => b.confidence > 0)
  const avg = done.reduce((s, b) => s + b.confidence, 0) / done.length

  return (
    <>
      <PageHeader title="OCR Status" subtitle="Turn bill scanning on or off per branch and set how much it can auto-approve" />

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Engine" value="Online" hint={cfg.engine} icon={Activity} tone="green" />
        <Stat label="Branches active" value={`${active} / ${BRANCHES.length}`} icon={CheckCircle2} />
        <Stat label="In queue" value={String(BILLS.filter((b) => b.status === 'queued' || b.status === 'processing').length)} icon={Clock} tone="amber" />
        <Stat label="Avg confidence" value={avg.toFixed(1) + '%'} icon={Gauge} tone={avg > 85 ? 'green' : 'amber'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="OCR per branch" pad={false} className="xl:col-span-2">
          <Table head={['Branch', 'Bills today', 'Failed', 'Status', 'OCR active']}>
            {BRANCHES.map((b) => {
              const bills = BILLS.filter((x) => x.branch === b.id)
              return (
                <tr key={b.id}>
                  <td className="font-medium">{b.name}</td>
                  <td>{bills.length}</td>
                  <td className={bills.some((x) => x.status === 'failed') ? 'text-rose-600' : ''}>{bills.filter((x) => x.status === 'failed').length}</td>
                  <td><Badge tone={ocrEnabled[b.id] ? 'green' : 'slate'}>{ocrEnabled[b.id] ? 'active' : 'inactive'}</Badge></td>
                  <td><Toggle checked={!!ocrEnabled[b.id]} disabled={!edit} label={`OCR for ${b.name}`} onChange={() => toggleOcr(b.id)} /></td>
                </tr>
              )
            })}
          </Table>
        </Card>

        <Card title="Engine settings">
          <div className="space-y-3">
            <Field label="OCR engine">
              <select className={inputCls} disabled={!edit} value={cfg.engine} onChange={(e) => setCfg({ ...cfg, engine: e.target.value })}>
                <option>Prisim Vision v2</option><option>Google Document AI</option><option>AWS Textract</option><option>Tesseract (offline)</option>
              </select>
            </Field>
            <Field label={`Auto-approve when confidence ≥ ${cfg.autoApprove}%`}>
              <input type="range" min={70} max={100} className="w-full accent-brand-600" disabled={!edit} value={cfg.autoApprove} onChange={(e) => setCfg({ ...cfg, autoApprove: +e.target.value })} />
            </Field>
            <Field label="Bill languages"><input className={inputCls} disabled={!edit} value={cfg.language} onChange={(e) => setCfg({ ...cfg, language: e.target.value })} /></Field>
            <Field label="Retries on failure"><input type="number" className={inputCls} disabled={!edit} value={cfg.retries} onChange={(e) => setCfg({ ...cfg, retries: +e.target.value })} /></Field>
          </div>
        </Card>
      </div>
    </>
  )
}
