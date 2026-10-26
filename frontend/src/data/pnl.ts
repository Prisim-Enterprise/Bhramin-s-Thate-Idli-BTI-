import { AGGREGATOR_COMMISSION, AGGREGATOR_SHARE, BRANCHES, BRANCH_COSTS, CENTRAL_COSTS, LAST_MONTH } from './mock'

export const OUTLETS = BRANCHES.filter((b) => b.id !== 'CK')
export const CENTRAL_TOTAL = CENTRAL_COSTS.salaries + CENTRAL_COSTS.rent + CENTRAL_COSTS.utilities

export type Period = 'this' | 'last'

// Builds the P&L for a set of outlets. Central kitchen/head office costs are
// shared out by each outlet's share of total sales.
export function buildPnl(ids: string[], period: Period) {
  const salesOf = (id: string) => (period === 'this' ? OUTLETS.find((b) => b.id === id)!.sales : LAST_MONTH[id].sales)
  const fcOf = (id: string) => (period === 'this' ? OUTLETS.find((b) => b.id === id)!.foodCost : LAST_MONTH[id].foodCost)
  const allSales = OUTLETS.reduce((s, b) => s + salesOf(b.id), 0)

  const sum = (f: (id: string) => number) => ids.reduce((s, id) => s + f(id), 0)
  const c = (k: keyof (typeof BRANCH_COSTS)[string]) => sum((id) => BRANCH_COSTS[id][k])

  const sales = sum(salesOf)
  const dineIn = sales * (1 - AGGREGATOR_SHARE)
  const online = sales * AGGREGATOR_SHARE
  const food = sum((id) => salesOf(id) * (fcOf(id) / 100))
  const gross = sales - food
  const commission = online * AGGREGATOR_COMMISSION
  const central = CENTRAL_TOTAL * (sales / allSales)

  const expenses = [
    { key: 'salaries', label: 'Salaries & wages', v: c('salaries') },
    { key: 'rent', label: 'Rent', v: c('rent') },
    { key: 'utilities', label: 'Electricity & water', v: c('utilities') },
    { key: 'gas', label: 'Gas / fuel', v: c('gas') },
    { key: 'commission', label: 'Swiggy / Zomato commission', v: commission },
    { key: 'marketing', label: 'Marketing', v: c('marketing') },
    { key: 'repairs', label: 'Repairs & maintenance', v: c('repairs') },
    { key: 'housekeeping', label: 'Housekeeping', v: c('housekeeping') },
    { key: 'misc', label: 'Other expenses', v: c('misc') },
    { key: 'central', label: 'Central kitchen & head office share', v: central },
  ]
  const opex = expenses.reduce((s, e) => s + e.v, 0)
  const ebitda = gross - opex
  const depreciation = c('depreciation')
  const net = ebitda - depreciation
  return { sales, dineIn, online, food, gross, expenses, opex, ebitda, depreciation, net }
}

