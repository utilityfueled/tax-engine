import {buildGuidedOhioReturnHeaderSources,type OhioReturnHeaderDraft} from './guided-ohio-return-header-sources';
import {buildGuidedOhioReciprocalWages,type OhioReciprocalWagesDraft} from './guided-oh-reciprocal-wages';
import {ohioBusinessActualValues,invalidateOhioBusiness} from './guided-ohio-business-facts';
import {buildGuidedOhioResidentCreditSources,ohioResidentCreditActualValues,invalidateOhioResidentCredit,type OhioResidentCreditDraft} from './guided-ohio-resident-credit-sources';
import {buildGuidedOhioSchoolDistrictFacts,type OhioSchoolDistrictDraft} from './guided-ohio-school-district-facts';
import {buildGuidedPAMarriedOrdinarySources,assertMarriedPASavedLedger} from './guided-pa-married-ordinary-sources';
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from "./guided-interview-bridge";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
import type { PAOrdinaryReturnFacts } from "@/models/pa-ordinary-return-facts";
import { buildGuidedOhioResidencyFacts } from "./guided-ohio-residency-facts";
import { buildGuidedOhioPaymentFacts } from "./guided-ohio-payment-facts";
import { buildGuidedPAResidencySources } from "./guided-pa-residency-facts";
import { buildGuidedPAReciprocitySources } from "./guided-pa-reciprocity-facts";
import { buildGuidedPAOrdinaryReturnFacts } from "./guided-pa-ordinary-return-facts";
import { buildGuidedPAOrdinaryReturnCompletionSources, type GuidedPAOrdinaryReturnCompletionSources } from "./guided-pa-ordinary-return-completion";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local";
import type { W2StateLocalSources } from "@/models/w2-state-local";
import type { OhioResidencyDraft } from "./guided-ohio-residency-facts";
import type { OhioPaymentDraft } from "./guided-ohio-payment-facts";
import type { PAResidencySources } from "@/models/pa-residency";
import type { PAReciprocitySources } from "@/models/pa-reciprocity";
import { cryptoDonationFactErrors, type CryptoDonationData } from './guided-crypto-donations';
import { royaltySourceFactErrors, invalidateRoyaltySources, type RoyaltyIncomeData } from "./guided-royalty-sources";
import { invalidateSharedPolicySources } from "./guided-shared-policy";
import { invalidateMarriageSources } from "./guided-marriage-policy";
import { foreignIncomeFactErrors, type ForeignIncomeData } from "./guided-foreign-income";
import { netOperatingLossFactErrors, netOperatingLossNavigationFactErrors, invalidateNetOperatingLossSources, type NetOperatingLossData } from "./guided-net-operating-loss";
import { currentLossOriginNavigationFactErrors, invalidateCurrentLossOrigin, type CurrentLossOriginData } from "./guided-current-loss-origin";
import { codNolNavigationFactErrors, invalidateGuidedCodNol, type CodNolData } from "./guided-cod-nol";
import { k1LossSourceFactErrors, invalidateK1LossSources } from "./guided-k1-qbi-sources";
import type { K1LossSourcesData } from "./guided-qbi-loss-data";
import { charitableCarryoverFactErrors, type CharitableCarryoverData } from "./guided-charitable-carryover";
import { k1CharitableSourceFactErrors, invalidateK1CharitableSources } from "./guided-k1-charitable-sources";
import type { K1CharitableSourcesData } from "./guided-k1-charitable-data";
import { estimatedTaxFactErrors, type EstimatedTaxFactsData } from "./guided-estimated-tax-facts";
import { minimumTaxCreditFactErrors, type MinimumTaxCreditData } from "./guided-minimum-tax-credit";
import { investmentInterestFactErrors, type InvestmentInterestSourceData } from "./guided-investment-interest";
import { guidedForeignTaxFactErrors, type ForeignTaxElectionData } from "./guided-foreign-tax-election";
import { foreignCreditKnownFacts } from './guided-foreign-tax-direct-credit';
import { premiumTaxCreditFactErrors, type PremiumTaxCreditData } from "./guided-premium-tax-credit-facts";
import { schedule1AFactErrors } from "./guided-schedule-1-a-facts";
import { tipIncomeFactErrors, type AdditionalDeductionsData } from "./guided-tip-income-facts";
import { healthInsuranceSourceErrors, invalidateHealthInsuranceSources, type HealthInsuranceData } from "./guided-health-insurance-facts";
import { hsaFactErrors, type HsaAccountData } from "./guided-hsa-facts";
import type { StandardDeductionData } from "./guided-standard-deduction-facts";
import { educatorFactErrors, educatorBondFactErrors, type EducatorSourceData } from "./guided-educator-facts";
import { studentLoanFactErrors, studentLoanEducationSources, type StudentLoanData, type StudentLoanEducationSources } from "./guided-student-loan-facts";
/**
 * Guided interview flow — state model, section routing, skip logic, and progress.
 *
 * Pure functions, no React, no DOM. The UI components consume this module.
 */

import Decimal from "decimal.js";
import { parseGuidedCurrency, hasGuidedCurrency } from "./guided-currency";
import { personalFactErrors } from "./guided-taxpayer-facts";
import type { EicClaimantEligibilityData } from "./guided-eic-eligibility";
import { eicHistorySourceValuesChanged, invalidateEicHistorySources } from "./guided-eic-disallowance-history";
import { allPaymentFactErrors, deductionFactErrors, educationFactErrors, retirementFactErrors } from "./guided-required-facts";
import { nonitemizedElectionFactErrors } from "./guided-nonitemized-election";
import { adjustmentFactErrors, householdFactErrors } from "./guided-adjustment-facts";
import { statePaymentFactErrors } from "./guided-state-facts";
import {zeroIncomeMiscSourceFactErrors,type ZeroIncomeMiscSourceDraft} from './guided-zero-income-misc-sources';
import { guidedOhioInterestFactErrors, type OhioInterestAllocation } from "./guided-ohio-interest-facts";
import { careBenefitsFactErrors, guidedCareBenefitSources, type CareBenefitsData } from "./guided-dependent-care-benefits";
import { careFactErrors } from "./guided-credit-facts";
import { energyFactErrors } from "./guided-energy-facts";
import { isStartedW2, w2FactErrors } from "./guided-w2-facts";
import { investmentFactErrors, investmentRowsStarted, type InvestmentSourceData, type InvestmentData } from "./guided-investment-facts";
import { businessFactErrors, hasBusinessSourceData, type BusinessSourceData } from "./guided-business-facts";
import { isStartedRental, rentalFactErrors, type RentalSourceData } from "./guided-rental-facts";
import { nonW2TaxAllocationErrors } from "./guided-salt-facts";
import { isStartedUnemployment, unemploymentEntries, unemploymentFactErrors, type UnemploymentSourceData } from "./guided-unemployment-facts";
import type { MortgageSourceData } from "./guided-mortgage-facts";
import type { MortgageWorksheetData } from "./guided-mortgage-worksheet";
import { socialSecurityFactErrors, socialSecurityEntries, isStartedSocialSecurity, type SocialSecuritySourceData } from "./guided-social-security-facts";
import type { RetirementSourceData } from "./guided-retirement-facts";
import type { GuidedIraBasisData, GuidedIraBasisContext } from "./guided-ira-basis";
import { vehicleFactErrors, type VehicleCreditData } from "./guided-vehicle-facts";
import { adoptionFactErrors, type AdoptionCreditData } from "./guided-adoption-facts";
import { invalidateAdoptionHistories } from "./guided-adoption-prior-benefits";
import { educationDistributionFactErrors, invalidateEducationPeriodSources, type EducationDistributionData } from "./guided-education-distributions";
import { savingsBondFactErrors, type SavingsBondEducationData } from "./guided-savings-bond-facts";
import { invalidateSavingsBondSources, savingsBondSourceValuesChanged } from "./guided-savings-bond-reissues";
import { buildActualEducationInput } from "./guided-education-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";
import { guidedNiitFactErrors, type NiitSourceData } from "./guided-niit-facts";

import { formatPendingW2SuggestionValueLabel, isOfficialFixtureSourceType } from "@/lib/document-fixture-copy";

// ── Filing status ──────────────────────────────────────────────────────────

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qss";

export const filingStatusOptions: { value: FilingStatus; label: string; description: string }[] = [
  { value: "single", label: "Single", description: "Unmarried or legally separated on Dec 31" },
  { value: "mfj", label: "Married Filing Jointly", description: "Married and filing a combined return" },
  { value: "mfs", label: "Married Filing Separately", description: "Married but filing your own return" },
  { value: "hoh", label: "Head of Household", description: "Unmarried and paid more than half the cost of keeping up a home for a qualifying person" },
  { value: "qss", label: "Qualifying Surviving Spouse", description: "Spouse died in the prior two tax years and you have a dependent child" },
];

// ── Income types ───────────────────────────────────────────────────────────

export type IncomeType =
  | "w2-wages"
  | "self-employment"
  | "investments"
  | "rental"
  | "royalties"
  | "retirement"
  | "social-security"
  | "unemployment";

export const incomeTypeOptions: { value: IncomeType; label: string; hint: string }[] = [
  { value: "w2-wages", label: "W-2 wages or salary", hint: "Most common — you received a W-2 from an employer" },
  { value: "self-employment", label: "Self-employment or freelance", hint: "1099-NEC, Schedule C business income" },
  { value: "investments", label: "Investment income", hint: "Stocks, bonds, crypto — 1099-B, 1099-DIV, 1099-INT" },
  { value: "royalties", label: "Royalty income", hint: "Original 1099-MISC and actual nonbusiness property expenses" },
  { value: "rental", label: "Rental property income", hint: "Schedule E rental income and expenses" },
  { value: "retirement", label: "Retirement distributions", hint: "IRA, 401(k), pension — 1099-R" },
  { value: "social-security", label: "Social Security benefits", hint: "SSA-1099" },
  { value: "unemployment", label: "Unemployment compensation", hint: "1099-G" },
];

// ── Life events ────────────────────────────────────────────────────────────

export type LifeEvent =
  | "k1-loss-sources"
  | "bought-home"
  | "sold-home"
  | "had-baby"
  | "got-married"
  | "got-divorced"
  | "started-business"
  | "student-loans"
  | "hsa-contributions"
  | "educator-expenses"
  | "self-employed-health-insurance"
  | "additional-deductions"
  | "net-operating-loss"
  | "current-year-loss"
  | "cancelled-debt"
  | "foreign-earned-income";

export const lifeEventOptions: { value: LifeEvent; label: string; hint: string }[] = [
  { value: "k1-loss-sources", label: "Have K-1 income or suspended business losses", hint: "Original partnership or S corporation statements, basis and loss histories" },
  { value: "cancelled-debt", label: "Had personal debt canceled while insolvent or in chapter 13 bankruptcy", hint: "Original debt statements, complete asset and liability records, and actual loss carry histories" },
  { value: "current-year-loss", label: "Calculate a current-year net operating loss", hint: "Actual current business, deduction and independent AMT source records" },
  { value: "net-operating-loss", label: "Have a net operating loss carryforward", hint: "Actual filed regular and AMT loss worksheets and complete carry history" },
  { value: "foreign-earned-income", label: "Worked abroad", hint: "Actual foreign earnings, tax home and qualification records" },
  { value: "additional-deductions", label: "Tips, overtime, vehicle loan interest or senior deduction", hint: "Actual tip records and Schedule 1-A eligibility" },
  { value: "bought-home", label: "Bought a home", hint: "Mortgage interest deduction may apply" },
  { value: "sold-home", label: "Sold a home", hint: "Capital gains exclusion may apply" },
  { value: "had-baby", label: "Had or adopted a child", hint: "Child tax credit, dependent exemption" },
  { value: "got-married", label: "Got married", hint: "Filing status change, possible joint return" },
  { value: "got-divorced", label: "Got divorced", hint: "Filing status change, alimony considerations" },
  { value: "started-business", label: "Started a business", hint: "Schedule C, self-employment tax" },
  { value: "student-loans", label: "Paid student loan interest", hint: "Above-the-line deduction up to $2,500" },
  { value: "hsa-contributions", label: "HSA contributions or distributions", hint: "Actual HSA statements and eligibility" },
  { value: "educator-expenses", label: "Paid educator expenses", hint: "Actual school work and paid classroom or professional development costs" },
  { value: "self-employed-health-insurance", label: "Paid self-employed or shareholder health insurance", hint: "Actual policies, premiums and monthly eligibility" },
];

// ── State of residence ─────────────────────────────────────────────────────

export const supportedStates = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export type SupportedStateCode = (typeof supportedStates)[number]["code"];

// ── Segmentation answers ───────────────────────────────────────────────────

export interface SegmentationAnswers {
  filingStatus: FilingStatus | null;
  incomeTypes: IncomeType[];
  lifeEvents: LifeEvent[];
  stateCode: SupportedStateCode | null;
}

export const emptySegmentation: SegmentationAnswers = {
  filingStatus: null,
  incomeTypes: [],
  lifeEvents: [],
  stateCode: null,
};

export function isSegmentationComplete(answers: SegmentationAnswers): boolean {
  return answers.filingStatus !== null;
}

// ── Standard deduction lookup ─────────────────────────────────────────────

/**
 * 2025 federal standard deduction amounts by filing status.
 * These mirror TAX_CONSTANTS[2025].standardDeduction from the engine constants
 * but are duplicated here to keep the guided interview flow module free of
 * engine/Decimal dependencies.
 */
const standardDeductionAmounts: Record<FilingStatus, number> = {
  single: 15750,
  mfj: 31500,
  mfs: 15750,
  hoh: 23625,
  qss: 31500,
};

export function getStandardDeductionAmount(filingStatus: FilingStatus | null, taxYear?: number | null): number {
  if (!filingStatus || taxYear !== 2025) return 0;
  return standardDeductionAmounts[filingStatus] ?? 0;
}

export interface DeductionComparison {
  standardAmount: number;
  itemizedTotal: string;
  recommendation: "standard" | "itemized" | "equal";
  savings: string;
}

export function computeDeductionComparison(
  filingStatus: FilingStatus | null,
  deductions: DeductionData | undefined,
  taxYear?: number | null,
): DeductionComparison {
  const standardAmount = getStandardDeductionAmount(filingStatus, taxYear);
  const data = deductions ?? emptyDeductionData;

  const fields: string[] = [
    data.medicalExpenses,
    data.stateLocalTaxes,
    data.realEstateTaxes,
    data.personalPropertyTaxes ?? "",
    data.mortgageInterest,
    ...(data.mortgageEntries ?? []).flatMap(entry => [entry.pointsPaid ?? "", entry.propertyTaxPaid ?? "", ...(taxYear === 2026 && entry.hasMortgageInsuranceAllocation === true ? [entry.insurancePremiumsAllocableToYear ?? ""] : [])]),
    data.charitableContributions,
    data.casualtyLosses,
    ...(data.investmentInterestExpense !== undefined || data.gamblingLosses !== undefined || data.gamblingExpenses !== undefined
      ? [data.investmentInterestExpense ?? "", data.gamblingLosses ?? "", data.gamblingExpenses ?? ""]
      : [data.otherItemized]),
  ];

  const itemizedTotal = fields.reduce((sum, value) => sum.plus(parseGuidedCurrency(value)), new Decimal(0));
  const diff = itemizedTotal.minus(standardAmount);
  return {
    standardAmount,
    itemizedTotal: itemizedTotal.toFixed(),
    recommendation: diff.gt(0) ? "itemized" : diff.lt(0) ? "standard" : "equal",
    savings: diff.abs().toFixed(),
  };

}

// ── Interview sections ─────────────────────────────────────────────────────

export type InterviewSectionId =
  | "personal-info"
  | "income-w2"
  | "income-self-employment"
  | "income-investments"
  | "income-rental"
  | "income-royalties"
  | "income-retirement"
  | "income-social-security"
  | "income-unemployment"
  | "adjustments"
  | "deductions"
  | "additional-deductions"
  | "credits"
  | "other-taxes"
  | "payments"
  | "review"
  | "state-return"
  | "final-review";

