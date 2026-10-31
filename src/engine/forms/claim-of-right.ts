/** Repaid earlier-year income. Spec: spec/federal/claim-of-right.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';

const MONEY = /^\d+(\.\d+)?$/, THRESHOLD = new Decimal(3000);
export interface ClaimOfRightStage { deduction: Decimal; credit: Decimal }
export interface ClaimOfRightRow { sourceId: string; amount: Decimal; originalTaxYear: number }
export interface ClaimOfRightResult {
  rows: ClaimOfRightRow[]; eligibleAmount: Decimal; availableCredit: Decimal; nondeductibleAmount: Decimal;
  method: 'not_deductible' | 'deduction' | 'credit' | 'no_benefit';
}

/** Internal comparison stage. A symbol key cannot arrive in parsed original JSON. */
const STAGE = Symbol('claim-of-right-stage');
type Staged = { [STAGE]?: ClaimOfRightStage };
export const claimOfRightStage = (input: object): ClaimOfRightStage | undefined => (input as Staged)[STAGE];
export const withClaimOfRightStage = <T extends object>(input: T, stage: ClaimOfRightStage): T => ({ ...input, [STAGE]: stage });

const amount = (value: string | undefined, label: string) => {
  if (value === undefined || !MONEY.test(value)) throw new Error(`Repaid earlier-year income requires the actual ${label}`);
  return new Decimal(value);
};

export function calculateClaimOfRightSources(input: Pick<TaxYearInput, 'form1099G' | 'taxpayer'>): Omit<ClaimOfRightResult, 'method'> | undefined {
  const yearFigures = new Map<number, { earlier: Decimal; refigured: Decimal }>();
  const rows = (input.form1099G ?? []).filter(form => !new Decimal(form.priorYearRepaid || 0).isZero()).map((form, index): ClaimOfRightRow => {
    const repaid = amount(form.priorYearRepaid, 'repaid amount'), source = form.priorYearRepaymentSource;
    if (source?.sourceFactsConfirmed !== true || !source.sourceReference?.trim()) throw new Error('Repaid earlier-year income requires confirmed earlier-return records');
    const year = source.originalTaxYear;
    if (!Number.isInteger(year) || year === undefined || year < 2000 || year >= input.taxpayer.taxYear) throw new Error('Repaid earlier-year income requires the actual earlier tax year');
    const earlier = amount(source.earlierReturnTax, 'tax shown on the earlier return'), refigured = amount(source.refiguredEarlierTax, 'refigured earlier tax');
    if (refigured.gt(earlier)) throw new Error('Repaid earlier-year income cannot increase the refigured earlier tax');
    const prior = yearFigures.get(year);
    // The refigured tax removes all income repaid from that year, so rows share one figure.
    if (prior && (!prior.earlier.eq(earlier) || !prior.refigured.eq(refigured))) throw new Error('Repaid earlier-year income rows for one year must share the same earlier-return figures');
    yearFigures.set(year, { earlier, refigured });
    return { sourceId: form.sourceId ?? `1099-g:${index}`, amount: repaid, originalTaxYear: year };
  });
  if (rows.length === 0) return undefined;
  const total = rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)), overThreshold = total.gt(THRESHOLD);
  const availableCredit = [...yearFigures.values()].reduce((sum, row) => sum.plus(row.earlier).minus(row.refigured), new Decimal(0));
  return { rows, eligibleAmount: overThreshold ? total : new Decimal(0), availableCredit: overThreshold ? availableCredit : new Decimal(0), nondeductibleAmount: overThreshold ? new Decimal(0) : total };
}

/** Refund less any amount owed: the comparison after every credit and payment. */
export function claimOfRightNetRefund(result: Pick<TaxReturnResult, 'refund' | 'amountOwed'>): Decimal {
  return result.refund.minus(result.amountOwed);
}

/** State repayment treatment is unresolved, so a state path must not guess. */
export function assertClaimOfRightStateMethod(input: Pick<TaxYearInput, 'form1099G'>, state: string): void {
  if ((input.form1099G ?? []).some(form => !new Decimal(form.priorYearRepaid || 0).isZero())) throw new Error(`Repaid earlier-year income has no implemented ${state} treatment`);
}
