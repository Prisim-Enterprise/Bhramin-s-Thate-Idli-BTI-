import { useApp } from '../../context/AppContext'
import { BRANCHES, EMPLOYEES, ROLES } from '../../data/mock'
import Hub, { type HubStat } from './Hub'

// Setup & Access home: big buttons for branches, OCR, users and roles.
export default function SetupHub() {
  const { ocrEnabled } = useApp()
  const offline = BRANCHES.filter((b) => b.status === 'offline').length
  const ocrOn = BRANCHES.filter((b) => ocrEnabled[b.id]).length

  const stats: Record<string, HubStat> = {
    '/admin/setup/branches': { value: `${BRANCHES.length} locations`, caption: offline ? `${offline} offline right now` : 'set up branch details', tone: offline ? 'warn' : undefined },
    '/admin/ocr': { value: `${ocrOn} of ${BRANCHES.length}`, caption: 'branches scanning bills' },
    '/admin/users': { value: String(EMPLOYEES.filter((e) => e.active).length), caption: 'people can log in' },
    '/admin/roles': { value: String(ROLES.length), caption: 'roles set up' },
  }

  return <Hub id="setup" stats={stats} />
}
