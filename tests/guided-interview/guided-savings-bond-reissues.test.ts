/** Spec: spec/federal/guided-savings-bond-reissues.yaml. */
import { expect, it } from "vitest";
import { guidedSavingsBondReissueState } from "../fixtures/guided-savings-bond-reissues.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";

it("preserves actual reissue sources and current transfer through the guide", () => {
  const state = guidedSavingsBondReissueState(), original = JSON.stringify(state);
  expect(validateSection(state, "credits").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(JSON.parse(original));
  expect(input?.form8815?.reissueSources?.groups?.[0]).toMatchObject({ valueAtReissue: "700", taxpayerPurchaseFunds: "500", spousePurchaseFunds: "0", communityProperty: false });
  expect(input?.savingsBondRedemptions?.map(row => row.priorYearInterestReported)).toEqual([undefined, undefined]);
  if (!input) throw new Error("Actual complete guide is blocked");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.form8815?.excludableSavingsBondInterest, result.totalInterest, result.agi].map(value => value?.toFixed())).toEqual(["400", "100", "80100"]);
  expect(JSON.stringify(state)).toBe(original);
});
it("blocks unknown false and contradictory original records", () => {
  for (const mode of ["prior", "false", "statement", "owner", "link", "household"]) {
    const state = guidedSavingsBondReissueState(), packet = state.sectionData.credits?.savingsBondEducation?.reissueSources;
    const group = packet?.groups?.[0], statement = packet?.statements?.[0];
    if (!packet || !group || !statement) throw new Error("Missing fictional originals");
    if (mode === "prior") group.taxpayerPreviouslyReportedInterest = "";
    if (mode === "false") group.allPriorReportingCompleteConfirmed = false;
    if (mode === "statement") statement.box3 = "499";
    if (mode === "owner") statement.accountHolder = "spouse";
    if (mode === "link" && group.successors?.[1]) group.successors[1].redemptionSourceId = "bond-primary";
    if (mode === "household" && state.sectionData["personal-info"]) state.sectionData["personal-info"].lastName = "Changed";
    expect(validateSection(state, "credits").status).not.toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
});
it("revokes history statement and root confirmation after real source edits", () => {
  const state = guidedSavingsBondReissueState(), credits = structuredClone(state.sectionData.credits);
  if (!credits?.savingsBondEducation?.reissueSources?.groups?.[0]) throw new Error("Missing fictional sources");
  credits.savingsBondEducation.reissueSources.groups[0].valueAtReissue = "700.01";
  const changed = updateSectionData(state, "credits", credits), sources = changed.sectionData.credits?.savingsBondEducation;
  expect(sources?.sourceFactsConfirmed).toBeNull();
  expect(sources?.currentStatementReconciliationConfirmed).toBeNull();
  expect(sources?.reissueSources?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const income = structuredClone(state.sectionData["income-investments"]);
  if (!income?.interestEntries[0]) throw new Error("Missing fictional statement");
  income.interestEntries[0].usSavingsBondInterest = "501";
  const revised = updateSectionData(state, "income-investments", income);
  expect(revised.sectionData.credits?.savingsBondEducation?.reissueSources?.sourceFactsConfirmed).toBeNull();
});
