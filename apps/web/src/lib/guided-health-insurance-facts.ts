import Decimal from "decimal.js";
import { Form7206Schema } from "@/models/inputs";
import { calculateForm7206 } from "@/engine/forms/form-7206";
import type { AdjustmentData, FilingStatus, GuidedFlowState, SelfEmploymentSectionData, W2EntryData } from "./guided-interview-flow";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";
import { validateMarketplaceHealthSources } from "./guided-marketplace-health-facts";
import type { K1LossSourcesData } from "./guided-qbi-loss-data";

type Owner = "primary" | "spouse";
export interface HealthInsurancePersonData { personId: string; name: string; householdRole: "" | Owner | "other"; attainedAgeAtYearEnd: string }
export interface HealthInsuranceAllocationData { personId: string; payer: "" | "owner_after_tax" | "business_paid_or_reimbursed"; amountPaid: string; advancePremiumTaxCredit?: string; excludedPublicSafetyOfficerAmount: string; publicSafetyOfficerAccountHolder: "" | Owner; otherTaxFreeFunding: string }
export interface HealthInsurancePaymentData { sourceId: string; datePaid: string; coverageTaxYear: string; coverageMonth: string; grossPremium: string; ownerOrBusinessPaid: string; otherPersonPaid: string; advancePremiumTaxCredit?: string; personAmounts: HealthInsuranceAllocationData[] }
export interface SharedMarketplaceHealthData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null;
  allCoveredPersonsLinkedConfirmed: boolean | null; allThisReturnPersonsInCoverageFamilyConfirmed: boolean | null;
  persons: { personId: string; coveredIndividualSsn: string }[];
}
export interface HealthInsurancePlanData {
  planId: string; policyReference: string; accountHolder: "" | Owner; businessSourceId: string; businessKind: "" | "self_employed" | "partnership" | "s_corporation";
  kind: "" | "medical" | "qualified_ltc"; policyHolder: "" | "individual" | "business";
  establishedUnderBusiness: boolean | null; insuranceQualificationConfirmed: boolean | null; premiumsIncludedInOwnerIncome: boolean | null; moreThanTwoPercentShareholder: boolean | null;
  marketplaceCoverage: boolean | null; premiumTaxCreditInvolved: boolean | null; clergySpecialRules: boolean | null;
  marketplacePolicySourceIds?: string[]; allCoveredPersonsInCoverageFamilyConfirmed?: boolean | null;
  sharedMarketplaceSources?: SharedMarketplaceHealthData;
  coveredPersons: { personId: string; relationshipToOwner: "" | "self" | "spouse" | "dependent" | "child_under_27" | "other"; dependencyEligibilityConfirmed: boolean | null }[];
  months: { month: string; employerSubsidizedPlanEligible: boolean | null; employerOfferPtcException?: "" | "unaffordable" | "does_not_provide_minimum_value"; employerCoverageEnrolled?: boolean | null; employerOfferSourceReference?: string }[];
  payments: HealthInsurancePaymentData[];
}
export interface HealthInsuranceIncomeDeductionsData {
  sourceReference: string; sourceFactsConfirmed: boolean | null; otherForeignExclusion: string;
  allocations: { businessSourceId: string; accountHolder: "" | Owner; retirementDeduction: string; foreignExclusion: string }[];
}
export interface HealthInsuranceData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPlansIncluded: boolean | null;
  persons: HealthInsurancePersonData[]; plans: HealthInsurancePlanData[];
  incomeDeductions?: HealthInsuranceIncomeDeductionsData;
  longTermCareAllocations: { personId: string; accountHolder: "" | Owner; businessSourceId: string; allowedPremium: string }[];
}
export interface HealthInsuranceSourceOption { sourceId: string; accountHolder: Owner; kind: "self_employed" | "partnership" | "s_corporation"; label: string }
export const emptyHealthInsuranceFacts: HealthInsuranceData = { sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allPlansIncluded: null, persons: [], plans: [], longTermCareAllocations: [] };
/** Revoke independent confirmations without replacing their actual source values. */
export function invalidateHealthInsuranceSources(data: HealthInsuranceData): HealthInsuranceData {
  return { ...data, sourceFactsConfirmed: null,
    ...(data.incomeDeductions ? { incomeDeductions: { ...data.incomeDeductions, sourceFactsConfirmed: null } } : {}),
    plans: data.plans.map(plan => ({ ...plan, ...(plan.sharedMarketplaceSources ? { sharedMarketplaceSources: { ...plan.sharedMarketplaceSources, sourceFactsConfirmed: null } } : {}) })),
  };
}
export const emptyHealthInsurancePerson: HealthInsurancePersonData = { personId: "", name: "", householdRole: "", attainedAgeAtYearEnd: "" };
export const emptyHealthInsurancePlan: HealthInsurancePlanData = { planId: "", policyReference: "", accountHolder: "", businessSourceId: "", businessKind: "", kind: "", policyHolder: "", establishedUnderBusiness: null, insuranceQualificationConfirmed: null, premiumsIncludedInOwnerIncome: null, moreThanTwoPercentShareholder: null, marketplaceCoverage: null, premiumTaxCreditInvolved: null, clergySpecialRules: null, coveredPersons: [], months: [], payments: [] };
export const emptyHealthInsurancePayment: HealthInsurancePaymentData = { sourceId: "", datePaid: "", coverageTaxYear: "", coverageMonth: "", grossPremium: "", ownerOrBusinessPaid: "", otherPersonPaid: "", personAmounts: [] };
export const emptyHealthInsuranceAllocation: HealthInsuranceAllocationData = { personId: "", payer: "", amountPaid: "", excludedPublicSafetyOfficerAmount: "", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "" };
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
function money(value: string | undefined, label: string) {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
function advance(value: string | undefined, required: boolean, label: string) {
  return required || value !== undefined ? money(value, label) : undefined;
}
function integer(value: string | undefined, label: string): number | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d{1,4}$/.test(value.trim())) throw new Error(`Enter the actual whole number for ${label}.`);
  return Number(value);
}
function buildIncomeDeductions(data: HealthInsuranceIncomeDeductionsData | undefined) {
  if (!data) return undefined;
  if (!data.sourceReference?.trim() || data.sourceFactsConfirmed !== true || !Array.isArray(data.allocations)) throw new Error("Confirm the actual business deduction attribution and its source reference.");
  const seen = new Set<string>();
  return { sourceReference: data.sourceReference.trim(), sourceFactsConfirmed: true,
    otherForeignExclusion: money(data.otherForeignExclusion, "foreign exclusion not attributable to these businesses"),
    allocations: data.allocations.map(row => {
      if (!row.businessSourceId?.trim() || !["primary", "spouse"].includes(row.accountHolder)) throw new Error("Enter the actual business source and owner for each deduction allocation.");
      if (seen.has(row.businessSourceId)) throw new Error("Duplicate business deduction allocation source.");
      seen.add(row.businessSourceId);
      return { businessSourceId: row.businessSourceId, accountHolder: row.accountHolder as Owner,
        retirementDeduction: money(row.retirementDeduction, "allowed retirement deduction attribution"), foreignExclusion: money(row.foreignExclusion, "allowed foreign exclusion attribution") };
    }),
  };
}
export function buildHealthInsuranceInput(data: HealthInsuranceData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, savedPremium?: string) {
  const legacy = hasEnteredAmount(savedPremium) ? new Decimal(money(savedPremium, "saved health insurance premiums")) : undefined;
  if (!data) {
    if (legacy?.gt(0)) throw new Error("Enter actual health insurance source facts; a saved premium amount does not establish a deduction.");
    return undefined;
  }
  if (!filingStatus || (taxYear !== 2025 && taxYear !== 2026)) throw new Error("Choose the actual return year and filing status for health insurance sources.");
  const facts = Form7206Schema.parse({
    sourceTaxYear: integer(data.sourceTaxYear, "source tax year"), sourceReference: data.sourceReference, sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined, allPlansIncluded: data.allPlansIncluded ?? undefined,
    incomeDeductions: buildIncomeDeductions(data.incomeDeductions),
    persons: data.persons?.map(person => ({ ...person, householdRole: person.householdRole || undefined, attainedAgeAtYearEnd: integer(person.attainedAgeAtYearEnd, "year-end age") })),
    plans: data.plans?.map(plan => ({ ...plan, accountHolder: plan.accountHolder || undefined, businessKind: plan.businessKind || undefined, kind: plan.kind || undefined, policyHolder: plan.policyHolder || undefined,
      ...Object.fromEntries((["establishedUnderBusiness", "insuranceQualificationConfirmed", "premiumsIncludedInOwnerIncome", "moreThanTwoPercentShareholder", "marketplaceCoverage", "premiumTaxCreditInvolved", "clergySpecialRules", "allCoveredPersonsInCoverageFamilyConfirmed"] as const).map(field => [field, plan[field] ?? undefined])),
      sharedMarketplaceSources: plan.sharedMarketplaceSources ? { ...plan.sharedMarketplaceSources,
        sourceTaxYear: integer(plan.sharedMarketplaceSources.sourceTaxYear, "shared health source year"),
        sourceFactsConfirmed: plan.sharedMarketplaceSources.sourceFactsConfirmed ?? undefined,
        allCoveredPersonsLinkedConfirmed: plan.sharedMarketplaceSources.allCoveredPersonsLinkedConfirmed ?? undefined,
        allThisReturnPersonsInCoverageFamilyConfirmed: plan.sharedMarketplaceSources.allThisReturnPersonsInCoverageFamilyConfirmed ?? undefined,
        persons: plan.sharedMarketplaceSources.persons.map(person => ({ personId: person.personId.trim(), coveredIndividualSsn: person.coveredIndividualSsn.trim() })),
      } : undefined,
      coveredPersons: plan.coveredPersons?.map(person => ({ ...person, relationshipToOwner: person.relationshipToOwner || undefined, dependencyEligibilityConfirmed: person.dependencyEligibilityConfirmed ?? undefined })),
      months: plan.months?.map(month => ({ month: integer(month.month, "coverage month"), employerSubsidizedPlanEligible: month.employerSubsidizedPlanEligible ?? undefined,
        employerOfferPtcException: month.employerOfferPtcException || undefined, employerCoverageEnrolled: month.employerCoverageEnrolled ?? undefined, employerOfferSourceReference: month.employerOfferSourceReference?.trim() || undefined })),
      payments: plan.payments?.map(payment => ({ ...payment, coverageTaxYear: integer(payment.coverageTaxYear, "coverage year"), coverageMonth: integer(payment.coverageMonth, "payment coverage month"),
        grossPremium: money(payment.grossPremium, "original premium"), ownerOrBusinessPaid: money(payment.ownerOrBusinessPaid, "owner or business paid share"), otherPersonPaid: money(payment.otherPersonPaid, "other person's paid share"),
        advancePremiumTaxCredit: advance(payment.advancePremiumTaxCredit, plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true, "actual premium advance credit"),
        personAmounts: payment.personAmounts?.map(person => ({ ...person, payer: person.payer || undefined, publicSafetyOfficerAccountHolder: person.publicSafetyOfficerAccountHolder || undefined,
          amountPaid: money(person.amountPaid, "person premium share"), advancePremiumTaxCredit: advance(person.advancePremiumTaxCredit, plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true, "actual person advance credit"), excludedPublicSafetyOfficerAmount: money(person.excludedPublicSafetyOfficerAmount, "excluded public-safety-officer payments"), otherTaxFreeFunding: money(person.otherTaxFreeFunding, "other distinct tax-free funding") })),
      })),
    })),
    longTermCareAllocations: data.longTermCareAllocations?.map(allocation => ({ ...allocation, accountHolder: allocation.accountHolder || undefined, allowedPremium: money(allocation.allowedPremium, "actual long-term-care allocation") })),
  });
  const specified = facts.plans?.some(plan => plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true);
  // Validate original amounts without inventing a business limit or claiming the
  // final deduction. Canonical Pub974 coordination supplies both later.
  const checked = calculateForm7206({ facts, filingStatus: statuses[filingStatus], taxYear, marketplaceHandling: specified ? "separate-specified-premiums" : undefined });
  if (legacy && !legacy.eq(checked.paidSourcePremiums)) throw new Error("Reconcile saved health insurance premiums with actual owner and business paid source shares.");
  return facts;
}
export function healthInsuranceSourceOptions(business: SelfEmploymentSectionData | undefined, w2s: W2EntryData[] = [], k1Sources?: K1LossSourcesData): HealthInsuranceSourceOption[] {
  const options: HealthInsuranceSourceOption[] = [];
  const facts = business?.businessFacts;
  if (facts?.accountHolder === "primary" || facts?.accountHolder === "spouse") options.push({ sourceId: "scheduleC", accountHolder: facts.accountHolder, kind: "self_employed", label: facts.businessName?.trim() || facts.activityDescription?.trim() || "Entered self-employment business" });
  w2s.forEach((w2, index) => { if (w2.accountHolder === "primary" || w2.accountHolder === "spouse") options.push({ sourceId: `formW2:${index}`, accountHolder: w2.accountHolder, kind: "s_corporation", label: w2.employerName?.trim() || `Entered W-2 employer ${index + 1}` }); });
  k1Sources?.activities?.forEach((source, index) => {
    if (source.entityType === "partnership" && (source.accountHolder === "primary" || source.accountHolder === "spouse")) options.push({ sourceId: `scheduleK1:${index}`, accountHolder: source.accountHolder, kind: "partnership", label: source.entityName?.trim() || `Entered partnership ${index + 1}` });
  });
  return options;
}
export function healthInsuranceFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null): Record<string, string> {
  try { buildHealthInsuranceInput(data?.healthInsuranceFacts, filingStatus, taxYear, data?.selfEmployedHealthInsurance); return {}; }
  catch (error) { return { healthInsuranceSources: error instanceof Error ? error.message : "Complete actual health insurance sources." }; }
}
function householdAttainedAge(dateOfBirth: string | undefined, taxYear: number | null | undefined): number | undefined {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || (taxYear !== 2025 && taxYear !== 2026)) return undefined;
  const date = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth > `${taxYear}-12-31`) return undefined;
  // Attained age uses the day before the birthday, including January1 births.
  const age = taxYear - date.getUTCFullYear() + (dateOfBirth.slice(5) === "01-01" ? 1 : 0);
  return age >= 0 && age <= 120 ? age : undefined;
}
export function healthInsuranceSourceErrors(state: GuidedFlowState): Record<string, string> {
  const data = state.sectionData.adjustments?.healthInsuranceFacts;
  if (!data && state.segmentation.lifeEvents.includes("self-employed-health-insurance")) return { healthInsuranceSources: "Enter the actual health insurance worksheet for this selection, including confirmed empty records if no premiums apply." };
  if (!data) return {};
  const sources = healthInsuranceSourceOptions(state.sectionData["income-self-employment"], state.sectionData["income-w2"]?.entries, state.sectionData.adjustments?.k1LossSources);
  if ((data.plans ?? []).some(plan => !sources.some(source => source.sourceId === plan.businessSourceId && source.accountHolder === plan.accountHolder && source.kind === plan.businessKind))) return { healthInsuranceBusiness: "Link every health plan to its actual business or shareholder W-2 on this return. Other business sources require their source worksheets before this interview can use them." };
  if ((data.incomeDeductions?.allocations ?? []).some(row => !sources.some(source => source.sourceId === row.businessSourceId && source.accountHolder === row.accountHolder))) return { healthInsuranceBusiness: "Link each deduction attribution to its actual business and owner on this return." };
  const personal = state.sectionData["personal-info"];
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const name = (person: { firstName?: string; lastName?: string } | undefined) => person ? normalize([person.firstName, person.lastName].filter(Boolean).join(" ")) : "";
  for (const person of data.persons ?? []) {
    const suppliedName = normalize(person.name);
    let household: { firstName: string; lastName: string; dateOfBirth?: string } | undefined = person.householdRole === "primary" ? personal : person.householdRole === "spouse" ? personal?.spouse : undefined;
    if (person.householdRole === "other") {
      if (suppliedName && (suppliedName === name(personal) || suppliedName === name(personal?.spouse))) return { healthInsuranceHousehold: "Use the actual taxpayer or spouse role for this household person." };
      const matches = personal?.dependents?.filter(dependent => name(dependent) === suppliedName) ?? [];
      if (matches.length > 1) return { healthInsuranceHousehold: "Resolve the covered person's ambiguous household identity before using an age limit." };
      if (matches.length === 0) continue; // Other qualifying persons retain separate actual source eligibility.
      household = matches[0];
    } else if (!household || name(household) !== suppliedName) return { healthInsuranceHousehold: "Reconcile the health plan's actual taxpayer or spouse name with the household record." };
    const actualAge = householdAttainedAge(household?.dateOfBirth, state.taxYear);
    if (actualAge === undefined || !/^\d{1,3}$/.test(person.attainedAgeAtYearEnd.trim()) || Number(person.attainedAgeAtYearEnd) !== actualAge) {
      return { healthInsuranceHouseholdAge: "Reconcile the health plan's attained age with this person's actual household birth date and return year." };
    }
  }
  try { validateMarketplaceHealthSources(state, data, buildHealthInsuranceInput(data, state.segmentation.filingStatus, state.taxYear)); }
  catch (error) { return { healthInsuranceMarketplace: error instanceof Error ? error.message : "Reconcile actual Marketplace policy and premium sources." }; }
  return {};
}
