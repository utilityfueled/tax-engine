import Decimal from "decimal.js";
import type { GuidedFlowState } from "./guided-interview-flow";
import type { HealthInsuranceData } from "./guided-health-insurance-facts";
import { buildPremiumTaxCreditInputs, type MarketplacePolicyData } from "./guided-premium-tax-credit-facts";
import { parseGuidedCurrency } from "./guided-currency";

export interface MarketplacePolicyOption { sourceId: string; label: string }
export function marketplacePolicyOptions(policies: MarketplacePolicyData[] = []): MarketplacePolicyOption[] {
  return policies.map((policy, index) => ({ sourceId: `form1095A:${index}`, label: `${policy.marketplace?.trim() || "Marketplace not entered"} — ${policy.policyNumber?.trim() || "policy number not entered"} (${policy.taxYear?.trim() || "year unknown"})` }));
}
function amount(value: string | undefined): Decimal {
  if (!value?.trim()) throw new Error("Enter each actual Marketplace premium and advance amount, including known zero.");
  const result = parseGuidedCurrency(value);
  if (!result.isFinite() || result.lt(0)) throw new Error("Marketplace source amounts must be finite and nonnegative.");
  return result;
}
/** Source reconciliation only; never supplies business income or a proposed credit. */
export function validateMarketplaceHealthSources(state: GuidedFlowState, health: HealthInsuranceData): void {
  const plans = health.plans.filter(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true);
  if (!plans.length) return;
  const coverage = buildPremiumTaxCreditInputs(state.sectionData.credits?.premiumTaxCredit, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"]);
  if (!coverage.form1095A || !coverage.form8962 || coverage.form8962.selfEmployedHealthInsuranceCoordinationRequired !== true) throw new Error("Enter and confirm the actual Marketplace policy and coverage worksheet in credits before linking health premiums.");
  if (coverage.form8962.qsehraAffected !== false) throw new Error("Marketplace health deduction with QSEHRA requires its separate actual coordination worksheet.");
  const used = new Set<string>();
  const totals = new Map<number, { premium: Decimal; advance: Decimal }>();
  for (const plan of plans) {
    if (plan.allCoveredPersonsInCoverageFamilyConfirmed !== true) throw new Error("Confirm actual coverage-family membership; mixed or unknown coverage requires a separate allocation worksheet.");
    if (!plan.marketplacePolicySourceIds?.length) throw new Error("Link the health plan to its actual original Marketplace policies.");
    const original = new Map<number, { premium: Decimal; advance: Decimal }>();
    for (const id of plan.marketplacePolicySourceIds) {
      const digits = /^form1095A:(\d+)$/.exec(id)?.[1];
      const policy = digits === undefined ? undefined : coverage.form1095A[Number(digits)];
      if (!policy || id !== `form1095A:${Number(digits)}` || used.has(id)) throw new Error("Reconcile unique original Marketplace policy source links.");
      used.add(id);
      for (const row of policy.monthlyPremiums) {
        const sum = original.get(row.month) ?? { premium: new Decimal(0), advance: new Decimal(0) };
        sum.premium = sum.premium.plus(row.enrolleePremium); sum.advance = sum.advance.plus(row.advancePremiumTaxCredit); original.set(row.month, sum);
      }
    }
    const payments = new Map<number, { premium: Decimal; advance: Decimal }>();
    for (const payment of plan.payments) {
      if (payment.coverageTaxYear !== String(state.taxYear) || !payment.datePaid.startsWith(`${state.taxYear}-`) || !/^(?:[1-9]|1[0-2])$/.test(payment.coverageMonth)) throw new Error("Marketplace health premiums require actual current-year payment and coverage dates; other timing requires a separate worksheet.");
      if (!amount(payment.otherPersonPaid).isZero() || payment.personAmounts.some(person => !amount(person.otherTaxFreeFunding).isZero() || !amount(person.excludedPublicSafetyOfficerAmount).isZero())) throw new Error("Marketplace outside-payer or separate tax-free funding requires its actual deduction allocation worksheet.");
      const month = Number(payment.coverageMonth), sum = payments.get(month) ?? { premium: new Decimal(0), advance: new Decimal(0) };
      sum.premium = sum.premium.plus(amount(payment.grossPremium)); sum.advance = sum.advance.plus(amount(payment.advancePremiumTaxCredit)); payments.set(month, sum);
    }
    if (original.size !== payments.size) throw new Error("Reconcile every actual Marketplace policy month with its premium payments.");
    for (const [month, source] of original) {
      const paid = payments.get(month);
      if (!paid || !paid.premium.eq(source.premium) || !paid.advance.eq(source.advance)) throw new Error("Marketplace policy premiums and advances must equal the actual linked payments for each month.");
      const employer = plan.months.find(row => row.month === String(month));
      if (!employer || typeof employer.employerSubsidizedPlanEligible !== "boolean") throw new Error("Confirm actual employer-plan eligibility for each Marketplace premium month.");
      if (employer.employerCoverageEnrolled === true) throw new Error("Actual employer coverage enrollment contradicts credit-eligible coverage-family sources.");
      if (employer.employerSubsidizedPlanEligible && (employer.employerCoverageEnrolled !== false || !employer.employerOfferSourceReference?.trim() || !["unaffordable", "does_not_provide_minimum_value"].includes(employer.employerOfferPtcException ?? ""))) throw new Error("Reconcile actual employer affordability or minimum-value evidence and no enrollment before using the PTC coverage exception.");
      const total = totals.get(month) ?? { premium: new Decimal(0), advance: new Decimal(0) };
      total.premium = total.premium.plus(source.premium); total.advance = total.advance.plus(source.advance); totals.set(month, total);
    }
  }
  for (const [month, total] of totals) {
    const actual = coverage.form8962.monthlyReconciliation?.find(row => row.month === month);
    if (!actual || actual.coverageEligible !== true || actual.incomeBasedSepEnrollment !== false || new Decimal(actual.enrolleePremium).lt(total.premium) || new Decimal(actual.advancePremiumTaxCredit).lt(total.advance)) throw new Error("Marketplace health sources require the actual eligible household month and separate coordination for ineligible or mixed coverage.");
  }
}
