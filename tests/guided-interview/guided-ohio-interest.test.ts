// Spec: spec/state/guided-ohio-interest.yaml; ORC5747.01(A)(1)-(3).
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { buildGuidedOhioOverlay } from "@/lib/guided-state-engine-inputs";
import { actualOid } from "../fixtures/guided-oid";
import { completeDividendSource, completeInterestSource, completeW2Entry, startCompleteInterview } from "./complete-facts";

const actualAllocation = {
  taxYear: "2025", sourceReference: "Actual synthetic issuer allocation statements", sourceFactsConfirmed: true,
  federalTaxExemptInterest: "410.40", nonOhioStateLocalInterest: "150.10", ohioStateLocalInterest: "100.10",
  otherInterestExemptFromOhio: "100", federalInterestTaxableByOhio: "60.20",
};
function ohioFlow() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages", "investments"], lifeEvents: [], stateCode: "OH" });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "60000" }] };
  state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, taxExemptInterest: "100.10" }], dividendEntries: [{ ...completeDividendSource, exemptInterestDividends: "200.20" }], brokerageEntries: [],
    oidEntries: [{ ...actualOid, obligationType: "tax_exempt", originalIssueDiscount: "0", otherPeriodicInterest: "10.10", treasuryOID: "0", taxExemptOID: "100", specifiedPrivateActivityBond: false }] };
  return state;
}
function addAllocation(state: ReturnType<typeof ohioFlow>, changes: Record<string, unknown> = {}) {
  state.sectionData["state-return"] = { additionalStateWithholding: "", stateEstimatedPayments: [], ohioInterestAllocation: { ...actualAllocation, ...changes } };
  return state;
}
function overlay(state: ReturnType<typeof ohioFlow>) {
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const federal = calculateFederalTax(input);
  return { input, federal, overlay: buildGuidedOhioOverlay(input, state, federal.taxExemptInterest) };
}

describe("actual Ohio exempt-interest allocation", () => {
  it("requires actual reconciled Ohio source facts without blocking the federal preview", () => {
    const state = ohioFlow();
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
    expect(validateSection(state, "state-return").status).toBe("partial");
    expect(computeGuidedPreview(state)).not.toBeNull();
    expect(computeGuidedPreview(state)?.state).toBeNull();
    addAllocation(state);
    expect(validateSection(state, "state-return").status).toBe("complete");
    expect(computeGuidedPreview(state)?.state).not.toBeNull();
    expect(overlay(state).federal.taxExemptInterest.toFixed()).toBe("410.4");
  });
  it("uses the same exact allocations for preview and packet overlays", () => {
    const state = addAllocation(ohioFlow());
    const actual = overlay(state);
    expect(actual.overlay).toMatchObject({ nonOhioStateLocalInterest: "150.1", otherAdditions: "60.2" });
    const ohio = buildOhioResidentReturnInput(actual.input, actual.federal, actual.overlay);
    expect(ohio.nonOhioStateLocalInterest).toBe("150.1");
    expect(ohio.otherAdditions).toBe("60.2");
    const allOhio = addAllocation(ohioFlow(), { nonOhioStateLocalInterest: "0", ohioStateLocalInterest: "410.4", otherInterestExemptFromOhio: "0", federalInterestTaxableByOhio: "0" });
    // $210.30 added to Ohio AGI is taxable; Ohio and other exempt obligations are excluded.
    const mixedTax = computeGuidedPreview(state)?.state?.stateTax;
    const exemptTax = computeGuidedPreview(allOhio)?.state?.stateTax;
    if (mixedTax === undefined || exemptTax === undefined) throw new Error("Missing source-qualified Ohio preview");
    expect(new Decimal(mixedTax).gt(exemptTax)).toBe(true);
    expect(computeGuidedPreview(state)?.agi).toBe(computeGuidedPreview(allOhio)?.agi);
  });
  it("rejects unknown or stale classifications and preserves exact explicit zero", () => {
    for (const changes of [{ nonOhioStateLocalInterest: "" }, { ohioStateLocalInterest: "-0.01" }, { otherInterestExemptFromOhio: "NaN" }, { taxYear: "2026" }, { sourceReference: "" }, { sourceFactsConfirmed: false }, { federalTaxExemptInterest: "400" }, { federalInterestTaxableByOhio: "0" }]) {
      const state = addAllocation(ohioFlow(), changes);
      expect(validateSection(state, "state-return").status).toBe("partial");
      expect(() => overlay(state)).toThrow();
      expect(computeGuidedPreview(state)?.state).toBeNull();
    }
    const exact = addAllocation(ohioFlow(), { federalTaxExemptInterest: "9007199254740993.03", nonOhioStateLocalInterest: "9007199254740993.01", ohioStateLocalInterest: "0", otherInterestExemptFromOhio: "0.02", federalInterestTaxableByOhio: "0" });
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(exact));
    expect(buildGuidedOhioOverlay(input, exact, new Decimal("9007199254740993.03"))).toMatchObject({ nonOhioStateLocalInterest: "9007199254740993.01", otherAdditions: "0" });
    expect(() => buildGuidedOhioOverlay(input, exact, new Decimal("9007199254740993.04"))).toThrow(/reconcile/i);
  });
  it("invalidates Ohio source confirmation after investment changes", () => {
    const state = addAllocation(ohioFlow());
    const next = updateSectionData(state, "income-investments", structuredClone(state.sectionData["income-investments"]));
    expect(next.sectionData["state-return"]?.ohioInterestAllocation).toEqual({ ...actualAllocation, sourceFactsConfirmed: null });
    expect(validateSection(next, "state-return").status).toBe("partial");
    expect(state.sectionData["state-return"]?.ohioInterestAllocation?.sourceFactsConfirmed).toBe(true);
    const stale = addAllocation(ohioFlow(), { federalTaxExemptInterest: "1", nonOhioStateLocalInterest: "1", ohioStateLocalInterest: "0", otherInterestExemptFromOhio: "0", federalInterestTaxableByOhio: "0" });
    expect(validateSection(stale, "state-return").status).toBe("partial");
    expect(() => overlay(stale)).toThrow(/reconcile/i);
  });
  it("does not default INT or DIV exempt interest to zero Ohio additions", () => {
    for (const sourceType of ["interestEntries", "dividendEntries"] as const) {
      const state = ohioFlow();
      const investments = state.sectionData["income-investments"];
      if (!investments) throw new Error("Missing actual synthetic investments");
      investments.oidEntries = [];
      investments[sourceType === "interestEntries" ? "dividendEntries" : "interestEntries"] = [];
      const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
      const federal = calculateFederalTax(input);
      expect(() => buildOhioResidentReturnInput(input, federal)).toThrow(/exempt.*allocation/i);
      expect(buildOhioResidentReturnInput(input, federal, { nonOhioStateLocalInterest: "0" }).nonOhioStateLocalInterest).toBe("0");
    }
  });
});
