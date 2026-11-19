// Specs: spec/federal/schedule-a.yaml; spec/federal/schedule-a-2026.yaml.
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function returnInput(
  taxYear: number,
  propertyTaxes: { taxYear?: number; propertyTax: string }[],
  realEstateTaxes: string,
) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    deductionElection: "automatic",
    form1098: propertyTaxes.map((statement, index) => ({
      ...statement,
      lender: `Synthetic Mortgage ${index + 1}`,
      mortgageInterestReceived: "0",
      outstandingMortgagePrincipal: "0",
    })),
    scheduleA: { realEstateTaxes },
  });
}

function scheduleALine(lines: CalculatedLine[], number: "5b" | "5e") {
  return lines.find(line => line.form === "Sched A" && line.line === number)?.value.toFixed();
}

describe("Schedule A Form 1098 property tax year", () => {
  it("holds positive property tax from other-year mortgage statements on the 2025 federal return", () => {
    for (const statement of [
      { taxYear: 2024, propertyTax: "0.01" },
      { taxYear: 2026, propertyTax: "40000.01" },
    ]) {
      const input = returnInput(2025, [{ taxYear: 2025, propertyTax: "20000" }, statement], "50.25");
      expect(() => calculateFederalTax(input)).toThrow(/Form 1098.*property tax.*year.*2025/i);
    }
  });

  it("adds matching and legacy undated mortgage amounts to separate tax payments on the 2025 federal return", () => {
    const input = returnInput(2025, [
      { taxYear: 2025, propertyTax: "20000.01" },
      { propertyTax: "1200.24" },
      { taxYear: 2024, propertyTax: "0.00" },
    ], "50.25");
    const result = calculateFederalTax(input);
    expect(result.deductionUsed).toBe("itemized");
    expect(scheduleALine(result.allLines, "5b")).toBe("21250.5");
    expect(scheduleALine(result.allLines, "5e")).toBe("21251");
  });

  it("holds positive property tax from other-year mortgage statements on the 2026 Schedule A worksheet", () => {
    for (const statement of [
      { taxYear: 2025, propertyTax: "0.01" },
      { taxYear: 2027, propertyTax: "40400.01" },
    ]) {
      const input = returnInput(2026, [statement], "40400");
      expect(() => calculateScheduleA(input, d("85000"), "single", FEDERAL_2026_CONSTANTS))
        .toThrow(/Form 1098.*property tax.*year.*2026/i);
    }
  });

  it("keeps matching and legacy undated mortgage amounts on the 2026 worksheet up to and beyond the SALT cap", () => {
    for (const [directTaxes, line5b, line5e] of [
      ["0.39", "40399.49", "40399"],
      ["0.9", "40400", "40400"],
      ["0.91", "40400.01", "40400"],
    ]) {
      const input = returnInput(2026, [
        { taxYear: 2026, propertyTax: "40000.01" },
        { propertyTax: "399.09" },
        { taxYear: 2025, propertyTax: "0.00" },
      ], directTaxes);
      const result = calculateScheduleA(input, d("85000"), "single", FEDERAL_2026_CONSTANTS);
      expect(scheduleALine(result.lines, "5b")).toBe(line5b);
      expect(scheduleALine(result.lines, "5e")).toBe(line5e);
    }
  });
});