export interface InterviewSectionDefinition {
  id: InterviewSectionId;
  label: string;
  eyebrow: string;
  description: string;
  groupLabel: string;
}

const allSections: InterviewSectionDefinition[] = [
  { id: "additional-deductions", label: "Tips & Additional Deductions", eyebrow: "ADDITIONAL DEDUCTIONS", description: "Actual tip records and additional deduction sources", groupLabel: "Deductions" },
  {
    id: "personal-info",
    label: "About You",
    eyebrow: "PERSONAL",
    description: "Your name, address, and filing details",
    groupLabel: "Basics",
  },
  {
    id: "income-w2",
    label: "W-2 Wages",
    eyebrow: "INCOME",
    description: "Let's get your employer wage info",
    groupLabel: "Income",
  },
  {
    id: "income-self-employment",
    label: "Self-Employment",
    eyebrow: "INCOME",
    description: "Freelance and business income",
    groupLabel: "Income",
  },
  {
    id: "income-investments",
    label: "Investments",
    eyebrow: "INCOME",
    description: "Stocks, dividends, and interest",
    groupLabel: "Income",
  },
  { id: "income-royalties", label: "Royalty Income", eyebrow: "INCOME", description: "Original royalty statements and property expenses", groupLabel: "Income" },
  {
    id: "income-rental",
    label: "Rental Income",
    eyebrow: "INCOME",
    description: "Rental property income and expenses",
    groupLabel: "Income",
  },
  {
    id: "income-retirement",
    label: "Retirement Income",
    eyebrow: "INCOME",
    description: "IRA, 401(k), and pension distributions",
    groupLabel: "Income",
  },
  {
    id: "income-social-security",
    label: "Social Security",
    eyebrow: "INCOME",
    description: "Social Security benefit payments",
    groupLabel: "Income",
  },
  {
    id: "income-unemployment",
    label: "Unemployment",
    eyebrow: "INCOME",
    description: "Unemployment compensation received",
    groupLabel: "Income",
  },
  {
    id: "adjustments",
    label: "Adjustments",
    eyebrow: "ADJUSTMENTS",
    description: "HSA, student loans, and other above-the-line deductions",
    groupLabel: "Adjustments",
  },
  {
    id: "deductions",
    label: "Deductions",
    eyebrow: "DEDUCTIONS",
    description: "Standard or itemized — we'll help you pick the better option",
    groupLabel: "Deductions",
  },
  {
    id: "credits",
    label: "Tax Credits",
    eyebrow: "CREDITS",
    description: "Child tax credit, education, energy, and more",
    groupLabel: "Credits",
  },
  {
    id: "other-taxes",
    label: "Other Taxes",
    eyebrow: "OTHER TAXES",
    description: "Self-employment tax, household employment, and more",
    groupLabel: "Other Taxes",
  },
  {
    id: "payments",
    label: "Payments & Withholding",
    eyebrow: "PAYMENTS",
    description: "Tax already paid through withholding and estimated payments",
    groupLabel: "Payments",
  },
  {
    id: "review",
    label: "Review & Summary",
    eyebrow: "REVIEW",
    description: "Check everything before we finalize",
    groupLabel: "Review",
  },
  {
    id: "state-return",
    label: "State Return",
    eyebrow: "STATE",
    description: "Your state tax return",
    groupLabel: "State",
  },
  {
    id: "final-review",
    label: "Final Review",
    eyebrow: "FINAL REVIEW",
    description: "Confirm your summary and open the full return",
    groupLabel: "Review",
  },
];

// ── Section routing (skip logic) ───────────────────────────────────────────

const incomeTypeToSection: Record<IncomeType, InterviewSectionId> = {
  "w2-wages": "income-w2",
  "self-employment": "income-self-employment",
  "investments": "income-investments",
  "rental": "income-rental",
  "royalties": "income-royalties",
  "retirement": "income-retirement",
  "social-security": "income-social-security",
  "unemployment": "income-unemployment",
};

export function buildSectionRoute(segmentation: SegmentationAnswers): InterviewSectionDefinition[] {
  const sections: InterviewSectionDefinition[] = [];

  // Personal info is always included
  const personalInfo = allSections.find((s) => s.id === "personal-info");
  if (personalInfo) sections.push(personalInfo);

  // Income sections — only include those the user indicated
  for (const incomeType of segmentation.incomeTypes) {
    const sectionId = incomeTypeToSection[incomeType];
    const section = allSections.find((s) => s.id === sectionId);
    if (section) sections.push(section);
  }

  // Adjustments — include when the taxpayer selects a supported source route.
  const needsAdjustments =
    segmentation.lifeEvents.includes("k1-loss-sources") ||
    segmentation.incomeTypes.includes("self-employment") ||
    segmentation.lifeEvents.includes("student-loans") ||
    segmentation.lifeEvents.includes("hsa-contributions") ||
    segmentation.lifeEvents.includes("educator-expenses") ||
    segmentation.lifeEvents.includes("self-employed-health-insurance") ||
    segmentation.lifeEvents.includes("foreign-earned-income") ||
    segmentation.lifeEvents.includes("net-operating-loss") ||
    segmentation.lifeEvents.includes("current-year-loss") ||
    segmentation.lifeEvents.includes("cancelled-debt");
  if (needsAdjustments) {
    const adj = allSections.find((s) => s.id === "adjustments");
    if (adj) sections.push(adj);
  }

  // Deductions — always included
  const deductions = allSections.find((s) => s.id === "deductions");
  if (deductions) sections.push(deductions);

  if (segmentation.lifeEvents.includes("additional-deductions")) {
    const additional = allSections.find(section => section.id === "additional-deductions");
    if (additional) sections.push(additional);
  }

  // Credits — include if had a baby or has dependents (always show for now)
  const credits = allSections.find((s) => s.id === "credits");
  if (credits) sections.push(credits);

  // Actual retirement and investment sources may need the NIIT worksheet.
  if (segmentation.lifeEvents.includes("k1-loss-sources") || segmentation.incomeTypes.some(type => ["self-employment", "investments", "rental", "royalties", "retirement"].includes(type))) {
    const otherTaxes = allSections.find((s) => s.id === "other-taxes");
    if (otherTaxes) sections.push(otherTaxes);
  }

  // Payments — always included
  const payments = allSections.find((s) => s.id === "payments");
  if (payments) sections.push(payments);

  // Review — always included
  const review = allSections.find((s) => s.id === "review");
  if (review) sections.push(review);

  // State return — only if a state was selected
  if (segmentation.stateCode !== null) {
    const stateReturn = allSections.find((s) => s.id === "state-return");
    if (stateReturn) sections.push(stateReturn);
  }

  const finalReview = allSections.find((s) => s.id === "final-review");
  if (finalReview) sections.push(finalReview);

  return sections;
}

// ── Section data (form values captured during the interview) ───────────────

export type DependentRelationship =
  | "child"
  | "stepchild"
  | "foster-child"
  | "sibling"
  | "step-sibling"
  | "grandchild"
  | "niece-nephew"
  | "parent"
  | "other";

export const dependentRelationshipOptions: { value: DependentRelationship; label: string }[] = [
  { value: "child", label: "Son or daughter" },
  { value: "stepchild", label: "Stepchild" },
  { value: "foster-child", label: "Foster child" },
  { value: "sibling", label: "Brother or sister" },
  { value: "step-sibling", label: "Stepbrother or stepsister" },
  { value: "grandchild", label: "Grandchild" },
  { value: "niece-nephew", label: "Niece or nephew" },
  { value: "parent", label: "Parent or grandparent" },
  { value: "other", label: "Other qualifying relative" },
];

export interface DependentEntryData {
  firstName: string;
  lastName: string;
  ssn: string;
  dateOfBirth: string;
  relationship: DependentRelationship | "";
  monthsLivedWithYou: string;
  qualifiesForCTC: boolean | null;
  qualifiesForODC: boolean | null;
  qualifiesForEIC: boolean | null;
  ctcSsnEligible?: boolean | null;
  odcTinEligible?: boolean | null;
}

export const emptyDependentEntry: DependentEntryData = {
  firstName: "",
  lastName: "",
  ssn: "",
  dateOfBirth: "",
  relationship: "",
  monthsLivedWithYou: "",
  qualifiesForCTC: null,
  qualifiesForODC: null,
  qualifiesForEIC: null,
};

export interface SpouseInfoData {
  firstName: string;
  lastName: string;
  ssn: string;
  dateOfBirth: string;
  usResidencyMonths: string;
  employmentValidSsnIssuedByDueDate?: boolean | null;
  tinIssuedByDueDate?: boolean | null;
}

export const emptySpouseInfo: SpouseInfoData = { firstName: "", lastName: "", ssn: "", dateOfBirth: "", usResidencyMonths: "" };

export interface PersonalInfoData {
  eicRecertificationSources?: import('./guided-form-8862').Form8862Data;
  eicDisallowanceHistory?: import('./guided-eic-disallowance-history').EicDisallowanceHistoryData;
  eicSeparatedSpouseSources?: import('./guided-eic-separated-spouse').EicSeparatedSpouseData;
  eicClaimantEligibility?: EicClaimantEligibilityData;
  standardDeductionFacts?: StandardDeductionData;
  employmentValidSsnIssuedByDueDate?: boolean | null;
  tinIssuedByDueDate?: boolean | null;
  childTaxCredit?: {
    bonaFidePuertoRicoResident?: boolean | null;
    possessionIncomeExclusion?: string;
    puertoRicoExcludedIncome?: string;
    form4563ExcludedIncome?: string;
    nonTaxableCombatPayElection?: string;
  };
  dateOfBirth?: string;
  usResidencyMonths?: string;
  stateResidency?: "full-year" | "part-year" | "nonresident" | null;
  spouse?: SpouseInfoData;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
  firstName: string;
  middleName?: string;
  lastName: string;
  ssn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  dependentCount: string;
  dependents?: DependentEntryData[];
}

export const emptyPersonalInfo: PersonalInfoData = {
  dateOfBirth: "",
  usResidencyMonths: "",
  stateResidency: null,
  firstName: "",
  middleName: "",
  lastName: "",
  ssn: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  dependentCount: "0",
  dependents: [],
};

export interface W2EntryData {
  stateLocalSources?: W2StateLocalSources;
  localWages?: string; localTaxWithheld?: string; localityName?: string;
  sourceTaxYear?: string;
  box12CodeTP?: string; box12CodeTT?: string; treasuryTippedOccupationCodes?: string[];
  box12CodeD?: string; box12CodeE?: string; box12CodeF?: string; box12CodeG?: string; box12CodeH?: string; box12CodeS?: string; box12CodeAA?: string; box12CodeBB?: string; box12CodeEE?: string; box12CodeT?: string;
  box12CodeW?: string;
  box10DependentCareBenefits?: string;
  accountHolder?: "primary" | "spouse" | "";
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  employerName: string;
  employerEin: string;
  wages: string;
  federalWithheld: string;
  socialSecurityWages: string;
  socialSecurityTips?: string;
  allocatedTips?: string;
  socialSecurityWithheld: string;
  medicareWages: string;
  medicareWithheld: string;
  stateWages: string;
  stateWithheld: string;
  aiSuggestedFields?: Partial<Record<W2SuggestedField, GuidedSuggestedFieldState>>;
}

export type W2SuggestedField =
  | "accountHolder"
  | "state"
  | "employerName"
  | "employerEin"
  | "wages"
  | "federalWithheld"
  | "socialSecurityWages"
  | "socialSecurityTips"
  | "box10DependentCareBenefits"
  | "box12CodeW"
  | "socialSecurityWithheld"
  | "medicareWages"
  | "medicareWithheld"
  | "stateWages"
  | "stateWithheld";

const w2SuggestedFieldLabels: Record<W2SuggestedField, string> = {
  accountHolder: "W-2 recipient",
  state: "Box 15 state",
  employerName: "Employer name",
  employerEin: "Employer EIN",
  wages: "Box 1 wages",
  federalWithheld: "Box 2 federal tax withheld",
  socialSecurityWages: "Box 3 social security wages",
  socialSecurityTips: "Box 7 social security tips",
  box10DependentCareBenefits: "Box 10 dependent care benefits",
  box12CodeW: "Box 12 code W employer HSA contributions",
  socialSecurityWithheld: "Box 4 social security tax withheld",
  medicareWages: "Box 5 medicare wages",
  medicareWithheld: "Box 6 medicare tax withheld",
  stateWages: "Box 16 state wages",
  stateWithheld: "Box 17 state income tax",
};

function getW2SuggestedFieldLabel(field: W2SuggestedField): string {
  return w2SuggestedFieldLabels[field];
}

export interface GuidedSuggestedFieldState {
  sourceLabel: string;
  sourceType?: string;
  status: "pending-confirmation" | "confirmed";
}

export const emptyW2Entry: W2EntryData = {
  accountHolder: "",
  stateTaxReporting: "",
  state: "",
  employerName: "",
  employerEin: "",
  wages: "",
  federalWithheld: "",
  socialSecurityWages: "",
  socialSecurityTips: "",
  socialSecurityWithheld: "",
  medicareWages: "",
  medicareWithheld: "",
  stateWages: "",
  stateWithheld: "",
  aiSuggestedFields: {},
};

export interface NecEntryData {
  sourceTaxYear?: string;
  cashTips?: string; qualifiedOvertimeCompensation?: string; treasuryTippedOccupationCodes?: string[];
  payerName: string;
  payerTin: string;
  nonemployeeCompensation: string;
  federalWithheld: string;
  accountHolder?: "primary" | "spouse" | "";
  stateTaxReporting?: "none" | "single" | "multiple" | "";
  state?: string;
  stateIncome?: string;
  stateWithheld?: string;
}

export const emptyNecEntry: NecEntryData = {
  payerName: "",
  payerTin: "",
  nonemployeeCompensation: "",
  federalWithheld: "",
};

export interface ScheduleCExpenseData {
  employeeBenefitPrograms?: string;
  advertising: string;
  carAndTruck: string;
  insurance: string;
  officeExpense: string;
  supplies: string;
  travel: string;
  meals: string;
  utilities: string;
  otherExpenses: string;
}

export const emptyScheduleCExpenses: ScheduleCExpenseData = {
  advertising: "",
  carAndTruck: "",
  insurance: "",
  officeExpense: "",
  supplies: "",
  travel: "",
  meals: "",
  utilities: "",
  otherExpenses: "",
};

export type ScheduleCExpenseSuggestionCategory =
  | keyof ScheduleCExpenseData
  | "not-business"
  | "needs-review";

export interface ScheduleCBankStatementSuggestion {
  id: string;
  date: string;
  description: string;
  amount: string;
  sourceSection?: string;
  sourceQuote?: string;
  suggestedCategory: ScheduleCExpenseSuggestionCategory;
  suggestedBusinessUse: boolean;
  confidence: "high" | "low";
  reason: string;
  appliedCategory?: keyof ScheduleCExpenseData | null;
  dismissed?: boolean;
}

export interface ScheduleCBankStatementAnalysis {
  id: string;
  fileName: string;
  label: string;
  uploadedAt: string;
  summary: string;
  institution?: string;
  statementPeriod?: string;
  suggestions: ScheduleCBankStatementSuggestion[];
  /** Unconfirmed source proposals; never included in expense totals automatically. */
  sourceFacts?: import("@tax-engine/engine/src/ai-application-schemas").AiSourceFact[];
}

export interface SelfEmploymentIncomeDocumentSuggestion {
  id: string;
  date: string;
  description: string;
  amount: string;
  sourceQuote?: string;
  confidence: "high" | "low";
  reason: string;
  applied: boolean;
  dismissed?: boolean;
}

export interface SelfEmploymentIncomeDocumentAnalysis {
  id: string;
  fileName: string;
  label: string;
  uploadedAt: string;
  summary: string;
  payer?: string;
  documentPeriod?: string;
  suggestions: SelfEmploymentIncomeDocumentSuggestion[];
  /** Unconfirmed source proposals; never included in gross receipts automatically. */
  sourceFacts?: import("@tax-engine/engine/src/ai-application-schemas").AiSourceFact[];
}

