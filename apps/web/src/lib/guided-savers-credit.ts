import Decimal from "decimal.js";
import type { z } from "zod";
import { Form8880AnnualSchema, getForm8880HistoricalIraPaymentYear, readForm8880AnnualSources } from "@/models/form-8880-sources";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date";
import { sumSourceMoney } from "@/utils/sum-source-money";
import type { AdjustmentData, FilingStatus, GuidedFlowState, RetirementEntryData, W2EntryData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { hasEnteredAmount } from "./guided-required-facts";
import { isStartedRetirement } from "./guided-retirement-source-inputs";

const electiveDeferralFields = ["box12CodeD", "box12CodeE", "box12CodeF", "box12CodeG", "box12CodeH", "box12CodeS", "box12CodeAA", "box12CodeBB", "box12CodeEE"] as const;

export interface GuidedSaversCreditDistribution {
  sourceReference: string;
  accountHolder: "" | "primary" | "spouse";
  receivedDate: string;
  amount: string;
  historicalProof?: GuidedSaversHistoricalProof;
}

export interface GuidedSaversHistoricalProof {
  originalTaxYear: string;
  originalReference: string;
  originalIssuerEin: string;
  receiptIssuerEin: string;
  originalAccountLast4: string;
  receiptAccountLast4: string;
  recipientTaxIdLast4: string;
  grossDistribution: string;
  taxableAmount: string;
  distributionCode: string;
  traditionalIraConfirmed: boolean | null;
  iraSepSimple: boolean | null;
  taxableAmountNotDetermined: boolean | null;
  sourceFactsConfirmed: boolean | null;
}

export interface GuidedSaversCreditData {
  taxYear: string;
  sourceFactsConfirmed: boolean | null;
  ordinaryScopeConfirmed: boolean | null;
  contribution: Pick<GuidedSaversCreditDistribution, "accountHolder" | "sourceReference" | "amount">;
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
  asOfDate: string;
  filingStatus: FilingStatus | null | undefined;
  iraContributions: Pick<NonNullable<AdjustmentData["iraContributions"]>,
    "contributionTaxYear" | "contributionTimingConfirmed" | "specialContributionRulesRequired" | "sourceFactsConfirmed"
    | "primaryRothContributions" | "primaryContributions" | "primarySection501c18Contributions" | "primaryCompensation"> | undefined;
  personal: { ssn?: string; dateOfBirth?: string; standardDeductionFacts?: { primaryCanBeClaimedAsDependent?: boolean | null } } | undefined;
  wageEntries: readonly Pick<W2EntryData, typeof electiveDeferralFields[number]>[];
  retirementEntries: readonly Pick<RetirementEntryData, "grossDistribution">[];
  hasCurrentRetirementStatements?: boolean;
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
  const retirementEntries = sections["income-retirement"]?.entries ?? [];
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
    asOfDate: currentLocalCivilDate(),
    filingStatus: state.segmentation.filingStatus,
    iraContributions: sections.adjustments?.iraContributions,
    personal,
    wageEntries: sections["income-w2"]?.entries ?? [],
    retirementEntries,
    hasCurrentRetirementStatements: retirementEntries.some(isStartedRetirement),
    hasConflictingIncomeExclusions: Boolean(sections.adjustments?.foreignIncome) || hasNonzeroOrUnknownExclusions,
  };
}

export const emptyGuidedSaversCredit: GuidedSaversCreditData = {
  taxYear: "", sourceFactsConfirmed: null, ordinaryScopeConfirmed: null,
  contribution: { accountHolder: "", sourceReference: "", amount: "" },
  qualifyingStudentMonths: "", dependentDeductionAllowedToAnotherTaxpayer: null,
  testingPeriod: { dueDate: "", distributionsConfirmed: null, distributions: [] },
};

export const emptyGuidedSaversHistoricalProof: GuidedSaversHistoricalProof = {
  originalTaxYear: "", originalReference: "", originalIssuerEin: "", receiptIssuerEin: "", originalAccountLast4: "",
  receiptAccountLast4: "", recipientTaxIdLast4: "", grossDistribution: "", taxableAmount: "", distributionCode: "",
  traditionalIraConfirmed: null, iraSepSimple: null, taxableAmountNotDetermined: null, sourceFactsConfirmed: null,
};

