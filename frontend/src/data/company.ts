import { cloudStore } from './cloudStore'

// The company, as in Tally's Company Creation. One company; each outlet is a cost centre.

export type Company = {
  id: 'main'
  name: string
  mailingName: string
  address: string
  state: string
  country: string
  pincode: string
  phone: string
  email: string
  gstin: string
  pan: string
  gstRegType: 'Regular' | 'Composition'
  fyFrom: string // financial year beginning from (yyyy-mm-dd)
  booksFrom: string // books beginning from (yyyy-mm-dd)
  updatedBy: string
  updatedAt: string
}

const store = cloudStore<Company>('prisim.company', { kind: 'company', idOf: (c) => c.id })
export const useCompany = (): Company | null => store.use()[0] ?? null
export const saveCompany = (c: Company) => store.set([c])

/** 1 April of the financial year a date falls in. */
export function fyStartOf(date: string) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7))
  return `${m >= 4 ? y : y - 1}-04-01`
}
export const fyEndOf = (from: string) => `${Number(from.slice(0, 4)) + 1}-03-31`

/** Starting values for the first Company Creation (from the company's own GST and Zomato records). */
export function companyDefaults(today: string): Omit<Company, 'updatedBy' | 'updatedAt'> {
  const fy = fyStartOf(today)
  return {
    id: 'main',
    name: 'PEP Hospitality and Services LLP',
    mailingName: "Brahmins' Thatte Idli",
    address: '',
    state: 'Karnataka',
    country: 'India',
    pincode: '',
    phone: '',
    email: '',
    gstin: '29AAQFP6766L1Z5',
    pan: 'AAQFP6766L',
    gstRegType: 'Regular',
    fyFrom: fy,
    booksFrom: fy,
  }
}

/** GSTIN: 2-digit state, 10-character PAN, entity number, Z, check character. */
export const gstinOk = (g: string) => !g || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.trim().toUpperCase())
export const panOk = (p: string) => !p || /^[A-Z]{5}\d{4}[A-Z]$/.test(p.trim().toUpperCase())
