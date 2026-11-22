// Spec: spec/federal/guided-federal-payment-return-year.yaml
import { expect, it } from "vitest";
import {
  emptyEstimatedPayment, emptyPaymentData, loadGuidedFlowState, saveGuidedFlowState,
  setInterviewTaxYear, startInterview, updateSectionData, validateSection,
  type GuidedFlowState, type PaymentData,
} from "@/lib/guided-interview-flow";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

function withCurrentFacts(state: GuidedFlowState, year: number) {
  const personal = updateSectionData(state, "personal-info", structuredClone(completePersonalInfo));
  return updateSectionData(personal, "income-w2", {
    entries: [{ ...completeW2Entry, employerName: `Wage source ${year}`, sourceTaxYear: String(year), wages: "60000", federalWithheld: "8000" }],
  });
}

function draft(year: number | null, payments: PaymentData) {
  const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null }, year);
  return updateSectionData(year === null ? state : withCurrentFacts(state, year), "payments", payments);
}

function reopen(state: GuidedFlowState) {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  } as Storage;
  expect(saveGuidedFlowState(storage, "federal-payment-year", state)).toBe(true);
  const restored = loadGuidedFlowState(storage, "federal-payment-year");
  if (!restored) throw new Error("Expected the guided payment draft to reopen");
  return restored;
}

it("blocks an implicitly dated extension payment after a confirmed year change", () => {
  const source = { date: "2026-04-14", amount: "5000.75" };
  const payments = { ...emptyPaymentData, extensionPayments: [source] };
  const original = reopen(draft(2025, payments));
  expect(setInterviewTaxYear(original, 2025)).toBe(original);
  expect(original.sectionData.payments).toEqual(payments);
  expect(computeGuidedPreviewEvaluation(original).preview.metrics?.totalPayments).toBe("13000.75");

  const switched = withCurrentFacts(setInterviewTaxYear(original, 2026), 2026);
  const reopened = reopen(updateSectionData(switched, "review", { qof2026Disclosure: false }));
  expect(computeGuidedPreviewEvaluation(reopened).input).toBeNull();
  expect(validateSection(reopened, "payments")).toMatchObject({ status: "partial", fieldErrors: {
    "extension-payment-0-application-year": expect.any(String),
    "extension-payment-0-application-confirmation": expect.any(String),
  } });
  expect(reopened.sectionData.payments?.extensionPayments).toEqual([
    { ...source, application: { taxYear: "", confirmed: null } },
  ]);

  const documentedPayment = { ...source, application: { taxYear: "2025", confirmed: true } };
  const confirmed = reopen(updateSectionData(reopened, "payments", { ...payments, extensionPayments: [documentedPayment] }));
  expect(computeGuidedPreviewEvaluation(confirmed).input).toBeNull();

  const originalYear = reopen(withCurrentFacts(setInterviewTaxYear(confirmed, 2025), 2025));
  const restored = computeGuidedPreviewEvaluation(originalYear);
  expect(restored.input?.adjustments?.extensionPayments).toEqual([
    { ...source, type: "federal", application: { taxYear: 2025, confirmed: true } },
  ]);
  expect(restored.preview.metrics?.totalPayments).toBe("13000.75");
});

it("preserves explicit application, pending estimates and blank rows through the year selector", () => {
  const source = { date: "2025-06-16", amount: "0.00" };
  const explicit = { date: "2026-01-15", amount: "100.01", application: { taxYear: "2025", confirmed: true } };
  const pending = { ...source, application: { taxYear: "", confirmed: null } };
  const original = draft(2025, { ...emptyPaymentData, estimatedPayments: [source, explicit, emptyEstimatedPayment] });
  const cleared = reopen(setInterviewTaxYear(original, null));
  expect(cleared.sectionData.payments?.estimatedPayments).toEqual([pending, explicit, emptyEstimatedPayment]);

  const switched = reopen(setInterviewTaxYear(cleared, 2026));
  expect(switched.sectionData.payments?.estimatedPayments).toEqual([pending, explicit, emptyEstimatedPayment]);

  const returned = withCurrentFacts(setInterviewTaxYear(switched, 2025), 2025);
  expect(returned.sectionData.payments?.estimatedPayments).toEqual([pending, explicit, emptyEstimatedPayment]);
  expect(validateSection(returned, "payments").fieldErrors).toHaveProperty("payment-0-application-year");
});

it("preserves date-based validation for the first year assigned to an unbound draft", () => {
  const payments = {
    ...emptyPaymentData,
    estimatedPayments: [{ date: "2025-06-16", amount: "100.01" }],
    extensionPayments: [{ date: "2026-04-14", amount: "500.50" }],
  };
  const assigned = reopen(withCurrentFacts(setInterviewTaxYear(reopen(draft(null, payments)), 2025), 2025));
  expect(assigned.sectionData.payments).toEqual(payments);
  expect(validateSection(assigned, "payments").status).toBe("complete");
  expect(computeGuidedPreviewEvaluation(assigned).preview.metrics?.totalPayments).toBe("8600.51");
});
