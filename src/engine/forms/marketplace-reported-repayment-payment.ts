/** Actual cash and reported repayment. Spec: marketplace-reported-repayment-payment.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult, CalculatedLine } from '@/models/outputs.js';
import { d, sum, roundDollar } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateForm7206 } from './form-7206.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { calculateMarketplaceCoverageFamilyHealth } from './marketplace-coverage-family-health.js';

export interface MarketplaceReportedRepaymentPayment {
  method: 'ordinary-reported-advance-repayment';
  stage: 'candidate' | 'final';
  reportingMethod: 'annual' | 'monthly';
  planId: string;
  businessSourceId: string;
  accountHolder: 'primary' | 'spouse';
  originalEligiblePremiums: Decimal;
  actualCash: Decimal;
  exactSourceAdvances: Decimal;
  reportedAdvances: Decimal;
  unreportedAdvanceRemainder: Decimal;
  reportingExcess: Decimal;
  eligiblePremiums: Decimal;
  finalCredit: Decimal;
  finalRepayment: Decimal;
  deduction?: Decimal;
  lines: CalculatedLine[];
}

/** Candidate uses the original reporting convention only. It is not an accepted
 * deduction until the complete return independently passes the final stage. */
export function calculateMarketplaceReportedRepaymentPayment(
  input: TaxYearInput,
  result: TaxReturnResult,
  stage: 'candidate' | 'final' = 'final',
): MarketplaceReportedRepaymentPayment {
  const facts = input.form7206;
  const families = calculateMarketplaceCoverageFamilySources(input);
  const allocations = calculateMarketplaceCoverageFamilyHealth(input, 'source-only');
  const credit = result.form8962;
  if (!facts || facts.plans?.length !== 1 || families?.length !== 1 || !allocations?.length
    || families[0].policyIndexes.length !== input.form1095A.length
    || !families[0].months.some(row => row.ownNoncoverageAdvance.gt(0))) {
    throw new Error('Reported repayment payment needs one complete actual owner/business plan and advance pool.');
  }
  if (input.form8962?.alternativeMarriageCalculationElected !== false
    || !credit?.sourceFactsVerified || credit.orderedDeductionInterim
    || credit.taxYear !== input.taxpayer.taxYear || result.taxYear !== input.taxpayer.taxYear) {
    throw new Error('Reported repayment payment needs its actual completed reporting source and separate marriage method.');
  }
  const source = calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    facts, marketplaceSourceInput: input, marketplaceHandling: 'full-advance-repayment' });
  const plan = facts.plans[0], business = source.businesses[0];
  const originalEligiblePremiums = sum(...allocations.map(row => row.taxFamilyPremium));
  if (source.businesses.length !== 1 || !business || !business.eligiblePremiums.eq(originalEligiblePremiums)
    || !business.longTermCarePremiums.isZero()) {
    throw new Error('Reported repayment payment requires every actual source cost to be eligible for the same business.');
  }
  for (const month of families[0].months) {
    const allocation = allocations.find(row => row.planId === plan.planId && row.month === month.month);
    if (!allocation) throw new Error('Reported repayment payment is missing its actual monthly premium allocation.');
    const records = source.sourceRecords.filter(row => row.planId === plan.planId && row.coverageMonth === month.month);
    const component = (ids: string[]) => sum(...records.filter(row => ids.includes(row.personId))
      .map(row => row.amountPaid.plus(row.advancePremiumTaxCredit)));
    if (!component(month.coveragePersonIds).eq(allocation.specifiedPremium)
      || !component(month.nonCoveragePersonIds).eq(allocation.nonspecifiedPremium)) {
      throw new Error('Reported repayment payment requires actual component costs to reconcile the specified and nonspecified sources.');
    }
  }
  const exactSourceAdvances = sum(...families[0].months.map(row => row.ownAdvance));
  const actualCash = sum(...families[0].months.map(row => row.ownCash));
  const reportedAdvances = credit.calculationMethod === 'annual' ? roundDollar(exactSourceAdvances)
    : sum(...families[0].months.map(row => roundDollar(row.ownAdvance)));
  if (!actualCash.plus(exactSourceAdvances).eq(originalEligiblePremiums)
    || !credit.advancePTCTotal.eq(reportedAdvances)) {
    throw new Error('Reported repayment payment must conserve its actual original cash, advances and reported total.');
  }
  const eligiblePremiums = Decimal.min(originalEligiblePremiums, actualCash.plus(reportedAdvances));
  const unreportedAdvanceRemainder = Decimal.max(0, exactSourceAdvances.minus(reportedAdvances));
  const reportingExcess = Decimal.max(0, reportedAdvances.minus(exactSourceAdvances));
  let deduction: Decimal | undefined;
  if (stage === 'final') {
    if (!credit.ptcAllowed.isZero() || !credit.netPTC.isZero()
      || !credit.excessAPTC.eq(reportedAdvances) || !credit.excessAPTCRepayment.eq(reportedAdvances)) {
      throw new Error('Reported repayment payment requires actual final zero credit and all reported advances repaid after its deduction.');
    }
    const health = result.form7206, actual = health?.businesses[0];
    if (!health?.calculationComplete || !health.sourceFactsVerified
      || health.marketplaceHandling !== 'reported-advance-repayment' || health.businesses.length !== 1
      || !actual || actual.businessSourceId !== business.businessSourceId || actual.accountHolder !== business.accountHolder
      || !actual.eligiblePremiums.eq(eligiblePremiums) || !actual.earnedIncomeLimit || !actual.deduction
      || !actual.deduction.eq(Decimal.min(eligiblePremiums, actual.earnedIncomeLimit))) {
      throw new Error('Reported repayment payment must reconcile the actual own-business paid cost and income limit.');
    }
    deduction = roundDollar(actual.deduction);
    if (!health.deductionToSchedule1.eq(deduction) || !result.schedule1?.seHealthInsurance.eq(deduction)) {
      throw new Error('Reported repayment payment must transfer the actual deduction once.');
    }
    for (const [number, value] of [['24', d(0)], ['25', reportedAdvances], ['29', reportedAdvances]] as const) {
      const lines = credit.lines.filter(row => row.form === 'Form 8962' && row.line === number);
      if (lines.length !== 1 || !lines[0].value.eq(value)) throw new Error('Reported repayment payment disagrees with the final credit audit.');
    }
  }
  const audit = new AuditTrail();
  audit.record('Marketplace Reported Repayment', 'cost', 'Original eligible premium cost', originalEligiblePremiums,
    'Complete actual one-owner/business source; both premium components have the same health qualification');
  audit.record('Marketplace Reported Repayment', 'cash', 'Actual owner cash paid', actualCash,
    'Original per-person receipts; no inferred payer or PartIV payment share');
  audit.record('Marketplace Reported Repayment', 'advance', 'Exact original advances', exactSourceAdvances,
    'Original allocated source cents unchanged', { 'Reported advances': reportedAdvances, 'Unreported source remainder': unreportedAdvanceRemainder, 'Reporting excess': reportingExcess });
  audit.record('Marketplace Reported Repayment', 'paid', 'Eligible paid premium before business limit', eligiblePremiums,
    'min(original eligible premium, actual cash + reported repayment); final zero-credit proof is required',
    { 'Original eligible premium': originalEligiblePremiums, 'Actual cash': actualCash, 'Reported repayment': reportedAdvances });
  if (deduction) audit.record('Marketplace Reported Repayment', '17', 'Actual health deduction', deduction,
    'One completed own-business deduction transferred once');
  return { method: 'ordinary-reported-advance-repayment', stage, reportingMethod: credit.calculationMethod, planId: plan.planId!,
    businessSourceId: business.businessSourceId, accountHolder: business.accountHolder,
    originalEligiblePremiums, actualCash, exactSourceAdvances, reportedAdvances, unreportedAdvanceRemainder,
    reportingExcess, eligiblePremiums, finalCredit: credit.ptcAllowed, finalRepayment: credit.excessAPTCRepayment,
    deduction, lines: audit.getLines() };
}
