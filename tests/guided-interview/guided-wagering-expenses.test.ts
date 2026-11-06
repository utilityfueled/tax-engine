// Spec: spec/federal/guided-wagering-expenses.yaml
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildScheduleAInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { computeDeductionComparison, emptyDeductionData, validateSection, type DeductionData } from "@/lib/guided-interview-flow";
import { deductionFactErrors } from "@/lib/guided-required-facts";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { startCompleteInterview } from "./complete-facts";

const itemized = (fields: Partial<DeductionData> = {}): DeductionData => ({ ...emptyDeductionData, method: "itemized", ...fields });
const state = (deductions: DeductionData) => {
  const initial = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...initial, sectionData: { ...initial.sectionData, deductions } };
};

describe("guided wagering expenses", () => {
  it("preserves actual expenses zero unknown and the deduction election", () => {
    expect(buildScheduleAInput(itemized())).toBeUndefined();
    expect(buildScheduleAInput(itemized({ gamblingWinnings: "100", gamblingExpenses: "" }))).toEqual({ gamblingWinnings: "100" });
    expect(buildScheduleAInput(itemized({ gamblingWinnings: "0", gamblingExpenses: "0" }))).toEqual({ gamblingWinnings: "0", gamblingExpenses: "0" });
    expect(buildScheduleAInput(itemized({ gamblingWinnings: "9007199254740994.99", gamblingExpenses: "9007199254740993.01" }))).toEqual({ gamblingWinnings: "9007199254740994.99", gamblingExpenses: "9007199254740993.01" });
    const entered = itemized({ gamblingWinnings: "10", gamblingLosses: "5", gamblingExpenses: "0.10" });
    expect(buildTaxInputFromGuidedData(state(entered))?.scheduleA).toMatchObject({ gamblingWinnings: "10", gamblingLosses: "5", gamblingExpenses: "0.10" });
    expect(buildScheduleAInput({ ...entered, method: "standard" })).toEqual({ gamblingWinnings: "10" });
    expect(entered.gamblingExpenses).toBe("0.10");
  });

  it("validates and reconciles expenses before calculation", () => {
    for (const gamblingExpenses of ["-0.01", "NaN", "Infinity", "1x", "-"]) {
      const data = itemized({ gamblingWinnings: "100", gamblingExpenses });
      expect(deductionFactErrors(data)).toHaveProperty("gamblingExpenses");
      expect(validateSection(state(data), "deductions").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state(data))).toBeNull();
    }
    for (const gamblingExpenses of ["0", "10"]) {
      expect(deductionFactErrors(itemized({ gamblingExpenses }))).toHaveProperty("gamblingWinnings");
      expect(deductionFactErrors(itemized({ gamblingExpenses, gamblingWinnings: "0" }))).not.toHaveProperty("gamblingWinnings");
    }
    const exact = itemized({ investmentInterestExpense: "0.10", gamblingLosses: "0.20", gamblingExpenses: "0.30", gamblingWinnings: "1", otherItemized: "0.60" });
    expect(deductionFactErrors(exact)).not.toHaveProperty("otherItemized");
    expect(computeDeductionComparison("single", exact, 2025).itemizedTotal).toBe("0.6");
    expect(deductionFactErrors({ ...exact, otherItemized: "0.30" })).toHaveProperty("otherItemized");
    expect(computeDeductionComparison("single", itemized({ gamblingExpenses: "9007199254740993.01", gamblingLosses: "0.09", otherItemized: "9007199254740993.10" }), 2025).itemizedTotal).toBe("9007199254740993.1");
  });

  it("hands actual amounts to the distinct year methods", () => {
    const source = buildScheduleAInput(itemized({ gamblingWinnings: "1000", gamblingLosses: "900", gamblingExpenses: "100" }));
    if (!source) throw new Error("Missing supplied wagering source amounts");
    for (const [taxYear, expected] of [[2025, "1000"], [2026, "900"]] as const) {
      const input = TaxYearInputSchema.parse({ taxpayer: { taxYear, filingStatus: "single", primary: { firstName: "Source", lastName: "Example", ssn: "900-00-0001", dateOfBirth: "1980-01-01" }, address: { street: "1 Test", city: "Test", state: "TX", zip: "00000" } }, scheduleA: source });
      const facts = input.scheduleA;
      if (!facts || facts.gamblingWinnings === undefined || facts.gamblingLosses === undefined || facts.gamblingExpenses === undefined) throw new Error("Actual source amount was discarded");
      const result = calculateScheduleA(input, new Decimal("100000"), "single", taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025), { gamblingWinnings: new Decimal(facts.gamblingWinnings), gamblingLosses: new Decimal(facts.gamblingLosses), gamblingExpenses: new Decimal(facts.gamblingExpenses) });
      expect(result.gamblingLossDeduction.toFixed()).toBe(expected);
    }
  });
});
