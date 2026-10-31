/** Repaid earlier-year income. Spec: spec/federal/claim-of-right.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';

const MONEY = /^\d+(\.\d+)?$/, THRESHOLD = new Decimal(3000);
export interface ClaimOfRightStage { deduction: Decimal; credit: Decimal }
export interface ClaimOfRightRow { sourceId: string; amount: Decimal; originalTaxYear: number; credit: Decimal; overThreshold: boolean }
export interface ClaimOfRightResult {
  rows: ClaimOfRightRow[]; eligibleAmount: Decimal; availableCredit: Decimal; nondeductibleAmount: Decimal;
  method: 'not_deductible' | 'deduction' | 'credit';
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
  const rows = (input.form1099G ?? []).filter(form => !new Decimal(form.priorYearRepaid || 0).isZero()).map((form, index): ClaimOfRightRow => {
    const repaid = amount(form.priorYearRepaid, 'repaid amount'), source = form.priorYearRepaymentSource;
    if (source?.sourceFactsConfirmed !== true || !source.sourceReference?.trim()) throw new Error('Repaid earlier-year income requires confirmed earlier-return records');
    if (!Number.isInteger(source.originalTaxYear) || source.originalTaxYear === undefined || source.originalTaxYear >= input.taxpayer.taxYear) {
      throw new Error('Repaid earlier-year income requires the actual earlier tax year');
    }
    const earlier = amount(source.earlierReturnTax, 'tax shown on the earlier return'), refigured = amount(source.refiguredEarlierTax, 'refigured earlier tax');
    if (refigured.gt(earlier)) throw new Error('Repaid earlier-year income cannot increase the refigured earlier tax');
    const overThreshold = repaid.gt(THRESHOLD);
    return { sourceId: form.sourceId ?? `1099-g:${index}`, amount: repaid, originalTaxYear: source.originalTaxYear, overThreshold, credit: overThreshold ? earlier.minus(refigured) : new Decimal(0) };
  });
  if (rows.length === 0) return undefined;
  const total = (values: Decimal[]) => values.reduce((sum, value) => sum.plus(value), new Decimal(0));
  return { rows, eligibleAmount: total(rows.filter(row => row.overThreshold).map(row => row.amount)), availableCredit: total(rows.map(row => row.credit)),
    nondeductibleAmount: total(rows.filter(row => !row.overThreshold).map(row => row.amount)) };
}

/** State repayment treatment is unresolved, so a state path must not guess. */
export function assertClaimOfRightStateMethod(input: Pick<TaxYearInput, 'form1099G'>, state: string): void {
  if ((input.form1099G ?? []).some(form => !new Decimal(form.priorYearRepaid || 0).isZero())) throw new Error(`Repaid earlier-year income has no implemented ${state} treatment`);
}
