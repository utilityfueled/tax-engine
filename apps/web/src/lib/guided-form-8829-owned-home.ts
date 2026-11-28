import Decimal from "decimal.js";
import { ZodError } from "zod";
import { buildForm8829OwnedHomePropertyInput } from "@/pdf/mappings/2026/form-8829-owned-home-sources";
import type { GuidedFlowState } from "./guided-interview-flow";

export interface OwnedHomeOfficeDraft {
  sourceTaxYear: string;
  propertyReference: string;
  purchaseReference: string;
  purchaseDate: string;
  firstBusinessUseReference: string;
  firstBusinessUseDate: string;
  floorAreaReference: string;
  businessSquareFeet: string;
  totalSquareFeet: string;
  adjustedBasisReference: string;
  adjustedBasisDate: string;
  adjustedBasisTotal: string;
  adjustedBasisLand: string;
  fairMarketValueReference: string;
  fairMarketValueDate: string;
  fairMarketValueTotal: string;
  fairMarketValueLand: string;
  mortgageInterestReference: string;
  mortgageInterest: string;
  realEstateTaxesReference: string;
  realEstateTaxes: string;
  confirmed: boolean;
}

const groupedInteger = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
const wholeDollarAmount = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0{1,2})?$/;

function area(value: string): number {
  const original = (value ?? "").trim();
  const squareFeet = groupedInteger.test(original) ? Number(original.replaceAll(",", "")) : NaN;
  if (!Number.isSafeInteger(squareFeet) || squareFeet <= 0) {
    throw new Error("Enter the measured office and home area in whole square feet.");
  }
  return squareFeet;
}

function wholeDollars(value: string, label: string): string {
  const original = (value ?? "").trim();
  if (!wholeDollarAmount.test(original)) throw new Error(`Enter the original whole-dollar amount for ${label}, including known zero.`);
  return new Decimal(original.replaceAll(",", "")).toFixed();
}

export function buildGuidedOwnedHomeOffice(draft: OwnedHomeOfficeDraft | undefined, flow: GuidedFlowState | undefined) {
  if (!draft) return undefined;
  if (flow?.taxYear !== 2026 || draft.sourceTaxYear?.trim() !== "2026") {
    throw new Error("Confirm that the owned home-office originals match this 2026 return.");
  }
  if (flow.segmentation.stateCode) throw new Error("These owned home-office originals currently support the federal calculation only.");
  if (flow.sectionData.deductions?.method !== "standard") {
    throw new Error("Select the standard deduction in Deductions before using this owned home-office worksheet.");
  }
  if (draft.confirmed !== true) throw new Error("Reconcile the owned home-office originals and confirm the qualifying use, income and expenses.");

  const propertyReference = draft.propertyReference;
  const original = (reference: string) => ({ propertyReference, reference });
  const qualifiedExpense = (reference: string, amount: string, label: string) => ({
    ...original(reference), taxYear: 2026, amount: wholeDollars(amount, label),
    qualifiedPaidOrKnownZeroNotDeductedElsewhereConfirmed: true,
  });
  try {
    return { method: "actual" as const, form8829: buildForm8829OwnedHomePropertyInput({
      taxYear: 2026,
      propertyReference,
      purchase: { ...original(draft.purchaseReference), date: draft.purchaseDate?.trim() },
      firstBusinessUse: { ...original(draft.firstBusinessUseReference), date: draft.firstBusinessUseDate?.trim() },
      floorArea: { ...original(draft.floorAreaReference), businessSquareFeet: area(draft.businessSquareFeet), totalSquareFeet: area(draft.totalSquareFeet) },
      adjustedBasis: { ...original(draft.adjustedBasisReference), date: draft.adjustedBasisDate?.trim(),
        total: wholeDollars(draft.adjustedBasisTotal, "adjusted basis"), land: wholeDollars(draft.adjustedBasisLand, "land in adjusted basis") },
      fairMarketValue: { ...original(draft.fairMarketValueReference), date: draft.fairMarketValueDate?.trim(),
        total: wholeDollars(draft.fairMarketValueTotal, "fair market value"), land: wholeDollars(draft.fairMarketValueLand, "land in fair market value") },
      mortgageInterest: qualifiedExpense(draft.mortgageInterestReference, draft.mortgageInterest, "qualified mortgage interest"),
      realEstateTaxes: qualifiedExpense(draft.realEstateTaxesReference, draft.realEstateTaxes, "real estate taxes"),
      standardDeduction: { taxYear: 2026, reference: "Standard deduction election in this return", claimedConfirmed: true },
      ownedAndQualifyingExclusiveUseAllYearUnchangedConfirmed: true,
      continuouslyUsedForThisBusinessConfirmed: true,
      standard39YearGdsRecoveryConfirmed: true,
      noOtherDepreciationMethodsAllowancesOrImprovementsConfirmed: true,
      noOtherExpensesAdjustmentsOrCarryoversConfirmed: true,
    }) };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error("Enter the property and all record references, actual dates and supported whole-dollar amounts from the originals.", { cause: error });
    }
    throw error;
  }
}
