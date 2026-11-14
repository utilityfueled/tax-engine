// Spec: spec/state/pa-2026-farmer-estimated-tax.yaml.
import { describe, expect, it } from "vitest";
import { estimatePennsylvania2026FarmerTaxTiming } from "@/engine/state/pa-2026-farmer-estimated-tax.js";

type Input = Parameters<typeof estimatePennsylvania2026FarmerTaxTiming>[0];

const confirmed = {
  taxYear: 2026,
  calendarYearConfirmed: true,
  individualGrossEstimatesConfirmed: true,
  estimatedGrossFarmIncome: "60000.00",
  estimatedTotalGrossIncome: "90000.00",
} satisfies Input;

describe("Pennsylvania 2026 farmer estimated tax timing", () => {
  it("compares exact current-year gross amounts at and immediately around two-thirds", () => {
    // 60,000 / 90,000 is exactly two-thirds and would fail a 0.6667 threshold.
    const cases = [
      ["59999.99", "90000.00", false],
      ["60000.00", "90000.00", true],
      ["60000.01", "90000.00", true],
      ["60000.00", "90000.01", false],
      ["60000.00", "89999.99", true],
      ["666666666666.66", "999999999999.99", true],
      ["666666666666.65", "999999999999.99", false],
      ["0", "90000.00", false],
      ["90000.00", "90000.00", true],
    ] as const;
    for (const [estimatedGrossFarmIncome, estimatedTotalGrossIncome, eligible] of cases) {
      const outcome = estimatePennsylvania2026FarmerTaxTiming({
        ...confirmed, estimatedGrossFarmIncome, estimatedTotalGrossIncome,
      });
      expect(outcome.meetsFarmerIncomeTest).toBe(eligible);
      expect(outcome.options).toHaveLength(eligible ? 2 : 0);
    }
  });

  it("returns both exact farmer deadline options without selecting or settling either one", () => {
    const outcome = estimatePennsylvania2026FarmerTaxTiming(confirmed);
    expect(outcome).toEqual({
      meetsFarmerIncomeTest: true,
      options: [
        { action: "declare_and_pay_full_estimate", dueDate: "2027-01-15" },
        { action: "file_return_and_pay_full_tax", dueDate: "2027-03-01" },
      ],
      lines: [expect.objectContaining({ line: "farmer-income-test" })],
    });
    expect(outcome.lines[0]?.inputs["Estimated gross farm income × 3"]?.toString()).toBe("180000");
    expect(outcome.lines[0]?.inputs["Estimated total gross income × 2"]?.toString()).toBe("180000");
    expect(outcome.lines[0]?.value.toFixed()).toBe("1");
  });

  it("returns no timing options for an explicitly confirmed zero gross total", () => {
    const outcome = estimatePennsylvania2026FarmerTaxTiming({
      ...confirmed, estimatedGrossFarmIncome: "0", estimatedTotalGrossIncome: "0.00",
    });
    expect(outcome.meetsFarmerIncomeTest).toBe(false);
    expect(outcome.options).toEqual([]);
    expect(outcome.lines[0]?.value.toFixed()).toBe("0");
  });

  it("rejects unconfirmed, wrong-year and inconsistent facts without providing deadlines", () => {
    for (const change of [
      { taxYear: 2025 }, { taxYear: 2027 }, { taxYear: "2026" },
      { calendarYearConfirmed: false }, { calendarYearConfirmed: undefined },
      { individualGrossEstimatesConfirmed: false }, { individualGrossEstimatesConfirmed: "true" },
      { individualGrossEstimatesConfirmed: undefined }, { estimatedGrossFarmIncome: "90000.01" },
      { estimatedTotalGrossIncome: "0.00" },
    ]) {
      expect(() => estimatePennsylvania2026FarmerTaxTiming({ ...confirmed, ...change } as Input)).toThrow();
    }
  });

  it("rejects missing, noncanonical and unsupported gross income values in either field", () => {
    for (const amount of [undefined, null, "", 60000, "-0", "-1", "NaN", "Infinity", "6e4",
      "60,000", " 60000", "60000\n", "60000.001", "1000000000000"]) {
      for (const field of ["estimatedGrossFarmIncome", "estimatedTotalGrossIncome"]) {
        expect(() => estimatePennsylvania2026FarmerTaxTiming({ ...confirmed, [field]: amount })).toThrow();
      }
    }
  });
});
