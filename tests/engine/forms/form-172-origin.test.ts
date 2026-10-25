// Spec: spec/federal/form-172-origin.yaml, all Part I lines.
import { expect, it } from "vitest";
import { calculateForm172Origin, type Form172OriginInput } from "@/engine/forms/form-172-origin.js";
import { d } from "@/utils/decimal.js";

function source(patch: Partial<Form172OriginInput> = {}): Form172OriginInput {
  return { taxYear: 2025, filingStatus: "single", adjustedGrossIncome: d("0"), deductionAmount: d("15750"),
    nonbusinessCapitalLosses: d("0"), nonbusinessCapitalGains: d("0"), nonbusinessDeductions: d("15750"),
    nonbusinessOrdinaryIncome: d("0"), businessCapitalLosses: d("0"), businessCapitalGains: d("0"),
    netCapitalGainOrLoss: d("0"), section1202Exclusion: d("0"), otherYearNolDeduction: d("0"), ...patch };
}

it("reproduces the published historical 1775 origin loss", () => {
  // Publication 536 (2023), page 6: its actual historical standard deduction
  // and classified amounts are supplied; no current-year constants are reused.
  const input = source({ taxYear: 2023, adjustedGrossIncome: d("-2350"), deductionAmount: d("13850"),
    nonbusinessCapitalLosses: d("1000"), nonbusinessDeductions: d("13850"), nonbusinessOrdinaryIncome: d("425"),
    businessCapitalGains: d("2000"), netCapitalGainOrLoss: d("1000") });
  const before = JSON.stringify(input);
  const result = calculateForm172Origin(input);
  expect(Object.values(result.partI).map(value => value.toFixed())).toEqual([
    "-16200", "1000", "0", "1000", "0", "13850", "425", "425", "13425", "0", "0", "2000",
    "2000", "0", "1000", "0", "0", "0", "0", "0", "0", "1000", "0", "-1775",
  ]);
  expect(result.netOperatingLoss.toFixed()).toBe("1775");
  expect(result.lines.some(line => line.line === "16")).toBe(false);
  expect(result.lines.filter(line => line.line === "24")).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
});

it("limits business capital losses after nonbusiness deductions", () => {
  for (const filingStatus of ["single", "married_filing_separately"] as const) {
    const result = calculateForm172Origin(source({ filingStatus,
      adjustedGrossIncome: d(filingStatus === "single" ? "-10000" : "-8500"),
      nonbusinessCapitalLosses: d("5000"), nonbusinessCapitalGains: d("7000"), nonbusinessOrdinaryIncome: d("500"),
      businessCapitalLosses: d("9000"), businessCapitalGains: d("500"), netCapitalGainOrLoss: d("-6500") }));
    expect(result.partI[9].toFixed()).toBe("13250");
    expect(result.partI[15].toFixed()).toBe("8500");
    expect(result.partI[19].toFixed()).toBe(filingStatus === "single" ? "3000" : "1500");
    expect(result.partI[22].toFixed()).toBe(filingStatus === "single" ? "5000" : "3500");
    expect(result.netOperatingLoss.toFixed()).toBe("7500");
  }
  const surplus = calculateForm172Origin(source({ adjustedGrossIncome: d("-3000"), deductionAmount: d("2000"),
    nonbusinessCapitalGains: d("7000"), nonbusinessDeductions: d("2000"), nonbusinessOrdinaryIncome: d("8000"),
    businessCapitalLosses: d("10000"), businessCapitalGains: d("500"), netCapitalGainOrLoss: d("-2500") }));
  expect(surplus.partI[10].toFixed()).toBe("7000");
  expect(surplus.partI[14].toFixed()).toBe("2500");
  expect(surplus.netOperatingLoss.toFixed()).toBe("2500");
});

it("does not turn a standard deduction or an older loss into a new loss", () => {
  const standard = calculateForm172Origin(source({ adjustedGrossIncome: d("1000") }));
  expect(standard.signedComputation.toFixed()).toBe("1000");
  expect(standard.netOperatingLoss.toFixed()).toBe("0");
  expect(standard.partI[24].toFixed()).toBe("0");
  const oldLoss = calculateForm172Origin(source({ adjustedGrossIncome: d("-20000"), otherYearNolDeduction: d("30000") }));
  expect(oldLoss.signedComputation.toFixed()).toBe("10000");
  expect(oldLoss.netOperatingLoss.toFixed()).toBe("0");
  const current = calculateForm172Origin(source({ adjustedGrossIncome: d("-40000"), otherYearNolDeduction: d("30000") }));
  expect(current.netOperatingLoss.toFixed()).toBe("10000");
  const large = calculateForm172Origin(source({ adjustedGrossIncome: d("-9007199254740993") }));
  expect(large.netOperatingLoss.toFixed()).toBe("9007199254740993");
});

it("requires conserved canonical amounts and explicit classification", () => {
  expect(() => calculateForm172Origin(source({ nonbusinessCapitalGains: d("1") }))).toThrow(/capital.*reconcile/i);
  expect(() => calculateForm172Origin(source({ nonbusinessDeductions: d("NaN") }))).toThrow(/finite/i);
  expect(() => calculateForm172Origin(source({ deductionAmount: d("-1") }))).toThrow(/nonnegative/i);
  expect(() => calculateForm172Origin(source({ deductionAmount: d("Infinity") }))).toThrow(/finite/i);
  expect(() => calculateForm172Origin(source({ nonbusinessOrdinaryIncome: undefined as never }))).toThrow(/actual|finite/i);
  expect(() => calculateForm172Origin(source({ taxYear: 2027 }))).toThrow(/year/i);
  expect(() => calculateForm172Origin(source({ section1202Exclusion: d("500"),
    nonbusinessCapitalGains: d("1000"), nonbusinessCapitalLosses: d("700"), netCapitalGainOrLoss: d("-200") })))
    .toThrow(/1202.*source|source.*1202/i);
});
