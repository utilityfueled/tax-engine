/** Spec: state/oh-2026-resident-credit-draft.yaml. Enacted-law draft, not final form lines. */
import Decimal from 'decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
const D = Decimal.clone({ precision: 100 });

/** Values must come from the separate actual-original source context in return composition. */
export function calculateOhio2026ResidentCredit(input: {
  ohioAgi: Decimal | string; taxAvailable: Decimal | string;
  virginiaIncome: string; virginiaTaxPaid: string;
}) {
  function amount(value: unknown): Decimal {
    if (value === null || value === undefined || typeof value === 'string' && !/^\d{1,15}(?:\.\d{1,2})?$/.test(value)) throw new Error('Ohio2026 resident credit requires actual nonnegative finite amounts');
    const n = new D(value as Decimal | string);
    if (!n.isFinite() || n.lt(0)) throw new Error('Ohio2026 resident credit requires actual nonnegative finite amounts');
    return n;
  }
  // Validate even when remaining Ohio tax is known0.
  const agi = new D(roundDollar(amount(input.ohioAgi)));
  const available = new D(roundDollar(amount(input.taxAvailable)));
  const rawIncome = amount(input.virginiaIncome), rawPaid = amount(input.virginiaTaxPaid);
  const income = new D(roundDollar(rawIncome));
  const paid = new D(roundDollar(rawPaid));
  if (income.gt(agi) || rawIncome.gt(0) !== rawPaid.gt(0)) throw new Error('Ohio2026 resident credit requires reconciled same-income and paid-tax columns');
  const ratio = agi.gt(0) ? D.min(1, income.div(agi).toDecimalPlaces(4, Decimal.ROUND_DOWN)) : new D(0);
  const cap = roundDollar(ratio.times(available));
  const credit = Decimal.min(paid, cap);
  const audit = new AuditTrail();
  for (const [line, label, value, formula] of [
    ['eligible-income', 'Actual Virginia income included once in Ohio AGI', income, 'Round current same-income source total once; paid0 gives column0'],
    ['paid-tax', 'Actual Virginia net income tax paid', paid, 'Round completed account net payments minus refunds once, after Virginia credits'],
    ['ratio', 'Current draft resident credit attribution ratio', ratio, 'min(1,truncate4(eligible income / Ohio AGI)); historical worksheet continuity provisional'],
    ['cap', 'Current draft Ohio tax attributable to Virginia income', cap, 'roundDollar(ratio * remaining tax after preceding credits and NRC)'],
    ['credit', 'Current draft resident credit', credit, 'min(actual paid tax, Ohio attribution cap); RC5747.05(B)-(D),5747.98'],
  ] as const) audit.record('OH2026 enacted resident credit draft', line, label, value, formula);
  return { credit, ratio, cap, lines: audit.getLines() };
}
