import type { z } from "zod";
import { Form8829Schema, type ScheduleCInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";

export interface RenterHomeOfficeDraft {
  sourceTaxYear: string;
  floorAreaReference: string;
  businessSquareFeet: string;
  totalSquareFeet: string;
  expenseReference: string;
  rent: string;
  utilities: string;
  eligibilityBasis: "principal-place" | "client-meetings" | "";
  confirmed: boolean;
}

const groupedInteger = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
const exactAmount = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

function squareFeet(value: string): number {
  const raw = value.trim();
  if (!groupedInteger.test(raw)) return 0;
  const feet = Number(raw.replaceAll(",", ""));
  return Number.isSafeInteger(feet) && feet > 0 ? feet : 0;
}

export function buildGuidedRenterHomeOffice(
  draft: RenterHomeOfficeDraft | undefined,
  returnYear?: number | null,
  selectedState?: string | null,
): z.infer<typeof ScheduleCInputSchema>["homeOffice"] {
  if (!draft) return undefined;
  if (returnYear !== 2026 || draft.sourceTaxYear.trim() !== "2026") {
    throw new Error("Confirm that the home-office originals match this 2026 return.");
  }
  if (selectedState) throw new Error("These home-office originals currently support the federal calculation only.");
  if (draft.eligibilityBasis !== "principal-place") {
    throw new Error("Confirm this home office is the principal place of business.");
  }
  const area = squareFeet(draft.businessSquareFeet);
  const total = squareFeet(draft.totalSquareFeet);
  if (!draft.floorAreaReference.trim() || !area || !total || area > total) {
    throw new Error("Enter the documented office and total-home measurements in whole square feet.");
  }
  const rent = draft.rent.trim();
  const utilities = draft.utilities.trim();
  if (!draft.expenseReference.trim() || !exactAmount.test(rent) || !exactAmount.test(utilities)) {
    throw new Error("Enter the original rent and utility amounts, including known zero.");
  }
  if (draft.confirmed !== true) throw new Error("Reconcile the home-office originals and confirm the qualifying use, income and expenses.");

  return {
    method: "actual",
    form8829: Form8829Schema.parse({
      areaUsedForBusiness: area,
      totalAreaOfHome: total,
      indirectExpenses: { rent: d(rent.replaceAll(",", "")).toFixed(), utilities: d(utilities.replaceAll(",", "")).toFixed() },
    }),
  };
}
