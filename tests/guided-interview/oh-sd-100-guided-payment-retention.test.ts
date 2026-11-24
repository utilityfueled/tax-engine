/** Spec: spec/state/guided-state-payment-reconciliation.yaml. */
import { expect, it } from "vitest";
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { confirmGuidedOhioPaymentFacts } from "@/lib/guided-ohio-payment-facts";
import { confirmGuidedOhioResidencyFacts } from "@/lib/guided-ohio-residency-facts";
import { confirmGuidedOhioSchoolDistrictFacts } from "@/lib/guided-ohio-school-district-facts";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { confirmGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { TaxYearInputSchema } from "@/models/inputs";
import { guidedSchoolDistrictFixture, required } from "../fixtures/guided-oh-school-district-complete";

function reopen(state: GuidedFlowState) {
  const items = new Map<string, string>();
  const storage: Storage = {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: key => { items.delete(key); },
    key: index => [...items.keys()][index] ?? null,
  };
  expect(saveGuidedFlowState(storage, "school-payment-retention", state)).toBe(true);
  return required(loadGuidedFlowState(storage, "school-payment-retention"));
}

function confirmParents(state: GuidedFlowState) {
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const data = required(state.sectionData["state-return"]);
  return {
    input,
    ohioResidency: confirmGuidedOhioResidencyFacts(input, data.ohioResidency),
    ohioPayments: confirmGuidedOhioPaymentFacts(input, data.ohioPayments),
  };
}

function confirmSchoolEstimate(sourceTaxYear = "2025") {
  const { state, data, draft } = guidedSchoolDistrictFixture("estimates");
  state.sectionData.deductions = { ...state.sectionData.deductions, method: "itemized", realEstateTaxes: "18000" };
  const { input, ohioResidency, ohioPayments } = confirmParents(state);
  Object.assign(data, { ohioResidency, ohioPayments, ohioSchoolDistrict: { ...draft, taxYear: sourceTaxYear, sourceFactsConfirmed: null } });
  return updateSectionData(state, "state-return", { ...data, ohioSchoolDistrict: confirmGuidedOhioSchoolDistrictFacts(
    input, data.ohioSchoolDistrict, ohioResidency, ohioPayments,
  ) });
}

const held = { blockedBy: expect.stringMatching(/school district/i), metrics: null };

it("clears the school payment hold only after a verified no-district Ohio correction", () => {
  const confirmed = reopen(confirmSchoolEstimate());
  const data = required(confirmed.sectionData["state-return"]);
  expect(data).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);
  const removed = reopen(updateSectionData(confirmed, "state-return", { ...data, ohioSchoolDistrict: undefined }));
  expect(computeGuidedPreviewEvaluation(removed).preview).toMatchObject(held);

  const removedData = required(removed.sectionData["state-return"]);
  const pending = updateSectionData(removed, "state-return", { ...removedData, ohioResidency: {
    ...required(removedData.ohioResidency), schoolDistrictStatus: "no_ohio_taxing_district_residency",
  } });
  const pendingData = required(pending.sectionData["state-return"]);
  const contradictoryParents = confirmParents(pending);
  const contradictory = reopen(updateSectionData(pending, "state-return", { ...pendingData,
    ohioResidency: contradictoryParents.ohioResidency, ohioPayments: contradictoryParents.ohioPayments,
  }));
  expect(contradictory.sectionData["state-return"]).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);
  expect(computeGuidedPreviewEvaluation(contradictory).preview).toMatchObject(held);

  const w2 = required(required(contradictory.sectionData["income-w2"]).entries[0]);
  const corrected = updateSectionData(contradictory, "income-w2", { entries: [{ ...w2,
    localWages: undefined, localTaxWithheld: undefined, localityName: undefined,
  }] });
  const correctedW2 = required(required(corrected.sectionData["income-w2"]).entries[0]);
  correctedW2.stateLocalSources = confirmGuidedW2StateLocalSources(required(buildGuidedW2SourceContext(corrected)), 0, {
    ...required(correctedW2.stateLocalSources), localReporting: "none", localRows: [],
  });
  const { ohioResidency, ohioPayments } = confirmParents(corrected);
  const resolved = reopen(updateSectionData(corrected, "state-return", {
    ...required(corrected.sectionData["state-return"]), ohioResidency, ohioPayments,
  }));
  expect.soft(resolved.sectionData["state-return"]).not.toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear");
  const evaluation = computeGuidedPreviewEvaluation(resolved);
  expect.soft(evaluation).toMatchObject({
    sourceReplaySucceeded: true, preview: { blockedBy: null, metrics: { taxableIncome: "59000", state: { stateWithholding: "3000" } } },
  });
  expect.soft(evaluation.preview.metrics?.state ?? {}).not.toHaveProperty("schoolDistrict");
});

it("routes accepted whitespace around the school source year through preview and retention", () => {
  const state = reopen(confirmSchoolEstimate(" 2025 "));
  const data = required(state.sectionData["state-return"]);
  expect.soft(data).toHaveProperty("lastConfirmedOHSchoolScheduleAPaymentYear", 2025);
  expect.soft(computeGuidedPreviewEvaluation(state).preview).toMatchObject({
    blockedBy: null, metrics: { taxableIncome: "58100", state: { schoolDistrict: { estimatedPayments: "400" } } },
  });
  const removed = reopen(updateSectionData(state, "state-return", { ...data, ohioSchoolDistrict: undefined }));
  expect.soft(computeGuidedPreviewEvaluation(removed).preview).toMatchObject(held);
});
