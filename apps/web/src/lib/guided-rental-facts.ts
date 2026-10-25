import Decimal from "decimal.js";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import type { FilingStatus, RentalPropertyEntryData } from "./guided-interview-flow";

export interface RentalSourceData {
  accountHolder?: "primary" | "spouse" | "joint" | "";
  ownershipPercentage?: string;
  minimumOwnershipPercentage?: string;
  personalUseDays?: string;
  rentalDays?: string;
  sourceFactsConfirmed?: boolean | null;
  heldForRental?: boolean | null;
  amountsAreWholeProperty?: boolean | null;
  isActiveParticipant?: boolean | null;
  allInvestmentAtRisk?: boolean | null;
  realEstateProfessional?: boolean | null;
  substantialServices?: boolean | null;
  selfRental?: boolean | null;
  additionalWorksheetRequired?: boolean | null;
  priorYearUnallowedLoss?: string;
  priorYearUnallowedCredits?: string;
  qualifiesForQBI?: boolean | null;
  qbiW2Wages?: string;
  qbiUBIA?: string;
  qbiIsSST?: boolean | null;
  advertising?: string;
  autoTravel?: string;
  cleaning?: string;
  commissions?: string;
  legalProfessional?: string;
  managementFees?: string;
  otherInterest?: string;
  supplies?: string;
  depreciationWorksheetConfirmed?: boolean | null;
  autoTravelWorksheetConfirmed?: boolean | null;
  otherExpenseDescription?: string;
}

export const rentalExpenseFields = [
  ["advertising", "Advertising"], ["autoTravel", "Auto and travel"], ["cleaning", "Cleaning and maintenance"], ["commissions", "Commissions"],
  ["insurance", "Insurance"], ["legalProfessional", "Legal and professional fees"], ["managementFees", "Management fees"], ["mortgageInterest", "Mortgage interest"],
  ["otherInterest", "Other interest"], ["repairs", "Repairs"], ["supplies", "Supplies"], ["taxes", "Property taxes"], ["utilities", "Utilities"],
  ["depreciation", "Depreciation from the actual worksheet"], ["otherExpenses", "Other deductible expenses"],
] as const;
const types = ["single_family", "multi_family", "vacation", "commercial", "land", "other"];

export function isStartedRental(entry: RentalPropertyEntryData): boolean {
  return Object.values(entry).some(value => typeof value === "boolean" || (typeof value === "string" && value.trim() !== ""));
}

