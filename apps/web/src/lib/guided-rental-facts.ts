import Decimal from "decimal.js";
import { calculateRentalUseAllocation2026 } from "@/engine/schedules/rental-use-allocation-2026.js";
import { RentalPropertySchema } from "@/models/inputs.js";
import { RentalUseAllocation2026Schema } from "@/models/rental-use-allocation-2026.js";
import { currentLocalCivilDate } from "@/utils/civil-date.js";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import type { FilingStatus, PersonalInfoData, RentalPropertyEntryData } from "./guided-interview-flow";
import { paRentalWorksheetErrors, type PARentalIncomeExpensesData } from "./guided-pa-rental-facts";
import { rentalCarrySourceErrors, type RentalCarryoverData } from "./guided-rental-carry-sources";
import { buildGuidedRentalUseAllocation, rentalDecimalText, type RentalUseAllocationDraft } from "./guided-rental-use-allocation";

export const paRentalBooleanFacts = [
  ["offeredToPublic", "Was this activity offered commercially to the public?"],
  ["regularAndContinuous", "Was the activity regular and continuous?"],
  ["availableDuringBusinessHours", "Was use limited to defined business hours?"],
  ["significantOperatingExpenses", "Did making the property available involve significant operating expenses?"],
  ["incidentalToRealEstateSales", "Was this leasing activity incidental to a real estate sales business?"],
  ["relatedPartyRental", "Was the property rented to a related party or your own business?"],
  ["dealerPropertyHeldForSale", "Was this a dealer property held for sale to customers?"],
] as const;
export type PARentalClassificationData = Partial<Record<typeof paRentalBooleanFacts[number][0], boolean | null>> & {
  sourceReference?: string;
  factsConfirmed?: boolean | null;
  averageCustomerUseDays?: string;
};

