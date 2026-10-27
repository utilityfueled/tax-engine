import { AdjustmentsSchema } from "@/models/inputs";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { calculateEducatorBondSources } from "@/engine/forms/educator-bond-sources";
import type { AdjustmentData, FilingStatus, GuidedFlowState } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import { buildSavingsBondInputs } from "./guided-savings-bond-facts";

export const educatorReductionFields = ["reimbursementsNotInWages", "excludedSavingsBondInterest", "nontaxableQualifiedTuitionProgramAmount", "nontaxableCoverdellEarnings"] as const;
export interface EducatorSchoolData {
  name: string; role: "" | "teacher" | "instructor" | "counselor" | "principal" | "aide" | "interscholastic_sports_administrator" | "coach" | "other";
  level?: "" | "k12" | "early_childhood" | "other";
  earlyChildhoodNonresidentChildrenUnder6?: string;
  operatedAtPublicExpense?: boolean | null;
  receivesFeePaymentOrGrant?: boolean | null;
  schoolEligible: boolean | null; hoursWorked: string;
}
export interface EducatorExpenseData {
  sourceId: string; datePaid: string; description: string;
  category: "" | "classroom" | "professional_development" | "protective_supplies" | "other";
  amount: string; ordinaryAndNecessary: boolean | null; qualifyingUse: boolean | null;
  instructionalActivity?: boolean | null;
  itemizedReimbursements?: string; itemizedTaxFreeFunding?: string;
  healthOrPhysicalEducation: boolean | null; athleticSupplies: boolean | null; deductedElsewhere: boolean | null;
}
export interface EducatorSourceData {
  accountHolder: "" | "primary" | "spouse"; taxYear: string; schoolYear: string;
  sourceFactsConfirmed: boolean | null; schools: EducatorSchoolData[]; expenses: EducatorExpenseData[];
  savingsBondReductionMethod?: "" | "return_sources";
  reimbursementsNotInWages: string; excludedSavingsBondInterest: string;
  nontaxableQualifiedTuitionProgramAmount: string; nontaxableCoverdellEarnings: string;
}
export const emptyEducatorSchool: EducatorSchoolData = { name: "", role: "", level: "", schoolEligible: null, hoursWorked: "", earlyChildhoodNonresidentChildrenUnder6: "", operatedAtPublicExpense: null, receivesFeePaymentOrGrant: null };
export const emptyEducatorExpense: EducatorExpenseData = { sourceId: "", datePaid: "", description: "", category: "", amount: "", ordinaryAndNecessary: null, qualifyingUse: null, healthOrPhysicalEducation: null, athleticSupplies: null, deductedElsewhere: null, instructionalActivity: null, itemizedReimbursements: "", itemizedTaxFreeFunding: "" };
export const emptyEducatorSource: EducatorSourceData = { accountHolder: "", taxYear: "", schoolYear: "", sourceFactsConfirmed: null, schools: [], expenses: [], reimbursementsNotInWages: "", excludedSavingsBondInterest: "", nontaxableQualifiedTuitionProgramAmount: "", nontaxableCoverdellEarnings: "" };

