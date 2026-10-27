import { savingsBondReissueReturnInput } from "./savings-bond-reissue-return.js";
import { startCompleteInterview, completeInterestSource, completeW2Entry } from "../guided-interview/complete-facts.js";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import type { SavingsBondEducationData } from "@/lib/guided-savings-bond-facts";

/** Explicit fictional originals. No calculated source amount or fabricated answer. */
export function guidedSavingsBondReissueState(current = true) {
  const input = savingsBondReissueReturnInput(current), facts = input.form8815;
  if (!facts || !input.taxpayer.spouse) throw new Error("Missing fictional bond sources");
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["w2", "investments"], lifeEvents: [], stateCode: null });
  const person = state.sectionData["personal-info"];
  if (!person?.spouse) throw new Error("Missing fictional household");
  Object.assign(person, input.taxpayer.primary);
  Object.assign(person.spouse, input.taxpayer.spouse);
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "80000", federalWithheld: "10000", socialSecurityWages: "80000", medicareWages: "80000", socialSecurityWithheld: "4960", medicareWithheld: "1160" }] };
  state.sectionData["income-investments"] = { interestEntries: input.form1099Int.map(form => ({ ...completeInterestSource,
    payer: form.payer, accountReference: form.accountReference, accountHolder: form.accountHolder,
    interestIncome: form.interestIncome, usSavingsBondInterest: form.usSavingsBondInterest })), dividendEntries: [], brokerageEntries: [] };
  const records = (values: unknown): unknown => {
    if (typeof values === "number") return String(values);
    if (Array.isArray(values)) return values.map(records);
    if (values && typeof values === "object") return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, records(value)]));
    return values;
  };
  const data = records({ ...facts, taxYear: "2025", redemptions: input.savingsBondRedemptions }) as SavingsBondEducationData;
  state.sectionData.credits = { ...emptyCreditsData, savingsBondEducation: data };
  return state;
}
