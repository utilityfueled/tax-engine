/** Actual cash is not a PartIV allocation. Spec: marketplace-actual-cash-health.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine, TaxReturnResult } from '@/models/outputs.js';
import { d, sum, roundDollar } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { calculateMarketplaceCoverageFamilyHealth } from './marketplace-coverage-family-health.js';
import { calculateSharedMarketplaceHealthSources, type SharedMarketplaceHealthInput } from './shared-marketplace-health.js';

export interface MarketplaceActualCashMonth {
  planId: string; month: number; taxFamilyPremium: Decimal;
  specifiedPremium: Decimal; nonspecifiedPremium: Decimal;
  actualSpecifiedCash: Decimal; actualNonspecifiedCash: Decimal;
  actualOutsideCash: Decimal; outsidePremiumPool: Decimal;
}
export interface MarketplaceActualCashHealthResult {
  method: 'ordinary-actual-cash-zero-credit';
  months: MarketplaceActualCashMonth[];
  finalCredit: Decimal; finalRepayment: Decimal; deduction: Decimal;
  businesses: { businessSourceId: string; accountHolder: 'primary' | 'spouse'; eligiblePremiums: Decimal; earnedIncomeLimit: Decimal; deduction: Decimal }[];
  lines: CalculatedLine[];
}

/** Existing complete original/person/receipt sources establish applicability.
 * This source-only result is not permission to claim a deduction or a credit. */
export function calculateMarketplaceActualCashSources(input: SharedMarketplaceHealthInput): MarketplaceActualCashMonth[] | undefined {
  const families = calculateMarketplaceCoverageFamilySources(input);
  if (!families) return undefined;
  const allocations = calculateMarketplaceCoverageFamilyHealth(input, 'actual-cash-candidate')!;
  const months = allocations.map(row => {
    const actual = families.find(plan => plan.planId === row.planId)!.months.find(month => month.month === row.month)!;
    return { planId: row.planId, month: row.month, taxFamilyPremium: row.taxFamilyPremium,
      specifiedPremium: row.specifiedPremium, nonspecifiedPremium: row.nonspecifiedPremium,
      actualSpecifiedCash: actual.ownCoverageCash, actualNonspecifiedCash: actual.ownNoncoverageCash,
      actualOutsideCash: actual.outsideCash, outsidePremiumPool: row.outsidePremiumPool };
  });
  if (!allocations.some(row => {
    const actual = families.find(plan => plan.planId === row.planId)!.months.find(month => month.month === row.month)!;
    return !actual.ownCash.plus(actual.ownAdvance).eq(row.taxFamilyPremium);
  })) return undefined;
  const plans = input.form7206!.plans!.filter(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true);
  if (plans.some(plan => !families.some(source => source.planId === plan.planId))) throw new Error('Actual cash health needs complete monthly coverage-family and payment sources for every actual Marketplace plan.');
  for (const policy of input.form1095A) for (const row of policy.monthlyPremiums) {
    if (row.advancePremiumTaxCredit === undefined || !/^\d+(?:\.\d+)?$/.test(row.advancePremiumTaxCredit)
      || !d(row.advancePremiumTaxCredit).isFinite() || !d(row.advancePremiumTaxCredit).isZero()) throw new Error('Actual cash health requires known zero original advances; positive advances require their separate payment method.');
  }
  for (const row of months) if (row.actualSpecifiedCash.gt(row.specifiedPremium) || row.actualNonspecifiedCash.gt(row.nonspecifiedPremium)) throw new Error('Actual cash component exceeds its independently allocated premium pool.');
  calculateSharedMarketplaceHealthSources(input);
  return months;
}

