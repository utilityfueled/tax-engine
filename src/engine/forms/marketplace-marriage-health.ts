/** Actual marriage credit within Pub974. Spec: marketplace-marriage-health.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { Form8962Result } from './form-8962.js';
import { calculateMarketplaceMarriageHealthSources } from './marketplace-marriage-health-sources.js';
import { calculateForm8962MarriageWorksheets } from './form-8962-marriage-worksheets.js';

/** Reconcile the completed source calculation, not an eligibility override. */
export function calculateMarketplaceMarriageHealth(params: {
  input: TaxYearInput;
  credit: Form8962Result;
  /** Already calculated X/Y/Z limit. Omitted when that worksheet did not apply. */
  repaymentLimit?: Decimal;
}) {
  const { input, credit } = params;
  const facts = input.form8962;
  if (facts?.alternativeMarriageCalculationElected !== true && facts?.marriageSources === undefined) {
    if (credit.marriageCalculation) throw new Error('Pub974 marriage result has no actual elected source worksheet.');
    return undefined;
  }
  const sources = calculateMarketplaceMarriageHealthSources(input);
  if (!facts?.fplRegion || !credit.marriageCalculation || credit.calculationMethod !== 'monthly' || credit.familySize !== sources.familySize) {
    throw new Error('Pub974 marriage requires the completed actual monthly alternative worksheets.');
  }
  const expected = calculateForm8962MarriageWorksheets({ ...sources, taxYear: input.taxpayer.taxYear,
    fplRegion: facts.fplRegion, householdIncome: credit.modifiedAGI,
    healthInsuranceRepaymentLimit: params.repaymentLimit, orderedDeductionInterim: credit.orderedDeductionInterim });
  // Audit wording may identify a computed X limit rather than the equal Table5
  // amount. Every actual numeric family/month/repayment value must still agree.
  if (JSON.stringify({ ...expected, lines: undefined }) !== JSON.stringify({ ...credit.marriageCalculation, lines: undefined })) {
    throw new Error('Pub974 retained marriage calculation contradicts actual source worksheets.');
  }
  for (const key of ['ptcAllowed', 'advancePTCTotal', 'netPTC', 'excessAPTC', 'excessAPTCRepayment'] as const) {
    if (!expected[key].eq(credit[key])) throw new Error('Pub974 marriage reconciliation contradicts the actual final credit.');
  }
  if (expected.repaymentCap?.toFixed() !== credit.repaymentCap?.toFixed()) throw new Error('Pub974 marriage repayment limit contradicts its actual worksheet.');
  return { lastPreMarriageMonth: sources.lastPreMarriageMonth, calculation: expected };
}
