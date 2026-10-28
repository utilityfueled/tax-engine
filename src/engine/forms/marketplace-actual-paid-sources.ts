/** Actual payer source applicability. Spec: marketplace-actual-paid-repayment.yaml. */
import { sum } from '@/utils/decimal.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { calculateMarketplaceCoverageFamilyHealth } from './marketplace-coverage-family-health.js';
import { calculateSharedMarketplaceHealthSources, type SharedMarketplaceHealthInput } from './shared-marketplace-health.js';
import { calculateMarketplaceMarriageHealthSources } from './marketplace-marriage-health-sources.js';

/** Complete actual source applicability only; the final return supplies proof. */
export function calculateMarketplaceActualPaidSources(input: SharedMarketplaceHealthInput) {
  const families = calculateMarketplaceCoverageFamilySources(input);
  if (!families?.some(plan => plan.months.some(row => row.ownAdvance.gt(0)))) return undefined;
  const allocations = calculateMarketplaceCoverageFamilyHealth(input, 'actual-paid-candidate')!;
  const months = allocations.map(row => {
    const actual = families.find(plan => plan.planId === row.planId)!.months.find(month => month.month === row.month)!;
    return { ...row, actualSpecifiedCash: actual.ownCoverageCash, actualNonspecifiedCash: actual.ownNoncoverageCash,
      actualSpecifiedAdvance: actual.ownAdvance.minus(actual.ownNoncoverageAdvance), actualNonspecifiedAdvance: actual.ownNoncoverageAdvance,
      actualOutsideCash: actual.outsideNetCash, originalPolicyAdvance: actual.sourceAdvance };
  });
  const cashDiffers = months.some(row => !row.actualSpecifiedCash.plus(row.actualNonspecifiedCash).plus(row.advancePremiumTaxCredit).eq(row.taxFamilyPremium));
  const marriageNoncoverage = input.form8962?.alternativeMarriageCalculationElected === true && months.some(row => row.actualNonspecifiedAdvance.gt(0));
  if (!cashDiffers && !marriageNoncoverage) return undefined;
  const plans = input.form7206!.plans!.filter(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true);
  if (plans.some(plan => !families.some(source => source.planId === plan.planId))
    || new Set(families.flatMap(plan => plan.policyIndexes)).size !== input.form1095A.length) {
    throw new Error('Actual paid repayment requires complete original policies and monthly payment sources for every Marketplace plan.');
  }
  for (const row of months) {
    if (row.actualSpecifiedCash.plus(row.actualSpecifiedAdvance).gt(row.specifiedPremium)
      || row.actualNonspecifiedCash.plus(row.actualNonspecifiedAdvance).gt(row.nonspecifiedPremium)) {
      throw new Error('Actual paid repayment component exceeds its independently allocated premium pool.');
    }
  }
  calculateSharedMarketplaceHealthSources(input);
  if (input.form8962?.alternativeMarriageCalculationElected === true || input.form8962?.marriageSources !== undefined) calculateMarketplaceMarriageHealthSources(input);
  return { months, exactSourceAdvances: sum(...months.map(row => row.advancePremiumTaxCredit)),
    originalPolicyAdvances: sum(...months.map(row => row.originalPolicyAdvance)) };
}
