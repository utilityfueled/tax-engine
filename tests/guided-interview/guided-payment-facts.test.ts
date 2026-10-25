// Spec: spec/federal/guided-input.yaml, payment-categories
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyPaymentData, type PaymentData, validateSection } from "@/lib/guided-interview-flow";
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
});