// ── Investment income data ────────────────────────────────────────────────

export interface InterestEntryData extends InvestmentSourceData {
  payer: string;
  interestIncome: string;
  federalWithheld: string;
  earlyWithdrawalPenalty?: string;
  usSavingsBondInterest?: string;
  foreignTaxPaid?: string;
  foreignCountry?: string;
  taxExemptInterest?: string;
  privateActivityBondInterest?: string;
  marketDiscount?: string;
  bondPremium?: string;
  treasuryBondPremium?: string;
  taxExemptBondPremium?: string;
}

export const emptyInterestEntry: InterestEntryData = {
  payer: "",
  interestIncome: "",
  federalWithheld: "",
};

export interface DividendEntryData extends InvestmentSourceData {
  payer: string;
  ordinaryDividends: string;
  qualifiedDividends: string;
  capitalGainDistributions: string;
  federalWithheld: string;
  section199ADividends: string;
  foreignTaxPaid: string;
  foreignCountry?: string;
  section1250Gain?: string;
  section1202Gain?: string;
  collectiblesGain?: string;
  nondividendDistributions?: string;
  exemptInterestDividends?: string;
  specifiedPrivateActivityBondInterest?: string;
  section897OrdinaryDividends?: string;
  section897CapitalGain?: string;
}

export const emptyDividendEntry: DividendEntryData = {
  payer: "",
  ordinaryDividends: "",
  qualifiedDividends: "",
  capitalGainDistributions: "",
  federalWithheld: "",
  section199ADividends: "",
  foreignTaxPaid: "",
};

export interface CapitalGainTransactionData {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: string;
  costBasis: string;
  holdingPeriod: "" | "short" | "long";
  basisReportedToIRS: boolean | null;
  digitalAsset: boolean | null;
  washSale?: boolean | null;
  washSaleDisallowed?: string;
  adjustments?: string;
  sourceClassificationConfirmed?: boolean | null;
  specialGainCharacter?: "" | "ordinary" | "collectible" | "qsbs" | "other";
}

export const emptyCapitalGainTransaction: CapitalGainTransactionData = {
  description: "",
  dateAcquired: "",
  dateSold: "",
  proceeds: "",
  costBasis: "",
  holdingPeriod: "",
  basisReportedToIRS: null,
  digitalAsset: null,
  washSale: null,
  washSaleDisallowed: "",
  adjustments: "",
  sourceClassificationConfirmed: null,
  specialGainCharacter: "",
};

export interface BrokerageEntryData extends InvestmentSourceData {
  broker: string;
  sourceId?: string;
  sourceTaxYear?: string;
  federalWithheld?: string;
  withholdingOnlyOpenShortSale?: {
    description: string; openedDate: string;
    stillOpenAtYearEndConfirmed: boolean | null; otherNumberedBoxesBlankConfirmed: boolean | null;
  };
  transactions: CapitalGainTransactionData[];
}

export const emptyBrokerageEntry: BrokerageEntryData = {
  broker: "",
  transactions: [emptyCapitalGainTransaction],
};

// ── Deductions data ─────────────────────────────────────────────────────────

export type DeductionMethod = "standard" | "itemized" | "nonitemized";

export interface MortgageEntryData extends MortgageSourceData {
  lender: string;
  mortgageInterest: string;
  outstandingPrincipal: string;
  originationDate: string;
}

export const emptyMortgageEntry: MortgageEntryData = { lender: "", mortgageInterest: "", outstandingPrincipal: "", originationDate: "" };

export interface DonationEntryData {
  organization: string;
  type: "" | "cash" | "appreciated_stock" | "property" | "other";
  amount: string;
  date: string;
  costBasis: string;
  isLongTermCapitalGain: boolean | null;
  /** Saved legacy provenance; true does not establish a recipient tax category. */
  isPrivateFoundation: boolean | null;
  recipientCategory?: "fifty-percent" | "private-nonoperating" | "other-thirty-percent" | null;
  qualifiedOrganization?: boolean | null;
  supportingOrganization?: boolean | null;
  donorAdvisedFund?: boolean | null;
  qualifiedAppreciatedStock?: boolean | null;
}

export const emptyDonationEntry: DonationEntryData = { organization: "", type: "", amount: "", date: "", costBasis: "", isLongTermCapitalGain: null, isPrivateFoundation: null };

export interface DeductionData {
  method: DeductionMethod;
  medicalExpenses: string;
  stateLocalTaxes: string;
  nonW2IncomeTaxesDeductedElsewhere?: string;
  realEstateTaxes: string;
  mortgageInterest: string;
  charitableContributions: string;
  casualtyLosses: string;
  otherItemized: string;
  personalPropertyTaxes?: string;
  investmentInterestExpense?: string;
  investmentInterestSources?: InvestmentInterestSourceData;
  gamblingWinnings?: string;
  gamblingLosses?: string;
  gamblingExpenses?: string;
  mortgageEntries?: MortgageEntryData[];
  mortgageWorksheet?: MortgageWorksheetData;
  donationEntries?: DonationEntryData[];
  charitableCarryoverSources?: CharitableCarryoverData;
  k1CharitableSources?: K1CharitableSourcesData;
  cryptoDonations?: CryptoDonationData[];
}

export const emptyDeductionData: DeductionData = {
  method: "standard",
  medicalExpenses: "",
  stateLocalTaxes: "",
  realEstateTaxes: "",
  mortgageInterest: "",
  charitableContributions: "",
  casualtyLosses: "",
  otherItemized: "",
};

// ── Adjustments data ──────────────────────────────────────────────────────

export interface AdjustmentData {
  k1LossSources?: K1LossSourcesData;
  codNolSources?: CodNolData;
  currentLossOrigin?: CurrentLossOriginData;
  netOperatingLossSources?: NetOperatingLossData;
  foreignIncome?: ForeignIncomeData;
  hsaAccounts?: HsaAccountData[];
  hsaDeduction: string;
  studentLoanInterest: string;
  studentLoanFacts?: StudentLoanData;
  selfEmployedHealthInsurance: string;
  healthInsuranceFacts?: HealthInsuranceData;
  educatorExpenses: string;
  educatorExpenseSources?: EducatorSourceData[];
  iraDeduction: string;
  alimonyPaid: string;
  iraContributions?: {
    primaryContributions: string;
    primaryIsActiveParticipant: boolean | null;
    spouseContributions: string;
    spouseIsActiveParticipant: boolean | null;
    primaryCompensation?: string;
    spouseCompensation?: string;
    primaryRothContributions?: string;
    spouseRothContributions?: string;
    primarySection501c18Contributions?: string;
    spouseSection501c18Contributions?: string;
    contributionTaxYear?: string;
    contributionTimingConfirmed?: boolean | null;
    specialContributionRulesRequired?: boolean | null;
    sourceFactsConfirmed?: boolean | null;
  };
  alimonyQualification?: {
    instrumentDate: string;
    post2018ModificationAppliesNewRules: boolean | null;
    paidInCash: boolean | null;
    notDesignatedNondeductible: boolean | null;
    notChildSupport: boolean | null;
    noJointReturnWithRecipient: boolean | null;
    householdRequirementMet: boolean | null;
    noPaymentsAfterRecipientDeath: boolean | null;
    recipientSsn: string;
  };
}

export const emptyAdjustmentData: AdjustmentData = {
  hsaDeduction: "",
  studentLoanInterest: "",
  selfEmployedHealthInsurance: "",
  educatorExpenses: "",
  iraDeduction: "",
  alimonyPaid: "",
};

// ── Payments data ───────────────────────────────────────────────────────────

export interface EstimatedPaymentEntry {
  date: string;
  amount: string;
}

export const emptyEstimatedPayment: EstimatedPaymentEntry = {
  date: "",
  amount: "",
};

export interface PaymentData {
  estimatedTaxFacts?: EstimatedTaxFactsData;
  estimatedPayments: EstimatedPaymentEntry[];
  otherPayments: string;
  extensionPayments?: EstimatedPaymentEntry[];
  priorYearAppliedCredits?: { sourceTaxYear: string; amount: string }[];
}

export const emptyPaymentData: PaymentData = {
  estimatedPayments: [],
  otherPayments: "",
};

// ── Credits data ────────────────────────────────────────────────────────────

export interface CareProviderData {
  name: string; address: string;
  identifierType: "tin" | "tax_exempt" | "foreign_no_us_tin" | "employer_furnished" | "withheld" | "";
  taxId?: string; dueDiligenceStatement?: string;
  householdEmployee?: boolean | null; amountPaid: string;
}
export interface CareQualifyingPersonData {
  firstName: string; lastName: string; identifierType: "tax_id" | "died" | ""; taxId?: string;
  over12Disabled?: boolean | null; qualifyingPersonConfirmed?: boolean | null; qualifiedExpenses: string;
}
export interface DependentCareData {
  expenses: string;
  qualifyingIndividuals: string;
  primaryEarnedIncome?: string;
  spouseEarnedIncome?: string;
  excludedDependentCareBenefits?: string;
  eligibilityConfirmed?: boolean | null;
  priorYearExpenseCredit?: string;
  sourceFactsConfirmed?: boolean | null;
  receivedBenefits?: boolean | null;
  usesDeemedIncome?: boolean | null;
  providers?: CareProviderData[];
  qualifyingPersons?: CareQualifyingPersonData[];
}

export const emptyDependentCareData: DependentCareData = {
  expenses: "",
  qualifyingIndividuals: "",
};

export interface EducationInstitutionData {
  name: string; address: string; ein?: string;
  receivedCurrentYear1098T?: boolean | null;
  receivedPriorYear1098TWithBox7?: boolean | null;
}
export interface EducationStudentSourceData {
  name: string;
  qualifiedExpenses: string;
  studentTaxId?: string;
  studentRole?: "primary" | "spouse" | "dependent" | "";
  studentTinEligible?: boolean | null;
  studentSsnEligible?: boolean | null;
  institutionEligible?: boolean | null;
  expensesEligibilityConfirmed?: boolean | null;
  form1098TRequirementMet?: boolean | null;
  institutions?: EducationInstitutionData[];
}
export interface EducationLlcStudentData extends EducationStudentSourceData { courseEligibilityConfirmed?: boolean | null }
export interface EducationStudentData extends EducationStudentSourceData {
  priorYearsClaimed: string;
  completedFirstFourYearsBeforeYear?: boolean | null;
  enrolledAtLeastHalfTime?: boolean | null;
  pursuingDegreeOrCredential?: boolean | null;
  felonyDrugConviction?: boolean | null;
  studentSsnEligible?: boolean | null;
  institutionEin?: string;
  requiresPriorYearsConfirmation?: boolean;
}

export const emptyEducationStudent: EducationStudentData = {
  name: "",
  qualifiedExpenses: "",
  priorYearsClaimed: "",
};

export interface EducationCreditData {
  aocStudents: EducationStudentData[];
  llcStudents?: EducationLlcStudentData[];
  llcExpenses: string;
  refundableAocEligible?: boolean | null;
  primarySsnEligible?: boolean | null;
  spouseSsnEligible?: boolean | null;
  primaryTinEligible?: boolean | null;
  canBeClaimedAsDependent?: boolean | null;
  claimedAsDependent?: boolean | null;
  nonresidentAlien?: boolean | null;
  residentJointElection?: boolean | null;
  aocBanInEffect?: boolean | null;
  form8862Required?: boolean | null;
  form8862Completed?: boolean | null;
  possessionIncomeExclusion?: string;
  refundableAocFacts?: { fullTimeStudent?: boolean | null; earnedIncome?: string; totalSupport?: string; parentAlive?: boolean | null };
}

export const emptyEducationCreditData: EducationCreditData = {
  aocStudents: [],
  llcExpenses: "",
};

export interface EnergyHomeData {
  id: string;
  owner?: "primary" | "spouse" | "joint" | "";
  address: { street: string; unit?: string; city: string; state: string; zip: string };
  locatedInUnitedStates?: boolean | null; usedAsResidence?: boolean | null;
  mainHomeFor?: "primary" | "spouse" | "both" | "neither" | "";
  mainHomeStartDate?: string; mainHomeEndDate?: string;
  ownedByTaxpayer?: boolean | null; jointOccupancyWithOtherReturn?: boolean | null;
  allOccupantCostsComplete?: boolean | null;
}
export interface EnergyPropertySourceData {
  sourceId?: string; homeId?: string;
  totalCostPaidByAllOccupants?: string;
  associationCostShare?: boolean | null;
  associationAllocation?: { totalQualifiedCost: string; numerator: string; denominator: string; sourceReference: string };
}
export interface EnergyCreditData {
  sourceFactsConfirmed?: boolean | null;
  separateSpousalMainHomes?: boolean | null;
  homes?: EnergyHomeData[];
  solarElectricCost: string;
  solarWaterHeatingCost: string;
  insulationCost: string;
  exteriorDoorsWindowsCost: string;
  roofCost: string;
  energyEfficientHvacCost: string;
  waterHeaterHeatPumpCost: string;
  qualifiedImprovements?: EnergyImprovementData[];
  cleanEnergyProperties?: CleanEnergyPropertyData[];
  residenceEligibilityConfirmed?: boolean | null;
  priorYearCarryforward?: string;
  carryforwardSourceTaxYear?: string;
  carryforwardConfirmed?: boolean | null;
  legacyRoofTreatment?: "" | "not_eligible" | "qualified_solar_component";
}

export type EnergyImprovementCategory = "insulation" | "exterior_door" | "windows_skylights" | "central_ac" | "gas_water_heater" | "furnace_boiler" | "electrical_panel" | "heat_pump" | "heat_pump_water_heater" | "biomass" | "home_energy_audit";
export interface EnergyImprovementData extends EnergyPropertySourceData {
  originalUseByTaxpayer?: boolean | null; expectedFiveYearUse?: boolean | null;
  newConstruction?: boolean | null; auditReportCertified?: boolean | null;
  enabledPropertyIds?: string[]; panelLoadAmps?: string;
  panelCodeComplianceConfirmed?: boolean | null; consecutiveYearElection?: boolean | null;
  priorYearCreditClaimed?: boolean | null;
  category: EnergyImprovementCategory | "";
  qualifiedCost: string;
  installationCompletedDate: string;
  qualificationConfirmed: boolean | null;
  manufacturerQualifiedId?: string;
}
export type CleanEnergyCategory = "solar_electric" | "solar_water" | "fuel_cell" | "small_wind" | "geothermal" | "battery";
export interface CleanEnergyPropertyData extends EnergyPropertySourceData {
  batteryKilowattHours?: string;
  category: CleanEnergyCategory | "";
  qualifiedCost: string;
  installationCompletedDate: string;
  qualificationConfirmed: boolean | null;
  fuelCellKilowattCapacity?: string;
}

export const emptyEnergyCreditData: EnergyCreditData = {
  solarElectricCost: "",
  solarWaterHeatingCost: "",
  insulationCost: "",
  exteriorDoorsWindowsCost: "",
  roofCost: "",
  energyEfficientHvacCost: "",
  waterHeaterHeatPumpCost: "",
};

export interface CreditsData {
  minimumTaxCredit?: MinimumTaxCreditData;
  premiumTaxCredit?: PremiumTaxCreditData;
  dependentCare: DependentCareData;
  dependentCareBenefits?: CareBenefitsData;
  education: EducationCreditData;
  educationDistributions?: EducationDistributionData;
  savingsBondEducation?: SavingsBondEducationData;
  energy: EnergyCreditData;
  vehicles?: VehicleCreditData;
  adoption?: AdoptionCreditData;
}

export const emptyCreditsData: CreditsData = {
  dependentCare: emptyDependentCareData,
  education: emptyEducationCreditData,
  energy: emptyEnergyCreditData,
};

// ── Other taxes data ──────────────────────────────────────────────────────

