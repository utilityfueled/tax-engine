/** Spec: spec/federal/educator-bond-reissue-coordination.yaml. */
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { guidedEducatorBondReissueState } from "../fixtures/guided-educator-bond-reissues.js";

it("preserves actual successor history and optional exclusion through save and reload", () => {
  const state = guidedEducatorBondReissueState(), original = JSON.stringify(state);
  const input = buildTaxInputFromGuidedData(JSON.parse(original));
  expect(input).not.toBeNull(); if (!input) throw new Error("Actual source guide blocked");
  expect(input.adjustments?.educatorExpenseSources?.map(source => source.excludedSavingsBondInterest)).toEqual([undefined, undefined]);
  expect(input.savingsBondRedemptions?.map(source => source.priorYearInterestReported)).toEqual([undefined, undefined]);
  expect(input.form8815?.reissueSources?.groups?.[0]?.taxpayerPurchaseFunds).toBe("500");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.schedule1?.educatorExpenses, result.totalInterest, result.agi].map(value => value?.toFixed())).toEqual(["400", "100", "79700"]);
  expect(JSON.stringify(state)).toBe(original);
  const missing = structuredClone(state); if (missing.sectionData.credits?.savingsBondEducation) delete missing.sectionData.credits.savingsBondEducation.reissueSources;
  expect(validateSection(missing, "credits").status).toBe("partial"); expect(buildTaxInputFromGuidedData(missing)).toBeNull();
});

it("invalidates changed actual records without inferring missing household facts", () => {
  const state = guidedEducatorBondReissueState(), adjustments = structuredClone(state.sectionData.adjustments);
  const receipt = adjustments?.educatorExpenseSources?.[0]?.expenses[0]; if (!receipt) throw new Error("Missing actual receipt");
  receipt.amount = "401";
  for (const source of adjustments?.educatorExpenseSources ?? []) source.sourceFactsConfirmed = null;
  let changed = updateSectionData(state, "adjustments", adjustments);
  expect(changed.sectionData.credits?.savingsBondEducation?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.credits?.savingsBondEducation?.reissueSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.credits?.savingsBondEducation?.currentStatementReconciliationConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  for (const source of adjustments?.educatorExpenseSources ?? []) source.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "adjustments", adjustments);
  expect(validateSection(changed, "adjustments").status).toBe("complete");
  expect(validateSection(changed, "credits").status).toBe("partial");
  const credits = structuredClone(changed.sectionData.credits); if (!credits?.savingsBondEducation) throw new Error("Missing retained original history");
  if (!credits.savingsBondEducation.reissueSources) throw new Error("Missing actual reissue packet");
  credits.savingsBondEducation.reissueSources.sourceFactsConfirmed = true;
  credits.savingsBondEducation.currentStatementReconciliationConfirmed = true;
  credits.savingsBondEducation.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "credits", credits);
  // The actual statement reconciliation also invalidates its dependent educator
  // record. Reconfirm that record explicitly; never retain a stale true answer.
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.map(source => source.sourceFactsConfirmed)).toEqual([null, null]);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const finalAdjustments = structuredClone(changed.sectionData.adjustments);
  for (const source of finalAdjustments?.educatorExpenseSources ?? []) source.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "adjustments", finalAdjustments);
  expect(changed.sectionData.payments?.estimatedTaxFacts?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const payments = structuredClone(changed.sectionData.payments);
  if (!payments?.estimatedTaxFacts) throw new Error("Missing actual payment history");
  payments.estimatedTaxFacts.sourceFactsConfirmed = true;
  changed = updateSectionData(changed, "payments", payments);
  const input = buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(changed)));
  expect(input).not.toBeNull(); if (!input) throw new Error("Actual sources did not reconfirm");
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).agi.toFixed()).toBe("79699");
  for (const kind of ["birth", "identity", "history", "year"] as const) {
    const missing = structuredClone(changed), personal = missing.sectionData["personal-info"];
    if (!personal?.spouse) throw new Error("Missing fictional household");
    if (kind === "birth") personal.spouse.dateOfBirth = "";
    if (kind === "identity") personal.spouse.lastName = "Changed";
    if (kind === "year") missing.taxYear = 2026;
    if (kind === "history" && missing.sectionData.credits?.savingsBondEducation?.reissueSources) missing.sectionData.credits.savingsBondEducation.reissueSources.sourceFactsConfirmed = null;
    expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  }
});
