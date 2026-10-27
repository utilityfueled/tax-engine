/** Internal exact candidate; the completed Form8815 must independently confirm full exclusion. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { BondSourceRatio } from "./savings-bond-reissue-sources.js";
import { calculateSavingsBondIncomeOwnership } from "./savings-bond-income-ownership.js";
import { sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";

export interface EducatorBondSourceContext {
  purpose: "full_exclusion_sources";
  ownerInterest: Record<"primary" | "spouse", BondSourceRatio>;
}
export type EducatorBondCalculationContext = EducatorBondSourceContext | { purpose: "form8815_magi" };

export interface EducatorBondSourceInput {
  adjustments?: TaxYearInput["adjustments"];
  savingsBondRedemptions?: TaxYearInput["savingsBondRedemptions"];
  form8815?: TaxYearInput["form8815"];
}

export function calculateEducatorBondSources(input: EducatorBondSourceInput): EducatorBondSourceContext | undefined {
  if (!input.adjustments?.educatorExpenseSources?.some(source => source.savingsBondReductionMethod === "return_sources")) return undefined;
  if (!input.savingsBondRedemptions?.length || input.form8815?.sourceFactsConfirmed !== true)
    throw new Error("Derived educator reductions require complete actual bond and Form8815 sources.");
  if (input.form8815.reissueSources) throw new Error("Derived educator reductions require the separate changed-ownership exclusion method.");
  const seen = new Set<string>();
  const rows = input.savingsBondRedemptions.map(source => {
    if (!source.sourceId?.trim() || seen.has(source.sourceId)) throw new Error("Derived educator reductions require each actual bond source exactly once.");
    seen.add(source.sourceId);
    return calculateSavingsBondIncomeOwnership(source);
  });
  const zero = { numerator: new Decimal(0), denominator: new Decimal(1) };
  return { purpose: "full_exclusion_sources", ownerInterest: {
    primary: sumSavingsBondRatios([zero, ...rows.map(row => row.primaryInterestRatio)]),
    spouse: sumSavingsBondRatios([zero, ...rows.map(row => row.spouseInterestRatio)]),
  } };
}
