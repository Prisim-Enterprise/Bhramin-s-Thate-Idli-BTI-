import { useMemo } from 'react'
import { useBankLines } from '../banking'
import { usePartnerTerms, useSettlements } from '../settlements'
import { isZomatoWeek, useAggregatorOutlets, useBankMatches, weekState, type WeekState } from './recon'

/** Everything the Aggregator Reconciliation screens read, worked out once per change. */
export function useRecon() {
  const settlements = useSettlements()
  const terms = usePartnerTerms()
  const lines = useBankLines()
  const matches = useBankMatches()
  const outlets = useAggregatorOutlets()
  const weeks: WeekState[] = useMemo(
    () => settlements.filter(isZomatoWeek).map((s) => weekState(s, terms, matches)).sort((a, b) => b.s.date.localeCompare(a.s.date) || a.s.branch.localeCompare(b.s.branch)),
    [settlements, terms, matches],
  )
  // Zomato settlements uploaded before the full statement was kept (the weekly Reconcile page): listed, to re-import.
  const older = useMemo(() => settlements.filter((s) => s.partner === 'zomato' && !s.zomato), [settlements])
  return { settlements, terms, lines, matches, outlets, weeks, older }
}
export type Recon = ReturnType<typeof useRecon>
