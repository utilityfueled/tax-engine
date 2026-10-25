import Decimal from "decimal.js";
import type { FilingStatus, NecEntryData, SelfEmploymentSectionData, StateReturnData, W2EntryData } from "./guided-interview-flow";
import { parseGuidedCurrency, sumGuidedDisplayAmounts } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";

export interface BusinessSourceData {
  accountHolder?: "primary" | "spouse" | "joint" | "";
  activityDescription?: string;
  businessName?: string;
  businessCode?: string;
  ein?: string;
  accountingMethod?: "cash" | "accrual" | "";
  singleBusinessConfirmed?: boolean | null;
  incomeReconciled?: boolean | null;
  expensesReconciled?: boolean | null;
  returnsAndAllowances?: string;
  costOfGoodsSold?: string;
  otherIncome?: string;
  contractLabor?: string;
  depreciation?: string;
  legalAndProfessional?: string;
  w2WagesPaid?: string;
  ubiaQualifiedProperty?: string;
  isSST?: boolean | null;
  allInvestmentAtRisk?: boolean | null;
  priorYearUnallowedLoss?: string;
  additionalWorksheetRequired?: boolean | null;
  otherExpenseDescription?: string;
  mealsEligibilityConfirmed?: boolean | null;
  carExpenseWorksheetConfirmed?: boolean | null;
  depreciationWorksheetConfirmed?: boolean | null;
}

export const businessSourceAmounts = [
  ["returnsAndAllowances", "Returns and allowances"], ["costOfGoodsSold", "Actual cost of goods sold from your inventory worksheet"], ["otherIncome", "Schedule C line 6 other income"],
  ["contractLabor", "Contract labor"], ["depreciation", "Depreciation and section 179 from the actual worksheet"], ["legalAndProfessional", "Legal and professional services"],
  ["w2WagesPaid", "Qualified W-2 wages paid for the QBI limit"], ["ubiaQualifiedProperty", "Qualified property UBIA for the QBI limit"], ["priorYearUnallowedLoss", "Prior-year unallowed business losses"],
] as const;
const expenseCategories = ["advertising", "carAndTruck", "insurance", "officeExpense", "supplies", "travel", "meals", "utilities", "otherExpenses"] as const;

/** A display or ledger total is unknown while any contributing source is missing. */
export function sumKnownBusinessAmounts(values: Array<string | undefined>): Decimal | null {
  if (!values.every(hasEnteredAmount)) return null;
  const total = sumGuidedDisplayAmounts(values);
  return total.isFinite() ? total : null;
}

export function isStartedNec(entry: NecEntryData): boolean {
  return Object.values(entry).some(value => typeof value === "string" && value.trim() !== "");
}

export function hasBusinessSourceData(data: SelfEmploymentSectionData | undefined): boolean {
  return !!data && (data.necEntries.some(isStartedNec) || hasEnteredAmount(data.manualGrossReceipts) || Object.values(data.expenses).some(hasEnteredAmount) || Object.values(data.businessFacts ?? {}).some(value => value !== undefined && value !== null && value !== ""));
}

