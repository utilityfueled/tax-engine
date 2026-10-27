/** Spec: spec/federal/educator-bond-rational-magi.yaml guided-originals. */
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { guidedEducatorBondState } from "../fixtures/guided-educator-bond.js";

it("preserves actual ownership through saved guide sources without a recurring amount override", () => {
  const state = guidedEducatorBondState(), original = JSON.stringify(state);
  const input = buildTaxInputFromGuidedData(JSON.parse(original));
  expect(input).not.toBeNull(); if (!input) throw new Error("Actual source guide blocked");
  expect(input.adjustments?.educatorExpenseSources?.map(source => source.excludedSavingsBondInterest)).toEqual([undefined, undefined]);
  expect(input.adjustments?.educatorExpenseSources?.map(source => source.savingsBondReductionMethod)).toEqual(["return_sources", "return_sources"]);
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.adjustmentsToIncome.toFixed()).toBe("200"); expect(result.agi.toFixed()).toBe("79800");
  expect(JSON.stringify(state)).toBe(original);
  const missing = structuredClone(state); if (missing.sectionData.credits) delete missing.sectionData.credits.savingsBondEducation;
  expect(validateSection(missing, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  const legacy = structuredClone(state);
  for (const source of legacy.sectionData.adjustments?.educatorExpenseSources ?? []) delete source.savingsBondReductionMethod;
  expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
});

it("validates educator and later bond records in their actual collection order", () => {
  const state = guidedEducatorBondState(), original = structuredClone(state.sectionData.credits?.savingsBondEducation);
  if (!state.sectionData.credits || !original) throw new Error("Missing fictional actual bond sources");
  delete state.sectionData.credits.savingsBondEducation;
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(validateSection(state, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.credits.savingsBondEducation = { ...original, sourceFactsConfirmed: null };
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(validateSection(state, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const cost = state.sectionData.adjustments?.educatorExpenseSources?.[0]?.expenses[0];
  if (!cost) throw new Error("Missing fictional actual educator receipt");
  cost.amount = "";
  expect(validateSection(state, "adjustments").status).toBe("partial");
  cost.amount = "400";
  state.sectionData.credits.savingsBondEducation.sourceFactsConfirmed = true;
  expect(validateSection(state, "credits").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(state)));
  expect(input).not.toBeNull();
  if (!input) throw new Error("Actual source confirmations did not reach the return");
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed()).toBe("79800");
});

it("invalidates actual educator and bond sources after original edits and permits separate reconfirmation", () => {
  const state = guidedEducatorBondState(), credits = structuredClone(state.sectionData.credits);
  const bond = credits?.savingsBondEducation?.redemptions?.[0];
  if (!bond) throw new Error("Missing fictional original bond");
  bond.incomeOwnershipTaxpayerPurchaseFunds = "1001";
  // The actual bond panel clears its own confirmation on this source edit.
  if (credits?.savingsBondEducation) credits.savingsBondEducation.sourceFactsConfirmed = null;
  let changed = updateSectionData(state, "credits", credits);
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.map(source => source.sourceFactsConfirmed)).toEqual([null, null]);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.[0]?.expenses[0]?.amount).toBe("400");
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.[0]?.excludedSavingsBondInterest).toBe("");
  bond.incomeOwnershipSpousePurchaseFunds = "1999";
  changed = updateSectionData(changed, "credits", credits);
  const adjustments = structuredClone(changed.sectionData.adjustments);
  for (const source of adjustments?.educatorExpenseSources ?? []) source.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "adjustments", adjustments);
  expect(changed.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmedCredits = structuredClone(changed.sectionData.credits);
  if (!confirmedCredits?.savingsBondEducation) throw new Error("Missing retained bond originals");
  confirmedCredits.savingsBondEducation.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "credits", confirmedCredits);
  expect(buildTaxInputFromGuidedData(changed)).not.toBeNull();
});
