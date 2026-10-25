// Spec: spec/federal/net-operating-loss-return.yaml.
import { expect, it } from "vitest";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";
import { getConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
it("restores regular NOL and subtracts only the separately established alternative deduction", () => {
  const input = { filingStatus: "single" as const, isItemizing: false, taxableIncome: d("20000"), standardDeductionAmount: d("15750"),
    saltDeduction: d("0"), regularTax: d("5000"), regularNolDeduction: d("60000"), alternativeTaxNolDeduction: d("10000") };
  const result = calculateForm6251(input, getConstants(2025));
  expect(result.amti.toFixed()).toBe("85750");
  expect(result.lines.find(line => line.line === "2e")?.value.toFixed()).toBe("60000");
  expect(result.lines.find(line => line.line === "2f")?.value.toFixed()).toBe("-10000");
  expect(() => calculateForm6251({ ...input, alternativeTaxNolDeduction: undefined }, getConstants(2025))).toThrow(/separate|actual|NOL/i);
  expect(() => calculateForm6251({ ...input, alternativeTaxNolDeduction: d("-1") }, getConstants(2025))).toThrow(/nonnegative|NOL/i);
});
