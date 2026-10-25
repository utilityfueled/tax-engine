// Spec: spec/federal/form-8995-a-loss-netting.yaml.
import { expect, it } from "vitest";
import { calculateForm8995A, type QBIBusinessSource } from "@/engine/forms/form-8995-a.js";
import { d } from "@/utils/decimal.js";
const business = (name: string, amount: string, isSST = false): QBIBusinessSource => ({
  name, qbi: d(amount), w2Wages: d("100000"), ubia: d("1000000"), isSST,
});
const calculate = (qbiSources: QBIBusinessSource[], prior = "0", taxableIncome = "222300") => calculateForm8995A({
  taxYear: 2025, qbiSources, priorYearQBILoss: d(prior), taxableIncomeBeforeQBI: d(taxableIncome),
  netCapitalGain: d("0"), qualifiedDividends: d("0"), simplifiedThreshold: d("197300"), phaseInRange: d("50000"),
});
it("qualifies current SSTB income before applying a prior qualified loss", () => {
  const result = calculate([business("Actual SSTB", "10000", true)], "3000");
  expect(result.businesses[0].line2AdjustedQBI.toFixed()).toBe("2000");
  expect(result.qbiDeduction.toFixed()).toBe("400");
  expect(result.qbiLossCarryforward.toFixed()).toBe("0");
  // A prior qualified loss retains character after the current SSTB is excluded.
  const excluded = calculate([business("Actual SSTB", "10000", true)], "3000", "300000");
  expect(excluded.qbiLossCarryforward.toFixed()).toBe("3000");
});
it("nets current losses once and excludes unqualified SSTB loss from the pool", () => {
  const ordinary = calculate([business("Profit", "100000"), business("Loss", "-40000")], "0", "300000");
  expect(ordinary.totalQBIComponent.toFixed()).toBe("12000");
  expect(ordinary.businesses[1].line15QBIComponent.toFixed()).toBe("0");
  const partial = calculate([business("Profit", "10000"), business("SSTB loss", "-6000", true)]);
  expect(partial.businesses[0].line2AdjustedQBI.toFixed()).toBe("7000");
  expect(partial.totalQBIComponent.toFixed()).toBe("1400");
  const excluded = calculate([business("Profit", "10000"), business("SSTB loss", "-6000", true)], "0", "300000");
  expect(excluded.totalQBIComponent.toFixed()).toBe("2000");
  expect(excluded.qbiLossCarryforward.toFixed()).toBe("0");
});
it("preserves only the remaining qualified loss and zeros exhausted business limits", () => {
  const result = calculate([business("Profit", "10000"), business("SSTB loss", "-20000", true)], "2000");
  expect(result.qbiLossCarryforward.toFixed()).toBe("2000");
  expect(result.qbiDeduction.toFixed()).toBe("0");
  for (const row of result.businesses) {
    expect(row.line2AdjustedQBI.toFixed()).toBe("0");
    expect(row.line4AdjustedW2.toFixed()).toBe("0");
    expect(row.line6AdjustedUBIA.toFixed()).toBe("0");
  }
});
it("conserves rounded loss allocation with stable ties and business limits", () => {
  const rows = [business("First", "1"), business("Second", "1"), business("Third", "1")];
  const result = calculate(rows, "1");
  expect(result.businesses.map(row => row.line2AdjustedQBI.toFixed())).toEqual(["0", "1", "1"]);
  expect(calculate([...rows].reverse(), "1").businesses.map(row => [row.name, row.line2AdjustedQBI.toFixed()]))
    .toEqual([["Third", "0"], ["Second", "1"], ["First", "1"]]);
  expect(calculate(rows, "4").qbiLossCarryforward.toFixed()).toBe("1");
  expect(calculate(rows, "4").businesses.every(row => row.line2AdjustedQBI.isZero())).toBe(true);
});
