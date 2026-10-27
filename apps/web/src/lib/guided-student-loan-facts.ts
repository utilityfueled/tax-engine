import Decimal from "decimal.js";
import { Form1098ESchema, StudentLoanInterestFactsSchema, type Form1098E } from "@/models/inputs";
import { calculateStudentLoanInterestDeduction } from "@/engine/forms/student-loan-interest";
import { calculateForm1099Q, type Form1099QResult } from "@/engine/forms/form-1099-q";
import type { AdjustmentData, CreditsData, FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { buildActualEducationInput } from "./guided-education-facts";
import { buildEducationDistributionInputs } from "./guided-education-distributions";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

export const studentLoanMoneyFields = ["interestPaid", "additionalInterestPaid", "employerAssistanceExcluded", "otherTaxFreeAssistance", "interestDeductibleElsewhere", "qtpTaxFreeEarningsUsedForInterest"] as const;
export const studentLoanBooleanFields = ["additionalInterestQualificationConfirmed", "paymentsInTaxYearConfirmed", "legallyObligated", "solelyQualifiedEducationExpenses", "eligibleInstitutionAtOrigination", "enrolledAtLeastHalfTime", "pursuingCredential", "expensesWithinReasonablePeriod", "relatedLender", "employerPlanLoan", "reductionsDistinctConfirmed"] as const;
export interface StudentLoanSourceData extends Record<typeof studentLoanMoneyFields[number], string>, Record<typeof studentLoanBooleanFields[number], boolean | null> {
  sourceId: string; borrowerId: string; accountHolder: "" | "primary" | "spouse"; lender: string;
  sourceKind: "" | "form1098e" | "lender_statement" | "payment_records";
  loanOriginationDate: string; additionalInterestSourceReference: string;
  studentRelationshipAtOrigination: "" | "self" | "spouse" | "dependent" | "other";
  form1098ESourceId: string; form1098ETaxYear: string; form1098EBox1: string;
  box2ExcludesOriginationFeesOrCapitalizedInterest: boolean | null;
  educationExpenseIds: string[];
}
export interface StudentLoanData {
  sourceTaxYear: string; sourceFactsConfirmed: boolean | null;
  primaryClaimedAsDependent: boolean | null; spouseClaimedAsDependent: boolean | null;
  puertoRicoIncomeExclusion: string; americanSamoaIncomeExclusion: string;
  loans?: StudentLoanSourceData[];
}
export type StudentLoanEducationSources = Form1099QResult["loanInterestSourceAdjustments"];
export const emptyStudentLoanSource: StudentLoanSourceData = {
  sourceId: "", borrowerId: "", accountHolder: "", lender: "", sourceKind: "", loanOriginationDate: "", additionalInterestSourceReference: "", studentRelationshipAtOrigination: "",
  form1098ESourceId: "", form1098ETaxYear: "", form1098EBox1: "", box2ExcludesOriginationFeesOrCapitalizedInterest: null, educationExpenseIds: [],
  interestPaid: "", additionalInterestPaid: "", employerAssistanceExcluded: "", otherTaxFreeAssistance: "", interestDeductibleElsewhere: "", qtpTaxFreeEarningsUsedForInterest: "",
  additionalInterestQualificationConfirmed: null, paymentsInTaxYearConfirmed: null, legallyObligated: null, solelyQualifiedEducationExpenses: null, eligibleInstitutionAtOrigination: null,
  enrolledAtLeastHalfTime: null, pursuingCredential: null, expensesWithinReasonablePeriod: null, relatedLender: null, employerPlanLoan: null, reductionsDistinctConfirmed: null,
};
export const emptyStudentLoanFacts: StudentLoanData = { sourceTaxYear: "", sourceFactsConfirmed: null, primaryClaimedAsDependent: null, spouseClaimedAsDependent: null, puertoRicoIncomeExclusion: "", americanSamoaIncomeExclusion: "", loans: [] };
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
function money(value: string | undefined, label: string): string {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
}
export function hasSavedStudentLoanStatement(loan: StudentLoanSourceData): boolean {
  return !!(loan.form1098ESourceId || loan.form1098ETaxYear || loan.form1098EBox1 || typeof loan.box2ExcludesOriginationFeesOrCapitalizedInterest === "boolean");
}

export function buildStudentLoanInputs(data: StudentLoanData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, educationLoanInterest: StudentLoanEducationSources = [], legacyGrossInterest?: string) {
  const legacy = hasEnteredAmount(legacyGrossInterest) ? new Decimal(money(legacyGrossInterest, "saved student-loan gross interest")) : undefined;
  if (!data) {
    if (educationLoanInterest.some(source => source.owner !== "other" && source.interestClaimedElsewhere.gt(0))) {
      throw new Error("Enter actual student-loan source facts for the interest claim in your education records.");
    }
    if (legacy?.gt(0)) throw new Error("Enter actual student-loan source facts; a saved amount does not establish eligibility.");
    return {};
  }
  if (!filingStatus || (taxYear !== 2025 && taxYear !== 2026)) throw new Error("Choose the actual return year and filing status for the student-loan worksheet.");
  const forms = new Map<string, Form1098E>();
  const loans = data.loans?.map(loan => {
    if (loan.sourceKind === "form1098e") {
      if (typeof loan.box2ExcludesOriginationFeesOrCapitalizedInterest !== "boolean") throw new Error("Confirm actual Form 1098-E Box 2; the legacy label cannot establish this answer.");
      const form = Form1098ESchema.parse({ sourceId: loan.form1098ESourceId.trim(), taxYear: /^\d{4}$/.test(loan.form1098ETaxYear) ? Number(loan.form1098ETaxYear) : undefined,
        borrowerId: loan.borrowerId.trim(), accountHolder: loan.accountHolder || undefined, lender: loan.lender.trim(), studentLoanInterestReceived: money(loan.form1098EBox1, "original Form 1098-E Box 1"), box2ExcludesOriginationFeesOrCapitalizedInterest: loan.box2ExcludesOriginationFeesOrCapitalizedInterest });
      const existing = forms.get(form.sourceId!);
      if (existing && JSON.stringify(existing) !== JSON.stringify(form)) throw new Error("Reconcile the original statement details across allocations to the same Form 1098-E.");
      forms.set(form.sourceId!, form);
    } else if (hasSavedStudentLoanStatement(loan)) throw new Error("Reconcile the saved Form 1098-E statement details with the actual source kind; clear only records that do not apply.");
    return { ...loan, accountHolder: loan.accountHolder || undefined, sourceKind: loan.sourceKind || undefined, studentRelationshipAtOrigination: loan.studentRelationshipAtOrigination || undefined,
      ...Object.fromEntries(studentLoanMoneyFields.map(field => [field, money(loan[field], field)])),
      ...Object.fromEntries(studentLoanBooleanFields.map(field => [field, loan[field] ?? undefined])),
    };
  });
  const facts = StudentLoanInterestFactsSchema.parse({ sourceTaxYear: /^\d{4}$/.test(data.sourceTaxYear) ? Number(data.sourceTaxYear) : undefined, sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    primaryClaimedAsDependent: data.primaryClaimedAsDependent ?? undefined, spouseClaimedAsDependent: data.spouseClaimedAsDependent ?? undefined,
    puertoRicoIncomeExclusion: money(data.puertoRicoIncomeExclusion, "Puerto Rico excluded income"), americanSamoaIncomeExclusion: money(data.americanSamoaIncomeExclusion, "American Samoa excluded income"), loans });
  const form1098E = [...forms.values()];
  const checked = calculateStudentLoanInterestDeduction({ taxYear, filingStatus: statuses[filingStatus], facts, forms: form1098E, educationLoanInterest });
  if (legacy && !checked.sources.reduce((sum, source) => sum.plus(source.grossInterest), new Decimal(0)).eq(legacy)) throw new Error("Reconcile the saved gross student-loan interest with the actual source amounts.");
  return { studentLoanInterestFacts: facts, form1098E };
}

export function studentLoanEducationSources(credits: CreditsData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personal?: PersonalInfoData, loanFacts?: StudentLoanData): StudentLoanEducationSources {
  const educationClaimed = credits?.education.claimedAsDependent;
  if (typeof educationClaimed === "boolean" && typeof loanFacts?.primaryClaimedAsDependent === "boolean" && educationClaimed !== loanFacts.primaryClaimedAsDependent) throw new Error("Reconcile the actual claimed-dependent answer in the education and student-loan worksheets.");
  if (loanFacts?.primaryClaimedAsDependent === true && personal?.standardDeductionFacts?.primaryCanBeClaimedAsDependent === false) throw new Error("Reconcile actual claimed dependency with the taxpayer's household eligibility answer.");
  if (filingStatus === "mfj" && loanFacts?.spouseClaimedAsDependent === true && personal?.standardDeductionFacts?.spouseCanBeClaimedAsDependent === false) throw new Error("Reconcile actual spouse claimed dependency with the household eligibility answer.");
  if (!credits?.educationDistributions) return [];
  const education = buildActualEducationInput(credits, taxYear, filingStatus, personal);
  const inputs = buildEducationDistributionInputs(credits.educationDistributions, taxYear, filingStatus, education);
  return calculateForm1099Q(inputs.form1099Q ?? [], inputs.qualifiedEducationExpenses, { taxYear: taxYear ?? undefined, educationExpenses: education }).loanInterestSourceAdjustments;
}

export function studentLoanFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, education: StudentLoanEducationSources = [], required = false): Record<string, string> {
  if (required && !data?.studentLoanFacts) return { studentLoanSources: "Enter the actual student-loan worksheet for this interview selection, including explicit zero if no qualified interest was paid." };
  try { buildStudentLoanInputs(data?.studentLoanFacts, filingStatus, taxYear, education, data?.studentLoanInterest); return {}; }
  catch (error) { return { studentLoanSources: error instanceof Error ? error.message : "Complete the actual student-loan source facts." }; }
}
