// Spec: spec/federal/guided-input.yaml, nonw2-tax-allocation
import { describe, expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyDeductionData, validateSection } from "@/lib/guided-interview-flow";
import { completeInterestSource, completeDividendSource, completeBusinessSection, completeNecSource, startCompleteInterview } from "./complete-facts";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculateStateLocalIncomeTaxDeduction } from "@/engine/forms/state-local-income-tax-deduction";

function flow() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["interest-dividends", "self-employment"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, stateTaxReporting: "single", state: "PA", stateWithheld: "0.10" }], dividendEntries: [{ ...completeDividendSource, stateTaxReporting: "single", state: "NY", stateWithheld: "0.20" }], brokerageEntries: [] };
  state.sectionData["income-self-employment"] = { ...completeBusinessSection, necEntries: [{ ...completeNecSource, stateTaxReporting: "single", state: "OH", stateWithheld: "0.30" }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: "itemized", stateLocalTaxes: "1.00" };
  return state;
}

describe("guided actual SALT source allocation", () => {
  it("requires actual non-W-2 deduction allocation and preserves explicit zero", () => {
    const state = flow();
    state.taxYear = 2025;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    state.taxYear = 2026;
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(validateSection(state, "deductions").status).toBe("partial");
    state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0";
    expect(buildTaxInputFromGuidedData(state)?.scheduleA).toMatchObject({ nonW2IncomeTaxesDeductedElsewhere: "0", additionalStateLocalIncomeTaxes: "1" });
    expect(validateSection(state, "deductions").status).toBe("complete");
    state.sectionData.deductions!.method = "standard";
    expect(buildTaxInputFromGuidedData(state)?.scheduleA).toEqual({ nonW2IncomeTaxesDeductedElsewhere: "0" });
  });
  it("counts each source once and subtracts only the actual cross-schedule amount", () => {
    const state = flow();
    state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0.10";
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    // .10 + .20 + .30 source withholding + 1.00 additional payment - .10 allocated elsewhere.
    expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe("1.5");
    expect(input.scheduleA?.additionalStateLocalIncomeTaxes).toBe("1");
    for (const value of ["", "-0.01", "0.61", "invalid"]) {
      state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = value;
      expect(buildTaxInputFromGuidedData(state), value).toBeNull();
    }
  });
});