export interface OtherTaxesData {
  niitSources?: NiitSourceData;
  foreignTaxElection?: ForeignTaxElectionData;
  householdEmploymentWages: string;
  acknowledgedSETax: boolean;
  acknowledgedAdditionalMedicare: boolean;
  acknowledgedNIIT: boolean;
  householdEmployees?: HouseholdEmployeeData[];
  futaApplies?: boolean | null;
  futaSectionA?: boolean | null;
  stateUnemploymentContributions?: string;
  stateUnemploymentContributionsPaidLate?: string;
  futaStatePeriods?: {
    state: string; periodStart: string; periodEnd: string; taxableWages: string;
    hasAssignedExperienceRate: boolean | null; experienceRatePercent: string; contributionsPaidTimely: string;
  }[];
  futaCreditReduction?: string;
}

export interface HouseholdEmployeeData {
  name: string;
  cashWages: string;
  federalIncomeTaxWithheld: string;
  isSpouse: boolean | null;
  isChildUnder21: boolean | null;
  isParent: boolean | null;
  parentCareExceptionApplies?: boolean | null;
  isUnder18NonPrincipal: boolean | null;
}

export const emptyHouseholdEmployee: HouseholdEmployeeData = { name: "", cashWages: "", federalIncomeTaxWithheld: "", isSpouse: null, isChildUnder21: null, isParent: null, isUnder18NonPrincipal: null };

export const emptyOtherTaxesData: OtherTaxesData = {
  householdEmploymentWages: "",
  acknowledgedSETax: false,
  acknowledgedAdditionalMedicare: false,
  acknowledgedNIIT: false,
};

// ── State return data ────────────────────────────────────────────────────────

export interface StateEstimatedPaymentEntry {
  date: string;
  amount: string;
  state?: string;
}

export const emptyStateEstimatedPayment: StateEstimatedPaymentEntry = {
  date: "",
  amount: "",
};

export interface StateReturnData {
  paMarriedOrdinarySources?: import('@/models/pa-married-ordinary-sources').PAMarriedOrdinarySources;
  zeroIncomeMiscSources?: ZeroIncomeMiscSourceDraft[];
  stateEstimatedPayments: StateEstimatedPaymentEntry[];
  additionalStateWithholding: string;
  additionalStateWithholdingEntries?: StateWithholdingEntry[];
  ohioInterestAllocation?: OhioInterestAllocation;
  ohioResidency?: OhioResidencyDraft;
  ohioPayments?: OhioPaymentDraft;
  ohioReturnHeaderSources?: OhioReturnHeaderDraft;
  ohioSchoolDistrict?: OhioSchoolDistrictDraft;
  ohioReciprocalWages?: OhioReciprocalWagesDraft;
  paResidencySources?: PAResidencySources;
  paReciprocitySources?: PAReciprocitySources;
  paOrdinaryReturnFacts?: PAOrdinaryReturnFacts;
  paOrdinaryReturnCompletionSources?: GuidedPAOrdinaryReturnCompletionSources;
}

export interface StateWithholdingEntry {
  payer: string;
  documentType: string;
  state: string;
  taxYear: string;
  amount: string;
}

export const emptyStateWithholdingEntry: StateWithholdingEntry = { payer: "", documentType: "", state: "", taxYear: "", amount: "" };

export const emptyStateReturnData: StateReturnData = {
  stateEstimatedPayments: [],
  additionalStateWithholding: "",
};

// ── Section data map ────────────────────────────────────────────────────────

export interface SectionDataMap {
  "personal-info"?: PersonalInfoData;
  "income-w2"?: { entries: W2EntryData[] };
  "income-self-employment"?: {
    necEntries: NecEntryData[];
    manualGrossReceipts: string;
    expenses: ScheduleCExpenseData;
    bankStatementAnalyses?: ScheduleCBankStatementAnalysis[];
    incomeDocumentAnalyses?: SelfEmploymentIncomeDocumentAnalysis[];
    qbiMateriallyParticipated?: boolean | null;
    businessFacts?: BusinessSourceData;
  };
  "income-investments"?: InvestmentData;
  "income-retirement"?: { entries: RetirementEntryData[]; basisSources?: GuidedIraBasisData };
  "income-rental"?: { entries: RentalPropertyEntryData[] };
  "income-royalties"?: RoyaltyIncomeData;
  "income-social-security"?: SocialSecurityData;
  "income-unemployment"?: UnemploymentData;
  "deductions"?: DeductionData;
  "additional-deductions"?: AdditionalDeductionsData;
  "adjustments"?: AdjustmentData;
  "credits"?: CreditsData;
  "other-taxes"?: OtherTaxesData;
  "payments"?: PaymentData;
  "state-return"?: StateReturnData;
  [key: string]: unknown;
}

export type SelfEmploymentSectionData = NonNullable<SectionDataMap["income-self-employment"]>;

// ── Flow state ─────────────────────────────────────────────────────────────

export type GuidedFlowPhase = "segmentation" | "interview" | "complete";

export interface GuidedFlowState {
  factsVersion?: 2;
  /** Null or absent means the year has not been confirmed; never default in the adapter. */
  taxYear?: number | null;
  phase: GuidedFlowPhase;
  segmentation: SegmentationAnswers;
  /** Index into the routed section list (0-based) */
  currentSectionIndex: number;
  /** Completed section IDs */
  completedSections: InterviewSectionId[];
  /** User-entered data keyed by section ID */
  sectionData: SectionDataMap;
}

export const initialFlowState: GuidedFlowState = {
  factsVersion: 2,
  taxYear: null,
  phase: "segmentation",
  segmentation: emptySegmentation,
  currentSectionIndex: 0,
  completedSections: [],
  sectionData: {},
};

function addCurrencyStrings(left: string, right: string) {
  return parseGuidedCurrency(left).plus(parseGuidedCurrency(right)).toFixed(2);
}

export function acceptSelfEmploymentIncomeSuggestion(
  section: SelfEmploymentSectionData,
  analysisId: string,
  suggestionId: string,
): SelfEmploymentSectionData {
  const analysis = section.incomeDocumentAnalyses?.find((entry) => entry.id === analysisId);
  const suggestion = analysis?.suggestions.find((entry) => entry.id === suggestionId);

  if (!analysis || !suggestion || suggestion.applied || suggestion.dismissed) {
    return section;
  }

  return {
    ...section,
    manualGrossReceipts: addCurrencyStrings(section.manualGrossReceipts, suggestion.amount),
    ...(section.businessFacts ? { businessFacts: { ...section.businessFacts, incomeReconciled: null } } : {}),
    incomeDocumentAnalyses: section.incomeDocumentAnalyses?.map((entry) => (
      entry.id !== analysisId
        ? entry
        : {
            ...entry,
            suggestions: entry.suggestions.map((candidate) => (
              candidate.id !== suggestionId
                ? candidate
                : {
                    ...candidate,
                    applied: true,
                  }
            )),
          }
    )),
  };
}

export function dismissSelfEmploymentIncomeSuggestion(
  section: SelfEmploymentSectionData,
  analysisId: string,
  suggestionId: string,
): SelfEmploymentSectionData {
  return {
    ...section,
    incomeDocumentAnalyses: section.incomeDocumentAnalyses?.map((entry) => (
      entry.id !== analysisId
        ? entry
        : {
            ...entry,
            suggestions: entry.suggestions.map((candidate) => (
              candidate.id !== suggestionId
                ? candidate
                : {
                    ...candidate,
                    dismissed: true,
                  }
            )),
          }
    )),
  };
}

function withDefaultSectionData(sectionData: SectionDataMap): SectionDataMap {
  return {
    ...sectionData,
    deductions: sectionData.deductions ?? { ...emptyDeductionData },
  };
}

// ── Progress calculation ───────────────────────────────────────────────────

export interface FlowProgress {
  currentSectionIndex: number;
  totalSections: number;
  completedSections: number;
  percentComplete: number;
  currentSection: InterviewSectionDefinition | null;
  sections: InterviewSectionDefinition[];
}

export type VisitedSectionStatus = "not-started" | "complete" | "skipped" | "needs-review";

const SKIPPED_WHEN_EMPTY_SECTIONS = new Set<InterviewSectionId>(["personal-info"]);

export interface FlowCompletionSummary {
  totalSections: number;
  completedSections: number;
  skippedSections: number;
  needsReviewSections: number;
  sections: InterviewSectionDefinition[];
}

export interface GuidedReviewIssue {
  sectionId: InterviewSectionId;
  sectionLabel: string;
  status: "skipped" | "needs-review";
  message: string;
  actionLabel: string;
}

export function computeFlowProgress(state: GuidedFlowState): FlowProgress {
  const completion = summarizeFlowCompletion(state);
  const totalSections = completion.totalSections;
  const completedSections = completion.completedSections;
  const percentComplete = totalSections > 0
    ? Math.round((completedSections / totalSections) * 100)
    : 0;
  const currentSection = completion.sections[state.currentSectionIndex] ?? null;

  return {
    currentSectionIndex: state.currentSectionIndex,
    totalSections,
    completedSections,
    percentComplete,
    currentSection,
    sections: completion.sections,
  };
}

/** Display analysis of the entire current state, shared only within one render. */
export interface GuidedRenderAnalysis {
  completion: FlowCompletionSummary;
  progress: FlowProgress;
  sectionStatuses: ReadonlyMap<InterviewSectionId, VisitedSectionStatus>;
}

export function analyzeGuidedRender(state: GuidedFlowState): GuidedRenderAnalysis {
  const sections = buildSectionRoute(state.segmentation);
  const sectionStatuses = new Map(sections.map(section =>
    [section.id, getVisitedSectionStatus(state, section.id)] as const));
  const completion = sections.reduce<FlowCompletionSummary>((summary, section) => {
    const status = sectionStatuses.get(section.id);
    if (status === "complete") summary.completedSections += 1;
    else if (status === "skipped") summary.skippedSections += 1;
    else if (status === "needs-review") summary.needsReviewSections += 1;
    return summary;
  }, {
    totalSections: sections.length,
    completedSections: 0,
    skippedSections: 0,
    needsReviewSections: 0,
    sections,
  });
  return {
    completion,
    sectionStatuses,
    progress: {
      currentSectionIndex: state.currentSectionIndex,
      totalSections: completion.totalSections,
      completedSections: completion.completedSections,
      percentComplete: completion.totalSections > 0
        ? Math.round((completion.completedSections / completion.totalSections) * 100)
        : 0,
      currentSection: sections[state.currentSectionIndex] ?? null,
      sections,
    },
  };
}

// ── Navigation helpers ─────────────────────────────────────────────────────

export function canGoBack(state: GuidedFlowState): boolean {
  return state.phase === "interview" && state.currentSectionIndex > 0;
}

export function canGoForward(state: GuidedFlowState): boolean {
  const sections = buildSectionRoute(state.segmentation);
  return state.phase === "interview" && state.currentSectionIndex < sections.length - 1;
}

export function goToNextSection(state: GuidedFlowState): GuidedFlowState {
  const sections = buildSectionRoute(state.segmentation);
  const currentSection = sections[state.currentSectionIndex];
  const nextIndex = state.currentSectionIndex + 1;

  const completedSections = currentSection && !state.completedSections.includes(currentSection.id)
    ? [...state.completedSections, currentSection.id]
    : state.completedSections;

  if (nextIndex >= sections.length) {
    return {
      ...state,
      phase: "complete",
      completedSections,
    };
  }

  return {
    ...state,
    currentSectionIndex: nextIndex,
    completedSections,
  };
}

export function goToPreviousSection(state: GuidedFlowState): GuidedFlowState {
  if (state.currentSectionIndex <= 0) {
    return state;
  }

  return {
    ...state,
    currentSectionIndex: state.currentSectionIndex - 1,
  };
}

export function startInterview(segmentation: SegmentationAnswers, taxYear: number | null = null): GuidedFlowState {
  return {
    phase: "interview",
    taxYear,
    segmentation,
    currentSectionIndex: 0,
    completedSections: [],
    sectionData: withDefaultSectionData({}),
  };
}

/** Current source-only originals for explicit PA ordinary confirmation.
 * Residency controls use separate federal-only originals, avoiding a confirmation
 * cycle. This reads/replays existing proof; it never confirms either ordinary packet. */
export function buildGuidedPAOrdinarySourceInput(state: GuidedFlowState): TaxYearInput | null {
  if (state.segmentation.stateCode !== "PA") return null;
  const data = state.sectionData["state-return"];
  if(state.segmentation.filingStatus==='mfj'||data?.paMarriedOrdinarySources){
    try{const raw=buildTaxInputFromGuidedData(state);const parsed=raw?TaxYearInputSchema.safeParse(raw):undefined;return parsed?.success?parsed.data:null;}catch{return null;}
  }
  if (!data?.paResidencySources) return null;
  try {
    const raw = buildTaxInputFromGuidedData(state);
    const parsed = raw ? TaxYearInputSchema.safeParse(raw) : undefined;
    if (!parsed?.success) return null;
    if (data.paReciprocitySources) {
      const bound = buildGuidedPAReciprocitySources(parsed.data, data.paResidencySources, data.paReciprocitySources);
      return { ...parsed.data, paResidencySources: bound.residencySources, paReciprocitySources: bound.reciprocitySources };
    }
    return { ...parsed.data, paResidencySources: buildGuidedPAResidencySources(parsed.data, data.paResidencySources) };
  } catch { return null; }
}

/** Automatic original snapshots and confirmation headers are not new user facts. */
function paOrdinarySourceValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(paOrdinarySourceValues);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["sourceFactsConfirmed", "originalFederalSources", "originalTaxpayer", "originalFederalDependent"].includes(key))
    .map(([key, child]) => [key, paOrdinarySourceValues(child)]));
  return value;
}
function paMarriedSourceValues(value:StateReturnData['paMarriedOrdinarySources']):unknown{
 if(!value)return value;
 return paOrdinarySourceValues({...value,wages:value.wages.map(({original:_original,originalRecipientSsn:_recipient,...facts})=>facts)});
}
function paCompletionSourceValues(value: GuidedPAOrdinaryReturnCompletionSources | undefined): unknown {
  if (!value) return value;
  const { owner: _boundOwner, ...facts } = value;
  return paOrdinarySourceValues(facts);
}
/** Only top-level OH confirmation/snapshot fields are automatic metadata. */
function ohioActualSourceValues(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  function stable(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item)
      .filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
    return item;
  }
  // Encode after excluding only the top header; the generic cross-section
  // comparator intentionally ignores recursive confirmation metadata.
  return JSON.stringify(stable(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "sourceFactsConfirmed" && key !== "originalFederalSources").map(([key,child])=>[key,key==='businessSources'?ohioBusinessActualValues(child as import('./guided-ohio-business-facts').OhioBusinessDraft|undefined):key==='residentCreditSources'?ohioResidentCreditActualValues(child as OhioResidentCreditDraft|undefined):child]))));
}

function ohioHeaderActualSourceValues(value: OhioReturnHeaderDraft | undefined): unknown {
  if (!value) return value;
  const {originalFederalSources:_f,originalOhioResidencySources:_r,originalOhioPaymentSources:_p,originalOhioSchoolDistrictSources:_s,confirmedHeaderSources:_h,...actual}=value;
  return ohioActualSourceValues(actual);
}

function ohioReciprocalActualSourceValues(value: OhioReciprocalWagesDraft | undefined): unknown {
  if (!value) return value;
  const {originalResidencySources:_residency,originalPaymentSources:_payments,...actual}=value;
  return ohioActualSourceValues(actual);
}

function paStateDependencyValues(value: StateReturnData | undefined): unknown {
  if (!value) return value;
  const { paMarriedOrdinarySources: _married, paOrdinaryReturnFacts: _ordinary, paOrdinaryReturnCompletionSources: _completion, ...dependencies } = value;
  return dependencies;
}


/** Reuse only the already computed comparison of identical plain source material.
 * Both old and incoming PA packets must be absent; retained/unknown packets keep
 * their existing dependency projection, including its malformed-value behavior. */
