import { foreignIncomeFactErrors, type ForeignIncomeData } from "./guided-foreign-income";
import { estimatedTaxFactErrors, type EstimatedTaxFactsData } from "./guided-estimated-tax-facts";
import { minimumTaxCreditFactErrors, type MinimumTaxCreditData } from "./guided-minimum-tax-credit";
import { guidedForeignTaxFactErrors, type ForeignTaxElectionData } from "./guided-foreign-tax-election";
import { foreignCreditKnownFacts } from './guided-foreign-tax-direct-credit';
import { premiumTaxCreditFactErrors, type PremiumTaxCreditData } from "./guided-premium-tax-credit-facts";
import { schedule1AFactErrors } from "./guided-schedule-1-a-facts";
import { tipIncomeFactErrors, type AdditionalDeductionsData } from "./guided-tip-income-facts";
import { healthInsuranceSourceErrors, type HealthInsuranceData } from "./guided-health-insurance-facts";
import { hsaFactErrors, type HsaAccountData } from "./guided-hsa-facts";
import type { StandardDeductionData } from "./guided-standard-deduction-facts";
import { educatorFactErrors, type EducatorSourceData } from "./guided-educator-facts";
import { studentLoanFactErrors, studentLoanEducationSources, type StudentLoanData, type StudentLoanEducationSources } from "./guided-student-loan-facts";
/**
 * Guided interview flow — state model, section routing, skip logic, and progress.
 *
 * Pure functions, no React, no DOM. The UI components consume this module.
 */

import Decimal from "decimal.js";
import { parseGuidedCurrency, hasGuidedCurrency } from "./guided-currency";
import { personalFactErrors } from "./guided-taxpayer-facts";
import { allPaymentFactErrors, deductionFactErrors, educationFactErrors, retirementFactErrors } from "./guided-required-facts";
import { adjustmentFactErrors, householdFactErrors } from "./guided-adjustment-facts";
import { statePaymentFactErrors } from "./guided-state-facts";
import { guidedOhioInterestFactErrors, type OhioInterestAllocation } from "./guided-ohio-interest-facts";
import { careBenefitsFactErrors, guidedCareBenefitSources, type CareBenefitsData } from "./guided-dependent-care-benefits";
import { careFactErrors } from "./guided-credit-facts";
import { energyFactErrors } from "./guided-energy-facts";
import { isStartedW2, w2FactErrors } from "./guided-w2-facts";
import { investmentFactErrors, isStartedInvestment, type InvestmentSourceData, type InvestmentData } from "./guided-investment-facts";
import { isStartedOid } from "./guided-oid-facts";
import { businessFactErrors, hasBusinessSourceData, type BusinessSourceData } from "./guided-business-facts";
import { isStartedRental, rentalFactErrors, type RentalSourceData } from "./guided-rental-facts";
import { nonW2TaxAllocationErrors } from "./guided-salt-facts";
import { isStartedUnemployment, unemploymentEntries, unemploymentFactErrors, type UnemploymentSourceData } from "./guided-unemployment-facts";
import type { MortgageSourceData } from "./guided-mortgage-facts";
import type { MortgageWorksheetData } from "./guided-mortgage-worksheet";
import { socialSecurityFactErrors, socialSecurityEntries, isStartedSocialSecurity, type SocialSecuritySourceData } from "./guided-social-security-facts";
import type { RetirementSourceData } from "./guided-retirement-facts";
import { vehicleFactErrors, type VehicleCreditData } from "./guided-vehicle-facts";
import { adoptionFactErrors, type AdoptionCreditData } from "./guided-adoption-facts";
import { educationDistributionFactErrors, type EducationDistributionData } from "./guided-education-distributions";
import { savingsBondFactErrors, type SavingsBondEducationData } from "./guided-savings-bond-facts";
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
  | "retirement"
  | "social-security"
  | "unemployment";

export const incomeTypeOptions: { value: IncomeType; label: string; hint: string }[] = [
  { value: "w2-wages", label: "W-2 wages or salary", hint: "Most common — you received a W-2 from an employer" },
  { value: "self-employment", label: "Self-employment or freelance", hint: "1099-NEC, Schedule C business income" },
  { value: "investments", label: "Investment income", hint: "Stocks, bonds, crypto — 1099-B, 1099-DIV, 1099-INT" },
  { value: "rental", label: "Rental property income", hint: "Schedule E rental income and expenses" },
  { value: "retirement", label: "Retirement distributions", hint: "IRA, 401(k), pension — 1099-R" },
  { value: "social-security", label: "Social Security benefits", hint: "SSA-1099" },
  { value: "unemployment", label: "Unemployment compensation", hint: "1099-G" },
];

