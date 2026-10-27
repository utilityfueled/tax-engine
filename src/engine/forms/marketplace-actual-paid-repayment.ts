/** Actual payer/repayment composition. Spec: marketplace-actual-paid-repayment.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import { d, sum, roundDollar } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateMarketplaceMarriageHealth } from './marketplace-marriage-health.js';
import { calculateForm7206 } from './form-7206.js';
import { calculateMarketplaceActualPaidSources } from './marketplace-actual-paid-sources.js';

/** Internal canonical reporting adjustment, never an input schema or election. */
export interface MarketplaceActualPaidAdjustment {
  accountHolder: 'primary' | 'spouse'; businessSourceId: string;
  reportingMethod: 'annual' | 'monthly';
  originalEligiblePremiums: Decimal; actualCash: Decimal;
  exactSourceAdvances: Decimal; reportedAdvances: Decimal; eligiblePremiums: Decimal;
}
export interface MarketplaceActualPaidRepaymentResult {
  method: 'ordinary-actual-paid-repayment'; stage: 'candidate' | 'final';
  originalPolicyAdvances: Decimal; exactSourceAdvances: Decimal; reportedAdvances: Decimal;
  unreportedAdvanceRemainder: Decimal; reportingExcess: Decimal;
  finalCredit: Decimal; finalRepayment: Decimal; deduction?: Decimal;
  reportedPayment?: MarketplaceActualPaidAdjustment;
  months: NonNullable<ReturnType<typeof calculateMarketplaceActualPaidSources>>['months'];
  lines: CalculatedLine[];
}