function canReusePAStateDependencyComparison(previous: unknown, next: unknown): boolean {
  const packetsAbsent = (value: unknown): boolean => {
    if (value === undefined || value === null) return true;
    if (typeof value !== "object" || Array.isArray(value)) return false;
    const stateReturn = value as Partial<StateReturnData>;
    return stateReturn.paMarriedOrdinarySources === undefined
      && stateReturn.paOrdinaryReturnFacts === undefined
      && stateReturn.paOrdinaryReturnCompletionSources === undefined;
  };
  return next !== null && typeof next === "object" && !Array.isArray(next)
    && packetsAbsent(previous) && packetsAbsent(next);
}

function w2OriginalFields(entry: W2EntryData | undefined) {
  if (!entry) return undefined;
  const { stateLocalSources: _source, aiSuggestedFields: _suggestions, ...original } = entry;
  return original;
}

export function updateSectionData(
  state: GuidedFlowState,
  sectionId: string,
  data: unknown,
): GuidedFlowState {
  const credits = state.sectionData.credits;
  const adjustments = state.sectionData.adjustments;
  const iraSourcesChanged = ["income-w2", "income-self-employment", "income-retirement"].includes(sectionId) && adjustments?.iraContributions;
  const hsaSourcesChanged = ["income-w2", "personal-info"].includes(sectionId) && adjustments?.hsaAccounts;
  const sourceValuesChanged = guidedSourceValuesChanged(state.sectionData[sectionId as keyof SectionDataMap], data);
  const nextBusiness = sectionId === "income-self-employment" ? data as SelfEmploymentSectionData : state.sectionData["income-self-employment"];
  const scheduleCValues=(value:SelfEmploymentSectionData|undefined)=>value?{...value,businessFacts:value.businessFacts?{...value.businessFacts,incomeReconciled:undefined,expensesReconciled:undefined,macrsAssets:value.businessFacts.macrsAssets?{...value.businessFacts.macrsAssets,sourceFactsConfirmed:undefined,originalBusiness:undefined,originalCollection:undefined}:undefined}:undefined}:value;
  const scheduleCValuesChanged=sectionId==='income-self-employment'?guidedSourceValuesChanged(scheduleCValues(state.sectionData['income-self-employment']),scheduleCValues(nextBusiness)):sourceValuesChanged;
  const scheduleCSourcesChanged=scheduleCValuesChanged && ["personal-info","income-self-employment","adjustments","credits"].includes(sectionId) && nextBusiness?.businessFacts?.scheduleCSourceFacts;
  const macrsSourcesChanged=scheduleCValuesChanged && ["personal-info","income-self-employment","income-rental","income-royalties","adjustments","credits"].includes(sectionId) && nextBusiness?.businessFacts?.macrsAssets;
  const nextPersonal = sectionId === "personal-info" ? data as PersonalInfoData : state.sectionData["personal-info"];
  const eicClaimantSourcesChanged = sourceValuesChanged && sectionId === "personal-info" && nextPersonal?.eicClaimantEligibility;
  const eicSeparatedSourcesChanged = sourceValuesChanged && sectionId === "personal-info" && nextPersonal?.eicSeparatedSpouseSources;
  const eicCurrentSourcesChanged = sourceValuesChanged && sectionId === "personal-info" && nextPersonal?.eicRecertificationSources;
  const eicHistorySourcesChanged = sectionId === "personal-info" && nextPersonal?.eicDisallowanceHistory
    && eicHistorySourceValuesChanged(state.sectionData["personal-info"], nextPersonal) ? nextPersonal.eicDisallowanceHistory : undefined;
  const nextGovernment = sectionId === "income-unemployment" ? data as UnemploymentData : state.sectionData["income-unemployment"];
  const refundSourcesChanged = sourceValuesChanged && ["personal-info", "income-unemployment", "deductions"].includes(sectionId) && nextGovernment?.taxRefund;
  const nextRetirement = sectionId === "income-retirement" ? data as SectionDataMap["income-retirement"] : state.sectionData["income-retirement"];
  const iraBasisSourcesChanged = sourceValuesChanged && ["income-retirement", "personal-info", "adjustments"].includes(sectionId) && nextRetirement?.basisSources;
  const nextRoyalties = sectionId === "income-royalties" ? data as RoyaltyIncomeData : state.sectionData["income-royalties"];
  const royaltySourcesChanged = sourceValuesChanged && ["personal-info", "income-royalties"].includes(sectionId) && nextRoyalties;
  const nextRentals = sectionId === "income-rental" ? data as SectionDataMap["income-rental"] : state.sectionData["income-rental"];
  const rentalCarrySourcesChanged = sourceValuesChanged && sectionId !== "final-review" && nextRentals?.entries.some(entry => entry.priorLossSources);
  const nextPayments = sectionId === "payments" ? data as PaymentData : state.sectionData.payments;
  const estimatedTaxSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "additional-deductions", "other-taxes"].includes(sectionId) && nextPayments?.estimatedTaxFacts;
  const nextInvestments = sectionId === "income-investments" ? data as InvestmentData : state.sectionData["income-investments"];
  const digitalAssetHouseholdChanged = sourceValuesChanged && sectionId === "personal-info" && nextInvestments?.digitalAssetEntries?.length;
  const qofSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment"].includes(sectionId) && nextInvestments?.qofDispositionFacts;
  const capitalSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment", "income-rental", "income-royalties", "adjustments"].includes(sectionId) && nextInvestments?.scheduleDSources;
  const qsbsSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment", "income-rental", "income-royalties", "adjustments"].includes(sectionId) && nextInvestments?.section1202Sources;
  const childElectionSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "additional-deductions", "other-taxes"].includes(sectionId) && nextInvestments?.childElections?.length;
  const niitOtherTaxes = state.sectionData["other-taxes"];
  const nextOtherTaxes = sectionId === "other-taxes" ? data as OtherTaxesData : niitOtherTaxes;
  const foreignElectionChanged = sectionId === "other-taxes" && guidedSourceValuesChanged(niitOtherTaxes?.foreignTaxElection, nextOtherTaxes?.foreignTaxElection);
  const niitSourcesChanged = (foreignElectionChanged || (sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "state-return", "additional-deductions"].includes(sectionId))) && nextOtherTaxes?.niitSources;
  const foreignTaxSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment", "adjustments", "credits"].includes(sectionId) && nextOtherTaxes?.foreignTaxElection;
  const tipSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2"].includes(sectionId) && state.sectionData["additional-deductions"];
  const nextAdditional = sectionId === "additional-deductions" ? data as AdditionalDeductionsData : state.sectionData["additional-deductions"];
  const additionalSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-social-security", "adjustments", "credits", "deductions", "additional-deductions"].includes(sectionId) && nextAdditional?.schedule1A;
  const nextAdjustments = sectionId === "adjustments" ? data as AdjustmentData : adjustments;
  const k1LossSourcesChanged = sourceValuesChanged && sectionId !== "final-review" && nextAdjustments?.k1LossSources;
  const codSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes"].includes(sectionId) && nextAdjustments?.codNolSources;
  const currentLossSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes", "state-return"].includes(sectionId) && nextAdjustments?.currentLossOrigin;
  const nolSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes"].includes(sectionId) && nextAdjustments?.netOperatingLossSources;
  const foreignIncomeSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "adjustments", "credits", "deductions"].includes(sectionId) && nextAdjustments?.foreignIncome;
  const healthSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "credits", "adjustments"].includes(sectionId) && nextAdjustments?.healthInsuranceFacts;
  const mortgageSourcesChanged = sourceValuesChanged && sectionId === "personal-info" && state.sectionData.deductions?.mortgageEntries?.length ? state.sectionData.deductions : undefined;
  const nextDeductions = sectionId === "deductions" ? data as DeductionData : state.sectionData.deductions;
  const cryptoDonationsChanged = nextDeductions?.cryptoDonations && ((sourceValuesChanged && sectionId === "personal-info") || (sectionId === "deductions" && guidedSourceValuesChanged(state.sectionData.deductions?.cryptoDonations, nextDeductions.cryptoDonations)));
  const k1CharitableSourcesChanged = sourceValuesChanged && ["personal-info", "adjustments", "deductions"].includes(sectionId) && nextDeductions?.k1CharitableSources;
  const charitableCarryoverChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes", "state-return"].includes(sectionId) && nextDeductions?.charitableCarryoverSources;
  const investmentInterestSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes"].includes(sectionId) && nextDeductions?.investmentInterestSources;
  const educatorSourcesChanged = sourceValuesChanged && ["income-w2", "personal-info", "credits", "income-investments"].includes(sectionId) && adjustments?.educatorExpenseSources;
  const studentLoanSourcesChanged = sourceValuesChanged && ["income-w2", "personal-info", "credits"].includes(sectionId) && adjustments?.studentLoanFacts;
  const benefitSourcesChanged = (sectionId === "income-w2" || sectionId === "income-self-employment") && credits?.dependentCareBenefits;
  const nextCredits = sectionId === "credits" ? data as CreditsData : credits;
  const adoptionHistoryChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "additional-deductions", "other-taxes"].includes(sectionId)
    && nextCredits?.adoption?.children.some(child => child.priorYearForeignBenefitHistory) ? nextCredits?.adoption : undefined;
  const minimumTaxCreditSourcesChanged = sourceValuesChanged && ["personal-info", "credits"].includes(sectionId) && nextCredits?.minimumTaxCredit;
  const premiumTaxCreditSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-royalties", "income-social-security", "income-unemployment", "adjustments", "credits", "additional-deductions"].includes(sectionId) && nextCredits?.premiumTaxCredit;
  const educationSourcesChanged = !!nextCredits?.educationDistributions && (
    ((sectionId === "personal-info" || sectionId === "adjustments") && guidedSourceValuesChanged(state.sectionData[sectionId], data)) ||
    (sectionId === "credits" && (guidedSourceValuesChanged(credits?.education, nextCredits.education) || guidedSourceValuesChanged(credits?.savingsBondEducation, nextCredits.savingsBondEducation)
      || guidedSourceValuesChanged(credits?.educationDistributions, nextCredits.educationDistributions)))
  );
  const bondSourcesChanged = !!nextCredits?.savingsBondEducation && (
    (["personal-info", "income-investments", "adjustments"].includes(sectionId) && sourceValuesChanged) ||
    (sectionId === "credits" && (guidedSourceValuesChanged(credits?.education, nextCredits.education) || guidedSourceValuesChanged(credits?.educationDistributions, nextCredits.educationDistributions)
      || (nextCredits.savingsBondEducation?.reissueSources !== undefined && savingsBondSourceValuesChanged(credits?.savingsBondEducation, nextCredits.savingsBondEducation))))
  );
  const nextW2 = sectionId === "income-w2" ? data as SectionDataMap["income-w2"] : state.sectionData["income-w2"];
  const invalidatedW2 = nextW2 && (sectionId === "income-w2" || sectionId === "personal-info" && sourceValuesChanged) ? {
    ...nextW2, entries: nextW2.entries.map((entry, index) => entry.stateLocalSources && (sectionId === "personal-info" || guidedSourceValuesChanged(w2OriginalFields(state.sectionData["income-w2"]?.entries[index]), w2OriginalFields(entry)))
      ? { ...entry, stateLocalSources: { ...entry.stateLocalSources, sourceFactsConfirmed: null } } : entry),
  } : undefined;
  const ohioStateReturn = state.sectionData["state-return"];
  const ohioInterestChanged = sectionId === "income-investments" && ohioStateReturn?.ohioInterestAllocation;
  const stateOriginalsChanged = sourceValuesChanged && sectionId !== "state-return" && ohioStateReturn;
  const incomingStateReturn = sectionId === "state-return" ? data as StateReturnData : undefined;
  const paDependenciesChanged = incomingStateReturn && (canReusePAStateDependencyComparison(ohioStateReturn, incomingStateReturn)
    ? sourceValuesChanged
    : guidedSourceValuesChanged(paStateDependencyValues(ohioStateReturn), paStateDependencyValues(incomingStateReturn)));
  const paOrdinaryChanged = incomingStateReturn && guidedSourceValuesChanged(paOrdinarySourceValues(ohioStateReturn?.paOrdinaryReturnFacts), paOrdinarySourceValues(incomingStateReturn.paOrdinaryReturnFacts));
  const paCompletionChanged = incomingStateReturn && guidedSourceValuesChanged(paCompletionSourceValues(ohioStateReturn?.paOrdinaryReturnCompletionSources), paCompletionSourceValues(incomingStateReturn.paOrdinaryReturnCompletionSources));
  const paMarriedChanged=incomingStateReturn&&guidedSourceValuesChanged(paMarriedSourceValues(ohioStateReturn?.paMarriedOrdinarySources),paMarriedSourceValues(incomingStateReturn.paMarriedOrdinarySources));
  const invalidatedPAStateReturn = incomingStateReturn && (paDependenciesChanged || paOrdinaryChanged || paCompletionChanged || paMarriedChanged) ? {
    ...incomingStateReturn,
    ...(incomingStateReturn.paMarriedOrdinarySources&&(paDependenciesChanged||paOrdinaryChanged||paCompletionChanged||paMarriedChanged)?{paMarriedOrdinarySources:{...incomingStateReturn.paMarriedOrdinarySources,sourceFactsConfirmed:null}}:{}),
    ...(incomingStateReturn.paOrdinaryReturnFacts && (paDependenciesChanged || paOrdinaryChanged)
      ? { paOrdinaryReturnFacts: { ...incomingStateReturn.paOrdinaryReturnFacts, sourceFactsConfirmed: null } } : {}),
    ...(incomingStateReturn.paOrdinaryReturnCompletionSources && (paDependenciesChanged || paCompletionChanged)
      ? { paOrdinaryReturnCompletionSources: { ...incomingStateReturn.paOrdinaryReturnCompletionSources, sourceFactsConfirmed: null } } : {}),
  } : undefined;
  const ohioResidencyChanged = incomingStateReturn && guidedSourceValuesChanged(ohioActualSourceValues(ohioStateReturn?.ohioResidency), ohioActualSourceValues(incomingStateReturn.ohioResidency));
  const ohioPaymentsChanged = incomingStateReturn && guidedSourceValuesChanged(ohioActualSourceValues(ohioStateReturn?.ohioPayments), ohioActualSourceValues(incomingStateReturn.ohioPayments));
  const ohioSchoolDistrictChanged = incomingStateReturn && guidedSourceValuesChanged(ohioActualSourceValues(ohioStateReturn?.ohioSchoolDistrict), ohioActualSourceValues(incomingStateReturn.ohioSchoolDistrict));
  const ohioReciprocalChanged = incomingStateReturn && guidedSourceValuesChanged(ohioReciprocalActualSourceValues(ohioStateReturn?.ohioReciprocalWages), ohioReciprocalActualSourceValues(incomingStateReturn.ohioReciprocalWages));
  const currentOhioBusiness=incomingStateReturn?.ohioResidency?.businessSources;
  const ohioBusinessDependenciesChanged=currentOhioBusiness&&(incomingStateReturn&&guidedSourceValuesChanged(
    ohioActualSourceValues(ohioStateReturn?.ohioResidency?{...ohioStateReturn.ohioResidency,businessSources:undefined}:undefined),
    ohioActualSourceValues(incomingStateReturn.ohioResidency?{...incomingStateReturn.ohioResidency,businessSources:undefined}:undefined))||ohioPaymentsChanged||ohioSchoolDistrictChanged);
  const ohioBusinessChanged=currentOhioBusiness&&incomingStateReturn&&guidedSourceValuesChanged(ohioBusinessActualValues(ohioStateReturn?.ohioResidency?.businessSources),ohioBusinessActualValues(currentOhioBusiness));
  const invalidateBusiness=Boolean(currentOhioBusiness&&(ohioBusinessChanged||ohioBusinessDependenciesChanged));
  const currentOhioResidentCredit=incomingStateReturn?.ohioResidency?.residentCreditSources;
  const residentCreditDependenciesChanged=currentOhioResidentCredit&&(incomingStateReturn&&guidedSourceValuesChanged(
    ohioActualSourceValues(ohioStateReturn?.ohioResidency?{...ohioStateReturn.ohioResidency,residentCreditSources:undefined}:undefined),
    ohioActualSourceValues(incomingStateReturn.ohioResidency?{...incomingStateReturn.ohioResidency,residentCreditSources:undefined}:undefined))||ohioPaymentsChanged||ohioSchoolDistrictChanged||ohioReciprocalChanged);
  const residentCreditChanged=currentOhioResidentCredit&&incomingStateReturn&&guidedSourceValuesChanged(ohioResidentCreditActualValues(ohioStateReturn?.ohioResidency?.residentCreditSources),ohioResidentCreditActualValues(currentOhioResidentCredit));
  const invalidateResidentCredit=Boolean(currentOhioResidentCredit&&(residentCreditChanged||residentCreditDependenciesChanged));
  const currentOhioHeader=incomingStateReturn?.ohioReturnHeaderSources;
  const ohioHeaderChanged=incomingStateReturn&&guidedSourceValuesChanged(ohioHeaderActualSourceValues(ohioStateReturn?.ohioReturnHeaderSources),ohioHeaderActualSourceValues(currentOhioHeader));
  const invalidateHeader=Boolean(currentOhioHeader&&(ohioHeaderChanged||ohioResidencyChanged||ohioPaymentsChanged||ohioSchoolDistrictChanged||ohioReciprocalChanged||invalidateBusiness||invalidateResidentCredit));
  const invalidatedOhioStateReturn = incomingStateReturn && (ohioResidencyChanged || ohioPaymentsChanged || ohioSchoolDistrictChanged || ohioReciprocalChanged || invalidateBusiness || invalidateResidentCredit || invalidateHeader) ? {
    ...(invalidatedPAStateReturn ?? incomingStateReturn),
    ...(currentOhioHeader&&invalidateHeader?{ohioReturnHeaderSources:{...currentOhioHeader,sourceFactsConfirmed:null}}:{}),
    ...(incomingStateReturn.ohioResidency && (ohioResidencyChanged||invalidateBusiness||invalidateResidentCredit) ? { ohioResidency: { ...incomingStateReturn.ohioResidency, sourceFactsConfirmed: null,...(currentOhioBusiness&&invalidateBusiness?{businessSources:invalidateOhioBusiness(currentOhioBusiness)}:{}),...(currentOhioResidentCredit&&invalidateResidentCredit?{residentCreditSources:invalidateOhioResidentCredit(currentOhioResidentCredit)}:{}) } } : {}),
    ...(incomingStateReturn.ohioPayments && ohioPaymentsChanged ? { ohioPayments: { ...incomingStateReturn.ohioPayments, sourceFactsConfirmed: null } } : {}),
    ...(incomingStateReturn.ohioSchoolDistrict && (ohioResidencyChanged || ohioPaymentsChanged || ohioSchoolDistrictChanged || ohioReciprocalChanged || invalidateBusiness || invalidateResidentCredit) ? { ohioSchoolDistrict: { ...incomingStateReturn.ohioSchoolDistrict, sourceFactsConfirmed: null } } : {}),
    ...(incomingStateReturn.ohioReciprocalWages && (ohioResidencyChanged || ohioPaymentsChanged || ohioSchoolDistrictChanged || ohioReciprocalChanged) ? {ohioReciprocalWages:{...incomingStateReturn.ohioReciprocalWages,sourceFactsConfirmed:null}} : {}),
  } : undefined;
  return {
    ...state,
    sectionData: {
      ...state.sectionData,
      [sectionId]: data,
      ...((invalidatedOhioStateReturn ?? invalidatedPAStateReturn) ? { "state-return": invalidatedOhioStateReturn ?? invalidatedPAStateReturn } : {}),
      ...(invalidatedW2 ? { "income-w2": invalidatedW2 } : {}),
      ...((scheduleCSourcesChanged || macrsSourcesChanged) && nextBusiness ? {"income-self-employment":{...nextBusiness,businessFacts:{...nextBusiness.businessFacts,...(scheduleCSourcesChanged?{scheduleCSourceFacts:{...scheduleCSourcesChanged,sourceFactsConfirmed:null}}:{}),...(macrsSourcesChanged?{macrsAssets:{...macrsSourcesChanged,sourceFactsConfirmed:null}}:{})}}}:{}),
      ...(royaltySourcesChanged ? { "income-royalties": invalidateRoyaltySources(royaltySourcesChanged) } : {}),
      ...((eicClaimantSourcesChanged || eicSeparatedSourcesChanged || eicHistorySourcesChanged || eicCurrentSourcesChanged) && nextPersonal ? { "personal-info": { ...nextPersonal,
        ...(eicClaimantSourcesChanged ? { eicClaimantEligibility: { ...eicClaimantSourcesChanged, sourceFactsConfirmed: null } } : {}),
        ...(eicSeparatedSourcesChanged ? { eicSeparatedSpouseSources: { ...eicSeparatedSourcesChanged, sourceFactsConfirmed: null } } : {}),
        ...(eicHistorySourcesChanged ? { eicDisallowanceHistory: invalidateEicHistorySources(eicHistorySourcesChanged) } : {}),
        ...(eicCurrentSourcesChanged ? { eicRecertificationSources: { ...eicCurrentSourcesChanged, sourceFactsConfirmed: null } } : {}),
      } } : {}),
      ...(refundSourcesChanged && nextGovernment ? { "income-unemployment": { ...nextGovernment, taxRefund: { ...refundSourcesChanged, sourceFactsConfirmed: null } } } : {}),
      ...(iraBasisSourcesChanged && nextRetirement ? { "income-retirement": { ...nextRetirement, basisSources: { ...iraBasisSourcesChanged, sourceFactsConfirmed: null } } } : {}),
      ...(rentalCarrySourcesChanged && nextRentals ? { "income-rental": { ...nextRentals, entries: nextRentals.entries.map(entry => entry.priorLossSources ? { ...entry, priorLossSources: { ...entry.priorLossSources, sourceFactsConfirmed: null } } : entry) } } : {}),
      ...(estimatedTaxSourcesChanged && nextPayments ? { payments: { ...nextPayments, estimatedTaxFacts: { ...estimatedTaxSourcesChanged, sourceFactsConfirmed: null } } } : {}),
      ...((childElectionSourcesChanged || qofSourcesChanged || capitalSourcesChanged || qsbsSourcesChanged || digitalAssetHouseholdChanged) && nextInvestments ? { "income-investments": { ...nextInvestments, ...(childElectionSourcesChanged ? { childElections: nextInvestments.childElections?.map(child => ({ ...child, sourceFactsConfirmed: null })) } : {}), ...(qofSourcesChanged ? { qofDispositionFacts: { ...qofSourcesChanged, sourceFactsConfirmed: null, ...(qofSourcesChanged.investments ? { investments: qofSourcesChanged.investments.map(row => ({ ...row, sourceFactsConfirmed: null })) } : {}) } } : {}), ...(capitalSourcesChanged ? { scheduleDSources: { ...capitalSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(qsbsSourcesChanged ? { section1202Sources: { ...qsbsSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(digitalAssetHouseholdChanged ? { digitalAssetEntries: nextInvestments.digitalAssetEntries?.map(entry => ({ ...entry, sourceFactsConfirmed: null })) } : {}) } } : {}),
      ...((niitSourcesChanged || foreignTaxSourcesChanged) && nextOtherTaxes ? { "other-taxes": { ...nextOtherTaxes, ...(niitSourcesChanged ? { niitSources: { ...niitSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(foreignTaxSourcesChanged ? { foreignTaxElection: { ...foreignTaxSourcesChanged, sourceFactsConfirmed: null, ...(foreignTaxSourcesChanged.creditWithoutForm1116 ? { creditWithoutForm1116: { ...foreignTaxSourcesChanged.creditWithoutForm1116, sourceFactsConfirmed: null } } : {}), ...(foreignTaxSourcesChanged.creditWithForm1116 ? { creditWithForm1116: { ...foreignTaxSourcesChanged.creditWithForm1116, sourceFactsConfirmed: null } } : {}) } } : {}) } } : {}),
      ...((tipSourcesChanged || additionalSourcesChanged) && nextAdditional ? { "additional-deductions": { ...nextAdditional, ...(tipSourcesChanged ? { tipIncomeAccounts: nextAdditional.tipIncomeAccounts?.map(account => ({ ...account, sourceFactsConfirmed: null })) } : {}), ...(additionalSourcesChanged ? { schedule1A: { ...additionalSourcesChanged, sourceFactsConfirmed: null } } : {}) } } : {}),
      ...((mortgageSourcesChanged || investmentInterestSourcesChanged || charitableCarryoverChanged || k1CharitableSourcesChanged || cryptoDonationsChanged) && nextDeductions ? { deductions: { ...nextDeductions,
        ...(cryptoDonationsChanged ? { cryptoDonations: nextDeductions.cryptoDonations?.map(row => ({ ...row, sourceFactsConfirmed: null })) } : {}),
        ...(k1CharitableSourcesChanged ? { k1CharitableSources: invalidateK1CharitableSources(k1CharitableSourcesChanged) } : {}),
        ...(charitableCarryoverChanged ? { charitableCarryoverSources: { ...charitableCarryoverChanged, sourceFactsConfirmed: null,
          ...(charitableCarryoverChanged.filingUnitHistory ? { filingUnitHistory: { ...charitableCarryoverChanged.filingUnitHistory, sourceFactsConfirmed: null } } : {}),
        } } : {}),
        ...(mortgageSourcesChanged ? { mortgageEntries: mortgageSourcesChanged.mortgageEntries?.map(entry => ({ ...entry, sourceFactsConfirmed: null })), ...(mortgageSourcesChanged.mortgageWorksheet ? { mortgageWorksheet: { ...mortgageSourcesChanged.mortgageWorksheet, sourceFactsConfirmed: null } } : {}) } : {}),
        ...(investmentInterestSourcesChanged ? { investmentInterestSources: Object.fromEntries(Object.entries(investmentInterestSourcesChanged).map(([key, worksheet]) => [key, worksheet ? { ...worksheet, sourceFactsConfirmed: null, ...(worksheet.childIncomeSources ? { childIncomeSources: { ...worksheet.childIncomeSources, sourceFactsConfirmed: null } } : {}) } : worksheet])) } : {}),
      } } : {}),
      ...((ohioInterestChanged || stateOriginalsChanged) && ohioStateReturn ? { "state-return": {
        ...ohioStateReturn,
        ...(ohioInterestChanged ? { ohioInterestAllocation: { ...ohioInterestChanged, sourceFactsConfirmed: null } } : {}),
        ...(stateOriginalsChanged ? {
          ...(ohioStateReturn.ohioResidency ? {ohioResidency:{...ohioStateReturn.ohioResidency,sourceFactsConfirmed:null,...(ohioStateReturn.ohioResidency.businessSources?{businessSources:invalidateOhioBusiness(ohioStateReturn.ohioResidency.businessSources)}:{}),...(ohioStateReturn.ohioResidency.residentCreditSources?{residentCreditSources:invalidateOhioResidentCredit(ohioStateReturn.ohioResidency.residentCreditSources)}:{})}} : {}),
          ...(ohioStateReturn.ohioPayments ? {ohioPayments:{...ohioStateReturn.ohioPayments,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.ohioSchoolDistrict ? {ohioSchoolDistrict:{...ohioStateReturn.ohioSchoolDistrict,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.ohioReturnHeaderSources ? {ohioReturnHeaderSources:{...ohioStateReturn.ohioReturnHeaderSources,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.paMarriedOrdinarySources ? {paMarriedOrdinarySources:{...ohioStateReturn.paMarriedOrdinarySources,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.ohioReciprocalWages ? {ohioReciprocalWages:{...ohioStateReturn.ohioReciprocalWages,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.paResidencySources ? {paResidencySources:{...ohioStateReturn.paResidencySources,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.paReciprocitySources ? {paReciprocitySources:{...ohioStateReturn.paReciprocitySources,sourceFactsConfirmed:null}} : {}),
          ...(ohioStateReturn.paOrdinaryReturnFacts ? { paOrdinaryReturnFacts: { ...ohioStateReturn.paOrdinaryReturnFacts, sourceFactsConfirmed: null } } : {}),
          ...(ohioStateReturn.paOrdinaryReturnCompletionSources ? { paOrdinaryReturnCompletionSources: { ...ohioStateReturn.paOrdinaryReturnCompletionSources, sourceFactsConfirmed: null } } : {}),
        } : {}),
      } } : {}),
      ...((iraSourcesChanged || hsaSourcesChanged || educatorSourcesChanged || studentLoanSourcesChanged || healthSourcesChanged || foreignIncomeSourcesChanged || nolSourcesChanged || currentLossSourcesChanged || codSourcesChanged || k1LossSourcesChanged) && nextAdjustments ? { adjustments: { ...nextAdjustments,
        ...(k1LossSourcesChanged ? { k1LossSources: invalidateK1LossSources(k1LossSourcesChanged) } : {}),
        ...(codSourcesChanged ? { codNolSources: invalidateGuidedCodNol(codSourcesChanged) } : {}),
        ...(currentLossSourcesChanged ? { currentLossOrigin: invalidateCurrentLossOrigin(currentLossSourcesChanged) } : {}),
        ...(nolSourcesChanged ? { netOperatingLossSources: invalidateNetOperatingLossSources(nolSourcesChanged) } : {}),
        ...(foreignIncomeSourcesChanged ? { foreignIncome: { ...foreignIncomeSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(healthSourcesChanged ? { healthInsuranceFacts: invalidateHealthInsuranceSources(healthSourcesChanged) } : {}), ...(studentLoanSourcesChanged ? { studentLoanFacts: { ...studentLoanSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(iraSourcesChanged ? { iraContributions: { ...iraSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(hsaSourcesChanged ? { hsaAccounts: hsaSourcesChanged.map(account => ({ ...account, sourceFactsConfirmed: null })) } : {}), ...(educatorSourcesChanged ? { educatorExpenseSources: educatorSourcesChanged.map(source => ({ ...source, sourceFactsConfirmed: null })) } : {}) } } : {}),
      ...((benefitSourcesChanged || educationSourcesChanged || bondSourcesChanged || premiumTaxCreditSourcesChanged || minimumTaxCreditSourcesChanged || adoptionHistoryChanged) && nextCredits ? { credits: { ...nextCredits,
        ...(adoptionHistoryChanged ? { adoption: invalidateAdoptionHistories(adoptionHistoryChanged) } : {}),
        ...(minimumTaxCreditSourcesChanged ? { minimumTaxCredit: { ...minimumTaxCreditSourcesChanged, sourceFactsConfirmed: null } } : {}),
        ...(benefitSourcesChanged ? { dependentCareBenefits: { ...nextCredits.dependentCareBenefits, sourceFactsConfirmed: null, earnedIncomeWorksheetConfirmed: null, creditExpenseCoordinationConfirmed: null } } : {}),
        ...(educationSourcesChanged ? { educationDistributions: invalidateEducationPeriodSources(nextCredits.educationDistributions) } : {}),
        ...(premiumTaxCreditSourcesChanged ? { premiumTaxCredit: { ...premiumTaxCreditSourcesChanged, sourceFactsConfirmed: null, ...(premiumTaxCreditSourcesChanged.sharedPolicyAllocations ? { sharedPolicyAllocations: invalidateSharedPolicySources(premiumTaxCreditSourcesChanged.sharedPolicyAllocations) } : {}), ...(premiumTaxCreditSourcesChanged.marriageSources ? { marriageSources: invalidateMarriageSources(premiumTaxCreditSourcesChanged.marriageSources) } : {}) } } : {}),
        ...(bondSourcesChanged ? { savingsBondEducation: invalidateSavingsBondSources(nextCredits.savingsBondEducation) } : {}),
      } } : {}),
    },
  };
}

export function getSectionData<K extends keyof SectionDataMap>(
  state: GuidedFlowState,
  sectionId: K,
): SectionDataMap[K] | undefined {
  return state.sectionData[sectionId] as SectionDataMap[K] | undefined;
}

export function jumpToSection(state: GuidedFlowState, sectionId: InterviewSectionId): GuidedFlowState {
  const sections = buildSectionRoute(state.segmentation);
  const index = sections.findIndex((s) => s.id === sectionId);

  if (index < 0) {
    return state;
  }

  return {
    ...state,
    currentSectionIndex: index,
  };
}

export function resumeInterviewAtSection(
  state: GuidedFlowState,
  sectionId: InterviewSectionId,
): GuidedFlowState {
  const next = jumpToSection(state, sectionId);
  return {
    ...next,
    phase: "interview",
  };
}

// ── Retirement income data ──────────────────────────────────────────────────

export interface RetirementEntryData extends RetirementSourceData {
  payer: string;
  grossDistribution: string;
  taxableAmount: string;
  federalWithheld: string;
  isIraSepSimple: boolean | null;
  distributionCode: string;
  requiresCodeConfirmation?: boolean;
  requiresIraConfirmation?: boolean;
}

export const emptyRetirementEntry: RetirementEntryData = {
  payer: "",
  grossDistribution: "",
  taxableAmount: "",
  federalWithheld: "",
  isIraSepSimple: null,
  distributionCode: "",
};

// ── Social security data ──────────────────────────────────────────────────

export interface SocialSecurityData extends SocialSecuritySourceData {
  netBenefits: string;
  federalWithheld: string;
}

export const emptySocialSecurityData: SocialSecurityData = {
  netBenefits: "",
  federalWithheld: "",
};

// ── Unemployment data ──────────────────────────────────────────────────────

export interface UnemploymentData extends UnemploymentSourceData {
  compensation: string;
  federalWithheld: string;
}

export const emptyUnemploymentData: UnemploymentData = {
  compensation: "",
  federalWithheld: "",
};

// ── Rental property data ────────────────────────────────────────────────────

export type RentalPropertyType = "single_family" | "multi_family" | "vacation" | "commercial" | "land" | "other";

export const rentalPropertyTypeOptions: { value: RentalPropertyType; label: string }[] = [
  { value: "single_family", label: "Single family home" },
  { value: "multi_family", label: "Multi-family (duplex, triplex, etc.)" },
  { value: "vacation", label: "Vacation / short-term rental" },
  { value: "commercial", label: "Commercial property" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
];

export interface RentalPropertyEntryData extends RentalSourceData {
  description: string;
  propertyType: RentalPropertyType | "";
  rents: string;
  mortgageInterest: string;
  taxes: string;
  insurance: string;
  repairs: string;
  utilities: string;
  depreciation: string;
  otherExpenses: string;
  qbiMateriallyParticipated?: boolean | null;
}

export const emptyRentalPropertyEntry: RentalPropertyEntryData = {
  description: "",
  propertyType: "",
  rents: "",
  mortgageInterest: "",
  taxes: "",
  insurance: "",
  repairs: "",
  utilities: "",
  depreciation: "",
  otherExpenses: "",
};

// ── Section validation ─────────────────────────────────────────────────────

export type SectionValidationStatus = "complete" | "partial" | "empty";

export interface SectionValidationResult {
  status: SectionValidationStatus;
  /** Short message for skip-confirmation prompts */
  message: string;
  /** Field-level errors — keys are field names, values are error messages */
  fieldErrors: Record<string, string>;
  /** When false, the user must resolve the issue before moving forward. */
  allowSkip?: boolean;
}

const VALID_SECTION: SectionValidationResult = {
  status: "complete",
  message: "",
  fieldErrors: {},
};

const EMPTY_SECTION = (label: string, allowSkip = true): SectionValidationResult => ({
  status: "empty",
  message: `You haven't entered any ${label} yet.`,
  fieldErrors: {},
  allowSkip,
});

function hasNumericValue(value: string | undefined): boolean {
  try { return hasGuidedCurrency(value); } catch { return false; }
}

function validatePersonalInfo(data: PersonalInfoData | undefined, status: FilingStatus | null, taxYear?: number | null): SectionValidationResult {
  if (!data) return EMPTY_SECTION("personal info");

  const errors = personalFactErrors(data, status, taxYear);

  if (Object.keys(errors).length > 0) {
    const hasAnyData = data.firstName.trim() || data.lastName.trim() || data.ssn.trim() || data.addressLine1.trim();
    return {
      status: hasAnyData ? "partial" : "empty",
      message: hasAnyData
        ? "Some required personal info fields are empty."
        : "You haven't entered any personal info yet.",
      fieldErrors: errors,
    };
  }

  return VALID_SECTION;
}

function validateW2Section(data: { entries: W2EntryData[] } | undefined, filingStatus?: FilingStatus | null, returnYear?: number | null, state?: GuidedFlowState): SectionValidationResult {
  if (!data?.entries || data.entries.length === 0) return EMPTY_SECTION("W-2 info");

  const filledEntries = data.entries.filter(isStartedW2);

  if (filledEntries.length === 0) return EMPTY_SECTION("W-2 info");

  const errors = w2FactErrors(data.entries, filingStatus, returnYear);

  const pendingSuggestionConfirmations = filledEntries.flatMap((entry, index) =>
    Object.entries(entry.aiSuggestedFields ?? {}).flatMap(([field, suggestion]) =>
      suggestion?.status === "pending-confirmation"
        ? [{
          key: `w2-${index}-${field}`,
          message: `W-2 #${index + 1}: confirm ${getW2SuggestedFieldLabel(field as W2SuggestedField)}`,
        }]
        : []
    )
  );
  const pendingSuggestions = filledEntries.flatMap((entry) =>
    Object.values(entry.aiSuggestedFields ?? {}).filter(
      (suggestion): suggestion is GuidedSuggestedFieldState => suggestion?.status === "pending-confirmation"
    )
  );

  if (pendingSuggestionConfirmations.length > 0) {
    const containsFixtureSuggestions = pendingSuggestions.some((suggestion) =>
      isOfficialFixtureSourceType(suggestion.sourceType)
      || suggestion.sourceLabel.toLowerCase().includes("official info-copy pdf")
    );

    return {
      status: "partial",
      message: `Confirm the highlighted ${formatPendingW2SuggestionValueLabel(pendingSuggestions, pendingSuggestionConfirmations.length)} before continuing.`,
      allowSkip: !containsFixtureSuggestions,
      fieldErrors: { ...errors, ...Object.fromEntries(pendingSuggestionConfirmations.map(({ key, message }) => [key, message])) },
    };
  }

  if (Object.keys(errors).length > 0) return { status: "partial", message: "Complete the actual W-2 identity, payroll and state facts.", fieldErrors: errors };

  if (state && data.entries.some(entry => entry.stateLocalSources !== undefined)) {
    const context = buildGuidedW2SourceContext(state);
    try {
      if (!context) throw new Error("Complete the current taxpayer and original W-2 before confirming its rows.");
      context.w2s.forEach((entry, index) => { if (entry.stateLocalSources !== undefined) calculateW2StateLocalSources(context, index, entry.stateLocalSources); });
    } catch (error) { return { status: "partial", message: "Review the actual W-2 rows after the last edit.", fieldErrors: { "w2-actual-sources": error instanceof Error ? error.message : "Actual source review is required." } }; }
  }
  return VALID_SECTION;
}

function validateSelfEmploymentSection(
  data: SelfEmploymentSectionData | undefined,
  filingStatus?: FilingStatus | null,
  w2s?: W2EntryData[],
  stateData?: StateReturnData,
  returnYear?: number | null,
): SectionValidationResult {
  if (!hasBusinessSourceData(data)) return EMPTY_SECTION("self-employment info");
  const errors = businessFactErrors(data, filingStatus, w2s, stateData, returnYear);
  return Object.keys(errors).length ? { status: "partial", message: "Complete the actual business ownership, source income and qualified expenses.", fieldErrors: errors, allowSkip: true } : VALID_SECTION;
}

function validateInvestmentSection(
  data: InvestmentData | undefined,
  filingStatus?: FilingStatus | null,
  taxYear?: number | null,
  stateData?: StateReturnData,
  stateCode?: string | null,
  personal?: PersonalInfoData,
): SectionValidationResult {
  if (!data || (!investmentRowsStarted(data) && !data.childElections?.length && !data.scheduleDSources && !data.qofDispositionFacts && !data.section1202Sources)) return EMPTY_SECTION("investment info");
  const errors = investmentFactErrors(data, filingStatus, taxYear, stateData, stateCode, personal);
  if (Object.keys(errors).length) return { status: "partial", message: "Complete the actual investment source amounts, ownership and classifications.", fieldErrors: errors, allowSkip: true };
  return VALID_SECTION;
}

function validateRentalSection(data: { entries: RentalPropertyEntryData[] } | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateCode?: string | null, personal?: PersonalInfoData): SectionValidationResult {
  if (!data?.entries.some(isStartedRental)) return EMPTY_SECTION("rental property info");
  const errors = rentalFactErrors(data.entries, filingStatus, taxYear, stateCode, personal);
  return Object.keys(errors).length ? { status: "partial", message: "Complete the actual rental ownership, use and expense facts.", fieldErrors: errors, allowSkip: true } : VALID_SECTION;
}

/** Source navigation only. The complete composer separately guards unsupported methods. */
function guidedPAOrdinaryReturnSourceErrors(state: GuidedFlowState): Record<string, string> {
  if (state.segmentation.stateCode !== "PA") return {};
  const data = state.sectionData["state-return"], current = buildGuidedPAOrdinarySourceInput(state);
  const errors: Record<string, string> = {};
  if(data?.paMarriedOrdinarySources||state.segmentation.filingStatus==='mfj'){
    try{if(!data?.paMarriedOrdinarySources||!current)throw Error('Complete actual current federal and married PA household sources.');assertMarriedPASavedLedger(data);buildGuidedPAMarriedOrdinarySources(current,data.paMarriedOrdinarySources);}catch(error){errors.paMarriedOrdinarySources=error instanceof Error?error.message:'Reconcile actual married PA household sources.';}return errors;
  }
  if (!current) errors.paResidencySources = "Complete and confirm the actual current federal and Pennsylvania residency sources.";
  if (!data?.paOrdinaryReturnFacts) errors.paOrdinaryReturnFacts = "Complete and confirm the actual Pennsylvania return records.";
  else if (current) {
    try { buildGuidedPAOrdinaryReturnFacts(current, data.paOrdinaryReturnFacts); }
    catch (error) { errors.paOrdinaryReturnFacts = error instanceof Error ? error.message : "Reconcile the actual Pennsylvania return records."; }
  }
  if (!data?.paOrdinaryReturnCompletionSources) errors.paOrdinaryReturnCompletionSources = "Complete and confirm the actual Pennsylvania completion records.";
  else if (current) {
    try { buildGuidedPAOrdinaryReturnCompletionSources(current, data.paOrdinaryReturnCompletionSources, data.paOrdinaryReturnFacts); }
    catch (error) { errors.paOrdinaryReturnCompletionSources = error instanceof Error ? error.message : "Reconcile the actual Pennsylvania completion records."; }
  }
  return errors;
}

/** Mandatory actual OH source replay, independent of state return calculation. */
function guidedOhioActualSourceErrors(state: GuidedFlowState): Record<string, string> {
  if (state.segmentation.stateCode !== "OH") return {};
  const data = state.sectionData["state-return"], errors: Record<string, string> = {};
  if (!data?.ohioResidency) errors.ohioResidency = "Complete and explicitly confirm the actual Ohio residency records.";
  if (!data?.ohioPayments) errors.ohioPayments = "Complete and explicitly confirm the actual Ohio payment records.";
  try {
    const raw = buildTaxInputFromGuidedData(state);
    const parsed = raw ? TaxYearInputSchema.safeParse(raw) : undefined;
    if (!parsed?.success) throw new Error("Complete the actual current federal owner, year and source originals before confirming Ohio sources.");
    try { buildGuidedOhioResidencyFacts(data?.ohioResidency, parsed.data); }
    catch (error) { errors.ohioResidency = error instanceof Error ? error.message : "Reconcile the actual Ohio residency sources."; }
    try { buildGuidedOhioPaymentFacts(data?.ohioPayments, parsed.data); }
    catch (error) { errors.ohioPayments = error instanceof Error ? error.message : "Reconcile the actual Ohio payment sources."; }
    if(data?.ohioResidency?.residentCreditSources){
      try{buildGuidedOhioResidentCreditSources(parsed.data,data.ohioResidency.residentCreditSources,buildGuidedOhioResidencyFacts(data.ohioResidency,parsed.data),buildGuidedOhioPaymentFacts(data.ohioPayments,parsed.data));}
      catch(error){errors.ohioResidentCredit=error instanceof Error?error.message:'Complete and explicitly confirm the actual Virginia return and completed account sources.';}
    }
    if(data?.ohioReturnHeaderSources){
      try{buildGuidedOhioReturnHeaderSources(parsed.data,data.ohioReturnHeaderSources,data.ohioResidency,data.ohioPayments,data.ohioSchoolDistrict);}
      catch(error){errors.ohioReturnHeader=error instanceof Error?error.message:'Complete and explicitly confirm the actual residential, Finder and county originals.';}
    }
    if(data?.ohioReciprocalWages){
      try{buildGuidedOhioReciprocalWages(parsed.data,data.ohioReciprocalWages,data.ohioResidency,data.ohioPayments);}
      catch(error){errors.ohioReciprocalWages=error instanceof Error?error.message:'Complete and explicitly confirm the actual reciprocal wage originals.';}
    }
    if(data?.ohioResidency?.schoolDistrictStatus==='actual_district_sources_required'||data?.ohioSchoolDistrict){
      try{buildGuidedOhioSchoolDistrictFacts(parsed.data,data?.ohioSchoolDistrict,data?.ohioResidency,data?.ohioPayments);}
      catch(error){errors.ohioSchoolDistrict=error instanceof Error?error.message:'Complete and explicitly confirm the actual school district records.';}
    }
  } catch (error) { errors["ohio-current-originals"] = error instanceof Error ? error.message : "Complete actual federal originals before confirming Ohio sources."; }
  return errors;
}

function validateRequiredFacts(errors: Record<string, string>): SectionValidationResult {
  return Object.keys(errors).length ? {
    status: "partial", message: Object.values(errors)[0], fieldErrors: errors, allowSkip: false,
  } : VALID_SECTION;
}

function validateRetirementSection(data: SectionDataMap["income-retirement"], filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData, basisContext?: GuidedIraBasisContext): SectionValidationResult {
  if (!data?.entries?.length && !data?.basisSources) return EMPTY_SECTION("retirement info");
  return validateRequiredFacts(retirementFactErrors(data?.entries, true, filingStatus, taxYear, stateData, basisContext));
}

function validateSocialSecuritySection(data: SocialSecurityData | undefined, state: GuidedFlowState): SectionValidationResult {
  if (!socialSecurityEntries(data).some(isStartedSocialSecurity)) return EMPTY_SECTION("Social Security info");
  return validateRequiredFacts(socialSecurityFactErrors(data, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments));
}

function validateUnemploymentSection(data: UnemploymentData | undefined, state: GuidedFlowState): SectionValidationResult {
  if (!unemploymentEntries(data).some(isStartedUnemployment)) return EMPTY_SECTION("government payment info");
  return validateRequiredFacts(unemploymentFactErrors(data, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData["state-return"], state.sectionData.deductions));
}

function validateDeductionsSection(data: DeductionData | undefined, taxYear?: number | null, sourceErrors: Record<string, string> = {}, filingStatus?: FilingStatus | null, spouse?: unknown): SectionValidationResult {
  if (Object.keys(sourceErrors).length) return validateRequiredFacts({ ...deductionFactErrors(data, taxYear, filingStatus, spouse), ...sourceErrors });
  if (!data) return EMPTY_SECTION("deductions info");
  return validateRequiredFacts(deductionFactErrors(data, taxYear, filingStatus, spouse));
}

function validateAdjustmentsSection(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, education: StudentLoanEducationSources = []): SectionValidationResult {
  if (!data) return EMPTY_SECTION("adjustments info", true);
  const errors = adjustmentFactErrors(data, filingStatus, taxYear, education);
  if (Object.keys(errors).length) return validateRequiredFacts(errors);
  if (data.iraContributions || data.hsaAccounts?.length || data.educatorExpenseSources?.length || data.studentLoanFacts || data.healthInsuranceFacts || data.foreignIncome || data.netOperatingLossSources || data.currentLossOrigin || data.codNolSources || data.k1LossSources) return VALID_SECTION;
  const hasAny = Object.values(data).some((v) => typeof v === "string" && hasNumericValue(v));
  if (!hasAny) return EMPTY_SECTION("adjustments info", true);
  return VALID_SECTION;
}

function validatePaymentsSection(data: PaymentData | undefined, taxYear?: number | null): SectionValidationResult {
  if (!data) return EMPTY_SECTION("payments info", true);
  const errors = { ...allPaymentFactErrors(data, taxYear), ...estimatedTaxFactErrors(data, taxYear) };
  if (Object.keys(errors).length) return validateRequiredFacts(errors);
  if (!data.estimatedTaxFacts && !data.estimatedPayments.length && !data.extensionPayments?.length && !data.priorYearAppliedCredits?.length && !hasNumericValue(data.otherPayments)) return EMPTY_SECTION("payments info", true);
  return VALID_SECTION;
}

/**
 * Validate the current section data, returning status and any field errors.
 * Pure function — no side effects.
 */
export function validateSection(
  state: GuidedFlowState,
  sectionId: InterviewSectionId,
): SectionValidationResult {
  switch (sectionId) {
    case "personal-info":
      return validatePersonalInfo(getSectionData(state, "personal-info"), state.segmentation.filingStatus, state.taxYear);
    case "income-w2":
      return validateW2Section(getSectionData(state, "income-w2"), state.segmentation.filingStatus, state.taxYear, state);
    case "income-self-employment":
      return validateSelfEmploymentSection(getSectionData(state, "income-self-employment"), state.segmentation.filingStatus, getSectionData(state, "income-w2")?.entries, getSectionData(state, "state-return"), state.taxYear);
    case "income-investments":
      return validateInvestmentSection(getSectionData(state, "income-investments"), state.segmentation.filingStatus, state.taxYear, getSectionData(state, "state-return"), state.segmentation.stateCode, getSectionData(state, "personal-info"));
    case "income-royalties":
      return validateRequiredFacts(royaltySourceFactErrors(state, true));
    case "income-rental":
      return validateRentalSection(getSectionData(state, "income-rental"), state.segmentation.filingStatus, state.taxYear, state.segmentation.stateCode, state.sectionData["personal-info"]);
    case "income-retirement":
      return validateRetirementSection(getSectionData(state, "income-retirement"), state.segmentation.filingStatus, state.taxYear, getSectionData(state, "state-return"), { data: state.sectionData["income-retirement"]?.basisSources, personal: state.sectionData["personal-info"], adjustments: state.sectionData.adjustments });
    case "income-social-security":
      return validateSocialSecuritySection(getSectionData(state, "income-social-security"), state);
    case "income-unemployment":
      return validateUnemploymentSection(getSectionData(state, "income-unemployment"), state);
    case "additional-deductions":
      return getSectionData(state, "additional-deductions") ? validateRequiredFacts({ ...tipIncomeFactErrors(state), ...schedule1AFactErrors(state) }) : EMPTY_SECTION("additional deduction sources");
    case "deductions": {
      // This later section owns the regular charitable history. Navigation from
      // Adjustments must not confirm it, while completion here binds both originals.
      const charitableNolErrors = state.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources
        ? netOperatingLossFactErrors(state.sectionData.adjustments.netOperatingLossSources, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"], false, state.sectionData.deductions, state.sectionData.adjustments.k1LossSources, state.sectionData.adjustments.codNolSources?.attributeSources) : {};
      return validateDeductionsSection(getSectionData(state, "deductions"), state.taxYear, { ...charitableNolErrors, ...nonitemizedElectionFactErrors(state), ...nonW2TaxAllocationErrors(state), ...investmentInterestFactErrors(state.sectionData.deductions, state.sectionData["income-investments"]?.childElections, state.taxYear), ...charitableCarryoverFactErrors(state.sectionData.deductions?.charitableCarryoverSources, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"]), ...k1CharitableSourceFactErrors(state), ...cryptoDonationFactErrors(state.sectionData.deductions?.cryptoDonations, state.taxYear) }, state.segmentation.filingStatus, state.sectionData["personal-info"]?.spouse);
    }
    case "adjustments": {
      const errors = { ...foreignIncomeFactErrors(state), ...healthInsuranceSourceErrors(state), ...hsaFactErrors(getSectionData(state, "adjustments")?.hsaAccounts, state.segmentation.filingStatus, state.taxYear, getSectionData(state, "income-w2")?.entries ?? [], getSectionData(state, "personal-info"), state.segmentation.lifeEvents.includes("hsa-contributions")), ...educatorFactErrors(getSectionData(state, "adjustments"), state.segmentation.filingStatus, state.taxYear, state.segmentation.lifeEvents.includes("educator-expenses")) };
      Object.assign(errors, currentLossOriginNavigationFactErrors(state));
      Object.assign(errors, codNolNavigationFactErrors(state));
      Object.assign(errors, k1LossSourceFactErrors(state));
      Object.assign(errors, netOperatingLossNavigationFactErrors(state.sectionData.adjustments?.netOperatingLossSources, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"], state.segmentation.lifeEvents.includes("net-operating-loss"), state.sectionData.deductions, state.sectionData.adjustments?.k1LossSources, state.sectionData.adjustments?.codNolSources?.attributeSources));
      let loanEducation: StudentLoanEducationSources = [];
      try {
        if (state.sectionData.adjustments?.studentLoanFacts || state.sectionData.credits?.educationDistributions?.expenses?.some(expense => expense.category === "student_loan")) loanEducation = studentLoanEducationSources(state.sectionData.credits, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments?.studentLoanFacts);
      } catch (error) { errors.studentLoanSources = error instanceof Error ? error.message : "Reconcile the actual education sources linked to student-loan interest."; }
      Object.assign(errors, studentLoanFactErrors(state.sectionData.adjustments, state.segmentation.filingStatus, state.taxYear, loanEducation, state.segmentation.lifeEvents.includes("student-loans")));
      return Object.keys(errors).length ? validateRequiredFacts(errors) : validateAdjustmentsSection(getSectionData(state, "adjustments"), state.segmentation.filingStatus, state.taxYear, loanEducation);
    }
    case "credits": {
      const credits = getSectionData(state, "credits");
      const personal = getSectionData(state, "personal-info");
      const educationErrors = educationFactErrors(credits, state.taxYear, state.segmentation.filingStatus, personal);
      let distributionErrors: Record<string, string> = {};
      try {
        const actualEducation = Object.keys(educationErrors).length ? undefined : buildActualEducationInput(credits, state.taxYear, state.segmentation.filingStatus, personal);
        distributionErrors = educationDistributionFactErrors(credits?.educationDistributions, state.taxYear, state.segmentation.filingStatus, actualEducation);
      } catch {
        distributionErrors.educationDistributions = "Complete the actual education credit facts before confirming distribution allocations.";
      }
      const sources = guidedCareBenefitSources(getSectionData(state, "income-w2")?.entries, getSectionData(state, "income-self-employment")?.businessFacts, getSectionData(state, "income-self-employment")?.expenses);
      return validateRequiredFacts({
        ...educationErrors,
        ...distributionErrors,
        ...educatorBondFactErrors(state),
        ...premiumTaxCreditFactErrors(state),
        ...minimumTaxCreditFactErrors(credits?.minimumTaxCredit, state.taxYear, state.segmentation.filingStatus, personal),
        ...savingsBondFactErrors(credits?.savingsBondEducation, state.taxYear, state.segmentation.filingStatus, getSectionData(state, "income-investments")?.interestEntries, personal),
        ...careBenefitsFactErrors(credits?.dependentCareBenefits, state.taxYear, state.segmentation.filingStatus, sources),
        ...careFactErrors(credits?.dependentCare, state.segmentation.filingStatus, { data: credits?.dependentCareBenefits, year: state.taxYear, sources }),
        ...energyFactErrors(credits?.energy, state.taxYear, state.segmentation.filingStatus),
        ...vehicleFactErrors(credits?.vehicles, state.taxYear, state.segmentation.filingStatus),
        ...adoptionFactErrors(credits?.adoption, state.taxYear, state.segmentation.filingStatus, state.sectionData["personal-info"]),
      });
    }
    case "other-taxes":
      return validateRequiredFacts({ ...householdFactErrors(getSectionData(state, "other-taxes"), state.taxYear),
        ...guidedNiitFactErrors(getSectionData(state, "other-taxes")?.niitSources, getSectionData(state, "income-retirement")?.entries, state.taxYear, state.segmentation.filingStatus),
        ...guidedForeignTaxFactErrors(getSectionData(state, "other-taxes")?.foreignTaxElection, getSectionData(state, "income-investments"), state.taxYear, state.segmentation.filingStatus, foreignCreditKnownFacts(state)) });
    case "payments":
      return validatePaymentsSection(getSectionData(state, "payments"), state.taxYear);
    case "review":
      return VALID_SECTION; // Review is always valid
    case "state-return":
      return validateRequiredFacts({
        ...zeroIncomeMiscSourceFactErrors(state),
        ...guidedPAOrdinaryReturnSourceErrors(state),
        ...guidedOhioActualSourceErrors(state),
        ...statePaymentFactErrors(getSectionData(state, "state-return"), state.taxYear, state.segmentation.stateCode),
        ...guidedOhioInterestFactErrors(state),
      });
    case "final-review":
      return VALID_SECTION; // Final review is always available
    default:
      return VALID_SECTION;
  }
}

export function getVisitedSectionStatus(
  state: GuidedFlowState,
  sectionId: InterviewSectionId,
): VisitedSectionStatus {
  if (!state.completedSections.includes(sectionId)) {
    return "not-started";
  }

  const result = validateSection(state, sectionId);
  if (result.status === "complete") {
    return "complete";
  }

  if (result.status === "empty") {
    if (SKIPPED_WHEN_EMPTY_SECTIONS.has(sectionId)) {
      const route = buildSectionRoute(state.segmentation);
      const sectionIndex = route.findIndex((section) => section.id === sectionId);
      const movedPastSection = state.phase === "complete" || state.currentSectionIndex > sectionIndex;

      return movedPastSection ? "skipped" : "complete";
    }

    return "complete";
  }

  return result.status === "partial" ? "needs-review" : "skipped";
}

export function summarizeFlowCompletion(state: GuidedFlowState): FlowCompletionSummary {
  const sections = buildSectionRoute(state.segmentation);

  return sections.reduce<FlowCompletionSummary>((summary, section) => {
    const status = getVisitedSectionStatus(state, section.id);

    if (status === "complete") {
      summary.completedSections += 1;
    } else if (status === "skipped") {
      summary.skippedSections += 1;
    } else if (status === "needs-review") {
      summary.needsReviewSections += 1;
    }

    return summary;
  }, {
    totalSections: sections.length,
    completedSections: 0,
    skippedSections: 0,
    needsReviewSections: 0,
    sections,
  });
}

export function collectGuidedReviewIssues(state: GuidedFlowState): GuidedReviewIssue[] {
  const sections = buildSectionRoute(state.segmentation);

  return sections.flatMap((section) => {
    const status = getVisitedSectionStatus(state, section.id);

    if (status !== "skipped" && status !== "needs-review") {
      return [];
    }

    const validation = validateSection(state, section.id);
    return [{
      sectionId: section.id,
      sectionLabel: section.label,
      status,
      message: validation.message || (status === "needs-review"
        ? `${section.label} still needs review.`
        : `${section.label} was skipped.`),
      actionLabel: status === "needs-review"
        ? `Review ${section.label}`
        : `Finish ${section.label}`,
    }];
  });
}

/**
 * Check whether the user should see a skip-confirmation prompt before advancing.
 * Returns null if no prompt needed, otherwise the validation result.
 */
export function shouldPromptBeforeAdvance(
  state: GuidedFlowState,
): SectionValidationResult | null {
  const sections = buildSectionRoute(state.segmentation);
  const currentSection = sections[state.currentSectionIndex];
  if (!currentSection) return null;

  const result = validateSection(state, currentSection.id);
  if (result.status === "complete") return null;

  return result;
}

// ── Segmentation step tracking ─────────────────────────────────────────────

export type SegmentationStep = "filing-status" | "income-types" | "life-events" | "state-residence";

export const segmentationSteps: { id: SegmentationStep; label: string }[] = [
  { id: "filing-status", label: "Filing Status" },
  { id: "income-types", label: "Income Types" },
  { id: "life-events", label: "Life Events" },
  { id: "state-residence", label: "State of Residence" },
];

export function getNextSegmentationStep(answers: SegmentationAnswers): SegmentationStep | null {
  if (answers.filingStatus === null) return "filing-status";
  // Income types and life events can be empty (user selected nothing), so we
  // track explicitly whether each step has been "visited" via a separate flag.
  // For the initial build, we walk through all four steps linearly.
  return null;
}

// ── Flow state persistence ─────────────────────────────────────────────────

const GUIDED_FLOW_STORAGE_KEY_PREFIX = "tax-engine.guided-flow-state.v1";

export function getGuidedFlowStorageKey(workspaceId: string): string {
  return `${GUIDED_FLOW_STORAGE_KEY_PREFIX}:${workspaceId}`;
}

function clearLegacyGuidedFlowState(storage: Storage): void {
  try {
    storage.removeItem(GUIDED_FLOW_STORAGE_KEY_PREFIX);
  } catch {
    // Silently ignore
  }
}

export function saveGuidedFlowState(storage: Storage, workspaceId: string, state: GuidedFlowState): void {
  try {
    storage.setItem(getGuidedFlowStorageKey(workspaceId), JSON.stringify(state));
    clearLegacyGuidedFlowState(storage);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadGuidedFlowState(storage: Storage, workspaceId: string): GuidedFlowState | null {
  try {
    const raw = storage.getItem(getGuidedFlowStorageKey(workspaceId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GuidedFlowState;

    // Basic shape validation
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !["segmentation", "interview", "complete"].includes(parsed.phase) ||
      typeof parsed.segmentation !== "object" ||
      typeof parsed.currentSectionIndex !== "number" ||
      !Array.isArray(parsed.completedSections) ||
      typeof parsed.sectionData !== "object"
    ) {
      return null;
    }

    const sectionData = withDefaultSectionData(parsed.sectionData as SectionDataMap);
    if (sectionData["income-retirement"]) {
      sectionData["income-retirement"] = { ...sectionData["income-retirement"], entries: sectionData["income-retirement"].entries.map(entry => ({ ...entry, requiresIraConfirmation: entry.requiresIraConfirmation || (entry.isIraSepSimple === false && entry.sourceTaxYear === undefined && entry.sourceFactsConfirmed === undefined) })) };
    }
    if (parsed.factsVersion !== 2) {
      if (sectionData["income-retirement"]) {
        sectionData["income-retirement"] = { ...sectionData["income-retirement"], entries: sectionData["income-retirement"].entries.map((entry) => ({ ...entry, requiresCodeConfirmation: entry.distributionCode === "7" || entry.requiresCodeConfirmation })) };
      }
      if (sectionData.credits) {
        sectionData.credits = { ...sectionData.credits, education: { ...sectionData.credits.education, aocStudents: sectionData.credits.education.aocStudents.map((entry) => ({ ...entry, requiresPriorYearsConfirmation: entry.priorYearsClaimed === "0" || entry.requiresPriorYearsConfirmation })) } };
      }
    }
    return {
      ...parsed,
      factsVersion: 2,
      taxYear: Number.isInteger(parsed.taxYear) ? parsed.taxYear : null,
      sectionData,
    };
  } catch {
    return null;
  }
}

export function clearGuidedFlowState(storage: Storage, workspaceId: string): void {
  try {
    storage.removeItem(getGuidedFlowStorageKey(workspaceId));
    clearLegacyGuidedFlowState(storage);
  } catch {
    // Silently ignore
  }
}