// ── Life events ────────────────────────────────────────────────────────────

export type LifeEvent =
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
  | "foreign-earned-income";

export const lifeEventOptions: { value: LifeEvent; label: string; hint: string }[] = [
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
    ...(data.investmentInterestExpense !== undefined || data.gamblingLosses !== undefined
      ? [data.investmentInterestExpense ?? "", data.gamblingLosses ?? ""]
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
    segmentation.incomeTypes.includes("self-employment") ||
    segmentation.lifeEvents.includes("student-loans") ||
    segmentation.lifeEvents.includes("hsa-contributions") ||
    segmentation.lifeEvents.includes("educator-expenses") ||
    segmentation.lifeEvents.includes("self-employed-health-insurance") ||
    segmentation.lifeEvents.includes("foreign-earned-income");
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
  if (segmentation.incomeTypes.some(type => ["self-employment", "investments", "rental", "retirement"].includes(type))) {
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
  sourceTaxYear?: string;
  box12CodeTP?: string; box12CodeTT?: string; treasuryTippedOccupationCodes?: string[];
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

export type DeductionMethod = "standard" | "itemized";

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
  isPrivateFoundation: boolean | null;
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
  gamblingWinnings?: string;
  gamblingLosses?: string;
  mortgageEntries?: MortgageEntryData[];
  mortgageWorksheet?: MortgageWorksheetData;
  donationEntries?: DonationEntryData[];
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
  stateEstimatedPayments: StateEstimatedPaymentEntry[];
  additionalStateWithholding: string;
  additionalStateWithholdingEntries?: StateWithholdingEntry[];
  ohioInterestAllocation?: OhioInterestAllocation;
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
  "income-retirement"?: { entries: RetirementEntryData[] };
  "income-rental"?: { entries: RentalPropertyEntryData[] };
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
  const nextPayments = sectionId === "payments" ? data as PaymentData : state.sectionData.payments;
  const estimatedTaxSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "additional-deductions", "other-taxes"].includes(sectionId) && nextPayments?.estimatedTaxFacts;
  const nextInvestments = sectionId === "income-investments" ? data as InvestmentData : state.sectionData["income-investments"];
  const qofSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment"].includes(sectionId) && nextInvestments?.qofDispositionFacts;
  const childElectionSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "additional-deductions", "other-taxes"].includes(sectionId) && nextInvestments?.childElections?.length;
  const niitOtherTaxes = state.sectionData["other-taxes"];
  const nextOtherTaxes = sectionId === "other-taxes" ? data as OtherTaxesData : niitOtherTaxes;
  const foreignElectionChanged = sectionId === "other-taxes" && guidedSourceValuesChanged(niitOtherTaxes?.foreignTaxElection, nextOtherTaxes?.foreignTaxElection);
  const niitSourcesChanged = (foreignElectionChanged || (sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-social-security", "income-unemployment", "adjustments", "credits", "deductions", "payments", "state-return", "additional-deductions"].includes(sectionId))) && nextOtherTaxes?.niitSources;
  const foreignTaxSourcesChanged = sourceValuesChanged && ["personal-info", "income-investments", "income-self-employment", "adjustments", "credits"].includes(sectionId) && nextOtherTaxes?.foreignTaxElection;
  const tipSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2"].includes(sectionId) && state.sectionData["additional-deductions"];
  const nextAdditional = sectionId === "additional-deductions" ? data as AdditionalDeductionsData : state.sectionData["additional-deductions"];
  const additionalSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-social-security", "adjustments", "credits", "deductions", "additional-deductions"].includes(sectionId) && nextAdditional?.schedule1A;
  const nextAdjustments = sectionId === "adjustments" ? data as AdjustmentData : adjustments;
  const foreignIncomeSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "adjustments", "credits", "deductions"].includes(sectionId) && nextAdjustments?.foreignIncome;
  const healthSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "credits", "adjustments"].includes(sectionId) && nextAdjustments?.healthInsuranceFacts;
  const mortgageSourcesChanged = sourceValuesChanged && sectionId === "personal-info" && state.sectionData.deductions?.mortgageEntries?.length ? state.sectionData.deductions : undefined;
  const educatorSourcesChanged = sourceValuesChanged && ["income-w2", "personal-info", "credits", "income-investments"].includes(sectionId) && adjustments?.educatorExpenseSources;
  const studentLoanSourcesChanged = sourceValuesChanged && ["income-w2", "personal-info", "credits"].includes(sectionId) && adjustments?.studentLoanFacts;
  const benefitSourcesChanged = (sectionId === "income-w2" || sectionId === "income-self-employment") && credits?.dependentCareBenefits;
  const nextCredits = sectionId === "credits" ? data as CreditsData : credits;
  const minimumTaxCreditSourcesChanged = sourceValuesChanged && ["personal-info", "credits"].includes(sectionId) && nextCredits?.minimumTaxCredit;
  const premiumTaxCreditSourcesChanged = sourceValuesChanged && ["personal-info", "income-w2", "income-self-employment", "income-retirement", "income-investments", "income-rental", "income-social-security", "income-unemployment", "adjustments", "credits", "additional-deductions"].includes(sectionId) && nextCredits?.premiumTaxCredit;
  const educationSourcesChanged = !!nextCredits?.educationDistributions && (
    ((sectionId === "personal-info" || sectionId === "adjustments") && guidedSourceValuesChanged(state.sectionData[sectionId], data)) ||
    (sectionId === "credits" && (guidedSourceValuesChanged(credits?.education, nextCredits.education) || guidedSourceValuesChanged(credits?.savingsBondEducation, nextCredits.savingsBondEducation)))
  );
  const bondSourcesChanged = !!nextCredits?.savingsBondEducation && (
    (["personal-info", "income-investments", "adjustments"].includes(sectionId) && sourceValuesChanged) ||
    (sectionId === "credits" && (guidedSourceValuesChanged(credits?.education, nextCredits.education) || guidedSourceValuesChanged(credits?.educationDistributions, nextCredits.educationDistributions)))
  );
  const ohioStateReturn = state.sectionData["state-return"];
  const ohioInterestChanged = sectionId === "income-investments" && ohioStateReturn?.ohioInterestAllocation;
  return {
    ...state,
    sectionData: {
      ...state.sectionData,
      [sectionId]: data,
      ...(estimatedTaxSourcesChanged && nextPayments ? { payments: { ...nextPayments, estimatedTaxFacts: { ...estimatedTaxSourcesChanged, sourceFactsConfirmed: null } } } : {}),
      ...((childElectionSourcesChanged || qofSourcesChanged) && nextInvestments ? { "income-investments": { ...nextInvestments, ...(childElectionSourcesChanged ? { childElections: nextInvestments.childElections?.map(child => ({ ...child, sourceFactsConfirmed: null })) } : {}), ...(qofSourcesChanged ? { qofDispositionFacts: { ...qofSourcesChanged, sourceFactsConfirmed: null } } : {}) } } : {}),
      ...((niitSourcesChanged || foreignTaxSourcesChanged) && nextOtherTaxes ? { "other-taxes": { ...nextOtherTaxes, ...(niitSourcesChanged ? { niitSources: { ...niitSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(foreignTaxSourcesChanged ? { foreignTaxElection: { ...foreignTaxSourcesChanged, sourceFactsConfirmed: null, ...(foreignTaxSourcesChanged.creditWithoutForm1116 ? { creditWithoutForm1116: { ...foreignTaxSourcesChanged.creditWithoutForm1116, sourceFactsConfirmed: null } } : {}) } } : {}) } } : {}),
      ...((tipSourcesChanged || additionalSourcesChanged) && nextAdditional ? { "additional-deductions": { ...nextAdditional, ...(tipSourcesChanged ? { tipIncomeAccounts: nextAdditional.tipIncomeAccounts?.map(account => ({ ...account, sourceFactsConfirmed: null })) } : {}), ...(additionalSourcesChanged ? { schedule1A: { ...additionalSourcesChanged, sourceFactsConfirmed: null } } : {}) } } : {}),
      ...(mortgageSourcesChanged ? { deductions: { ...mortgageSourcesChanged, mortgageEntries: mortgageSourcesChanged.mortgageEntries?.map(entry => ({ ...entry, sourceFactsConfirmed: null })), ...(mortgageSourcesChanged.mortgageWorksheet ? { mortgageWorksheet: { ...mortgageSourcesChanged.mortgageWorksheet, sourceFactsConfirmed: null } } : {}) } } : {}),
      ...(ohioInterestChanged && ohioStateReturn ? { "state-return": { ...ohioStateReturn, ohioInterestAllocation: { ...ohioInterestChanged, sourceFactsConfirmed: null } } } : {}),
      ...((iraSourcesChanged || hsaSourcesChanged || educatorSourcesChanged || studentLoanSourcesChanged || healthSourcesChanged || foreignIncomeSourcesChanged) && nextAdjustments ? { adjustments: { ...nextAdjustments, ...(foreignIncomeSourcesChanged ? { foreignIncome: { ...foreignIncomeSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(healthSourcesChanged ? { healthInsuranceFacts: { ...healthSourcesChanged, sourceFactsConfirmed: null, ...(healthSourcesChanged.incomeDeductions ? { incomeDeductions: { ...healthSourcesChanged.incomeDeductions, sourceFactsConfirmed: null } } : {}) } } : {}), ...(studentLoanSourcesChanged ? { studentLoanFacts: { ...studentLoanSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(iraSourcesChanged ? { iraContributions: { ...iraSourcesChanged, sourceFactsConfirmed: null } } : {}), ...(hsaSourcesChanged ? { hsaAccounts: hsaSourcesChanged.map(account => ({ ...account, sourceFactsConfirmed: null })) } : {}), ...(educatorSourcesChanged ? { educatorExpenseSources: educatorSourcesChanged.map(source => ({ ...source, sourceFactsConfirmed: null })) } : {}) } } : {}),
      ...((benefitSourcesChanged || educationSourcesChanged || bondSourcesChanged || premiumTaxCreditSourcesChanged || minimumTaxCreditSourcesChanged) && nextCredits ? { credits: { ...nextCredits,
        ...(minimumTaxCreditSourcesChanged ? { minimumTaxCredit: { ...minimumTaxCreditSourcesChanged, sourceFactsConfirmed: null } } : {}),
        ...(benefitSourcesChanged ? { dependentCareBenefits: { ...nextCredits.dependentCareBenefits, sourceFactsConfirmed: null, earnedIncomeWorksheetConfirmed: null, creditExpenseCoordinationConfirmed: null } } : {}),
        ...(educationSourcesChanged ? { educationDistributions: { ...nextCredits.educationDistributions, sourceFactsConfirmed: null } } : {}),
        ...(premiumTaxCreditSourcesChanged ? { premiumTaxCredit: { ...premiumTaxCreditSourcesChanged, sourceFactsConfirmed: null } } : {}),
        ...(bondSourcesChanged ? { savingsBondEducation: { ...nextCredits.savingsBondEducation, sourceFactsConfirmed: null } } : {}),
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

function validateW2Section(data: { entries: W2EntryData[] } | undefined, filingStatus?: FilingStatus | null, returnYear?: number | null): SectionValidationResult {
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
): SectionValidationResult {
  if (!data || (![...data.interestEntries, ...data.dividendEntries, ...data.brokerageEntries].some(isStartedInvestment) && !data.brokerageEntries.some(entry => entry.transactions.some(isStartedInvestment)) && !data.oidEntries?.some(isStartedOid) && !data.childElections?.length)) return EMPTY_SECTION("investment info");
  const errors = investmentFactErrors(data, filingStatus, taxYear, stateData, stateCode);
  if (Object.keys(errors).length) return { status: "partial", message: "Complete the actual investment source amounts, ownership and classifications.", fieldErrors: errors, allowSkip: true };
  return VALID_SECTION;
}

function validateRentalSection(data: { entries: RentalPropertyEntryData[] } | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateCode?: string | null): SectionValidationResult {
  if (!data?.entries.some(isStartedRental)) return EMPTY_SECTION("rental property info");
  const errors = rentalFactErrors(data.entries, filingStatus, taxYear, stateCode);
  return Object.keys(errors).length ? { status: "partial", message: "Complete the actual rental ownership, use and expense facts.", fieldErrors: errors, allowSkip: true } : VALID_SECTION;
}

function validateRequiredFacts(errors: Record<string, string>): SectionValidationResult {
  return Object.keys(errors).length ? {
    status: "partial", message: Object.values(errors)[0], fieldErrors: errors, allowSkip: false,
  } : VALID_SECTION;
}

function validateRetirementSection(data: { entries: RetirementEntryData[] } | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateData?: StateReturnData): SectionValidationResult {
  if (!data?.entries?.length) return EMPTY_SECTION("retirement info");
  return validateRequiredFacts(retirementFactErrors(data.entries, true, filingStatus, taxYear, stateData));
}

function validateSocialSecuritySection(data: SocialSecurityData | undefined, state: GuidedFlowState): SectionValidationResult {
  if (!socialSecurityEntries(data).some(isStartedSocialSecurity)) return EMPTY_SECTION("Social Security info");
  return validateRequiredFacts(socialSecurityFactErrors(data, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments));
}

function validateUnemploymentSection(data: UnemploymentData | undefined, state: GuidedFlowState): SectionValidationResult {
  if (!unemploymentEntries(data).some(isStartedUnemployment)) return EMPTY_SECTION("government payment info");
  return validateRequiredFacts(unemploymentFactErrors(data, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData["state-return"]));
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
  if (data.iraContributions || data.hsaAccounts?.length || data.educatorExpenseSources?.length || data.studentLoanFacts || data.healthInsuranceFacts || data.foreignIncome) return VALID_SECTION;
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
      return validateW2Section(getSectionData(state, "income-w2"), state.segmentation.filingStatus, state.taxYear);
    case "income-self-employment":
      return validateSelfEmploymentSection(getSectionData(state, "income-self-employment"), state.segmentation.filingStatus, getSectionData(state, "income-w2")?.entries, getSectionData(state, "state-return"), state.taxYear);
    case "income-investments":
      return validateInvestmentSection(getSectionData(state, "income-investments"), state.segmentation.filingStatus, state.taxYear, getSectionData(state, "state-return"), state.segmentation.stateCode);
    case "income-rental":
      return validateRentalSection(getSectionData(state, "income-rental"), state.segmentation.filingStatus, state.taxYear, state.segmentation.stateCode);
    case "income-retirement":
      return validateRetirementSection(getSectionData(state, "income-retirement"), state.segmentation.filingStatus, state.taxYear, getSectionData(state, "state-return"));
    case "income-social-security":
      return validateSocialSecuritySection(getSectionData(state, "income-social-security"), state);
    case "income-unemployment":
      return validateUnemploymentSection(getSectionData(state, "income-unemployment"), state);
    case "additional-deductions":
      return getSectionData(state, "additional-deductions") ? validateRequiredFacts({ ...tipIncomeFactErrors(state), ...schedule1AFactErrors(state) }) : EMPTY_SECTION("additional deduction sources");
    case "deductions":
      return validateDeductionsSection(getSectionData(state, "deductions"), state.taxYear, nonW2TaxAllocationErrors(state), state.segmentation.filingStatus, state.sectionData["personal-info"]?.spouse);
    case "adjustments": {
      const errors = { ...foreignIncomeFactErrors(state), ...healthInsuranceSourceErrors(state), ...hsaFactErrors(getSectionData(state, "adjustments")?.hsaAccounts, state.segmentation.filingStatus, state.taxYear, getSectionData(state, "income-w2")?.entries ?? [], getSectionData(state, "personal-info"), state.segmentation.lifeEvents.includes("hsa-contributions")), ...educatorFactErrors(getSectionData(state, "adjustments"), state.segmentation.filingStatus, state.taxYear, state.segmentation.lifeEvents.includes("educator-expenses")) };
      let loanEducation: StudentLoanEducationSources = [];
      try {
        if (state.sectionData.adjustments?.studentLoanFacts) loanEducation = studentLoanEducationSources(state.sectionData.credits, state.segmentation.filingStatus, state.taxYear, state.sectionData["personal-info"], state.sectionData.adjustments.studentLoanFacts);
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
        ...premiumTaxCreditFactErrors(state),
        ...minimumTaxCreditFactErrors(credits?.minimumTaxCredit, state.taxYear, state.segmentation.filingStatus, personal),
        ...savingsBondFactErrors(credits?.savingsBondEducation, state.taxYear, state.segmentation.filingStatus, getSectionData(state, "income-investments")?.interestEntries, personal),
        ...careBenefitsFactErrors(credits?.dependentCareBenefits, state.taxYear, state.segmentation.filingStatus, sources),
        ...careFactErrors(credits?.dependentCare, state.segmentation.filingStatus, { data: credits?.dependentCareBenefits, year: state.taxYear, sources }),
        ...energyFactErrors(credits?.energy, state.taxYear, state.segmentation.filingStatus),
        ...vehicleFactErrors(credits?.vehicles, state.taxYear, state.segmentation.filingStatus),
        ...adoptionFactErrors(credits?.adoption, state.taxYear, state.segmentation.filingStatus),
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