/** An internally proposed payment becomes deductible only after this final proof. */
export function calculateMarketplaceActualPaidRepayment(input: TaxYearInput, result: TaxReturnResult,
  stage: 'candidate' | 'final' = 'final'): MarketplaceActualPaidRepaymentResult {
  const sources = calculateMarketplaceActualPaidSources(input), credit = result.form8962, health = result.form7206;
  if (!sources || !credit?.sourceFactsVerified || credit.orderedDeductionInterim
    || credit.taxYear !== input.taxpayer.taxYear || result.taxYear !== input.taxpayer.taxYear
    || !health?.sourceFactsVerified || !health.calculationComplete || health.marketplaceHandling !== 'actual-paid-repayment') {
    throw new Error('Actual paid repayment requires its completed canonical source and calculation.');
  }
  const monthly = new Map<number, Decimal>();
  for (const row of sources.months) monthly.set(row.month, (monthly.get(row.month) ?? d(0)).plus(row.advancePremiumTaxCredit));
  const reportedAdvances = credit.calculationMethod === 'annual' ? roundDollar(sources.exactSourceAdvances) : sum(...[...monthly.values()].map(roundDollar));
  if (!credit.advancePTCTotal.eq(reportedAdvances)) throw new Error('Actual paid repayment must preserve this return\'s independently allocated reported advances.');
  const original = calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    facts: input.form7206!, marketplaceSourceInput: input, marketplaceHandling: 'actual-paid-repayment' });
  let reportedPayment: MarketplaceActualPaidAdjustment | undefined;
  if (!reportedAdvances.eq(sources.exactSourceAdvances)) {
    const business = original.businesses[0];
    const actualCash = sum(...sources.months.map(row => row.actualSpecifiedCash.plus(row.actualNonspecifiedCash).plus(row.actualOutsideCash)));
    const originalEligiblePremiums = actualCash.plus(sources.exactSourceAdvances);
    if (input.form7206!.plans!.length !== 1 || original.businesses.length !== 1 || !business
      || !business.longTermCarePremiums.isZero() || !business.eligiblePremiums.eq(originalEligiblePremiums)) {
      throw new Error('Reported actual payment cents require a single fully eligible owner/business cost pool.');
    }
    reportedPayment = { accountHolder: business.accountHolder, businessSourceId: business.businessSourceId, reportingMethod: credit.calculationMethod,
      originalEligiblePremiums, actualCash, exactSourceAdvances: sources.exactSourceAdvances, reportedAdvances,
      eligiblePremiums: Decimal.min(originalEligiblePremiums, actualCash.plus(reportedAdvances)) };
  }
  let deduction: Decimal | undefined;
  if (stage === 'final') {
    if (!credit.ptcAllowed.isZero() || !credit.netPTC.isZero() || !credit.excessAPTC.eq(reportedAdvances)
      || !credit.excessAPTCRepayment.eq(reportedAdvances)) {
      throw new Error('Actual paid repayment requires zero final credit and full reported own-return repayment after the actual deduction.');
    }
    calculateMarketplaceMarriageHealth({ input, credit });
    const expected = reportedPayment ? calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
      facts: input.form7206!, marketplaceSourceInput: input, marketplaceHandling: 'actual-paid-repayment', actualPaidAdjustment: reportedPayment }) : original;
    if (health.businesses.length !== expected.businesses.length) throw new Error('Actual paid repayment business source count changed.');
    for (const business of health.businesses) {
      const source = expected.businesses.find(row => row.accountHolder === business.accountHolder && row.businessSourceId === business.businessSourceId);
      if (!source || !source.eligiblePremiums.eq(business.eligiblePremiums) || !business.earnedIncomeLimit || !business.deduction
        || !business.earnedIncomeLimit.isFinite() || business.earnedIncomeLimit.lt(0)
        || !business.deduction.eq(Decimal.min(source.eligiblePremiums, business.earnedIncomeLimit))) {
        throw new Error('Actual paid repayment does not reconcile the original eligible cost and own-business limit.');
      }
    }
    deduction = sum(...health.businesses.map(row => roundDollar(row.deduction!)));
    if (!health.deductionToSchedule1.eq(deduction) || !result.schedule1?.seHealthInsurance.eq(deduction)) throw new Error('Actual paid repayment deduction must transfer once.');
    for (const [number, value] of [['24', d(0)], ['25', reportedAdvances], ['29', reportedAdvances]] as const) {
      const lines = credit.lines.filter(row => row.form === 'Form 8962' && row.line === number);
      if (lines.length !== 1 || !lines[0].value.eq(value)) throw new Error('Actual paid repayment requires the unique completed credit audit.');
    }
  }
  const unreportedAdvanceRemainder = Decimal.max(0, sources.exactSourceAdvances.minus(reportedAdvances));
  const reportingExcess = Decimal.max(0, reportedAdvances.minus(sources.exactSourceAdvances));
  const audit = new AuditTrail();
  audit.record('Marketplace Actual Paid Repayment', 'original', 'All original policy advances', sources.originalPolicyAdvances,
    'Full original sources retained; advances attributable to another return never become this owner\'s payment');
  audit.record('Marketplace Actual Paid Repayment', 'own', 'Exact advances attributable to this return', sources.exactSourceAdvances,
    'Independent Part IV and actual person records agree', { 'Reported advances': reportedAdvances, 'Unpaid source remainder': unreportedAdvanceRemainder, 'Reporting excess': reportingExcess });
  for (const row of sources.months) audit.record('Marketplace Actual Paid Repayment', `${row.planId}:${row.month}`, 'Actual owner cash and own-return advances',
    row.actualSpecifiedCash.plus(row.actualNonspecifiedCash).plus(row.advancePremiumTaxCredit),
    'Actual source costs remain distinct from independently allocated premium pools; final repayment proof required',
    { 'Plan': row.planId, 'Month': String(row.month), 'Tax-family premium': row.taxFamilyPremium, 'Specified pool': row.specifiedPremium,
      'Specified cash': row.actualSpecifiedCash, 'Specified advance': row.actualSpecifiedAdvance, 'Nonspecified pool': row.nonspecifiedPremium,
      'Nonspecified cash': row.actualNonspecifiedCash, 'Nonspecified advance': row.actualNonspecifiedAdvance });
  if (reportedPayment) audit.record('Marketplace Actual Paid Repayment', 'paid', 'Single eligible actual paid cost', reportedPayment.eligiblePremiums,
    'min(original actual eligible cost, actual cash + reported repayment); no expense from rounding up',
    { 'Original eligible cost': reportedPayment.originalEligiblePremiums, 'Actual cash': reportedPayment.actualCash, 'Reported repayment': reportedAdvances });
  if (deduction !== undefined) audit.record('Marketplace Actual Paid Repayment', '17', 'Actual Schedule1 health deduction', deduction,
    'Actual qualified person costs and own-business limits, transferred once after final zero-credit/full-repayment proof');
  return { method: 'ordinary-actual-paid-repayment', stage, ...sources, reportedAdvances, unreportedAdvanceRemainder,
    reportingExcess, finalCredit: credit.ptcAllowed, finalRepayment: credit.excessAPTCRepayment, deduction, reportedPayment, lines: audit.getLines() };
}
