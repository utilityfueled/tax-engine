import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateStateLocalIncomeTaxDeduction } from "@/engine/forms/state-local-income-tax-deduction.js";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources.js";
import { calculatePAReciprocalCompensation } from "@/engine/state/pa-reciprocity.js";
import { actualW2ConsumerFixture, actualPARowConsumerFixture, actualReciprocalRowConsumerFixture } from "../fixtures/w2-state-local-consumers.js";
// Spec: spec/federal/w2-state-local-consumers.yaml. Literal controls derive from printed sources, never candidate outputs.
it("W2 actual consumers - includes each actual state/local withholding once", () => {
  for (const year of [2025, 2026]) {
    const f = actualW2ConsumerFixture(year); const before = structuredClone(f);
    const deduction = calculateStateLocalIncomeTaxDeduction(f.input);
    expect(deduction.w2StateWithholding.toString()).toBe("2535");
    expect(deduction.w2LocalWithholding.toString()).toBe("3125");
    expect(deduction.total.toString()).toBe("5660");
    if (year === 2025) {
      const federal = calculateFederalTax(f.input);
      expect(federal.totalIncome.toString()).toBe("50000"); expect(federal.totalWithholding.toString()).toBe("5000");
    } else {
      // Source qualification cannot enable the independently incomplete 2026 law pack.
      expect(() => calculateFederalTax(f.input)).toThrow(/2026.*rule pack.*incomplete/i);
    }
    expect(f).toEqual(before);
  }
});
it("W2 actual consumers - rejects stale actual packet before federal calculation", () => {
  for (const year of [2025, 2026]) {
    const f = actualW2ConsumerFixture(year); f.input.w2s[0].employer.name = "Different actual employer";
    expect(() => calculateFederalTax(f.input)).toThrow(/W2.*state.local|actual.*W2|original/i);
  }
});
it("W2 actual consumers - selects actual PA Box16 after OH first row", () => {
  for (const year of [2025, 2026]) {
    const f = actualPARowConsumerFixture(year); const before = structuredClone(f);
    expect(calculatePAResidencySources(f.input, f.sources).taxBeforeCredits.toString()).toBe("1535");
    expect(f).toEqual(before);
    const reportedPA = f.packet.stateRows.find(row => row.state === "PA");
    if (!reportedPA) throw new Error("Fictional actual original must contain its PA row");
    reportedPA.wages = "50001";
    f.sources.wages[0].original = structuredClone(f.input.w2s[0]);
    expect(() => calculatePAResidencySources(f.input, f.sources)).toThrow(/PA.*payroll|reported compensation/i);
  }
});
it("W2 actual consumers - selects actual reciprocal PA withholding without single-state assertion", () => {
  for (const year of [2025, 2026]) {
    const f = actualReciprocalRowConsumerFixture(year); const before = structuredClone(f);
    const reciprocal = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
    expect(reciprocal.totalExcludedPACompensation.toString()).toBe("30000"); expect(reciprocal.paWithheldFromCoveredOriginals.toString()).toBe("1535");
    const result = calculatePAResidencySources({ ...f.input, paReciprocitySources: f.reciprocalSources }, f.residencySources);
    expect(result.compensation.toString()).toBe("20000"); expect(result.taxBeforeCredits.toString()).toBe("614");
    expect(f).toEqual(before);
  }
});
