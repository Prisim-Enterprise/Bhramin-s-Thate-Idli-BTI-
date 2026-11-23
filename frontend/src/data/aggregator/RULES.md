# Aggregator Reconciliation (Zomato): rules, assumptions, open questions

Screens: Accounting → **Aggregator Reconciliation** (`pages/admin/aggregator/`).
Engine: `zomatoEngine.ts` (pure, exact decimals in `money.ts`). Storage and actions: `recon.ts`.
Tests: `npm run test:recon` (frontend) — sample data only.

## Where each figure comes from (Zomato "Payout breakup" sheet)

| Value | Rows | Column |
|---|---|---|
| Total commissionable value | 9 + 10 + 11 (= B) | Delivered |
| Investment in growth services (ads, incl. 18% GST) | 24 + 25 + 26 (= F) | Total |
| Other order-level deductions | 21 + 22 + 23 (= E) | Total |
| Commission charged | 12 − 15 (base service fee less the 30% cap discount) | Delivered |
| Expected payable | A (delivered) − C − D − E − F − G − H + I (total) | — |

* The rows behind each value can be changed by an admin (Configuration), as a new version from a date.
* Every lettered total (A, B, C, D, E, F, I) and the payout are recomputed and compared with what Zomato printed;
  a difference above ₹0.01 makes the week a **Mismatch**.

## Assumptions (please confirm with the CA)

1. **“Other order-level deductions = items 16 + 17 + 18”**: Zomato prints row E as “(16 + 17 + 18)”, but on the
   Payout breakup rows 16, 17, 18 are the payment mechanism fee, GST on fees and TCS (₹12,155.59 in the 17–23 Aug 2026
   statement), while row E itself is ₹218.87 = rows 21 + 22 + 23. The engine uses **21 + 22 + 23** (matching E).
   If 16 + 17 + 18 is really meant, change it in Configuration.
2. **Cancelled orders**: their net order value (A, cancelled column) is not paid; only the refund in row 29 is.
3. **Expected payable vs payable under terms**: what should reach the bank is the statement's own payout. Commission
   above the agreed rule and advertisement above the approved amount are shown separately as **recoverable from
   Zomato** (they make the week *Under review*), not deducted from what the bank should show.
4. **Advertisement approval** is compared including GST (Zomato bills ads with 18% GST). A % approval is a % of the
   delivered net order value (row A).
5. **Commission** is never assumed: until a rule (a % of the commissionable value, or a fixed ₹ per week) is
   configured, it is not checked and the week stays *Under review*.
6. **Bank matching** is automatic only on evidence: a bank line carrying one of the statement's UTRs, or exactly one
   Zomato credit for the amount still expected (within the tolerance, default ₹1), dated from the week's end to three
   weeks after, that no other open week could claim. Everything else is matched by hand.
7. Storage follows BTI's design (one `docs` table, one record per item): weekly statements are `settlements`,
   bank credits are the `bankLines` uploaded in Banking, matches are `bankMatches`, terms are versioned
   `partnerTerms`, restaurant IDs are `aggregatorOutlets`. The server's `audit_log` records every save and delete;
   each statement also keeps its own history and revisions.

## Open questions

* Does Zomato ever pay one outlet's week in several transfers, or several outlets in one transfer? Both are supported
  (manual allocation); automatic matching only handles the clear cases.
* Should commission be checked against row 12 alone (before the cap discount) instead of 12 − 15?
* Swiggy: its statement rules are not set up yet (shown as “coming”).
