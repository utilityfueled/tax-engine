/** Internal exact candidate; the completed Form8815 must independently confirm full exclusion. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { BondSourceRatio } from "./savings-bond-reissue-sources.js";
import { calculateEducatorBondOwnership, type EducatorBondOwnershipInput } from "./educator-bond-ownership.js";
import { sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";

export interface EducatorBondSourceContext {
  purpose: "full_exclusion_sources";
  ownerInterest: Record<"primary" | "spouse", BondSourceRatio>;
}
export type EducatorBondCalculationContext = EducatorBondSourceContext | { purpose: "form8815_magi" };

export interface EducatorBondSourceInput extends EducatorBondOwnershipInput {
  adjustments?: TaxYearInput["adjustments"];
}

export function calculateEducatorBondSources(input: EducatorBondSourceInput): EducatorBondSourceContext | undefined {
  if (!input.adjustments?.educatorExpenseSources?.some(source => source.savingsBondReductionMethod === "return_sources")) return undefined;
  if (!input.savingsBondRedemptions?.length || input.form8815?.sourceFactsConfirmed !== true)
    throw new Error("Derived educator reductions require complete actual bond and Form8815 sources.");
  const rows = [...calculateEducatorBondOwnership(input).values()];
  const zero = { numerator: new Decimal(0), denominator: new Decimal(1) };
  return { purpose: "full_exclusion_sources", ownerInterest: {
    primary: sumSavingsBondRatios([zero, ...rows.map(row => row.primaryInterestRatio)]),
    spouse: sumSavingsBondRatios([zero, ...rows.map(row => row.spouseInterestRatio)]),
  } };
}
