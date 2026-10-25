/** Actual federal deduction choice. Spec: nonitemized-charitable-election.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult, CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

export function calculateFederalDeductionSelection(input: {
  taxYear: number; election: NonNullable<TaxYearInput['deductionElection']>;
  eligibleForStandardDeduction: boolean; standardDeduction: Decimal;
  itemizedDeductions: Decimal; nonitemizerCharitableDeduction: Decimal;
}): Pick<TaxReturnResult, 'deductionUsed' | 'deductionAmount'> & { nonitemizerCharitableDeduction: Decimal; lines: CalculatedLine[] } {
  if (![2025, 2026].includes(input.taxYear) || typeof input.eligibleForStandardDeduction !== 'boolean') throw new Error('Deduction selection requires actual supported year and standard eligibility');
  if ([input.standardDeduction, input.itemizedDeductions, input.nonitemizerCharitableDeduction].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) throw new Error('Deduction selection amounts must be finite and nonnegative');
  if (!input.eligibleForStandardDeduction && !input.standardDeduction.isZero()) throw new Error('An unavailable standard deduction must retain the actual zero amount');
  if (input.election === 'standard' && !input.eligibleForStandardDeduction) throw new Error('Standard deduction election is ineligible for the actual taxpayer facts');
  if (input.election === 'nonitemized' && (input.taxYear !== 2026 || input.eligibleForStandardDeduction)) {
    throw new Error('The explicit nonitemized election requires 2026 and an actually unavailable standard deduction');
  }
  if (input.taxYear === 2025 && !input.nonitemizerCharitableDeduction.isZero()) throw new Error('The nonitemizer charitable deduction is unavailable for 2025');
  const deductionUsed = input.election === 'nonitemized' ? 'nonitemized'
    : input.election === 'itemized' || !input.eligibleForStandardDeduction
      || (input.election === 'automatic' && input.itemizedDeductions.gt(input.standardDeduction.plus(input.nonitemizerCharitableDeduction)))
      ? 'itemized' : 'standard';
  const deductionAmount = deductionUsed === 'itemized' ? input.itemizedDeductions : deductionUsed === 'standard' ? input.standardDeduction : d('0');
  const nonitemizerCharitableDeduction = deductionUsed === 'itemized' ? d('0') : input.nonitemizerCharitableDeduction;
  const audit = new AuditTrail();
  audit.record('Deduction Selection', 'method', 'Actual federal deduction election', deductionAmount,
    deductionUsed === 'nonitemized' ? 'Explicit 2026 nonitemization; standard deduction unavailable; section 170(p) is separate'
      : `${deductionUsed} under actual election and standard eligibility`, { 'Standard amount': input.standardDeduction, 'Section170(p) deduction': nonitemizerCharitableDeduction });
  return { deductionUsed, deductionAmount, nonitemizerCharitableDeduction, lines: audit.getLines() };
}