/** Only a completed actual return can prove the sufficient zero-credit case. */
export function calculateMarketplaceActualCashHealth(input: TaxYearInput, result: TaxReturnResult): MarketplaceActualCashHealthResult {
  const months = calculateMarketplaceActualCashSources(input);
  if (!months || input.form8962?.alternativeMarriageCalculationElected !== false) throw new Error('Actual cash health requires its original source and separate marriage method.');
  const health = result.form7206, credit = result.form8962;
  if (result.taxYear !== input.taxpayer.taxYear || !health?.calculationComplete || !health.sourceFactsVerified
    || health.marketplaceHandling !== 'actual-cash-zero-credit' || !credit?.sourceFactsVerified || credit.orderedDeductionInterim
    || credit.taxYear !== input.taxpayer.taxYear || !credit.ptcAllowed.isZero() || !credit.netPTC.isZero()
    || !credit.advancePTCTotal.isZero() || !credit.excessAPTC.isZero() || !credit.excessAPTCRepayment.isZero()) throw new Error('Actual cash health requires zero final credit and no advances after the actual ordinary deduction; a positive credit requires its separate payment method.');
  for (const number of ['24', '25', '29']) {
    const rows = credit.lines.filter(row => row.form === 'Form 8962' && row.line === number);
    if (rows.length !== 1 || !rows[0].value.isZero()) throw new Error('Actual cash health proof requires the unique completed zero-credit audit.');
  }
  const businesses = health.businesses.map(row => {
    if (!row.earnedIncomeLimit || !row.deduction || !row.eligiblePremiums.isFinite() || row.eligiblePremiums.lt(0)
      || !row.earnedIncomeLimit.isFinite() || row.earnedIncomeLimit.lt(0) || !row.deduction.isFinite() || row.deduction.lt(0)
      || !row.deduction.eq(row.eligiblePremiums.lte(row.earnedIncomeLimit) ? row.eligiblePremiums : row.earnedIncomeLimit)) throw new Error('Actual cash health needs each completed own-business ordinary deduction.');
    return { businessSourceId: row.businessSourceId, accountHolder: row.accountHolder, eligiblePremiums: row.eligiblePremiums,
      earnedIncomeLimit: row.earnedIncomeLimit, deduction: row.deduction };
  });
  const deduction = sum(...businesses.map(row => roundDollar(row.deduction)));
  if (!health.deductionToSchedule1.eq(deduction) || !result.schedule1?.seHealthInsurance.eq(deduction)) throw new Error('Actual cash health does not reconcile its once-only Schedule1 transfer.');
  const audit = new AuditTrail();
  for (const row of months) {
    audit.record('Marketplace Actual Cash', `${row.planId}:${row.month}:specified`, 'Actual coverage-family cash', row.actualSpecifiedCash,
      'Actual owner/business cash, independently bounded by allocated specified premium', { 'Plan': row.planId, 'Month': String(row.month), 'Specified premium pool': row.specifiedPremium, 'Tax-family premium': row.taxFamilyPremium });
    audit.record('Marketplace Actual Cash', `${row.planId}:${row.month}:nonspecified`, 'Actual noncoverage-family cash', row.actualNonspecifiedCash,
      'Actual owner/business cash, independently bounded by allocated nonspecified premium', { 'Plan': row.planId, 'Month': String(row.month), 'Nonspecified premium pool': row.nonspecifiedPremium });
    audit.record('Marketplace Actual Cash', `${row.planId}:${row.month}:outside`, 'Actual cash for people outside the tax family', row.actualOutsideCash,
      'Original cash only; each person separately qualifies under Form7206 before business limits', { 'Plan': row.planId, 'Month': String(row.month), 'Outside premium pool': row.outsidePremiumPool });
  }
  audit.record('Marketplace Actual Cash', '24', 'Actual final premium tax credit', credit.ptcAllowed, 'Completed actual ordinary deduction; no entered credit or hypothetical income');
  audit.record('Marketplace Actual Cash', '29', 'Actual advance repayment', credit.excessAPTCRepayment, 'All original advances explicitly zero');
  audit.record('Marketplace Actual Cash', '17', 'Actual Schedule1 health deduction', deduction, 'Actual qualified cash subject to each own-business limit; one transfer');
  return { method: 'ordinary-actual-cash-zero-credit', months, finalCredit: credit.ptcAllowed, finalRepayment: credit.excessAPTCRepayment, deduction, businesses, lines: audit.getLines() };
}
