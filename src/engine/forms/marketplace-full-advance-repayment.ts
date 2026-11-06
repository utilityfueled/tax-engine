/** Derived zero-credit/full-repayment case. Spec: marketplace-full-advance-repayment.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult, CalculatedLine } from '@/models/outputs.js';
import { d, sum, roundDollar } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { getConstants } from '@/models/constants.js';
import { calculateScheduleC } from '@/engine/schedules/schedule-c.js';
import { calculateScheduleF } from '@/engine/schedules/schedule-f.js';
import { calculateScheduleSE } from '@/engine/schedules/schedule-se.js';
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
/** Source-only admission for the finite historical binding-owner method.
 * No credit, repayment, allowed deduction or spouse-capacity allocation is an
 * input. The completed canonical return below must still prove full repayment.
 * Spec: marketplace-binding-owner-full-repayment.yaml. */
export function hasBindingOwnerFullRepaymentSources(input: TaxYearInput): boolean {
  if (input.taxpayer.taxYear !== 2025 || input.taxpayer.filingStatus !== 'married_filing_jointly'
    || !input.taxpayer.spouse || input.taxpayer.dependents.length !== 0
    || !input.scheduleC || !input.scheduleF || input.scheduleC.accountHolder === input.scheduleF.accountHolder
    || !['primary', 'spouse'].includes(input.scheduleC.accountHolder ?? '')
    || !['primary', 'spouse'].includes(input.scheduleF.accountHolder ?? '')) return false;
  // This proof has fixed C/F income less actual SE halves and health. Do not
  // silently compose another income, deduction, exclusion or original-loss
  // method merely because a particular intermediate happens to be zero.
  const allowed = new Set(['taxpayer', 'scheduleC', 'scheduleF', 'form7206', 'form1095A', 'form8962',
    'form2210', 'standardDeductionFacts', 'deductionElection']);
  const emptyArrays = new Set(['w2s', 'form1099Int', 'form1099Div', 'form1099B', 'form1099DA', 'form1099Nec',
    'form1099Misc', 'form1099G', 'form1099OID', 'formW2G', 'form1099K', 'form1099C', 'form1099Q',
    'scheduleK1', 'scheduleK1Form1041', 'form1098', 'form1098E', 'donations', 'rentalProperties',
    'savingsBondRedemptions', 'form6252', 'form8814', 'homeSales', 'form8824']);
  if (Object.entries(input).some(([key, value]) => value !== undefined && !allowed.has(key)
    && !(emptyArrays.has(key) && Array.isArray(value) && value.length === 0))) return false;
  const facts = input.form7206, credit = input.form8962;
  if (!facts || facts.sourceTaxYear !== 2025 || facts.sourceFactsConfirmed !== true || facts.allPlansIncluded !== true
    || facts.plans?.length !== 2 || facts.persons?.length !== 2 || input.form1095A.length !== 2
    || facts.incomeDeductions || facts.marketplaceCreditAllocation || facts.domesticFarmSources
    || facts.partnershipGrossIncomeSources || (facts.longTermCareAllocations?.length ?? 0) !== 0
    || !credit || credit.taxFamilySize !== 2 || credit.allocationRequired !== false
    || credit.alternativeMarriageCalculationElected !== false || credit.qsehraAffected !== false
    || credit.lawfulPresenceReconciliationRequired !== false || credit.marriageSources || credit.sharedPolicyAllocations
    || credit.requiredFilingDependentsModifiedAGI === undefined || !d(credit.requiredFilingDependentsModifiedAGI).isZero()) return false;
  const amount = (value: string | null | undefined) => value !== undefined && value !== null && /^\d+(?:\.\d+)?$/.test(value) && d(value).isFinite();
  const zero = (value: string | undefined) => amount(value) && d(value).isZero();
  const fullYear = (rows: readonly { month?: number }[] | undefined) => rows?.length === 12
    && new Set(rows.map(row => row.month)).size === 12 && rows.every(row => row.month !== undefined && Number.isInteger(row.month) && row.month >= 1 && row.month <= 12);
  const seen = new Set<string>();
  for (const plan of facts.plans) {
    const owner = plan.accountHolder, business = plan.businessSourceId;
    if (!owner || !business || seen.has(business) || plan.businessKind !== 'self_employed' || plan.kind !== 'medical'
      || plan.marketplaceCoverage !== true || plan.premiumTaxCreditInvolved !== true
      || plan.allCoveredPersonsInCoverageFamilyConfirmed !== true || plan.coverageFamilySources || plan.sharedMarketplaceSources
      || plan.coveredPersons?.length !== 1 || plan.coveredPersons[0].relationshipToOwner !== 'self'
      || plan.marketplacePolicySourceIds?.length !== 1 || !fullYear(plan.months)
      || plan.months?.some(row => row.employerSubsidizedPlanEligible !== false)
      || (business !== 'scheduleC' && business !== 'scheduleF') || input[business]?.accountHolder !== owner) return false;
    seen.add(business);
    const person = facts.persons.find(row => row.personId === plan.coveredPersons![0].personId);
    if (!person || person.householdRole !== owner) return false;
    const id = plan.marketplacePolicySourceIds[0];
    if (!/^form1095A:[01]$/.test(id)) return false;
    const policy = input.form1095A[Number(id.slice('form1095A:'.length))];
    if (!policy || policy.sourceFactsComplete !== true || policy.taxYear !== 2025 || !fullYear(policy.monthlyPremiums)) return false;
    const first = policy.monthlyPremiums[0];
    if (!amount(first.enrolleePremium) || !d(first.enrolleePremium).gt(0) || !amount(first.slcsp)) return false;
    if (policy.monthlyPremiums.some(row => !amount(row.advancePremiumTaxCredit) || !d(row.advancePremiumTaxCredit).eq(d(first.enrolleePremium))
      || !d(row.enrolleePremium).eq(d(first.enrolleePremium)) || !amount(row.slcsp) || !d(row.slcsp).eq(d(first.slcsp)))) return false;
    if (plan.payments?.length !== 12 || new Set(plan.payments.map(row => row.coverageMonth)).size !== 12) return false;
    for (const payment of plan.payments) {
      const original = policy.monthlyPremiums.find(row => row.month === payment.coverageMonth);
      const personPayment = payment.personAmounts?.[0];
      if (!original || payment.coverageTaxYear !== 2025 || !payment.datePaid?.startsWith('2025-')
        || !amount(payment.grossPremium) || !d(payment.grossPremium).eq(d(original.enrolleePremium))
        || !amount(payment.advancePremiumTaxCredit) || !d(payment.advancePremiumTaxCredit).eq(d(original.enrolleePremium))
        || !zero(payment.ownerOrBusinessPaid) || !zero(payment.otherPersonPaid) || payment.personAmounts?.length !== 1
        || !personPayment || personPayment.personId !== person.personId || personPayment.payer !== 'owner_after_tax'
        || !zero(personPayment.amountPaid) || !zero(personPayment.excludedPublicSafetyOfficerAmount) || !zero(personPayment.otherTaxFreeFunding)
        || !amount(personPayment.advancePremiumTaxCredit) || !d(personPayment.advancePremiumTaxCredit).eq(d(original.enrolleePremium))) return false;
    }
  }
  if (seen.size !== 2 || new Set(facts.plans.map(plan => plan.marketplacePolicySourceIds![0])).size !== 2) return false;
  const c = calculateScheduleC(input, input.scheduleC), f = calculateScheduleF(input.scheduleF);
  if (!c.netProfit.gt(0) || !f.netFarmProfit.gt(0)) return false;
  const payroll = calculateScheduleSE(input, getConstants(2025), c.netProfit, f.netFarmProfit);
  if (!payroll.sourceFactsVerified || payroll.perTaxpayer.length !== 2) return false;
  // Exactly one positive C/F source belongs to each owner in this cohort.
  // Reuse actual canonical SE halves, never a household earnings share.
  return facts.plans.some(plan => {
    const owners = payroll.perTaxpayer.filter(row => row.accountHolder === plan.accountHolder);
    if (owners.length !== 1) return false;
    const income = plan.businessSourceId === 'scheduleC' ? c.netProfit : f.netFarmProfit;
    const premiums = sum(...plan.payments!.map(row => d(row.grossPremium)));
    return income.minus(owners[0].deductibleHalf).lt(premiums);
  });
}