export function rentalFactErrors(entries: RentalPropertyEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const names = new Set<string>();
  const maxDays = taxYear && new Date(Date.UTC(taxYear, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  (entries ?? []).forEach((entry, index) => {
    if (!isStartedRental(entry)) return;
    const key = `rental-${index}`;
    const name = entry.description?.trim().toLowerCase();
    if (!name) errors[`${key}-address`] = "Enter the actual property address or legal land description.";
    else if (names.has(name)) errors[`${key}-duplicate`] = "Reconcile duplicate property records. Separate owner interests require distinct supported allocation records.";
    if (name) names.add(name);
    if (!types.includes(entry.propertyType)) errors[`${key}-type`] = "Select the actual property type; a saved default does not establish it.";
    if (!["primary", "spouse"].includes(entry.accountHolder ?? "") || (entry.accountHolder === "spouse" && filingStatus !== "mfj")) errors[`${key}-owner`] = "Identify the actual owner. Joint interests need separate supported allocations.";
    const ownershipError = amountError(entry.ownershipPercentage, "actual ownership percentage");
    if (ownershipError || parseGuidedCurrency(entry.ownershipPercentage).lte(0) || parseGuidedCurrency(entry.ownershipPercentage).gt(100)) errors[`${key}-ownership`] = "Enter the actual ownership percentage greater than 0 and no more than 100.";
    for (const field of ["personalUseDays", "rentalDays"] as const) if (!/^\d+$/.test(entry[field] ?? "") || Number(entry[field]) > maxDays) errors[`${key}-${field}`] = `Enter the actual whole number of days, from 0 to ${maxDays}.`;
    if (!errors[`${key}-personalUseDays`] && !errors[`${key}-rentalDays`] && Number(entry.personalUseDays) + Number(entry.rentalDays) > maxDays) errors[`${key}-days`] = "Rental and personal days cannot exceed the calendar year.";
    if (!errors[`${key}-personalUseDays`] && Number(entry.personalUseDays) > 0) errors[`${key}-personal-allocation`] = "Personal use requires the actual rental/personal allocation and section 280A worksheets, which this guided route does not yet support.";
    for (const [field, label] of [["rents", "Actual gross rents"], ...rentalExpenseFields, ["priorYearUnallowedLoss", "Prior-year unallowed losses"], ["priorYearUnallowedCredits", "Prior-year unallowed credits"]] as const) {
      const error = amountError(entry[field], label); if (error) errors[`${key}-${field}`] = error;
    }
    for (const field of ["heldForRental", "amountsAreWholeProperty", "isActiveParticipant", "allInvestmentAtRisk", "realEstateProfessional", "substantialServices", "selfRental", "additionalWorksheetRequired", "qualifiesForQBI"] as const) if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = "Answer this qualification from the actual records.";
    if (entry.heldForRental === false) errors[`${key}-heldForRental`] = "A property not held for rental profit needs its separate reporting and deduction rules.";
    if (entry.amountsAreWholeProperty !== true) errors[`${key}-amount-basis`] = "Enter the full-property amounts before ownership allocation; an already allocated amount would be counted twice.";
    if (entry.sourceFactsConfirmed !== true) errors[`${key}-confirmation`] = "Review the actual property classification, ownership, income and expenses after the latest edits.";
    for (const field of ["realEstateProfessional", "substantialServices", "selfRental", "additionalWorksheetRequired"] as const) if (entry[field] === true) errors[`${key}-${field}`] = "These facts need additional rental classification or limitation worksheets before calculation.";
    for (const field of ["priorYearUnallowedLoss", "priorYearUnallowedCredits"] as const) if (!errors[`${key}-${field}`] && parseGuidedCurrency(entry[field]).gt(0)) errors[`${key}-${field}`] = "Prior-year losses or credits need their actual activity carryforward worksheets.";
    if (entry.isActiveParticipant === true && (amountError(entry.minimumOwnershipPercentage, "minimum combined ownership") || parseGuidedCurrency(entry.minimumOwnershipPercentage).lt(10) || parseGuidedCurrency(entry.minimumOwnershipPercentage).gt(100))) errors[`${key}-active-interest`] = "Active participation requires at least 10% combined taxpayer/spouse ownership by value throughout the year.";
    for (const [amount, field, label] of [[entry.depreciation, "depreciationWorksheetConfirmed", "depreciation"], [entry.autoTravel, "autoTravelWorksheetConfirmed", "vehicle and travel"]] as const) if (!amountError(amount, label) && parseGuidedCurrency(amount).gt(0) && entry[field] !== true) errors[`${key}-${field}`] = `Confirm the actual deductible ${label} worksheet amount.`;
    if (!errors[`${key}-otherExpenses`] && parseGuidedCurrency(entry.otherExpenses).gt(0) && !entry.otherExpenseDescription?.trim()) errors[`${key}-expense-description`] = "Describe the actual other deductible expenses.";
    if (entry.qualifiesForQBI === true) {
      for (const field of ["qbiMateriallyParticipated", "qbiIsSST"] as const) if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = "Answer the actual section 199A qualification.";
      for (const field of ["qbiW2Wages", "qbiUBIA"] as const) { const error = amountError(entry[field], "actual owner's QBI worksheet amount"); if (error) errors[`${key}-${field}`] = error; }
    }
    if (!errors[`${key}-rents`] && rentalExpenseFields.every(([field]) => !errors[`${key}-${field}`])) {
      const expenses = rentalExpenseFields.reduce((sum, [field]) => sum.plus(parseGuidedCurrency(entry[field])), new Decimal(0));
      if (parseGuidedCurrency(entry.rents).lt(expenses) && entry.allInvestmentAtRisk === false) errors[`${key}-at-risk-loss`] = "This loss requires the actual Form 6198 at-risk worksheet before deduction.";
    }
  });
  return errors;
}

export function knownRentalExpenses(entry: RentalPropertyEntryData): Decimal | null {
  if (!rentalExpenseFields.every(([field]) => hasEnteredAmount(entry[field]) && !amountError(entry[field], "expense"))) return null;
  return rentalExpenseFields.reduce((sum, [field]) => sum.plus(parseGuidedCurrency(entry[field])), new Decimal(0));
}
