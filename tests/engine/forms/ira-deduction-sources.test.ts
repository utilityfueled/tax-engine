// Spec: spec/federal/ira-deduction-worksheet.yaml; Pub590-A Worksheet1-2 lines4–8.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...actual, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : actual.getConstants(year) };
});
import { calculateIraDeduction, type IraDeductionInput } from "@/engine/forms/ira-deduction-worksheet.js";
const source = (overrides: Partial<IraDeductionInput> = {}): IraDeductionInput => ({
  filingStatus: "single", taxYear: 2025, magi: "84000", contributions: "7000",
  isActiveParticipant: true, isSpouseActiveParticipant: false, age50OrOlder: false,
  compensation: "84000", section501c18Contributions: "0", ...overrides,
});
describe("Actual IRA contribution sources", () => {
  it("rounds the remaining deduction upward and uses indexed2026 limits", () => {
    // Worksheet4: (89000-79001)*0.7=6999.30, roundedUP7000.
    expect(calculateIraDeduction(source({ magi: "79001" })).deductibleAmount.toString()).toBe("7000");
    // (89000-80001)*0.7=6299.30 ->6300, not6290.
    expect(calculateIraDeduction(source({ magi: "80001" })).deductibleAmount.toString()).toBe("6300");
    const indexed = calculateIraDeduction(source({ taxYear: 2026, magi: "86000", contributions: "8600", age50OrOlder: true }));
    expect(indexed.contributionLimit.toString()).toBe("8600");
    expect(indexed.deductibleAmount.toString()).toBe("4300");
    expect(indexed.sourceFactsVerified).toBe(true);
    expect(calculateIraDeduction(source({ magi: "88999", compensation: "150" })).deductibleAmount.toString()).toBe("150");
  });
  it("limits deduction and basis to actual compensation and separates excess", () => {
    const capped = calculateIraDeduction(source({ compensation: "2000" }));
    expect(capped.deductibleAmount.toString()).toBe("2000");
    expect(capped.nondeductibleAmount.toString()).toBe("0");
    expect(capped.excessContributions.toString()).toBe("5000");
    const phased = calculateIraDeduction(source({ compensation: "2000", magi: "89000" }));
    expect(phased.deductibleAmount.toString()).toBe("0");
    expect(phased.nondeductibleAmount.toString()).toBe("2000");
    expect(phased.excessContributions.toString()).toBe("5000");
    const plan = calculateIraDeduction(source({ magi: "1000", section501c18Contributions: "1000" }));
    expect(plan.contributionLimit.toString()).toBe("6000");
    expect(plan.deductibleAmount.toString()).toBe("6000");
    expect(plan.excessContributions.toString()).toBe("1000");
    expect(calculateIraDeduction(source({ compensation: "0" })).deductibleAmount.toString()).toBe("0");
  });
  it("preserves unknown facts and rejects invalid amounts", () => {
    expect(() => calculateIraDeduction(source({ taxYear: 2026, compensation: undefined }))).toThrow(/compensation/);
    expect(() => calculateIraDeduction(source({ taxYear: 2026, section501c18Contributions: undefined }))).toThrow(/501/);
    expect(() => calculateIraDeduction(source({ taxYear: 2026, filingStatus: "married_filing_separately" }))).toThrow(/living/);
    for (const field of ["magi", "contributions", "compensation", "section501c18Contributions"] as const) {
      expect(() => calculateIraDeduction(source({ [field]: "Infinity" }))).toThrow(/finite/);
      if (field !== "magi") expect(() => calculateIraDeduction(source({ [field]: "-1" }))).toThrow(/nonnegative/);
    }
    expect(calculateIraDeduction(source({ compensation: undefined })).sourceFactsVerified).toBe(false);
    const survivor = calculateIraDeduction(source({ filingStatus: "qualifying_surviving_spouse", magi: "500000", isActiveParticipant: false, isSpouseActiveParticipant: true }));
    expect(survivor.deductibleAmount.toString()).toBe("7000");
  });
});