/** The caller supplies a completed canonical return, not a proposed tax scalar.
 * Review callers must first rebind its original income and policy context. */
export function calculateMarketplaceFullAdvanceRepayment(input: TaxYearInput, result: TaxReturnResult): MarketplaceFullRepaymentHealthResult {
  const families = calculateMarketplaceCoverageFamilySources(input);
  const bindingOwners = hasBindingOwnerFullRepaymentSources(input);
  if (!bindingOwners && !families?.some(plan => plan.months.some(row => row.ownNoncoverageAdvance.gt(0)))) throw new Error('Full advance repayment requires actual positive noncoverage advances or the complete finite binding-owner sources.');
  calculateMarketplaceCoverageFamilyHealth(input, 'full-repayment-candidate');
  if (input.form8962?.alternativeMarriageCalculationElected !== false) throw new Error('Full advance repayment requires its separate actual marriage coordination method.');
  const health = result.form7206, credit = result.form8962;
  if (result.taxYear !== input.taxpayer.taxYear || !health?.calculationComplete || !health.sourceFactsVerified
    || health.marketplaceHandling !== 'full-advance-repayment' || !credit?.sourceFactsVerified || credit.orderedDeductionInterim
    || credit.taxYear !== input.taxpayer.taxYear || !credit.ptcAllowed.isZero() || !credit.netPTC.isZero()) throw new Error(bindingOwners
      ? 'Pub974 binding owner earned-income limits with historical advances require the separate capped-repayment coordination method unless actual final credit is zero and every advance is repaid.'
      : 'Full advance repayment requires actual zero final credit after the ordinary deduction.');
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
    || !credit.excessAPTCRepayment.eq(reportedAdvances) || !credit.excessAPTCRepayment.eq(exactSourceAdvances)) throw new Error(bindingOwners
      ? 'Pub974 binding owner earned-income limits with historical advances require the separate capped-repayment coordination method unless every original advance is repaid; partial, capped or source-cent differences remain separate.'
      : 'Full advance repayment requires every original advance repaid; partial, capped or source-cent differences need their separate payment attribution method.');
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
  if (bindingOwners) {
    // M is the ordinary, separately limited and reported business transfer.
    // Thus this canonical income is B-M, the lowest income in the admitted
    // fixed-income interval. Above400 alone does not prove zero2025 credit;
    // the completed zero-credit/full-repayment reconciliation above also must pass.
    const fixedIncome = sum(...health.businesses.map(row => {
      if (!row.netIncome?.isFinite() || !row.netIncome.gt(0) || !row.allocatedSelfEmploymentTax?.isFinite()
        || row.allocatedSelfEmploymentTax.lt(0)) throw new Error('Binding-owner full repayment requires actual positive C/F income and separate owner SE deductions.');
      return row.netIncome.minus(row.allocatedSelfEmploymentTax);
    }));
    // The canonical return wrapper extends the general low-level8962 result.
    // Validate its actual property; do not cast a general result into that proof.
    const taxpayerMagi = 'canonicalTaxpayerModifiedAGI' in credit ? credit.canonicalTaxpayerModifiedAGI : undefined;
    if (health.businesses.length !== 2 || !result.agi.eq(fixedIncome.minus(deduction))
      || !Decimal.isDecimal(taxpayerMagi) || !taxpayerMagi.isFinite() || !taxpayerMagi.eq(result.agi) || !credit.modifiedAGI.eq(result.agi)
      || !credit.federalPovertyLine.isFinite() || !credit.federalPovertyLine.gt(0)
      || result.agi.lt(credit.federalPovertyLine.times(4))) throw new Error('Binding-owner full repayment requires its independently fixed minimum household income at or above400percent of the actual poverty line.');
  }
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
