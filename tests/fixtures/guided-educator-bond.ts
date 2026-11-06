/** Fictional source-only interview; no calculated exclusion or deduction stored. */
import { guidedSavingsBondReissueState } from "./guided-savings-bond-reissues.js";
import { educatorBondThirdsInput } from "./educator-bond-rational-magi.js";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { emptyEducatorSource, type EducatorSourceData } from "@/lib/guided-educator-facts";
import type { SavingsBondEducationData } from "@/lib/guided-savings-bond-facts";

export function guidedEducatorBondState() {
  const state = guidedSavingsBondReissueState(), input = educatorBondThirdsInput();
  const credits = state.sectionData.credits, interest = state.sectionData["income-investments"]?.interestEntries[0];
  if (!credits || !input.form8815 || !interest) throw new Error("Missing fictional source fixtures");
  state.segmentation.lifeEvents = ["educator-expenses"];
  interest.usSavingsBondInterest = "1000";
  const records = (value: unknown): unknown => {
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(records);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, records(item)]));
    return value;
  };
  credits.savingsBondEducation = records({ ...input.form8815, taxYear: 2025,
    redemptions: input.savingsBondRedemptions?.map(({ incomeOwnership, ...source }) => ({ ...source,
      ...Object.fromEntries(Object.entries(incomeOwnership ?? {}).map(([key, value]) => [key === "ownershipUnchangedSinceIssueConfirmed" ? "incomeOwnershipUnchangedSinceIssueConfirmed" : `incomeOwnership${key[0]?.toUpperCase()}${key.slice(1)}`, value])),
    })),
  }) as SavingsBondEducationData;
  state.sectionData.adjustments = { ...emptyAdjustmentData, educatorExpenseSources: input.adjustments?.educatorExpenseSources?.map(source => ({
    ...emptyEducatorSource, ...records(source) as EducatorSourceData, excludedSavingsBondInterest: "",
  })) };
  return state;
}
