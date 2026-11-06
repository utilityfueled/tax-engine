/** Actual redeemed-interest ownership for IRC62(d)(2), never a final exclusion split. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { calculateSavingsBondIncomeOwnership } from "./savings-bond-income-ownership.js";
import { calculateSavingsBondReissueSources, type BondSourceRatio, type SavingsBondReissueInput } from "./savings-bond-reissue-sources.js";
import { sumSavingsBondRatios } from "@/utils/savings-bond-ratios.js";

export interface EducatorBondOwnershipInput {
  taxpayer?: SavingsBondReissueInput["taxpayer"];
  savingsBondRedemptions?: TaxYearInput["savingsBondRedemptions"];
  form8815?: TaxYearInput["form8815"];
}
export interface EducatorBondOwnershipRow {
  principal: Decimal;
  currentInterestRatio: BondSourceRatio;
  primaryInterestRatio: BondSourceRatio;
  spouseInterestRatio: BondSourceRatio;
  reissueOwner?: "primary" | "spouse";
}

export function calculateEducatorBondOwnership(input: EducatorBondOwnershipInput, selectedSourceIds?: ReadonlySet<string>): Map<string, EducatorBondOwnershipRow> {
  const originals = input.savingsBondRedemptions ?? [], seen = new Set<string>();
  for (const original of originals) {
    if (!original.sourceId?.trim() || seen.has(original.sourceId)) throw new Error("Educator reductions require each actual bond source exactly once.");
    seen.add(original.sourceId);
  }
  let reissues;
  if (input.form8815?.reissueSources || originals.some(row => row.reissueSourceId !== undefined)) {
    if (!input.taxpayer || input.form8815?.sourceFactsConfirmed !== true)
      throw new Error("Educator reissued-bond reductions require actual household identity and confirmed Form8815 sources.");
    reissues = calculateSavingsBondReissueSources({ taxpayer: input.taxpayer, redemptions: originals, sources: input.form8815.reissueSources });
  }
  const historical = new Map(reissues?.redemptions.map(row => [row.sourceId, row]));
  const result = new Map<string, EducatorBondOwnershipRow>();
  for (const original of originals) {
    const id = original.sourceId;
    if (!id || (selectedSourceIds && !selectedSourceIds.has(id))) continue;
    const successor = historical.get(id);
    if (original.reissueSourceId !== undefined) {
      if (!successor) throw new Error("Educator reissued-bond ownership requires the matching actual redeemed successor history.");
      const zero = { numerator: new Decimal(0), denominator: new Decimal(1) };
      // Transfer recognition and held successors never enter this redemption-only vector.
      result.set(id, { principal: successor.principal, currentInterestRatio: successor.redemptionInterest,
        primaryInterestRatio: successor.owner === "primary" ? successor.redemptionInterest : zero,
        spouseInterestRatio: successor.owner === "spouse" ? successor.redemptionInterest : zero,
        reissueOwner: successor.owner });
    } else {
      const unchanged = calculateSavingsBondIncomeOwnership(original);
      result.set(id, { principal: unchanged.principal,
        currentInterestRatio: sumSavingsBondRatios([unchanged.primaryInterestRatio, unchanged.spouseInterestRatio]),
        primaryInterestRatio: unchanged.primaryInterestRatio, spouseInterestRatio: unchanged.spouseInterestRatio });
    }
  }
  return result;
}
