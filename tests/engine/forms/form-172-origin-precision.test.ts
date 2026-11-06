// Spec: spec/federal/form-172-origin-precision.yaml. Derived exact-source controls.
import { expect, it } from "vitest";
import { calculateForm172Origin, type Form172OriginInput } from "@/engine/forms/form-172-origin.js";
import { d } from "@/utils/decimal.js";

function source(gain: string, loss: string, patch: Partial<Form172OriginInput> = {}): Form172OriginInput {
  const net = d(gain).minus(loss);
  return { taxYear: 2025, filingStatus: "single", adjustedGrossIncome: d("-75000").plus(net),
    deductionAmount: d("15750"), nonbusinessCapitalGains: d(gain), nonbusinessCapitalLosses: d(loss),
    nonbusinessDeductions: d("15750"), nonbusinessOrdinaryIncome: d("5000"), businessCapitalLosses: d("0"),
    businessCapitalGains: d("0"), netCapitalGainOrLoss: net, section1202Exclusion: d("0"),
    otherYearNolDeduction: d("0"), ...patch };
}

it("conserves exact capital cents before printing independent line amounts", () => {
  const input = source("100.49", "100.50"), before = JSON.stringify(input);
  const result = calculateForm172Origin(input);
  expect(result.sourcePartI[2].toFixed()).toBe("100.5");
  expect(result.sourcePartI[3].toFixed()).toBe("100.49");
  expect(result.sourcePartI[4].toFixed()).toBe("0.01");
  expect(result.sourcePartI[22].toFixed()).toBe("0.01");
  expect(result.sourcePartI[16].toFixed()).toBe("0.01");
  expect(result.partI[2].toFixed()).toBe("101");
  expect(result.partI[3].toFixed()).toBe("100");
  expect(result.partI[4].toFixed()).toBe("0");
  expect(result.partI[16].toFixed()).toBe("0");
  expect(result.capitalLimitationRequired).toBe(true);
  expect(result.sourceSignedComputation.toFixed()).toBe("-80000");
  expect(result.netOperatingLoss.toFixed()).toBe("80000");
  expect(calculateForm172Origin(source("100.50", "100.49")).netOperatingLoss.toFixed()).toBe("80000");
  expect(JSON.stringify(input)).toBe(before);
});

it("retains exact source subtotals without inventing a rounding allocation", () => {
  const result = calculateForm172Origin(source("20000.49", "100.50"));
  expect(result.sourcePartI[5].toFixed()).toBe("19899.99");
  expect(result.sourcePartI[10].toFixed()).toBe("9149.99");
  expect(result.sourceSignedComputation.toFixed()).toBe("-70850.01");
  expect(result.partI[24].toFixed()).toBe("-70850");
  expect(result.netOperatingLoss.toFixed()).toBe("70850");
  expect(result.lines.find(row => row.line === "24")?.inputs?.["Exact signed computation"]).toEqual(d("-70850.01"));
  const personal = calculateForm172Origin(source("0", "0", { adjustedGrossIncome: d("0.49"),
    deductionAmount: d("15750.49"), nonbusinessDeductions: d("15750.49"), nonbusinessOrdinaryIncome: d("0.49") }));
  expect(personal.sourceSignedComputation.toFixed()).toBe("0");
  expect(personal.netOperatingLoss.toFixed()).toBe("0");
});

it("rounds the final loss magnitude without creating a loss from positive income", () => {
  for (const [amount, printed] of [["-10.49", "10"], ["-10.50", "11"], ["0.49", "0"]]) {
    const result = calculateForm172Origin(source("0", "0", { adjustedGrossIncome: d(amount),
      nonbusinessOrdinaryIncome: d("0") }));
    expect(result.sourceSignedComputation.toFixed()).toBe(d(amount).toFixed());
    expect(result.partI[24].toFixed()).toBe(d(printed).negated().toFixed());
    expect(result.netOperatingLoss.toFixed()).toBe(printed);
  }
});

it("rejects exact source differences even when printed totals agree", () => {
  expect(() => calculateForm172Origin(source("100.49", "100.50", { netCapitalGainOrLoss: d("0") }))).toThrow(/capital.*reconcile/i);
  expect(() => calculateForm172Origin(source("100.49", "100.50", { nonbusinessDeductions: d("NaN") }))).toThrow(/finite/i);
  expect(() => calculateForm172Origin(source("100.49", "100.50", { nonbusinessDeductions: d("-0.01") }))).toThrow(/nonnegative/i);
});