export function businessFactErrors(data: SelfEmploymentSectionData | undefined, filingStatus?: FilingStatus | null, _w2s: W2EntryData[] = [], stateData?: StateReturnData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!hasBusinessSourceData(data) || !data) return errors;
  const facts = data.businessFacts ?? {};
  if (!["primary", "spouse"].includes(facts.accountHolder ?? "") || (facts.accountHolder === "spouse" && filingStatus !== "mfj")) errors.businessOwner = "Identify the actual owner. Joint ownership requires separate business and self-employment calculations.";
  if (!facts.activityDescription?.trim()) errors.businessActivity = "Describe the actual business activity.";
  if (!/^\d{6}$/.test(facts.businessCode ?? "")) errors.businessCode = "Enter the actual six-digit principal business activity code.";
  if (facts.ein?.trim() && !/^\d{2}-?\d{7}$/.test(facts.ein.trim())) errors.businessEin = "Enter the business EIN, or leave blank if no EIN was issued.";
  if (!["cash", "accrual"].includes(facts.accountingMethod ?? "")) errors.accountingMethod = "Confirm the actual accounting method; another method requires additional support.";
  for (const field of ["singleBusinessConfirmed", "incomeReconciled", "expensesReconciled"] as const) if (facts[field] !== true) errors[field] = field === "singleBusinessConfirmed" ? "This interview supports one actual business activity; separate activities cannot be combined." : "Review and reconcile the actual source amounts before calculating.";
  for (const [field, label] of businessSourceAmounts) { const error = amountError(facts[field], label); if (error) errors[field] = error; }
  const manualError = amountError(data.manualGrossReceipts, "gross receipts not already included on Forms 1099-NEC"); if (manualError) errors.manualGrossReceipts = manualError;
  if (hasEnteredAmount(data.expenses.employeeBenefitPrograms)) { const error = amountError(data.expenses.employeeBenefitPrograms, "actual employee-benefit program expense"); if (error) errors.employeeBenefitPrograms = error; }
  for (const field of expenseCategories) { const error = amountError(data.expenses[field], `${field} business expenses`); if (error) errors[`expense-${field}`] = error; }
  for (const field of ["isSST", "allInvestmentAtRisk", "additionalWorksheetRequired"] as const) if (typeof facts[field] !== "boolean") errors[field] = "Answer this business qualification from the actual facts.";
  if (typeof data.qbiMateriallyParticipated !== "boolean") errors.materialParticipation = "Confirm actual material participation under the section 469 rules.";
  if (facts.additionalWorksheetRequired === true || (!errors.priorYearUnallowedLoss && parseGuidedCurrency(facts.priorYearUnallowedLoss).gt(0))) errors.additionalWorksheets = "Prior-loss or other additional business worksheets require separate support before this guided calculation can proceed.";
  if (!errors["expense-otherExpenses"] && parseGuidedCurrency(data.expenses.otherExpenses).gt(0) && !facts.otherExpenseDescription?.trim()) errors.otherExpenseDescription = "Identify the actual other deductible expenses; do not combine unrelated or personal amounts.";
  for (const [amount, field, label] of [[data.expenses.meals, "mealsEligibilityConfirmed", "eligible business meals subject to the 50% limit"], [data.expenses.carAndTruck, "carExpenseWorksheetConfirmed", "actual deductible vehicle worksheet amount"], [facts.depreciation, "depreciationWorksheetConfirmed", "actual depreciation and section 179 worksheet amount"]] as const) {
    if (hasEnteredAmount(amount) && !amountError(amount, label) && parseGuidedCurrency(amount).gt(0) && facts[field] !== true) errors[field] = `Confirm the ${label}. Other exceptions need their supporting worksheets.`;
  }
  data.necEntries.forEach((entry, index) => {
    if (!isStartedNec(entry)) return;
    const prefix = `nec-${index}`;
    if (!entry.payerName.trim()) errors[`${prefix}-payer`] = "Enter the actual payer name.";
    for (const field of ["nonemployeeCompensation", "federalWithheld"] as const) { const error = amountError(entry[field], field); if (error) errors[`${prefix}-${field}`] = error; }
    if (!["primary", "spouse"].includes(entry.accountHolder ?? "") || entry.accountHolder !== facts.accountHolder) errors[`${prefix}-owner`] = "The actual NEC recipient must match this business owner; separate owners cannot be combined.";
    if (entry.stateTaxReporting === "single") {
      if (!/^[A-Z]{2}$/.test(entry.state?.trim().toUpperCase() ?? "")) errors[`${prefix}-state`] = "Enter the actual source state.";
      for (const field of ["stateIncome", "stateWithheld"] as const) { const error = amountError(entry[field], field); if (error) errors[`${prefix}-${field}`] = error; }
    } else if (entry.stateTaxReporting === "none") {
      if (entry.state?.trim() || [entry.stateIncome, entry.stateWithheld].some(value => hasEnteredAmount(value) && (amountError(value, "state amount") || !parseGuidedCurrency(value).isZero()))) errors[`${prefix}-state`] = "Reconcile the saved state amounts with the answer that no state section is reported.";
    } else errors[`${prefix}-state`] = "Confirm actual state reporting; multiple states need separate source allocation.";
    if (stateData?.additionalStateWithholdingEntries?.some(extra => extra.documentType === "1099-NEC" && extra.state === entry.state?.trim().toUpperCase() && extra.payer.trim().toLowerCase() === entry.payerName.trim().toLowerCase())) errors[`${prefix}-duplicate-withholding`] = "This NEC withholding is also recorded as additional state withholding. Reconcile the duplicate.";
  });
  const receipts = [data.manualGrossReceipts, ...data.necEntries.filter(isStartedNec).map(entry => entry.nonemployeeCompensation)];
  const businessIncome = [...receipts, facts.otherIncome];
  const incomeReductions = [facts.returnsAndAllowances, facts.costOfGoodsSold];
  const expenseAmounts = [...expenseCategories.filter(field => field !== "meals").map(field => data.expenses[field]), facts.contractLabor, facts.depreciation, facts.legalAndProfessional];
  if ([...businessIncome, ...incomeReductions, ...expenseAmounts, data.expenses.meals].every(value => !amountError(value, "business amount"))) {
    const total = (values: Array<string | undefined>) => values.reduce((sum, value) => sum.plus(parseGuidedCurrency(value)), new Decimal(0));
    const tentative = total(businessIncome).minus(total(incomeReductions)).minus(total(expenseAmounts)).minus(parseGuidedCurrency(data.expenses.meals).times("0.5").toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
    if (tentative.isNegative() && (data.qbiMateriallyParticipated === false || facts.allInvestmentAtRisk === false)) errors.lossLimitation = "This loss needs the actual passive activity or at-risk worksheet; the guided calculation cannot treat it as fully deductible.";
  }

  return errors;
}
