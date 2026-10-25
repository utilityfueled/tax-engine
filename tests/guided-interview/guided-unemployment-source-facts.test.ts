// Spec: spec/federal/guided-input.yaml, government-payment-source-records
import { expect, it } from "vitest";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildTaxInputFromGuidedData, buildUnemploymentInputs } from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { emptyDeductionData, emptyStateReturnData, type UnemploymentData, validateSection } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";

export const unemploymentSource = {
  sourceTaxYear: "2025", sourceFormRevision: "2024-03", payer: "Actual State Agency", payerTin: "12-3456789", accountReference: "actual-government-source", accountHolder: "primary" as const, recipientTaxIdLast4: "3333", programType: "government-unemployment" as const,
  compensation: "1000.10", federalWithheld: "0", stateOrLocalTaxRefund: "0", rtaaPayments: "0", taxableGrants: "0", agriculturePayments: "0", marketGain: "0", tradeOrBusinessRefund: false,
  currentYearRepaid: "0", priorYearRepaid: "0", unrecoveredAfterTaxContributions: "0", actualReceiptConfirmed: true, additionalWorksheetRequired: false, sourceFactsConfirmed: true, stateTaxReporting: "none" as const,
};
const data = (entries = [unemploymentSource]): UnemploymentData => ({ compensation: "", federalWithheld: "", entries });
function flow() {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["unemployment"], lifeEvents: [], stateCode: "PA" });
  state.sectionData["personal-info"]!.state = "PA";
  state.sectionData["income-unemployment"] = data();
  return state;
}

it("preserves actual government source identity ownership and zero amounts", () => {
  const state = flow();
  state.sectionData["income-unemployment"] = { ...data(), entries: [unemploymentSource, { ...unemploymentSource, accountReference: "spouse-source", accountHolder: "spouse", recipientTaxIdLast4: "4444", compensation: "0", federalWithheld: "0.10" }] };
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form1099G).toHaveLength(2);
  expect(input?.form1099G?.[0]).toMatchObject({ payer: "Actual State Agency", payerTin: "12-3456789", accountHolder: "primary", unemploymentCompensation: "1000.10", federalWithheld: "0" });
  expect(input?.form1099G?.[1]).toMatchObject({ accountHolder: "spouse", unemploymentCompensation: "0", federalWithheld: "0.10" });
  expect(validateSection(state, "income-unemployment").status).toBe("complete");
  expect(buildUnemploymentInputs(data([{ ...unemploymentSource, compensation: "9007199254740993.01" }]))[0]?.unemploymentCompensation).toBe("9007199254740993.01");
});

it("requires actual source facts and keeps legacy unknown withholding unverified", () => {
  const state = flow();
  for (const change of [{ payer: "" }, { payerTin: "" }, { sourceTaxYear: "2026" }, { sourceFormRevision: "" }, { accountHolder: undefined }, { recipientTaxIdLast4: "0000" }, { federalWithheld: "" }, { sourceFactsConfirmed: undefined }, { currentYearRepaid: "" }, { stateTaxReporting: undefined }, { actualReceiptConfirmed: false }]) {
    state.sectionData["income-unemployment"] = { ...data(), entries: [{ ...unemploymentSource, ...change }] };
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "1099-g")?.coverage).toBe("partially-supported");
  }
  const legacy = { compensation: "1000.10", federalWithheld: "" };
  expect(() => buildUnemploymentInputs(legacy)).toThrow();
  state.sectionData["income-unemployment"] = legacy;
  expect(buildGuidedFactAnswers(state).find(fact => fact.factId === "government-payments-review")?.answerText).not.toContain("confirmed");
});

it("retains unsupported repayments contribution history and other payment classifications", () => {
  const state = flow();
  for (const change of [{ currentYearRepaid: "0.10" }, { priorYearRepaid: "3000.01" }, { unrecoveredAfterTaxContributions: "10" }, { stateOrLocalTaxRefund: "100", refundTaxYear: "2024" }, { rtaaPayments: "100" }, { taxableGrants: "100" }, { agriculturePayments: "100" }, { marketGain: "100" }, { familyLeaveBenefits: "100" }, { tradeOrBusinessRefund: true }, { additionalWorksheetRequired: true }, { programType: "employer-supplemental" }]) {
    state.sectionData["income-unemployment"] = { ...data(), entries: [{ ...unemploymentSource, ...change }] };
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    expect(state.sectionData["income-unemployment"]?.entries?.[0]).toMatchObject(change);
  }
  state.sectionData["income-unemployment"] = { ...data(), entries: [unemploymentSource, unemploymentSource] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData["income-unemployment"] = { ...data(), compensation: "1000.11" };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("uses actual source states once and requires the known non-W-2 tax allocation", () => {
  const state = flow();
  const source = { ...unemploymentSource, stateTaxReporting: "single" as const, state: "PA", statePayerId: "actual-pa-id", stateWithheld: "12.34" };
  state.sectionData["income-unemployment"] = { ...data(), entries: [source] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.deductions = { ...emptyDeductionData, nonW2IncomeTaxesDeductedElsewhere: "0" };
  expect(buildTaxInputFromGuidedData(state)?.form1099G?.[0]).toMatchObject({ state: "PA", stateWithheld: "12.34" });
  expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("12.34");
  state.sectionData["income-unemployment"]!.entries![0]!.state = "NY";
  expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0");
  state.sectionData["income-unemployment"]!.entries![0]!.state = "PA";
  state.sectionData["state-return"] = { ...emptyStateReturnData, additionalStateWithholdingEntries: [{ payer: source.payer, documentType: "1099-G", state: "PA", taxYear: "2025", amount: "12.34" }] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("keeps saved zero aggregates visible and rejects malformed supplied refund years", () => {
  const state = flow();
  state.sectionData["income-unemployment"] = { compensation: "0", federalWithheld: "0", entries: [] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(validateSection(state, "income-unemployment").status).toBe("partial");
  expect(buildGuidedFactAnswers(state).find(fact => fact.factId === "government-payments-review")).toBeDefined();
  state.sectionData["income-unemployment"] = { ...data(), entries: [{ ...unemploymentSource, refundTaxYear: "bad" }] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
