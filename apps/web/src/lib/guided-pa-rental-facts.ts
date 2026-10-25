import { amountError } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

export const paRentalAmountFields = [
  ["grossRents", "PA gross rents"], ["advertising", "PA advertising"], ["autoTravel", "PA auto and travel"],
  ["cleaning", "PA cleaning and maintenance"], ["commissions", "PA commissions"], ["insurance", "PA insurance"],
  ["legalProfessional", "PA legal and professional fees"], ["managementFees", "PA management fees"],
  ["mortgageInterest", "PA mortgage interest"], ["otherInterest", "PA other interest"], ["repairs", "PA repairs"],
  ["supplies", "PA supplies"], ["taxes", "PA taxes"], ["utilities", "PA utilities"],
  ["depreciation", "PA depreciation"], ["otherExpenses", "PA other expenses"],
] as const;
export const paRentalWorksheetQuestions = [
  ["amountsBeforeOwnershipAllocation", "Are these PA amounts before ownership allocation?"],
  ["expensesAreRentalUseOnly", "Do these expenses exclude all personal-use costs?"],
  ["paRulesApplied", "Were the PA deduction rules applied to these source amounts?"],
] as const;
export type PARentalIncomeExpensesData = Partial<Record<typeof paRentalAmountFields[number][0], string>> &
  Partial<Record<typeof paRentalWorksheetQuestions[number][0], boolean | null>> & {
    taxYear?: string;
    sourceReference?: string;
    factsConfirmed?: boolean | null;
    depreciationSourceReference?: string;
    allocationSourceReference?: string;
    otherExpenseDescription?: string;
  };

export function paRentalWorksheetErrors(source: PARentalIncomeExpensesData | undefined, taxYear?: number | null, personalUseDays?: string): Record<string, string> {
  if (!source) return { "pa-worksheet": "Enter the actual PA income and expense worksheet; federal amounts do not establish PA deductions." };
  const errors: Record<string, string> = {};
  if (!/^\d{4}$/.test(source.taxYear ?? "") || (taxYear != null && Number(source.taxYear) !== taxYear)) errors["pa-worksheet-year"] = "Enter the worksheet's actual tax year, matching this return.";
  if (!source.sourceReference?.trim()) errors["pa-worksheet-reference"] = "Identify the actual PA income and expense source records.";
  if (source.factsConfirmed !== true) errors["pa-worksheet-confirmation"] = "Review the actual PA worksheet after the latest edits.";
  for (const [field] of paRentalWorksheetQuestions) if (source[field] !== true) errors[`pa-worksheet-${field}`] = "PA sources must use rental-use expenses before ownership allocation under PA rules.";
  for (const [field, label] of paRentalAmountFields) {
    const error = amountError(source[field], label);
    if (error) errors[`pa-worksheet-${field}`] = error;
  }
  if (!errors["pa-worksheet-depreciation"] && parseGuidedCurrency(source.depreciation).gt(0) && !source.depreciationSourceReference?.trim()) errors["pa-worksheet-depreciation-source"] = "Identify the PA depreciation worksheet with the actual PA basis and method.";
  if (!errors["pa-worksheet-otherExpenses"] && parseGuidedCurrency(source.otherExpenses).gt(0) && !source.otherExpenseDescription?.trim()) errors["pa-worksheet-other-description"] = "Itemize the actual other PA expenses.";
  if (Number(personalUseDays) > 0 && !source.allocationSourceReference?.trim()) errors["pa-worksheet-allocation"] = "Identify the actual allocation excluding personal-use expenses.";
  return errors;
}
