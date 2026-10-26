import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BRANCHES, DEFAULT_DEDUCTIONS, DEFAULT_PERMISSIONS, type Action, type DeductionRules, type ModuleId, type PermissionMatrix, type RoleId } from '../data/mock'

type Ctx = {
  role: RoleId
  setRole: (r: RoleId) => void
  permissions: PermissionMatrix
  setPermissions: (p: PermissionMatrix) => void
  can: (module: ModuleId, action?: Action) => boolean
  ocrEnabled: Record<string, boolean>
  toggleOcr: (branchId: string) => void
  deductions: DeductionRules
  setDeductions: (d: DeductionRules) => void
}

const AppContext = createContext<Ctx | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable – keep in memory only */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<RoleId>(() => load('prisim.role', 'admin'))
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => load('prisim.permissions', DEFAULT_PERMISSIONS))
  const [ocrEnabled, setOcrEnabled] = useState<Record<string, boolean>>(() =>
    // Merge with defaults so newly added branches get their default OCR setting.
    ({ ...Object.fromEntries(BRANCHES.map((b) => [b.id, b.ocr])), ...load<Record<string, boolean>>('prisim.ocr', {}) }),
  )

  const [deductions, setDeductions] = useState<DeductionRules>(() => load('prisim.deductions', DEFAULT_DEDUCTIONS))

  useEffect(() => save('prisim.role', role), [role])
  useEffect(() => save('prisim.deductions', deductions), [deductions])
  useEffect(() => save('prisim.permissions', permissions), [permissions])
  useEffect(() => save('prisim.ocr', ocrEnabled), [ocrEnabled])

  const can = (module: ModuleId, action: Action = 'view') => permissions[role]?.[module]?.includes(action) ?? false
  const toggleOcr = (id: string) => setOcrEnabled((s) => ({ ...s, [id]: !s[id] }))

  return (
    <AppContext.Provider value={{ role, setRole, permissions, setPermissions, can, ocrEnabled, toggleOcr, deductions, setDeductions }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
