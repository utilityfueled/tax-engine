import { AdjustmentsSchema } from "@/models/inputs";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import type { AdjustmentData, FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

export const educatorReductionFields = ["reimbursementsNotInWages", "excludedSavingsBondInterest", "nontaxableQualifiedTuitionProgramAmount", "nontaxableCoverdellEarnings"] as const;
export interface EducatorSchoolData {
  name: string; role: "" | "teacher" | "instructor" | "counselor" | "principal" | "aide" | "other";
  schoolEligible: boolean | null; hoursWorked: string;
}
export interface EducatorExpenseData {
  sourceId: string; datePaid: string; description: string;
  category: "" | "classroom" | "professional_development" | "protective_supplies" | "other";
  amount: string; ordinaryAndNecessary: boolean | null; qualifyingUse: boolean | null;
  healthOrPhysicalEducation: boolean | null; athleticSupplies: boolean | null; deductedElsewhere: boolean | null;
}
export interface EducatorSourceData {
  accountHolder: "" | "primary" | "spouse"; taxYear: string; schoolYear: string;
  sourceFactsConfirmed: boolean | null; schools: EducatorSchoolData[]; expenses: EducatorExpenseData[];
  reimbursementsNotInWages: string; excludedSavingsBondInterest: string;
  nontaxableQualifiedTuitionProgramAmount: string; nontaxableCoverdellEarnings: string;
}
export const emptyEducatorSchool: EducatorSchoolData = { name: "", role: "", schoolEligible: null, hoursWorked: "" };
export const emptyEducatorExpense: EducatorExpenseData = { sourceId: "", datePaid: "", description: "", category: "", amount: "", ordinaryAndNecessary: null, qualifyingUse: null, healthOrPhysicalEducation: null, athleticSupplies: null, deductedElsewhere: null };
export const emptyEducatorSource: EducatorSourceData = { accountHolder: "", taxYear: "", schoolYear: "", sourceFactsConfirmed: null, schools: [], expenses: [], reimbursementsNotInWages: "", excludedSavingsBondInterest: "", nontaxableQualifiedTuitionProgramAmount: "", nontaxableCoverdellEarnings: "" };

export function buildEducatorSources(sources: EducatorSourceData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, legacyAmount?: string) {
  if (!sources?.length) {
    if (hasEnteredAmount(legacyAmount) && parseGuidedCurrency(legacyAmount).gt(0)) throw new Error("Enter actual educator sources; a saved aggregate does not establish the owner or qualification.");
    return undefined;
  }
  const money = (value: string | undefined, label: string) => {
    const error = amountError(value, label);
    if (error) throw new Error(error);
    return parseGuidedCurrency(value).toString();
  };
  const actual = sources.map(source => ({
    accountHolder: source.accountHolder || undefined,
    taxYear: /^\d{4}$/.test(source.taxYear) ? Number(source.taxYear) : undefined,
    schoolYear: source.schoolYear, sourceFactsConfirmed: source.sourceFactsConfirmed ?? undefined,
    schools: source.schools?.map(school => ({ name: school.name, role: school.role || undefined, schoolEligible: school.schoolEligible ?? undefined, hoursWorked: money(school.hoursWorked, "actual school-year hours") })),
    expenses: source.expenses?.map(expense => ({ ...expense, category: expense.category || undefined, amount: money(expense.amount, "actual educator cost"), ordinaryAndNecessary: expense.ordinaryAndNecessary ?? undefined, qualifyingUse: expense.qualifyingUse ?? undefined, healthOrPhysicalEducation: expense.healthOrPhysicalEducation ?? undefined, athleticSupplies: expense.athleticSupplies ?? undefined, deductedElsewhere: expense.deductedElsewhere ?? undefined })),
    ...Object.fromEntries(educatorReductionFields.map(field => [field, money(source[field], field)])),
  }));
  const adjustments = AdjustmentsSchema.parse({ educatorExpenseSources: actual, educatorExpenses: hasEnteredAmount(legacyAmount) ? money(legacyAmount, "saved educator net expenses") : undefined });
  const year = taxYear ?? actual[0]?.taxYear;
  if (year !== 2025 && year !== 2026) throw new Error("Select and confirm the actual educator tax year.");
  calculateEducatorExpensesDeduction(adjustments, filingStatus === "mfj" ? "married_filing_jointly" : "single", year);
  return adjustments.educatorExpenseSources;
}

export function educatorFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, required = false): Record<string, string> {
  if (required && !data?.educatorExpenseSources?.length) return { educatorSources: "Enter the actual educator sources for the expenses selected in your interview." };
  if (!data) return {};
  try { buildEducatorSources(data.educatorExpenseSources, filingStatus, taxYear, data.educatorExpenses); return {}; }
  catch (error) { return { educatorSources: error instanceof Error ? error.message : "Check the actual educator source facts." }; }
}
