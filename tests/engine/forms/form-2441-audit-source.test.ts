// Spec: spec/federal/form-2441.yaml lines 4-11; official 2025 form page 1.
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2441, type Form2441Input } from "@/engine/forms/form-2441.js";

const d = (value: string) => new Decimal(value);
const source = (overrides: Partial<Form2441Input> = {}): Form2441Input => ({
  taxYear: 2025, filingStatus: "married_filing_jointly", careExpenses: d("6000"), qualifyingIndividuals: 2,
  earnedIncome: d("30000"), spouseEarnedIncome: d("2000"), agi: d("19000"),
  eligibilityConfirmed: true, excludedDependentCareBenefits: d("0"), earnedIncomeFactsVerified: true,
  priorYearExpenseCredit: d("40.25"), taxLiabilityLimit: d("123"), ...overrides,
});

describe("Form2441 source audit", () => {
  it("care audit preserves separate earned incomes and tentative credit", () => {
    const result = calculateForm2441(source());
    const values = Object.fromEntries(result.lines.map(line => [line.line, line.value.toString()]));
    // Independently: 33% of min(6000,30000,2000)=660; plus prior40=700; tax limit123.
    expect(values).toMatchObject({ "3": "6000", "4": "30000", "5": "2000", "6": "2000", "7": "19000",
      "8": "0.33", "9a": "660", "9b": "40", "9c": "700", "10": "123", "11": "123" });
    expect(result.credit.toString()).toBe("123");
    expect(result.earnedIncomeFactsVerified).toBe(true);
  });

  it("care prior-year amount preserves unknown and exact zero", () => {
    const unknown = calculateForm2441(source({ priorYearExpenseCredit: undefined, earnedIncomeFactsVerified: undefined }));
    expect(unknown.lines.some(line => ["9b", "9c"].includes(line.line))).toBe(false);
    expect(unknown.earnedIncomeFactsVerified).toBe(false);
    const known = calculateForm2441(source({ priorYearExpenseCredit: d("0") }));
    expect(known.lines.find(line => line.line === "9b")?.value.toString()).toBe("0");
    expect(() => calculateForm2441(source({ taxYear: 2026, priorYearExpenseCredit: undefined }))).toThrow(/prior-year/i);
    for (const value of ["-1", "NaN", "Infinity"]) expect(() => calculateForm2441(source({ priorYearExpenseCredit: d(value) }))).toThrow(/prior-year/i);
  });

  it("care signed income stays on the actual source lines while line6 floors at zero", () => {
    const result = calculateForm2441(source({ earnedIncome: d("-0.75"), spouseEarnedIncome: d("100"), agi: d("-10"), priorYearExpenseCredit: d("0") }));
    const values = Object.fromEntries(result.lines.map(line => [line.line, line.value.toString()]));
    expect(values).toMatchObject({ "4": "-0.75", "5": "100", "6": "0", "7": "-10", "9a": "0", "11": "0" });
  });
});
