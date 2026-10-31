/** Spec: spec/federal/cod-zero-minimum-tax-credit-bound.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar } from '@/utils/decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';
import type { Form6251Result } from './form-6251.js';
import type { Form8801Result } from './form-8801.js';

export interface CodZeroMinimumTaxCreditBound {
  method: 'zero_available_pool_bound'; sourceFactsVerified: true; sourceTaxYear: number;
  currentAmt: Decimal; currentCreditAvailable: Decimal; currentCreditUsed: Decimal; currentFormCarry: Decimal;
  currentYearUnallowedQualifiedElectricVehicleCredit: Decimal; followingYearPool: Decimal; lines: CalculatedLine[];
}

/** This proves only the available pool. It does not calculate or assign a
 * value to signed current-source18, MTCNOLD, MTFTCE or exclusion-only net tax. */
export function calculateCodZeroMinimumTaxCreditBound(input: TaxYearInput, context: {
  form6251: Form6251Result; form8801?: Form8801Result;
}): CodZeroMinimumTaxCreditBound | undefined {
  const attributes = input.form982AttributeSources, facts = attributes?.currentMinimumTaxCredit;
  if (facts?.currentYearUnallowedQualifiedElectricVehicleCredit === undefined) return undefined;
  const fail = () => new Error('COD zero minimum tax credit pool requires actual zero AMT, present verified full8801 zero carry and explicit current-year legacy credit zero');
  if (attributes?.sourceTaxYear !== input.taxpayer.taxYear || attributes.sourceFactsConfirmed !== true
    || facts.sourceFactsConfirmed !== true || !facts.sourceReference?.trim() || facts.allCurrentAdjustmentSourcesIncluded !== true
    || facts.sourceYearCalculation !== undefined || !/^\d+(\.\d+)?$/.test(facts.currentYearUnallowedQualifiedElectricVehicleCredit)
    || !d(facts.currentYearUnallowedQualifiedElectricVehicleCredit).isZero()) throw fail();
  const original = input.form8801, full = context.form8801, amt = context.form6251;
  if (!original || original.sourceFactsConfirmed !== true || original.sourceFactsComplete === false
    || original.priorYear !== input.taxpayer.taxYear - 1 || !full || full.sourceFactsVerified !== true
    || full.taxYear !== input.taxpayer.taxYear || full.priorYear !== original.priorYear) throw fail();
  // A full current form proves the preceding source year only. Its legacy
  // line20 must be present, but it never supplies the separate current L.
  const required = [original.priorYearForm6251Line1And2e, original.priorYearExclusionItemAdjustments,
    original.priorYearAMT, original.priorYearMinimumTaxCreditNOLDeduction, original.priorYearMinimumTaxForeignTaxCredit,
    original.priorYearForm6251Line10, original.unusedMinimumTaxCreditCarryforward, original.priorYearUnallowedQualifiedElectricVehicleCredit];
  if (required.some(value => value === undefined) || [original.priorYearFiledForm2555, original.priorYearFiledForm1040NR,
    original.priorYearCapitalGainsRequired].some(value => typeof value !== 'boolean')) throw fail();
  const same = (actual: Decimal, expected: Decimal) => {
    if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) throw fail();
  };
  const line = (lines: CalculatedLine[], form: string, number: string): Decimal => {
    const rows = lines.filter(row => row.form === form && row.line === number);
    if (rows.length !== 1 || !Decimal.isDecimal(rows[0]!.value) || !rows[0]!.value.isFinite()) throw fail();
    return rows[0]!.value;
  };
  const zero = d('0');
  same(amt.amt, zero); same(line(amt.lines, 'Form 6251', '11'), zero);
  same(amt.tentativeMinimumTax, line(amt.lines, 'Form 6251', '9'));
  same(amt.amt, Decimal.max(zero, sumSourceMoney(line(amt.lines, 'Form 6251', '9'), line(amt.lines, 'Form 6251', '10').negated())));
  const available = full.totalAvailableCredit, used = full.creditAllowed, carry = full.carryforwardToNextYear;
  if ([available, used, carry].some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) throw fail();
  same(line(full.lines, 'Form 8801', '18'), full.minTaxCreditFromPriorYear);
  same(line(full.lines, 'Form 8801', '19'), roundDollar(d(original.unusedMinimumTaxCreditCarryforward)));
  same(line(full.lines, 'Form 8801', '20'), roundDollar(d(original.priorYearUnallowedQualifiedElectricVehicleCredit)));
  same(line(full.lines, 'Form 8801', '21'), sumSourceMoney(...['18', '19', '20'].map(number => line(full.lines, 'Form 8801', number))));
  same(available, Decimal.max(zero, line(full.lines, 'Form 8801', '21')));
  same(full.currentYearLimitation, line(full.lines, 'Form 8801', '24'));
  same(used, Decimal.min(available, full.currentYearLimitation)); same(used, line(full.lines, 'Form 8801', '25'));
  same(carry, line(full.lines, 'Form 8801', '26')); same(carry, sumSourceMoney(available, used.negated())); same(carry, zero);
  const audit = new AuditTrail();
  audit.record('COD zero minimum tax credit bound', 'following-pool', 'Source-proved zero beginning-next-year minimum tax credit pool', zero,
    'Actual AMT A=0, verified current full8801 carry C=0 and actual current legacy L=0; for every exclusion-only net tax X>=0, max(0,C+A-X+L)=0. Signed current adjustment is not determined.',
    { 'Actual current AMT': amt.amt, 'Current Form8801 carry': carry, 'Actual current legacy vehicle credit': zero });
  return { method: 'zero_available_pool_bound', sourceFactsVerified: true, sourceTaxYear: input.taxpayer.taxYear,
    currentAmt: amt.amt, currentCreditAvailable: available, currentCreditUsed: used, currentFormCarry: carry,
    currentYearUnallowedQualifiedElectricVehicleCredit: zero, followingYearPool: zero, lines: audit.getLines() };
}
