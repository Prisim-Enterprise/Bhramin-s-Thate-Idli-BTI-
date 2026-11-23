// SAMPLE DATA FOR TESTS ONLY. These are made-up figures shaped like Zomato's weekly Settlement Report;
// they are not BTI's real numbers. Worked so every lettered total adds up:
//   A delivered = 10,000 + 1,500 − 300 + 560 = 11,760 · cancelled orders' value 500 (not paid)
//   B = 9,700 + 1,500 + 0 = 11,200 (commissionable value)
//   C = 1,904 (17% of B) + 150 − 0 − 4 + 200 = 2,250
//   D = 405 + 0 + 11.20 + 560 = 976.20 · E = 25 + 0 + 0 = 25 · F = 1,180 (ads 1,000 + 18% GST)
//   I = 200 (cancellation refund) · J = 11,760 − 2,250 − 976.20 − 25 − 1,180 + 200 = 7,528.80

export const SAMPLE_SUMMARY: string[][] = [
  ['', 'Report summary'],
  ['', 'Report period', '17 Aug 2026 - 23 Aug 2026'],
  ['', 'Res id', '90000001'],
  ['', 'Legal entity', 'SAMPLE LLP'],
  ['', 'Res name', 'Sample Restaurant'],
  ['', 'Address', 'Sample address, Vidyaranyapura, Bengaluru'],
  ['', 'Total Orders \n(Delivered + Cancelled/ Rejected)', '101'],
  ['', 'Net Payout\n(Settled + Unsettled)', '7528.8'],
  ['', 'Bank UTR', ''],
]

const R = (no: string, name: string, d: string, c = '0', t?: string) => ['', no, name, d, c, t ?? String(Math.round((Number(d) + Number(c === '-' ? 0 : c)) * 10000) / 10000)]
export const SAMPLE_PAYOUT: string[][] = [
  ['', 'Payout breakup'],
  ['', 'S.no.', 'Particular', 'Delivered Orders', 'Cancelled/ Rejected Orders', 'Total'],
  ['', '', 'Number of orders', '100', '1', '101'],
  R('A', 'Net order value ( 1 + 2 + 3 - 4 - 5 + 6 - 7 + 8 )', '11760', '500'),
  R('1', 'Subtotal (items total)', '10000', '500'),
  R('2', 'Packaging charge', '1500'), R('3', 'Delivery charge for restaurants on self logistics', '0'),
  R('4', 'Restaurant discount (Promo)', '300'), R('5', 'Restaurant discount (BOGO, Freebies, Gold, Brand pack & others)', '0'),
  R('6', 'Brand pack subscription fee', '0'), R('7', 'Delivery charge discount/ Relisting discount', '0'), R('8', 'Total GST collected from customers', '560'),
  R('B', 'Total commissionable value ( 9 + 10 + 11 )', '11200'),
  R('9', 'Commissionable value of Subtotal', '9700'), R('10', 'Commissionable value of Packaging charge', '1500'), R('11', 'Commissionable value of Total GST', '0'),
  R('C', 'Service fees & payment mechanism fees ( 12 + 13 - 14 - 15 + 16 )', '2250'),
  R('12', 'Base service fee', '1904'), R('13', 'Long distance enablement fee', '150'), R('14', 'Discount on long distance enablement fee', '0'),
  R('15', 'Discount on service fee due to 30% capping', '4'), R('16', 'Payment mechanism fee', '200'),
  R('D', 'Government charges ( 12 + 13 + 14 + 15 )', '976.2'),
  R('17', 'Taxes on service fee & payment mechanism fee', '405'), R('18', 'Tax collected at source + TCS IGST amount', '0'),
  R('19', 'TDS 194O amount', '11.2'), R('20', 'GST paid by Zomato on behalf of restaurant - under section 9(5)', '560'),
  R('E', 'Other order level deductions ( 16 + 17 + 18 )', '25'),
  R('21', 'Other Order level deductions', '25'), ['', 'Customer compensation/ recoupment', '', '25', '0', '25'],
  R('22', 'Amount received in cash (on self delivery orders)', '0'), R('23', 'Adjustments from previous weeks', '0', '-'),
  R('F', 'Investment in growth services (24 + 25 + 26)', '1180', '-', '1180'),
  R('24', 'Total Ads (inc. 18% GST)', '1180', '-', '1180'), R('25', 'Total Dining Ads (inc. 18% GST)', '0', '-', '0'), R('26', 'Miscellaneous sevices', '0', '-', '0'),
  R('G', 'Investment in Hyperpure', '0', '-', '0'), R('27', 'Total Hyperpure', '0', '-', '0'),
  R('H', 'Other Deductions', '0', '-', '0'), R('28', 'Express order discount reversal', '0', '-', '0'),
  R('I', 'Total Additions (29 + 30 + 31 + 32)', '0', '200', '200'),
  R('29', 'Cancellation refund for cancelled orders', '-', '200', '200'), R('30', 'Tip for kitchen staff for delivered orders', '0', '-', '0'),
  R('31', 'TDS 194 H and other Res id level additions', '0', '-', '0'), R('32', 'Restaurant-level service fees rebate', '0', '-', '0'),
  R('J', 'Net Payout  (A - C - D - E - F - G - H + I)', '7328.8', '200', '7528.8'),
  ['', 'Settlement breakdown'],
  ['', 'Amount settled', '', '0', '0', '0'],
  ['', 'Pending amount (will be credited on next payout day)', '', '7328.8', '200', '7528.8'],
]

export const SAMPLE_ADS: string[][] = [
  ['', 'Deduction Type'], ['', 'A) Investments in growth services'],
  ['', 'Type', 'Res id for which deduction created', 'Invoice No/Campaign id', 'Deduction time period', 'Settlement Status', 'Total amount', 'Adjusted amount', 'Outstanding amount'],
  ['', 'ADS', '90000001', 'C-1', '17 August 26 - 23 August 26', 'pending', '1180', '0', '1180'],
  ['', 'Total Ads & miscellaneous services', '', '', '', '', '1180', '0', '1180'],
  ['', 'B) Investments in Hyperpure'],
]

export const sampleSheets = () => [
  { name: 'Summary', rows: SAMPLE_SUMMARY },
  { name: 'Payout Breakup', rows: SAMPLE_PAYOUT },
  { name: 'Addition Deductions Details', rows: SAMPLE_ADS },
]

/** The same Payout breakup as a CSV, with the summary lines above it (as when one sheet is saved as CSV). */
export const sampleCsv = () => [...SAMPLE_SUMMARY, ...SAMPLE_PAYOUT].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
