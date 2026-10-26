/** Pub974 Gary/Sue allocation, after independently derived PartIV amounts.
 * Spec: spec/federal/marketplace-coverage-family-health.yaml. */
import { calculateMarketplaceCoverageFamilySources, type MarketplaceCoverageFamilyInput } from './marketplace-coverage-family-sources.js';
import { calculateForm8962SharedPolicy } from './form-8962-shared-policy.js';
import { d, sum } from '@/utils/decimal.js';

export function calculateMarketplaceCoverageFamilyHealth(input: MarketplaceCoverageFamilyInput, mode?: "full-repayment-candidate" | "source-only") {
  const sources = calculateMarketplaceCoverageFamilySources(input);
  if (!sources) return undefined;
  if (!mode && sources.some(plan => plan.months.some(row => row.ownNoncoverageAdvance.gt(0)))) throw new Error("Noncoverage member advances require their actual separate repayment and deduction method.");
  const allocated = input.form8962?.allocationRequired === true ? calculateForm8962SharedPolicy(input) : undefined;
  return sources.flatMap(plan => plan.months.map(row => {
    const allocatedMonths = allocated?.months.filter(month => month.month === row.month && plan.policyIndexes.includes(month.policyIndex));
    if (allocated && allocatedMonths?.length !== plan.policyIndexes.filter(index => input.form1095A[index].monthlyPremiums.some(month => month.month === row.month)).length) throw new Error('Coverage-family health source is absent from its complete actual policy allocation.');
    const taxFamilyPremium = allocatedMonths ? sum(...allocatedMonths.map(month => month.premium)) : row.sourcePremium;
    const advancePremiumTaxCredit = allocatedMonths ? sum(...allocatedMonths.map(month => month.advance)) : row.sourceAdvance;
    if (!taxFamilyPremium.eq(row.ownCash.plus(row.ownAdvance)) || !advancePremiumTaxCredit.eq(row.ownAdvance)) throw new Error('Coverage-family actual paid shares must reconcile the independently allocated tax-family policy amounts.');
    const denominator = row.coverageFamilySlcsp.plus(row.nonCoverageFamilySlcsp);
    if (denominator.lte(0) && !taxFamilyPremium.isZero()) throw new Error('Coverage-family positive premiums require actual applicable benchmark sources.');
    const specifiedPremium = !row.coveragePersonIds.length || denominator.isZero() ? d(0) : taxFamilyPremium.times(row.coverageFamilySlcsp).div(denominator);
    return { planId: plan.planId, policyIndexes: plan.policyIndexes, month: row.month, taxFamilyPremium, advancePremiumTaxCredit,
      coverageFamilySlcsp: row.coverageFamilySlcsp, nonCoverageFamilySlcsp: row.nonCoverageFamilySlcsp,
      coveragePersonIds: row.coveragePersonIds, nonCoveragePersonIds: row.nonCoveragePersonIds,
      specifiedPremium, nonspecifiedPremium: taxFamilyPremium.minus(specifiedPremium) };
  }));
}
