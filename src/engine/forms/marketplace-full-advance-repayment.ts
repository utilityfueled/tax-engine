/** Derived zero-credit/full-repayment case. Spec: marketplace-full-advance-repayment.yaml. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult, CalculatedLine } from '@/models/outputs.js';
import { d, sum, roundDollar } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateMarketplaceCoverageFamilySources } from './marketplace-coverage-family-sources.js';
import { calculateMarketplaceCoverageFamilyHealth } from './marketplace-coverage-family-health.js';
import { calculateForm8962SharedPolicy } from './form-8962-shared-policy.js';

export interface MarketplaceFullRepaymentHealthResult {
  method: 'ordinary-full-advance-repayment';
  exactSourceAdvances: Decimal;
  reportedAdvances: Decimal;
  finalCredit: Decimal;
  finalRepayment: Decimal;
  deduction: Decimal;
  businesses: { businessSourceId: string; accountHolder: 'primary' | 'spouse'; eligiblePremiums: Decimal; earnedIncomeLimit: Decimal; deduction: Decimal }[];
  lines: CalculatedLine[];
}
/** The caller supplies a completed canonical return, not a proposed tax scalar.
 * Review callers must first rebind its original income and policy context. */
export function calculateMarketplaceFullAdvanceRepayment(input: TaxYearInput, result: TaxReturnResult): MarketplaceFullRepaymentHealthResult {
  const families = calculateMarketplaceCoverageFamilySources(input);
  if (!families?.some(plan => plan.months.some(row => row.ownNoncoverageAdvance.gt(0)))) throw new Error('Full advance repayment requires actual positive noncoverage advances.');
  calculateMarketplaceCoverageFamilyHealth(input, 'full-repayment-candidate');
  if (input.form8962?.alternativeMarriageCalculationElected !== false) throw new Error('Full advance repayment requires its separate actual marriage coordination method.');
  const health = result.form7206, credit = result.form8962;
  if (result.taxYear !== input.taxpayer.taxYear || !health?.calculationComplete || !health.sourceFactsVerified
    || health.marketplaceHandling !== 'full-advance-repayment' || !credit?.sourceFactsVerified || credit.orderedDeductionInterim
    || credit.taxYear !== input.taxpayer.taxYear || !credit.ptcAllowed.isZero() || !credit.netPTC.isZero()) throw new Error('Full advance repayment requires actual zero final credit after the ordinary deduction.');
  const allocated = input.form8962?.allocationRequired === true ? calculateForm8962SharedPolicy(input) : undefined;
  const months = new Map<number, Decimal>();
  if (allocated) for (const row of allocated.householdMonths) months.set(row.month, row.advance);
  else for (const policy of input.form1095A) for (const row of policy.monthlyPremiums) {
    if (row.advancePremiumTaxCredit === undefined || !d(row.advancePremiumTaxCredit).isFinite() || d(row.advancePremiumTaxCredit).lt(0)) throw new Error('Full advance repayment needs actual original monthly advances.');
    months.set(row.month, (months.get(row.month) ?? d(0)).plus(d(row.advancePremiumTaxCredit)));
  }
  const exactSourceAdvances = sum(...months.values());
  const reportedAdvances = credit.calculationMethod === 'annual' ? roundDollar(exactSourceAdvances)
    : sum(...[...months.values()].map(roundDollar));
  if (!reportedAdvances.gt(0) || !credit.advancePTCTotal.eq(reportedAdvances) || !credit.excessAPTC.eq(reportedAdvances)
    || !credit.excessAPTCRepayment.eq(reportedAdvances) || !credit.excessAPTCRepayment.eq(exactSourceAdvances)) throw new Error('Full advance repayment requires every original advance repaid; partial, capped or source-cent differences need their separate payment attribution method.');
  for (const [number, value] of [['24', d(0)], ['25', reportedAdvances], ['29', reportedAdvances]] as const) {
    const rows = credit.lines.filter(row => row.form === 'Form 8962' && row.line === number);
    if (rows.length !== 1 || !rows[0].value.eq(value)) throw new Error('Full advance repayment proof does not reconcile the actual final credit audit.');
  }
  const businesses = health.businesses.map(row => {
    if (!row.earnedIncomeLimit || !row.deduction || !row.eligiblePremiums.isFinite() || row.eligiblePremiums.lt(0)
      || !row.earnedIncomeLimit.isFinite() || row.earnedIncomeLimit.lt(0) || !row.deduction.isFinite() || row.deduction.lt(0)
      || !row.deduction.eq(row.eligiblePremiums.lte(row.earnedIncomeLimit) ? row.eligiblePremiums : row.earnedIncomeLimit)) throw new Error('Full advance repayment requires each actual own-business ordinary deduction.');
    return { businessSourceId: row.businessSourceId, accountHolder: row.accountHolder, eligiblePremiums: row.eligiblePremiums,
      earnedIncomeLimit: row.earnedIncomeLimit, deduction: row.deduction };
  });
  const deduction = sum(...businesses.map(row => roundDollar(row.deduction)));
  if (!health.deductionToSchedule1.eq(deduction) || !result.schedule1?.seHealthInsurance.eq(deduction)) throw new Error('Full advance repayment deduction does not reconcile its actual once-only return transfer.');
  const audit = new AuditTrail();
  audit.record('Marketplace Full Advance Repayment', '24', 'Actual final premium tax credit', credit.ptcAllowed, 'Completed ordinary return with actual health deduction; no current-tax override');
  audit.record('Marketplace Full Advance Repayment', '25', 'All original reported advances', reportedAdvances, 'Original allocated source amounts under actual annual or monthly8962 rounding', { 'Exact original advances': exactSourceAdvances });
  audit.record('Marketplace Full Advance Repayment', '29', 'Actual full repayment', credit.excessAPTCRepayment, 'Zero final credit and every actual advance repaid; no partial source allocation');
  for (const row of businesses) audit.record('Marketplace Full Advance Repayment', row.businessSourceId, 'Actual ordinary business deduction', row.deduction,
    'min(actual eligible premiums, actual own business earned-income limit)', { 'Owner': row.accountHolder, 'Eligible premiums': row.eligiblePremiums, 'Earned-income limit': row.earnedIncomeLimit });
  audit.record('Marketplace Full Advance Repayment', '17', 'Schedule1 health deduction', deduction, 'Sum actual separate ordinary business transfers, once');
  return { method: 'ordinary-full-advance-repayment', exactSourceAdvances, reportedAdvances, finalCredit: credit.ptcAllowed,
    finalRepayment: credit.excessAPTCRepayment, deduction, businesses, lines: audit.getLines() };
}