export function buildEducatorSources(sources: EducatorSourceData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, legacyAmount?: string) {
  if (hasEnteredAmount(legacyAmount)) {
    const error = amountError(legacyAmount, "saved educator net expenses");
    if (error) throw new Error(error);
  }
  if (!sources?.length) {
    if (hasEnteredAmount(legacyAmount) && parseGuidedCurrency(legacyAmount).gt(0)) throw new Error("Enter actual educator sources; a saved aggregate does not establish the owner or qualification.");
    return undefined;
  }
  const money = (value: string | undefined, label: string) => {
    const error = amountError(value, label);
    if (error) throw new Error(error);
    return parseGuidedCurrency(value).toString();
  };
  const childCount = (value: string | undefined) => {
    if (!value?.trim()) return undefined;
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) throw new Error("Enter the actual nonnegative whole number of nonresident children under six.");
    return Number(value);
  };
  const actual = sources.map(source => ({
    accountHolder: source.accountHolder || undefined,
    taxYear: /^\d{4}$/.test(source.taxYear) ? Number(source.taxYear) : undefined,
    schoolYear: source.schoolYear, sourceFactsConfirmed: source.sourceFactsConfirmed ?? undefined,
    schools: source.schools?.map(school => ({ name: school.name, role: school.role || undefined, level: school.level || undefined, schoolEligible: school.schoolEligible ?? undefined, hoursWorked: money(school.hoursWorked, "actual school-year hours"),
      earlyChildhoodNonresidentChildrenUnder6: childCount(school.earlyChildhoodNonresidentChildrenUnder6), operatedAtPublicExpense: school.operatedAtPublicExpense ?? undefined, receivesFeePaymentOrGrant: school.receivesFeePaymentOrGrant ?? undefined })),
    expenses: source.expenses?.map(expense => ({ ...expense, category: expense.category || undefined, amount: money(expense.amount, "actual educator cost"), ordinaryAndNecessary: expense.ordinaryAndNecessary ?? undefined, qualifyingUse: expense.qualifyingUse ?? undefined, healthOrPhysicalEducation: expense.healthOrPhysicalEducation ?? undefined, athleticSupplies: expense.athleticSupplies ?? undefined, deductedElsewhere: expense.deductedElsewhere ?? undefined,
      instructionalActivity: expense.instructionalActivity ?? undefined,
      itemizedReimbursements: hasEnteredAmount(expense.itemizedReimbursements) ? money(expense.itemizedReimbursements, "receipt reimbursements") : undefined,
      itemizedTaxFreeFunding: hasEnteredAmount(expense.itemizedTaxFreeFunding) ? money(expense.itemizedTaxFreeFunding, "receipt tax-free funding") : undefined })),
    savingsBondReductionMethod: source.savingsBondReductionMethod || undefined,
    ...Object.fromEntries(educatorReductionFields.map(field => [field,
      field === "excludedSavingsBondInterest" && source.savingsBondReductionMethod === "return_sources" && !hasEnteredAmount(source[field])
        ? undefined : money(source[field], field)])),
  }));
  const adjustments = AdjustmentsSchema.parse({ educatorExpenseSources: actual, educatorExpenses: hasEnteredAmount(legacyAmount) ? money(legacyAmount, "saved educator net expenses") : undefined });
  const year = taxYear ?? actual[0]?.taxYear;
  if (year !== 2025 && year !== 2026) throw new Error("Select and confirm the actual educator tax year.");
  const result = calculateEducatorExpensesDeduction(adjustments, filingStatus === "mfj" ? "married_filing_jointly" : "single", year,
    sources.some(source => source.savingsBondReductionMethod === "return_sources") ? { purpose: "form8815_magi" } : undefined);
  if (year >= 2026 && !result.itemizedCalculationComplete) throw new Error("Complete the actual itemized educator facts, including instructional use and receipt funding; unknown is not zero.");
  return adjustments.educatorExpenseSources;
}

/** Reconcile the selected source method with actual return records, never an entered exclusion. */
export function educatorBondFactErrors(state: GuidedFlowState): Record<string, string> {
  const data = state.sectionData.adjustments;
  if (!data?.educatorExpenseSources?.some(source => source.savingsBondReductionMethod === "return_sources")) return {};
  try {
    const educatorExpenseSources = buildEducatorSources(data.educatorExpenseSources, state.segmentation.filingStatus, state.taxYear, data.educatorExpenses);
    const adjustments = AdjustmentsSchema.parse({ educatorExpenseSources });
    const bonds = buildSavingsBondInputs(state.sectionData.credits?.savingsBondEducation, state.taxYear,
      state.segmentation.filingStatus, state.sectionData["income-investments"]?.interestEntries, state.sectionData["personal-info"]);
    const context = calculateEducatorBondSources({ adjustments, ...bonds });
    const year = state.taxYear;
    if (year !== 2025 && year !== 2026) throw new Error("Select the actual educator tax year.");
    calculateEducatorExpensesDeduction(adjustments, state.segmentation.filingStatus === "mfj" ? "married_filing_jointly" : "single", year, context);
    return {};
  } catch (error) {
    return { educatorBondSources: error instanceof Error ? error.message : "Complete the actual educator and bond sources." };
  }
}

export function educatorFactErrors(data: AdjustmentData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, required = false): Record<string, string> {
  if (required && !data?.educatorExpenseSources?.length) return { educatorSources: "Enter the actual educator sources for the expenses selected in your interview." };
  if (!data) return {};
  try { buildEducatorSources(data.educatorExpenseSources, filingStatus, taxYear, data.educatorExpenses); return {}; }
  catch (error) { return { educatorSources: error instanceof Error ? error.message : "Check the actual educator source facts." }; }
}