export interface RentalSourceData {
  priorLossSources?: RentalCarryoverData;
  paIncomeExpenses?: PARentalIncomeExpensesData;
  paClassification?: PARentalClassificationData;
  accountHolder?: "primary" | "spouse" | "joint" | "";
  ownershipPercentage?: string;
  minimumOwnershipPercentage?: string;
  personalUseDays?: string;
  rentalDays?: string;
  rentalUseAllocationSources?: RentalUseAllocationDraft;
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

function guidedRentalUseAllocationError(entry: RentalPropertyEntryData): string | undefined {
  const source = RentalUseAllocation2026Schema.safeParse(buildGuidedRentalUseAllocation(entry.rentalUseAllocationSources));
  if (!source.success && source.error.issues.some(issue => issue.path[0] === "residenceWorksheet")) {
    return "Complete the original same-dwelling 2025 carryover records and enter the actual 2026 casualty and theft loss.";
  }
  if (!source.success) return "Complete the original 2026 calendar, rent, expense and fully recovered asset records.";
  if (entry.sourceFactsConfirmed !== true) return undefined;
  const property = RentalPropertySchema.safeParse({
    ...entry,
    ownershipPercentage: rentalDecimalText(entry.ownershipPercentage),
    personalUseDays: Number(entry.personalUseDays), rentalDays: Number(entry.rentalDays),
    rents: rentalDecimalText(entry.rents), ...Object.fromEntries(rentalExpenseFields.map(([field]) => [field, rentalDecimalText(entry[field])])),
    qbiW2Wages: rentalDecimalText(entry.qbiW2Wages), qbiUBIA: rentalDecimalText(entry.qbiUBIA),
    rentalUseAllocationSources: source.data,
  });
  if (!property.success) return "Confirm the dwelling and its original annual day and expense amounts.";
  try {
    calculateRentalUseAllocation2026(property.data, currentLocalCivilDate());
  } catch (error) {
    return error instanceof Error ? error.message : "Reconcile the actual dwelling records.";
  }
}

export function isStartedRental(entry: RentalPropertyEntryData): boolean {
  const entered = (value: unknown) => typeof value === "boolean" || (typeof value === "string" && value.trim() !== "");
  return Object.values(entry).some(entered) || !!entry.priorLossSources || !!entry.rentalUseAllocationSources
    || [entry.paClassification, entry.paIncomeExpenses].some(source => source && Object.values(source).some(entered));
}

export function rentalFactErrors(entries: RentalPropertyEntryData[] | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, stateCode?: string | null, personal?: PersonalInfoData): Record<string, string> {
  const errors: Record<string, string> = rentalCarrySourceErrors(entries, taxYear, filingStatus, personal);
  const names = new Set<string>();
  const startedEntries = (entries ?? []).filter(isStartedRental).length;
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
    if (entry.rentalUseAllocationSources || (!errors[`${key}-personalUseDays`] && Number(entry.personalUseDays) > 0)) {
      const issue = taxYear === 2026 && startedEntries === 1
        ? guidedRentalUseAllocationError(entry)
        : "Personal use without the supported 2026 same-dwelling source method requires separate section 280A worksheets.";
      if (issue) errors[`${key}-personal-allocation`] = issue;
    }
    for (const [field, label] of [["rents", "Actual gross rents"], ...rentalExpenseFields, ["priorYearUnallowedLoss", "Prior-year unallowed losses"], ["priorYearUnallowedCredits", "Prior-year unallowed credits"]] as const) {
      const error = amountError(entry[field], label); if (error) errors[`${key}-${field}`] = error;
    }
    for (const field of ["heldForRental", "amountsAreWholeProperty", "isActiveParticipant", "allInvestmentAtRisk", "realEstateProfessional", "substantialServices", "selfRental", "additionalWorksheetRequired", "qualifiesForQBI"] as const) if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = "Answer this qualification from the actual records.";
    if (entry.heldForRental === false) errors[`${key}-heldForRental`] = "A property not held for rental profit needs its separate reporting and deduction rules.";
    if (entry.amountsAreWholeProperty !== true) errors[`${key}-amount-basis`] = "Enter the full-property amounts before ownership allocation; an already allocated amount would be counted twice.";
    if (entry.sourceFactsConfirmed !== true) errors[`${key}-confirmation`] = "Review the actual property classification, ownership, income and expenses after the latest edits.";
    if (stateCode?.toUpperCase() === "PA") {
      for (const [field, error] of Object.entries(paRentalWorksheetErrors(entry.paIncomeExpenses, taxYear, entry.personalUseDays))) errors[`${key}-${field}`] = error;
      const pa = entry.paClassification;
      if (!pa) errors[`${key}-pa-classification`] = "Complete the actual PA rental activity classification; annual rented days do not identify customer-use periods.";
      else {
        if (!pa.sourceReference?.trim()) errors[`${key}-pa-source`] = "Identify the actual activity records or classification worksheet.";
        if (pa.factsConfirmed !== true) errors[`${key}-pa-confirmation`] = "Check the PA activity facts after the latest edits.";
        const averageError = amountError(pa.averageCustomerUseDays, "actual average customer-use days");
        if (averageError || (Number(entry.rentalDays) > 0 && parseGuidedCurrency(pa.averageCustomerUseDays).isZero())) errors[`${key}-pa-average`] = "Enter the actual average customer-use period; use zero only when there was no customer use.";
        for (const [field] of paRentalBooleanFacts) if (typeof pa[field] !== "boolean") errors[`${key}-pa-${field}`] = "Answer the PA activity question from the actual records.";
      }
    }
    for (const field of ["realEstateProfessional", "substantialServices", "selfRental", "additionalWorksheetRequired"] as const) if (entry[field] === true) errors[`${key}-${field}`] = "These facts need additional rental classification or limitation worksheets before calculation.";
    if (!errors[`${key}-priorYearUnallowedCredits`] && parseGuidedCurrency(entry.priorYearUnallowedCredits).gt(0)) errors[`${key}-priorYearUnallowedCredits`] = "Prior-year credits need their separate actual activity carryforward worksheet method.";
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
