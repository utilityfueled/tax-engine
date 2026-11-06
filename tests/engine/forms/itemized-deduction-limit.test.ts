// Spec: spec/federal/itemized-deduction-limit.yaml
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateItemizedDeductionLimit } from "@/engine/forms/itemized-deduction-limit.js";
const d = (value: string) => new Decimal(value);
describe("2026 itemized deduction limitation", () => {
  const calc = (income: string, deduction = "100000", threshold = "640600", year = 2026) => calculateItemizedDeductionLimit({ taxYear: year, itemizedDeductions: d(deduction), taxableIncomeBeforeItemized: d(income), topBracketThreshold: d(threshold) });
  it.each([["640599", "0"], ["640600", "0"], ["640637", "2"], ["740600", "5405"], ["1000000", "5405"]])("uses exact statutory ratio at income %s", (income, expected) => {
    expect(calc(income).reduction.toString()).toBe(expected);
    expect(calc(income).allowedDeduction.toString()).toBe(d("100000").minus(expected).toString());
  });
  it("accepts actual bracket thresholds without using the joint threshold for MFS", () => {
    expect(calc("768737", "100000", "768700").reduction.toString()).toBe("2");
    expect(calc("384387", "100000", "384350").reduction.toString()).toBe("2");
  });
  it("floors low income, handles zero deductions and preserves 2025", () => {
    expect(calc("-1").reduction.toString()).toBe("0");
    expect(calc("1000000", "0").allowedDeduction.toString()).toBe("0");
    expect(calc("1000000", "100000", "640600", 2025).allowedDeduction.toString()).toBe("100000");
  });
  it("rejects negative itemized deductions and nonfinite amounts", () => {
    expect(() => calc("1000000", "-1")).toThrow();
    expect(() => calc("Infinity")).toThrow();
  });
});