export function guidedSaversHistoricalEvidence(data: GuidedSaversCreditData | undefined) {
  if (!data) return undefined;
  const period = data.testingPeriod;
  if (!Array.isArray(period?.distributions) || !period.distributions.some(row => row.historicalProof !== undefined)) return undefined;
  return { taxYear: data.taxYear, dueDate: period.dueDate, distributions: period.distributions };
}

export function requireGuidedSaversReview(data: GuidedSaversCreditData, historical = false): GuidedSaversCreditData {
  if (!historical) return { ...data, sourceFactsConfirmed: null };
  return {
    ...data,
    sourceFactsConfirmed: null,
    testingPeriod: { ...data.testingPeriod, distributionsConfirmed: null, distributions: data.testingPeriod.distributions.map(row => (
      row.historicalProof ? { ...row, historicalProof: { ...row.historicalProof, sourceFactsConfirmed: null } } : row
    )) },
  };
}

function actualAmount(value: string | undefined, label: string): Decimal {
  if (!hasEnteredAmount(value)) throw new Error(`Enter the actual ${label}, including zero when known.`);
  const amount = parseGuidedCurrency(value);
  if (amount.isNegative()) throw new Error(`The ${label} cannot be negative.`);
  return amount;
}

function distributionReduction(period: GuidedSaversCreditData["testingPeriod"], asOfDate: string): string {
  if (period.distributionsConfirmed !== true || !["2027-04-15", "2027-10-15"].includes(period.dueDate) || !Array.isArray(period.distributions)) {
    throw new Error("Confirm the actual testing-period distributions and the applicable ordinary or extended return due date.");
  }
  const amounts: Decimal[] = [];
  const references = new Set<string>();
  for (const row of period.distributions) {
    const reference = row.sourceReference?.trim().toLowerCase();
    if (!reference || references.has(reference) || row.accountHolder !== "primary") {
      throw new Error("Identify each distinct primary-owner distribution from its actual source record.");
    }
    if (!isActualDate(row.receivedDate) || row.receivedDate < "2024-01-01" || row.receivedDate >= period.dueDate) {
      throw new Error("The distribution must have been received during the Form 8880 testing period.");
    }
    if (row.receivedDate > asOfDate) throw new Error("Enter only distributions you have already received for Form 8880.");
    if (row.receivedDate.startsWith("2026-")) throw new Error("A 2026 distribution needs separate reconciliation with the current return's retirement sources.");
    const amount = actualAmount(row.amount, "distribution amount");
    if (amount.isZero()) throw new Error("Each included distribution requires a positive amount from its actual record.");
    references.add(reference);
    amounts.push(amount);
  }
  return sumSourceMoney(...amounts).toFixed();
}

function buildHistoricalPayment(row: GuidedSaversCreditDistribution, proof: GuidedSaversHistoricalProof) {
  const paymentYear = getForm8880HistoricalIraPaymentYear(row.receivedDate);
  if (row.accountHolder !== "primary" || paymentYear === undefined) {
    throw new Error("Each historical proof requires a 2024 or 2025 payment to the primary taxpayer.");
  }
  if (!proof || proof.originalTaxYear !== String(paymentYear)) {
    throw new Error("The year printed on Form 1099-R must match the year you received the payment.");
  }
  if (proof.distributionCode?.trim() !== "7" || proof.traditionalIraConfirmed !== true
    || proof.iraSepSimple !== true || proof.taxableAmountNotDetermined !== false) {
    throw new Error("Enter the original Form 1099-R for a traditional IRA with Code 7, the IRA box checked and a determined taxable amount.");
  }
  const isLastFour = (value: string | undefined) => /^\d{4}$/.test(value ?? "");
  const isIssuerEin = (value: string | undefined) => /^\d{2}-?\d{7}$/.test(value?.trim() ?? "");
  if (!proof.originalReference?.trim() || !isIssuerEin(proof.originalIssuerEin) || !isIssuerEin(proof.receiptIssuerEin)
    || !isLastFour(proof.originalAccountLast4) || !isLastFour(proof.receiptAccountLast4) || !isLastFour(proof.recipientTaxIdLast4)) {
    throw new Error("Enter the Form 1099-R reference, both issuer EINs, and only the requested last four digits.");
  }
  const grossDistribution = actualAmount(proof.grossDistribution, "Form 1099-R Box 1 amount");
  const taxableAmount = actualAmount(proof.taxableAmount, "Form 1099-R Box 2a amount");
  if (proof.sourceFactsConfirmed !== true) throw new Error("Confirm the original Form 1099-R and matching issuer payment after reviewing both records.");
  return {
    original: {
      taxYear: paymentYear, accountHolder: row.accountHolder, recipientTaxIdLast4: proof.recipientTaxIdLast4,
      payerTin: proof.originalIssuerEin.trim(), accountReference: proof.originalAccountLast4, sourceReference: proof.originalReference,
      accountType: "traditional-ira", iraSepSimple: true, distributionCode: "7", grossDistribution: grossDistribution.toFixed(),
      taxableAmount: taxableAmount.toFixed(), taxableAmountNotDetermined: false,
    },
    issuerPayment: {
      sourceReference: row.sourceReference, payerTin: proof.receiptIssuerEin.trim(), accountReference: proof.receiptAccountLast4,
      receivedDate: row.receivedDate, amount: actualAmount(row.amount, "issuer payment amount").toFixed(),
    },
    statementReportsThisSinglePaymentConfirmed: true,
    noLine4ExclusionConfirmed: true,
  } as const;
}

