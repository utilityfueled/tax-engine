/** Actual Pub974 premium links. Spec: spec/federal/marketplace-health-premiums.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form7206Result } from "./form-7206.js";
import { d, sum } from "@/utils/decimal.js";
import { calculateSharedMarketplaceHealthSources } from "./shared-marketplace-health.js";

export interface MarketplaceHealthPremiumGroup {
  businessSourceId: string;
  accountHolder: "primary" | "spouse";
  specifiedPremiums: Decimal;
  remainingEarnedIncome: Decimal;
  nonspecifiedDeduction: Decimal;
  months: { month: number; specifiedPremium: Decimal; sourcePremium: Decimal; advancePremiumTaxCredit: Decimal }[];
}
function actual(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error("Marketplace premium source amounts must be actual finite nonnegative amounts, including known zero.");
  return d(value);
}
function remainingIncome(business: Form7206Result["businesses"][number]): Decimal {
  const income = business.kind === "s_corporation" ? business.sCorporationMedicareWages : business.incomeAfterRetirement;
  if (income === undefined || business.attributableForeignExclusion === undefined || business.deduction === undefined) throw new Error("Marketplace WorksheetW requires actual signed business income sources.");
  const result = income.minus(business.attributableForeignExclusion).minus(business.deduction);
  if (!result.isFinite()) throw new Error("Marketplace WorksheetW requires finite actual business income.");
  return result;
}
export function calculateMarketplaceHealthPremiums(params: { input: TaxYearInput; healthInsurance: Form7206Result }) {
  const { input, healthInsurance } = params;
  if (![2025,2026].includes(input.taxpayer.taxYear) || !input.form7206 || !input.form8962 || !healthInsurance.calculationComplete) throw new Error("Actual Marketplace premium coordination requires completed2025 or2026 source and business worksheets.");
  const facts = input.form8962;
  if (facts.selfEmployedHealthInsuranceCoordinationRequired !== true || facts.coverageFactsConfirmed !== true || typeof facts.allocationRequired !== 'boolean' || facts.qsehraAffected !== false) throw new Error("Marketplace source coordination requires actual coverage facts and separate special allocations when applicable.");
  const sharedPlans = calculateSharedMarketplaceHealthSources(input);
  const groups = new Map<string, MarketplaceHealthPremiumGroup>();
  const usedPolicies = new Set<string>();
  const recordedMonthly = new Map<number, { premium: Decimal; advance: Decimal }>();
  for (const plan of input.form7206.plans ?? []) {
    if (!plan.marketplaceCoverage || !plan.premiumTaxCreditInvolved) continue;
    const shared = sharedPlans?.get(plan.planId ?? '');
    if (!shared && plan.allCoveredPersonsInCoverageFamilyConfirmed !== true) throw new Error("Marketplace premiums require the actual coverage-family source allocation; unknown is not complete coverage.");
    if (!plan.marketplacePolicySourceIds?.length) throw new Error("Marketplace plan requires actual policy source identity links.");
    const policyMonths = new Map<number, { premium: Decimal; advance: Decimal }>();
    for (const id of plan.marketplacePolicySourceIds) {
      const digits = /^form1095A:(\d+)$/.exec(id)?.[1];
      const form = digits === undefined ? undefined : input.form1095A[Number(digits)];
      if (digits === undefined || id !== `form1095A:${Number(digits)}` || !form || usedPolicies.has(id)) throw new Error("Reconcile unique canonical Marketplace policy source identity.");
      usedPolicies.add(id);
      if (form.taxYear !== input.taxpayer.taxYear || form.sourceFactsComplete !== true || !form.marketplace?.trim() || !form.policyNumber?.trim()) throw new Error("Marketplace policy requires actual complete original source facts and matching tax year.");
      const seenMonths = new Set<number>();
      for (const row of form.monthlyPremiums) {
        if (seenMonths.has(row.month)) throw new Error("Duplicate Marketplace source policy month.");
        seenMonths.add(row.month);
        const current = policyMonths.get(row.month) ?? { premium: d(0), advance: d(0) };
        current.premium = current.premium.plus(actual(row.enrolleePremium)); current.advance = current.advance.plus(actual(row.advancePremiumTaxCredit));
        policyMonths.set(row.month, current);
      }
    }
    const business = healthInsurance.businesses.find(row => row.businessSourceId === plan.businessSourceId && row.accountHolder === plan.accountHolder);
    if (!business || business.earnedIncomeLimit === undefined || business.deduction === undefined) throw new Error("Marketplace plan needs its actual completed business source limit.");
    let group = groups.get(business.businessSourceId);
    if (!group) {
      group = { businessSourceId: business.businessSourceId, accountHolder: business.accountHolder, specifiedPremiums: d(0),
        remainingEarnedIncome: remainingIncome(business), nonspecifiedDeduction: business.deduction, months: [] };
      groups.set(business.businessSourceId, group);
    } else if (group.accountHolder !== business.accountHolder) throw new Error("Marketplace source business owner contradicts canonical income.");
    const paymentsByMonth = new Map<number, { premium: Decimal; advance: Decimal }>();
    for (const payment of plan.payments ?? []) {
      const month = payment.coverageMonth;
      if (month === undefined || payment.coverageTaxYear !== input.taxpayer.taxYear || !payment.datePaid?.startsWith(`${input.taxpayer.taxYear}-`)) throw new Error("Marketplace premium source year or payment date requires a separate timing worksheet.");
      if (!shared && !actual(payment.otherPersonPaid).isZero()) throw new Error("Marketplace outside-payer source shares require their actual separate deduction allocation.");
      const row = paymentsByMonth.get(month) ?? { premium: d(0), advance: d(0) };
      row.premium = row.premium.plus(actual(payment.grossPremium)); row.advance = row.advance.plus(actual(payment.advancePremiumTaxCredit)); paymentsByMonth.set(month,row);
    }
    for (const [month, paid] of paymentsByMonth) {
      const policy = policyMonths.get(month);
      if (!policy || !policy.premium.eq(paid.premium) || !policy.advance.eq(paid.advance)) throw new Error("Marketplace source policy premiums and advance payments must reconcile actual paid monthly records.");
      const employer = plan.months?.find(row => row.month === month);
      const coverage = facts.monthlyReconciliation?.find(row => row.month === month);
      if (employer?.employerCoverageEnrolled === true && coverage?.coverageEligible === true) throw new Error("Actual employer MEC enrollment contradicts credit-eligible coverage-family sources.");
      if (employer?.employerSubsidizedPlanEligible === true && coverage?.coverageEligible === true
        && (employer.employerCoverageEnrolled !== false || !employer.employerOfferSourceReference?.trim()
          || !["unaffordable", "does_not_provide_minimum_value"].includes(employer.employerOfferPtcException ?? ""))) {
        throw new Error("Employer-eligible health months require actual PTC exception source facts and no employer MEC enrollment.");
      }
      const sources = healthInsurance.sourceRecords.filter(row => row.planId === plan.planId && row.coverageMonth === month);
      if (sources.some(row => row.excludedFunding.gt(0))) throw new Error("Marketplace other tax-free source funding requires its actual coordinated worksheet.");
      const specified = sum(...sources.map(row => row.marketplaceSpecifiedPremium));
      const attributable = shared?.months.get(month) ?? paid;
      if (specified.gt(attributable.premium)) throw new Error("Marketplace specified premiums exceed their actual allocated policy source.");
      const combined = group.months.find(row => row.month === month);
      if (combined) { combined.specifiedPremium = combined.specifiedPremium.plus(specified); combined.sourcePremium = combined.sourcePremium.plus(attributable.premium); combined.advancePremiumTaxCredit = combined.advancePremiumTaxCredit.plus(attributable.advance); }
      else group.months.push({ month, specifiedPremium: specified, sourcePremium: attributable.premium, advancePremiumTaxCredit: attributable.advance });
      group.specifiedPremiums = group.specifiedPremiums.plus(specified);
      const recorded = recordedMonthly.get(month) ?? { premium: d(0), advance: d(0) };
      recorded.premium = recorded.premium.plus(attributable.premium); recorded.advance = recorded.advance.plus(attributable.advance); recordedMonthly.set(month,recorded);
    }
    if (policyMonths.size !== paymentsByMonth.size) throw new Error("Marketplace source needs actual paid records for every linked policy month.");
  }
  if (!groups.size) throw new Error("Actual Marketplace coordination needs linked source plans.");
  for (const business of healthInsurance.businesses) {
    if (groups.has(business.businessSourceId)) continue;
    if (business.earnedIncomeLimit === undefined || business.deduction === undefined || business.attributableForeignExclusion === undefined || (business.kind === "s_corporation" ? business.sCorporationMedicareWages : business.incomeAfterRetirement) === undefined || !business.specifiedPremiums.isZero()) throw new Error("Pub974 needs complete nonduplicated business source limits.");
    groups.set(business.businessSourceId, { businessSourceId: business.businessSourceId, accountHolder: business.accountHolder,
      specifiedPremiums: d(0), remainingEarnedIncome: remainingIncome(business), nonspecifiedDeduction: business.deduction, months: [] });
  }
  for (const [month, source] of recordedMonthly) {
    const reconciled = facts.monthlyReconciliation?.filter(row => row.month === month);
    if (reconciled?.length !== 1 || reconciled[0].coverageEligible !== true || reconciled[0].incomeBasedSepEnrollment !== false || actual(reconciled[0].enrolleePremium).lt(source.premium) || actual(reconciled[0].advancePremiumTaxCredit).lt(source.advance)) throw new Error("Marketplace premium sources must reconcile the actual household month worksheet.");
  }
  for (const group of groups.values()) group.months.sort((a,b) => a.month - b.month);
  return { groups: [...groups.values()] };
}
