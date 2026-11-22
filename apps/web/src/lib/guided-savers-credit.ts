import Decimal from "decimal.js";
import type { z } from "zod";
import { Form8880AnnualSchema } from "@/models/form-8880-sources";
import type { AdjustmentData, FilingStatus, GuidedFlowState, RetirementEntryData, W2EntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { hasEnteredAmount, isActualDate } from "./guided-required-facts";

const electiveDeferralFields = ["box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE"] as const;

export interface GuidedSaversCreditDistribution {
  sourceReference: string;
  accountHolder: "" | "primary" | "spouse";
  receivedDate: string;
  amount: string;
}

export interface GuidedSaversCreditData {
  taxYear: string;
  sourceFactsConfirmed: boolean | null;
  ordinaryScopeConfirmed: boolean | null;
  contribution: Omit<GuidedSaversCreditDistribution, "receivedDate">;
  qualifyingStudentMonths: string;
  dependentDeductionAllowedToAnotherTaxpayer: boolean | null;
  testingPeriod: {
    dueDate: string;
    distributionsConfirmed: boolean | null;
    distributions: GuidedSaversCreditDistribution[];
  };
}

export interface GuidedSaversCreditContext {
  taxYear: number | null | undefined;
  filingStatus: FilingStatus | null | undefined;
  iraContributions: Pick<NonNullable<AdjustmentData["iraContributions"]>,
    "contributionTaxYear" | "contributionTimingConfirmed" | "specialContributionRulesRequired" | "sourceFactsConfirmed"
    | "primaryRothContributions" | "primaryContributions" | "primarySection501c18Contributions" | "primaryCompensation"> | undefined;
  personal: { dateOfBirth?: string; standardDeductionFacts?: { primaryCanBeClaimedAsDependent?: boolean | null } } | undefined;
  wageEntries: readonly Pick<W2EntryData, typeof electiveDeferralFields[number]>[];
  retirementEntries: readonly Pick<RetirementEntryData, "grossDistribution">[];
  hasConflictingIncomeExclusions?: boolean;
}

export function guidedSaversCreditContext(state: GuidedFlowState): GuidedSaversCreditContext {
  const sections = state.sectionData;
  const personal = sections["personal-info"];
  const childFacts = personal?.childTaxCredit;
  const socialSecurity = sections["income-social-security"];
  const schedule1A = sections["additional-deductions"]?.schedule1A;
  const studentLoan = sections.adjustments?.studentLoanFacts;
  const credits = sections.credits;
  const exclusions = [
    childFacts?.possessionIncomeExclusion, childFacts?.puertoRicoExcludedIncome, childFacts?.form4563ExcludedIncome,
    socialSecurity?.puertoRicoIncomeExclusion, socialSecurity?.americanSamoaIncomeExclusion,
    schedule1A?.excludedPuertoRicoIncome, schedule1A?.form4563Exclusion,
    studentLoan?.puertoRicoIncomeExclusion, studentLoan?.americanSamoaIncomeExclusion,
    credits?.education?.possessionIncomeExclusion, credits?.savingsBondEducation?.americanSamoaIncomeExclusion,
    credits?.vehicles?.foreignEarnedIncomeExclusion, credits?.vehicles?.foreignHousingDeduction, credits?.vehicles?.possessionIncomeExclusion,
    credits?.adoption?.foreignEarnedIncomeExclusion, credits?.adoption?.foreignHousingExclusion, credits?.adoption?.possessionIncomeExclusion,
  ];
  const hasNonzeroOrUnknownExclusions = exclusions.some(value => {
    try { return !parseGuidedCurrency(value).isZero(); } catch { return true; }
  });
  return {
    taxYear: state.taxYear,
    filingStatus: state.segmentation.filingStatus,
    iraContributions: sections.adjustments?.iraContributions,
    personal,
    wageEntries: sections["income-w2"]?.entries ?? [],
    retirementEntries: sections["income-retirement"]?.entries ?? [],
    hasConflictingIncomeExclusions: Boolean(sections.adjustments?.foreignIncome) || hasNonzeroOrUnknownExclusions,
  };
}

export const emptyGuidedSaversCredit: GuidedSaversCreditData = {
  taxYear: "", sourceFactsConfirmed: null, ordinaryScopeConfirmed: null,
  contribution: { accountHolder: "", sourceReference: "", amount: "" },
  qualifyingStudentMonths: "", dependentDeductionAllowedToAnotherTaxpayer: null,
  testingPeriod: { dueDate: "", distributionsConfirmed: null, distributions: [] },
};

function actualAmount(value: string | undefined, label: string): Decimal {
  if (!hasEnteredAmount(value)) throw new Error(`Enter the actual ${label}, including zero when known.`);
  const amount = parseGuidedCurrency(value);
  if (amount.isNegative()) throw new Error(`The ${label} cannot be negative.`);
  return amount;
}

function distributionReduction(period: GuidedSaversCreditData["testingPeriod"]): string {
  if (period.distributionsConfirmed !== true || !["2027-04-15", "2027-10-15"].includes(period.dueDate) || !Array.isArray(period.distributions)) {
    throw new Error("Confirm the actual testing-period distributions and the applicable ordinary or extended return due date.");
  }
  let total = new Decimal(0);
  const references = new Set<string>();
  for (const row of period.distributions) {
    const reference = row.sourceReference?.trim().toLowerCase();
    if (!reference || references.has(reference) || row.accountHolder !== "primary") {
      throw new Error("Identify each distinct primary-owner distribution from its actual source record.");
    }
    if (!isActualDate(row.receivedDate) || row.receivedDate < "2024-01-01" || row.receivedDate >= period.dueDate) {
      throw new Error("The distribution must have been received during the Form 8880 testing period.");
    }
    if (row.receivedDate.startsWith("2026-")) throw new Error("A 2026 distribution needs separate reconciliation with the current return's retirement sources.");
    const amount = actualAmount(row.amount, "distribution amount");
    if (amount.isZero()) throw new Error("Each included distribution requires a positive amount from its actual record.");
    references.add(reference);
    total = total.plus(amount);
  }
  return total.toFixed();
}

export function buildGuidedSaversCredit(data: GuidedSaversCreditData | undefined, context: GuidedSaversCreditContext): z.infer<typeof Form8880AnnualSchema> | undefined {
  if (!data) return undefined;
  const { taxYear, filingStatus, iraContributions, personal, wageEntries, retirementEntries, hasConflictingIncomeExclusions } = context;
  if (taxYear !== 2026 || data.taxYear !== "2026" || filingStatus !== "single") {
    throw new Error("This Form 8880 worksheet requires a 2026 single return.");
  }
  if (data.sourceFactsConfirmed !== true || data.ordinaryScopeConfirmed !== true || hasConflictingIncomeExclusions) {
    throw new Error("Confirm the actual ordinary Roth IRA facts, including the absence of other qualifying contributions and relevant income exclusions.");
  }
  if (wageEntries.some(entry => electiveDeferralFields.some(field => !parseGuidedCurrency(entry[field]).isZero()))) {
    throw new Error("Employer retirement contributions need separate Form 8880 reconciliation.");
  }
  if (retirementEntries.some(entry => !parseGuidedCurrency(entry.grossDistribution).isZero())) {
    throw new Error("Reconcile the current return's retirement distributions before completing Form 8880.");
  }
  if (iraContributions?.contributionTaxYear !== "2026" || iraContributions.sourceFactsConfirmed !== true
    || iraContributions.contributionTimingConfirmed !== true || iraContributions.specialContributionRulesRequired !== false) {
    throw new Error("Complete and confirm the ordinary IRA contribution worksheet for 2026.");
  }
  if (data.contribution.accountHolder !== "primary" || !data.contribution.sourceReference?.trim()) {
    throw new Error("Identify the contribution record for the primary Roth IRA owner.");
  }
  const roth = actualAmount(data.contribution.amount, "Roth IRA contribution");
  if (roth.isZero() || !roth.eq(actualAmount(iraContributions.primaryRothContributions, "worksheet Roth IRA contribution"))
    || !actualAmount(iraContributions.primaryContributions, "traditional IRA contribution").isZero()
    || !actualAmount(iraContributions.primarySection501c18Contributions, "section 501(c)(18)(D) contribution").isZero()) {
    throw new Error("Reconcile the positive Roth IRA contribution and other contribution amounts with the IRA worksheet.");
  }
  if (roth.gt(actualAmount(iraContributions.primaryCompensation, "eligible IRA compensation"))) {
    throw new Error("The Roth IRA contribution exceeds eligible compensation in the IRA worksheet.");
  }
  const dependency = data.dependentDeductionAllowedToAnotherTaxpayer;
  const householdDependency = personal?.standardDeductionFacts?.primaryCanBeClaimedAsDependent;
  const birthDate = personal?.dateOfBirth;
  if (!birthDate || !isActualDate(birthDate) || birthDate > "2026-12-31"
    || !/^(?:[0-9]|1[0-2])$/.test(data.qualifyingStudentMonths) || typeof dependency !== "boolean"
    || (typeof householdDependency === "boolean" && householdDependency !== dependency)) {
    throw new Error("Confirm the taxpayer's date of birth, qualifying student months and dependency facts for 2026.");
  }
  return Form8880AnnualSchema.parse({
    primaryIraContributions: roth.toFixed(),
    primaryElectiveDeferrals: "0",
    sourceFacts2026: {
      taxYear: 2026,
      testingPeriodComplete: true,
      primary: {
        qualifyingStudentMonths: Number(data.qualifyingStudentMonths),
        dependentDeductionAllowedToAnotherTaxpayer: dependency,
        testingPeriodDistributionReduction: distributionReduction(data.testingPeriod),
      },
      americanSamoaAgiRestoration: "0",
      puertoRicoAgiRestoration: "0",
    },
  });
}

export function guidedSaversCreditFactErrors(data: GuidedSaversCreditData | undefined, context: GuidedSaversCreditContext): Record<string, string> {
  try { buildGuidedSaversCredit(data, context); return {}; }
  catch (error) { return { saversCredit: error instanceof Error ? error.message : "Check the actual Form 8880 facts." }; }
}
