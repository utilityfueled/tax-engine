// Spec: spec/federal/guided-input.yaml
import { describe, expect, it } from "vitest";
import { formatGuidedCurrency, parseGuidedDisplayAmount, sumGuidedDisplayAmounts } from "@/lib/guided-currency";
import { computeDeductionComparison, emptyDeductionData } from "@/lib/guided-interview-flow";

describe("exact guided UI money", () => {
  it("retains exact source cents in deduction comparison and formatting", () => {
    const result = computeDeductionComparison("single", { ...emptyDeductionData, mortgageInterest: "9007199254740993.01", charitableContributions: "0.09" }, 2025);
    expect(result.itemizedTotal).toBe("9007199254740993.1");
    expect(result.savings).toBe("9007199254725243.1");
    expect(formatGuidedCurrency(result.itemizedTotal)).toBe("$9,007,199,254,740,993.10");
    expect(sumGuidedDisplayAmounts(["0.1", "0.2", "-0.05"]).toFixed()).toBe("0.25");
    expect(formatGuidedCurrency("-0.25")).toBe("-$0.25");
  });
  it("shows malformed display amounts as unknown without silently dropping them", () => {
    for (const amount of ["oops", "Infinity", "NaN", "1,2,3", "-"]) {
      expect(parseGuidedDisplayAmount(amount).isNaN()).toBe(true);
      expect(formatGuidedCurrency(amount)).toBe("—");
      expect(formatGuidedCurrency(sumGuidedDisplayAmounts(["10", amount]))).toBe("—");
    }
    expect(formatGuidedCurrency("0")).toBe("$0");
    expect(sumGuidedDisplayAmounts(["", "0"]).toFixed()).toBe("0");
  });
});
