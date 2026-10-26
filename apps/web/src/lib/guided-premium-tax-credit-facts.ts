import Decimal from "decimal.js";
import { bindGuidedMarriageSources, type MarriagePolicyData } from "./guided-marriage-policy";
import { Form8962Schema, type TaxYearInput } from "@/models/inputs";
import type { FilingStatus, GuidedFlowState, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { normalizeMarketplacePolicy, resolveGuidedSharedPolicy, type SharedPolicyAllocationData } from "./guided-shared-policy";

export interface MarketplaceMonthData { month: string; enrolleePremium: string; slcsp: string; advancePremiumTaxCredit: string }
export interface MarketplacePolicyData {
  taxYear: string; marketplace: string; policyNumber: string; monthlyPremiums: (MarketplaceMonthData & { slcspReportedBlank?: boolean | null })[];
  recipientName?: string; recipientSsn?: string;
  coveredIndividuals?: { name: string; ssn: string; firstMonth: string; lastMonth: string }[];
}
export interface MarketplaceCoverageMonthData extends MarketplaceMonthData {
  coverageEligible: boolean | null; incomeBasedSepEnrollment: boolean | null;
  qsehraAffordable?: boolean | null; qsehraMonthlyPermittedBenefit?: string;
}
export interface PremiumTaxCreditData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPoliciesIncluded: boolean | null;
  taxFamilySize: string; fplRegion: "" | "contiguous" | "alaska" | "hawaii"; requiredFilingDependentsModifiedAGI: string;
  householdFactsConfirmed: boolean | null; canBeClaimedAsDependent: boolean | null; marriedFilingSeparatelyExceptionConfirmed?: boolean | null;
  belowPovertyException: "" | "none" | "marketplace_estimate" | "lawfully_present_ineligible_medicaid";
  marketplaceEstimatedIncomeWithinEligibilityRange?: boolean | null; marketplaceInformationAccurate?: boolean | null;
  coverageFactsConfirmed: boolean | null; allocationRequired: boolean | null; alternativeMarriageCalculationElected: boolean | null;
  selfEmployedHealthInsuranceCoordinationRequired: boolean | null; qsehraAffected: boolean | null; lawfulPresenceReconciliationRequired: boolean | null;
  sharedPolicyAllocations?: SharedPolicyAllocationData;
  marriageSources?: MarriagePolicyData;
  policies: MarketplacePolicyData[]; monthlyReconciliation: MarketplaceCoverageMonthData[];
}
export const emptyMarketplaceMonth: MarketplaceMonthData = { month: "", enrolleePremium: "", slcsp: "", advancePremiumTaxCredit: "" };
export const emptyMarketplaceCoverageMonth: MarketplaceCoverageMonthData = { ...emptyMarketplaceMonth, coverageEligible: null, incomeBasedSepEnrollment: null };
export const emptyPremiumTaxCreditFacts: PremiumTaxCreditData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allPoliciesIncluded: null, taxFamilySize: "", fplRegion: "", requiredFilingDependentsModifiedAGI: "",
  householdFactsConfirmed: null, canBeClaimedAsDependent: null, belowPovertyException: "", coverageFactsConfirmed: null, allocationRequired: null,
  alternativeMarriageCalculationElected: null, selfEmployedHealthInsuranceCoordinationRequired: null, qsehraAffected: null, lawfulPresenceReconciliationRequired: null,
  policies: [], monthlyReconciliation: [],
};
function money(value: string | undefined, label: string, signed = false): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}, including zero when known.`);
  const amount = parseGuidedCurrency(value);
  if (!signed && amount.lt(0)) throw new Error(`The actual ${label} cannot be negative.`);
  return amount.toFixed();
}
function integer(value: string | undefined, label: string): number {
  if (!value?.trim() || !/^\d{1,4}$/.test(value.trim())) throw new Error(`Enter the actual whole number for ${label}.`);
  return Number(value);
}
function fact(value: boolean | null | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Confirm the actual ${label}.`);
  return value;
}
function month(row: MarketplaceMonthData, label: string) {
  return { month: integer(row.month, `${label} month`), enrolleePremium: money(row.enrolleePremium, `${label} enrollment premium`),
    slcsp: money(row.slcsp, `${label} SLCSP benchmark premium`), advancePremiumTaxCredit: money(row.advancePremiumTaxCredit, `${label} advance credit`) };
}