function buildHistoricalProof(period: GuidedSaversCreditData["testingPeriod"]) {
  if (!Array.isArray(period?.distributions) || !period.distributions.some(row => row.historicalProof !== undefined)) return undefined;
  const [first, second] = period.distributions;
  if (period.distributions.length === 1 && first?.historicalProof) {
    return { priorYearOrdinaryIraDistribution: {
      ...buildHistoricalPayment(first, first.historicalProof), onlyIncludiblePaymentForTestingPeriodConfirmed: true,
    } } as const;
  }
  if (period.distributions.length !== 2 || !first?.historicalProof || !second?.historicalProof) {
    throw new Error("Historical proof requires records for every listed payment. Provide proof for one 2024 or 2025 payment, or one from each year.");
  }
  const firstPayment = buildHistoricalPayment(first, first.historicalProof);
  const secondPayment = buildHistoricalPayment(second, second.historicalProof);
  if (firstPayment.original.taxYear === secondPayment.original.taxYear) {
    throw new Error("Two historical payments require one payment from 2024 and one from 2025.");
  }
  return { priorYearOrdinaryIraDistributions: {
    payments: [firstPayment, secondPayment], onlyIncludiblePaymentsForTestingPeriodConfirmed: true,
  } } as const;
}

export function buildGuidedSaversCredit(data: GuidedSaversCreditData | undefined, context: GuidedSaversCreditContext): z.infer<typeof Form8880AnnualSchema> | undefined {
  if (!data) return undefined;
  const { taxYear, filingStatus, iraContributions, personal, wageEntries, retirementEntries, hasConflictingIncomeExclusions } = context;
  if (taxYear !== 2026 || data.taxYear !== "2026" || filingStatus !== "single") {
    throw new Error("This Form 8880 worksheet requires a 2026 single return.");
  }
  const historicalProof = buildHistoricalProof(data.testingPeriod);
  if (historicalProof && context.hasCurrentRetirementStatements) {
    throw new Error("This historical proof requires a return without a current Form 1099-R.");
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
  const annual = Form8880AnnualSchema.parse({
    primaryIraContributions: roth.toFixed(),
    primaryElectiveDeferrals: "0",
    sourceFacts2026: {
      taxYear: 2026,
      testingPeriodComplete: true,
      primary: {
        qualifyingStudentMonths: Number(data.qualifyingStudentMonths),
        dependentDeductionAllowedToAnotherTaxpayer: dependency,
        testingPeriodDistributionReduction: distributionReduction(data.testingPeriod, context.asOfDate),
      },
      americanSamoaAgiRestoration: "0",
      puertoRicoAgiRestoration: "0",
      ...historicalProof,
    },
  });
  if (historicalProof) readForm8880AnnualSources(annual, taxYear, false, false, undefined, {
    taxpayer: { filingStatus, primary: { ssn: personal?.ssn ?? "", dateOfBirth: birthDate } },
    hasCurrentRetirementStatements: context.hasCurrentRetirementStatements ?? retirementEntries.length > 0,
  });
  return annual;
}

export function guidedSaversCreditFactErrors(data: GuidedSaversCreditData | undefined, context: GuidedSaversCreditContext): Record<string, string> {
  try { buildGuidedSaversCredit(data, context); return {}; }
  catch (error) { return { saversCredit: error instanceof Error ? error.message : "Check the actual Form 8880 facts." }; }
}
