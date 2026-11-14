// Spec: spec/federal/guided-input.yaml, payment-categories
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyPaymentData, getGuidedFlowStorageKey, loadGuidedFlowState, type PaymentData, validateSection } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";

function stateWith(data: PaymentData) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, sectionData: { ...state.sectionData, payments: data } };
}

describe("classified guided payments", () => {
  it("requires legacy other payments to be classified instead of dropping them", () => {
    const state = stateWith({ ...emptyPaymentData, otherPayments: "100.01" });
    expect(validateSection(state, "payments").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  });
  it("preserves extension dates and prior-year credits with exact amounts and zero", () => {
    const state = stateWith({ ...emptyPaymentData, otherPayments: "100.01", extensionPayments: [{ amount: "0", date: "2026-04-15" }], priorYearAppliedCredits: [{ amount: "100.01", sourceTaxYear: "2024" }] });
    expect(validateSection(state, "payments").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(state)?.adjustments).toMatchObject({ extensionPayments: [{ amount: "0", date: "2026-04-15", type: "federal" }], priorYearAppliedCredits: [{ amount: "100.01", sourceTaxYear: 2024, type: "federal" }] });
  });
  it("rejects unknown dates, conflicting source years and unreconciled totals", () => {
    for (const data of [
      { ...emptyPaymentData, extensionPayments: [{ amount: "100", date: "" }] },
      { ...emptyPaymentData, priorYearAppliedCredits: [{ amount: "100", sourceTaxYear: "2023" }] },
      { ...emptyPaymentData, otherPayments: "100", priorYearAppliedCredits: [{ amount: "99", sourceTaxYear: "2024" }] },
      { ...emptyPaymentData, otherPayments: "-" },
    ]) {
      const state = stateWith(data);
      expect(validateSection(state, "payments").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state)).toBeNull();
    }
  });
  it("replays confirmed payment application with exact amounts for both payment categories", () => {
    const application = { taxYear: "2026", confirmed: true };
    const state = { ...stateWith({
      ...emptyPaymentData,
      estimatedPayments: [
        { date: "2028-02-29", amount: "9007199254740993.01", application },
        { date: "2027-01-15", amount: "101.01" },
      ],
      extensionPayments: [{ date: "2028-04-15", amount: "0", application }],
    }), taxYear: 2026 };
    const snapshot = JSON.stringify(state);
    const restored = loadGuidedFlowState({ getItem: (key: string) => key === getGuidedFlowStorageKey("payments") ? snapshot : null } as Storage, "payments");
    if (!restored) throw new Error("Expected the saved interview to reopen");
    expect(restored.sectionData.payments).toEqual(state.sectionData.payments);
    expect(validateSection(restored, "payments").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(restored)?.adjustments).toMatchObject({
      estimatedTaxPayments: [
        { date: "2028-02-29", amount: "9007199254740993.01", type: "federal", application: { taxYear: 2026, confirmed: true } },
        { date: "2027-01-15", amount: "101.01", type: "federal" },
      ],
      extensionPayments: [{ date: "2028-04-15", amount: "0", type: "federal", application: { taxYear: 2026, confirmed: true } }],
    });
  });
  it.each(["estimatedPayments", "extensionPayments"] as const)("blocks missing or conflicting tax-year application in %s", category => {
    for (const entry of [
      { date: "2027-01-15", amount: "0", application: { taxYear: "2024", confirmed: true } },
      { date: "2027-01-15", amount: "0", application: { taxYear: "2025", confirmed: false } },
      { date: "2027-01-15", amount: "0", application: { taxYear: "2025", confirmed: null } },
      { date: "2027-01-15", amount: "0" },
      { date: "2026-02-30", amount: "0", application: { taxYear: "2025", confirmed: true } },
      { date: "0000-01-01", amount: "0", application: { taxYear: "2025", confirmed: true } },
      { date: "2026-01-15", amount: "0", application: { taxYear: "2022", confirmed: true } },
      { date: "2026-01-15", amount: "0", application: { taxYear: "", confirmed: true } },
      { date: "2026-01-15", amount: "0", application: { taxYear: "2025", confirmed: false } },
    ]) {
      const state = stateWith({ ...emptyPaymentData, [category]: [entry] });
      expect(validateSection(state, "payments").status, JSON.stringify(entry)).toBe("partial");
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(entry)).toBeNull();
    }
  });
});