/** Collect sources without supplying a placeholder MAGI or calculating eligibility. */
export function buildPremiumTaxCreditInputs(data: PremiumTaxCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Partial<Pick<TaxYearInput, "form1095A" | "form8962">> {
  if (!data) return {};
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus) throw new Error("Choose the actual return year and filing status for Marketplace coverage.");
  if (integer(data.sourceTaxYear, "coverage worksheet year") !== taxYear) throw new Error("The coverage worksheet year must match the actual return year.");
  if (!data.sourceReference?.trim() || data.sourceFactsConfirmed !== true || data.allPoliciesIncluded !== true) throw new Error("Confirm all actual Marketplace sources and the worksheet reference after the last edit.");
  if (data.householdFactsConfirmed !== true || data.coverageFactsConfirmed !== true) throw new Error("Confirm the actual household and monthly coverage worksheets.");
  if (!personal) throw new Error("Complete the actual return household before reconciling Marketplace facts.");
  const familySize = integer(data.taxFamilySize, "tax family size");
  const dependentCount = (personal.dependents ?? []).length;
  const standard = personal.standardDeductionFacts;
  const primaryClaimable = fact(standard?.primaryCanBeClaimedAsDependent, "primary dependency source answer");
  const spouseClaimable = filingStatus === "mfj" ? fact(standard?.spouseCanBeClaimedAsDependent, "joint spouse dependency source answer") : undefined;
  const expectedFamilySize = (primaryClaimable ? 0 : 1) + (filingStatus === "mfj" && spouseClaimable === false ? 1 : 0) + dependentCount;
  if (expectedFamilySize === 0 || familySize === 0) throw new Error("An actual zero-family or policy-allocation case requires its separate supported reconciliation worksheet.");
  if (familySize !== expectedFamilySize) throw new Error("Reconcile tax family size to actual unclaimable filers and claimed household dependents.");
  const dependentMagi = money(data.requiredFilingDependentsModifiedAGI, "required-filing dependent modified AGI", true);
  if (dependentCount === 0 && !new Decimal(dependentMagi).isZero()) throw new Error("Dependent modified AGI contradicts a household with no claimed dependents.");
  const dependency = fact(data.canBeClaimedAsDependent, "dependency eligibility answer");
  if (dependency !== (primaryClaimable || spouseClaimable === true)) throw new Error("Reconcile the Marketplace dependency answer with the household source facts.");
  if (!data.fplRegion || !data.belowPovertyException) throw new Error("Enter the actual poverty guideline region and below-poverty exception answer.");
  const allocationRequired = fact(data.allocationRequired, "shared-policy allocation answer");
  const marriageElected = fact(data.alternativeMarriageCalculationElected, "alternative marriage election answer");
  for (const field of ["lawfulPresenceReconciliationRequired"] as const) {
    if (fact(data[field], field) === true) throw new Error(`The actual ${field} worksheet is not yet supported in this guided route. Keep its source records for review.`);
  }
  if (filingStatus === "mfs") fact(data.marriedFilingSeparatelyExceptionConfirmed, "married-filing-separately exception answer");
  if (data.belowPovertyException === "marketplace_estimate") {
    fact(data.marketplaceEstimatedIncomeWithinEligibilityRange, "Marketplace income estimate eligibility"); fact(data.marketplaceInformationAccurate, "Marketplace information accuracy");
  }
  const qsehra = fact(data.qsehraAffected, "QSEHRA answer");
  const shared = allocationRequired || data.sharedPolicyAllocations ? resolveGuidedSharedPolicy(data, taxYear, filingStatus, personal) : undefined;
  const policies = shared?.policies ?? data.policies?.map(policy => normalizeMarketplacePolicy(policy, taxYear));
  if (!policies?.length) throw new Error("Enter the actual original Marketplace policy statements.");
  const identities = new Set<string>();
  const sourceMonths = new Map<number, { premium: Decimal; advance: Decimal }>();
  for (const policy of policies) {
    const identity = JSON.stringify([policy.marketplace, policy.policyNumber]);
    if (identities.has(identity)) throw new Error("Duplicate Marketplace policy: replace superseded statements instead of adding them.");
    identities.add(identity);
    for (const row of policy.monthlyPremiums) {
      const previous = sourceMonths.get(row.month);
      sourceMonths.set(row.month, { premium: new Decimal(row.enrolleePremium).plus(previous?.premium ?? 0), advance: new Decimal(row.advancePremiumTaxCredit).plus(previous?.advance ?? 0) });
    }
  }
  if (shared) {
    sourceMonths.clear();
    for (const row of shared.allocation.householdMonths) sourceMonths.set(row.month, { premium: row.premium, advance: row.advance });
  }
  const reconciliation = data.monthlyReconciliation?.map(row => {
    const actual = month(row, "household coverage"); const source = sourceMonths.get(actual.month);
    if (!source) throw new Error("The household month has no actual original statement.");
    const allocated = shared?.allocation.householdMonths.find(entry => entry.month === actual.month);
    if (allocated && (!allocated.premium.eq(actual.enrolleePremium) || !allocated.slcsp.eq(actual.slcsp) || !allocated.advance.eq(actual.advancePremiumTaxCredit))) throw new Error("Reconcile shared household amounts to the actual original sources and allocation.");
    if (!source.advance.eq(actual.advancePremiumTaxCredit)) throw new Error("Reconcile household advance credit to the exact original monthly total.");
    if (new Decimal(actual.enrolleePremium).gt(source.premium)) throw new Error("Eligible enrollment premium cannot exceed the original monthly premiums.");
    const qsehraBenefit = row.qsehraMonthlyPermittedBenefit?.trim() ? money(row.qsehraMonthlyPermittedBenefit, "QSEHRA monthly permitted benefit") : undefined;
    if (qsehra) { fact(row.qsehraAffordable, "monthly QSEHRA affordability"); money(row.qsehraMonthlyPermittedBenefit, "QSEHRA monthly permitted benefit"); }
    if (!qsehra && (row.qsehraAffordable === true || (qsehraBenefit !== undefined && !new Decimal(qsehraBenefit).isZero()))) throw new Error("Monthly QSEHRA facts contradict the household answer.");
    return { ...actual, coverageEligible: fact(row.coverageEligible, "monthly coverage eligibility"), incomeBasedSepEnrollment: fact(row.incomeBasedSepEnrollment, "monthly income-based special enrollment answer"),
      qsehraAffordable: row.qsehraAffordable ?? undefined, qsehraMonthlyPermittedBenefit: qsehraBenefit };
  });
  if (!reconciliation || new Set(reconciliation.map(row => row.month)).size !== sourceMonths.size) throw new Error("Complete the household reconciliation for every original source month.");
  const facts = Form8962Schema.parse({
    taxFamilySize: familySize, fplRegion: data.fplRegion, requiredFilingDependentsModifiedAGI: dependentMagi,
    householdFactsConfirmed: true, canBeClaimedAsDependent: dependency,
    marriedFilingSeparatelyExceptionConfirmed: data.marriedFilingSeparatelyExceptionConfirmed ?? undefined,
    belowPovertyException: data.belowPovertyException, marketplaceEstimatedIncomeWithinEligibilityRange: data.marketplaceEstimatedIncomeWithinEligibilityRange ?? undefined, marketplaceInformationAccurate: data.marketplaceInformationAccurate ?? undefined,
    coverageFactsConfirmed: true, allocationRequired, sharedPolicyAllocations: shared?.packet, alternativeMarriageCalculationElected: marriageElected, lawfulPresenceReconciliationRequired: false,
    selfEmployedHealthInsuranceCoordinationRequired: fact(data.selfEmployedHealthInsuranceCoordinationRequired, "self-employed health coordination answer"), qsehraAffected: qsehra, monthlyReconciliation: reconciliation,
  });
  if (marriageElected || data.marriageSources) facts.marriageSources = bindGuidedMarriageSources(data, taxYear, filingStatus, personal, policies, facts);
  return { form1095A: policies, form8962: facts };
}
export function premiumTaxCreditFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    const data = state.sectionData.credits?.premiumTaxCredit;
    const requiresCoordination = state.sectionData.adjustments?.healthInsuranceFacts?.plans?.some(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true) ?? false;
    if (requiresCoordination && !data) throw new Error("Enter the actual Marketplace statements and coverage worksheet for the self-employed health plan.");
    const inputs = buildPremiumTaxCreditInputs(data, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"]);
    if (inputs.form8962 && inputs.form8962.selfEmployedHealthInsuranceCoordinationRequired !== requiresCoordination) throw new Error("Reconcile Marketplace health coordination with the actual self-employed plan sources.");
    return {};
  } catch (error) { return { premiumTaxCreditSources: error instanceof Error ? error.message : "Complete the actual Marketplace coverage sources." }; }
}
