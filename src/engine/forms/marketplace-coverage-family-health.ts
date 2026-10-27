/** Pub974 Gary/Sue allocation, after independently derived PartIV amounts.
 * Spec: spec/federal/marketplace-coverage-family-health.yaml. */
import { calculateMarketplaceCoverageFamilySources, type MarketplaceCoverageFamilyInput } from './marketplace-coverage-family-sources.js';
import { calculateForm8962SharedPolicy } from './form-8962-shared-policy.js';
import { d, sum } from '@/utils/decimal.js';

export function calculateMarketplaceCoverageFamilyHealth(input: MarketplaceCoverageFamilyInput, mode?: "full-repayment-candidate" | "actual-cash-candidate" | "actual-paid-candidate" | "source-only") {
  const sources = calculateMarketplaceCoverageFamilySources(input);
  if (!sources) return undefined;
  if (!mode && sources.some(plan => plan.months.some(row => row.ownNoncoverageAdvance.gt(0)))) throw new Error("Noncoverage member advances require their actual separate repayment and deduction method.");
  const allocated = input.form8962?.allocationRequired === true ? calculateForm8962SharedPolicy(input) : undefined;
  return sources.flatMap(plan => plan.months.map(row => {
    const allocatedMonths = allocated?.months.filter(month => month.month === row.month && plan.policyIndexes.includes(month.policyIndex));
    if (allocated && allocatedMonths?.length !== plan.policyIndexes.filter(index => input.form1095A[index].monthlyPremiums.some(month => month.month === row.month)).length) throw new Error('Coverage-family health source is absent from its complete actual policy allocation.');
    const taxFamilyPremium = allocatedMonths ? sum(...allocatedMonths.map(month => month.premium)) : row.sourcePremium;
    const advancePremiumTaxCredit = allocatedMonths ? sum(...allocatedMonths.map(month => month.advance)) : row.sourceAdvance;
    const outsidePremiumPool = row.sourcePremium.minus(taxFamilyPremium);
    if (outsidePremiumPool.lt(0) || row.outsideCash.plus(row.outsideAdvance).gt(outsidePremiumPool)) throw new Error('Actual outside-person cash and advances exceed their independently allocated outside premium pool.');
    const cashDiffers = !taxFamilyPremium.eq(row.ownCash.plus(row.ownAdvance));
    if (!advancePremiumTaxCredit.eq(row.ownAdvance) || (cashDiffers && mode !== 'actual-paid-candidate' && (mode !== 'actual-cash-candidate' && mode !== 'source-only'
      || !row.sourceAdvance.isZero() || !row.ownAdvance.isZero()))) throw new Error('Coverage-family actual paid shares must reconcile the independently allocated tax-family policy amounts.');
    const denominator = row.coverageFamilySlcsp.plus(row.nonCoverageFamilySlcsp);
    if (denominator.lte(0) && !taxFamilyPremium.isZero()) throw new Error('Coverage-family positive premiums require actual applicable benchmark sources.');
    const specifiedPremium = !row.coveragePersonIds.length || denominator.isZero() ? d(0) : taxFamilyPremium.times(row.coverageFamilySlcsp).div(denominator);
    const nonspecifiedPremium = taxFamilyPremium.minus(specifiedPremium);
    if (cashDiffers && (row.ownCoverageCash.gt(specifiedPremium) || row.ownNoncoverageCash.gt(nonspecifiedPremium))) throw new Error('Actual cash component exceeds its independently allocated premium pool; a separate paid-share method is required.');
    return { planId: plan.planId, policyIndexes: plan.policyIndexes, month: row.month, taxFamilyPremium, advancePremiumTaxCredit,
      coverageFamilySlcsp: row.coverageFamilySlcsp, nonCoverageFamilySlcsp: row.nonCoverageFamilySlcsp,
      coveragePersonIds: row.coveragePersonIds, nonCoveragePersonIds: row.nonCoveragePersonIds, outsidePersonIds: row.outsidePersonIds,
      outsidePremiumPool, outsideCash: row.outsideCash, outsideAdvance: row.outsideAdvance,
      specifiedPremium, nonspecifiedPremium };
  }));
}
