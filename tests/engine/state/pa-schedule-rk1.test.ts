/**
 * Tests for Pennsylvania PA-20S/PA-65 Schedule RK-1 / NRK-1 statement aggregation
 * Spec: spec/state/pa-schedule-rk1.yaml
 */

import { describe, expect, it } from "vitest";
import { calculatePAScheduleRK1, type PAScheduleRK1Input } from "@/engine/state/pa-schedule-rk1.js";

function makeInput(overrides: Partial<PAScheduleRK1Input> = {}): PAScheduleRK1Input {
  return {
    taxYear: 2025,
    statements: [],
    ...overrides,
  };
}

describe("Pennsylvania PA-20S/PA-65 Schedule RK-1 / NRK-1 statement aggregation", () => {
  it("PA Schedule RK-1/NRK-1 statement lines map to the supported Pennsylvania income classes", () => {
    const result = calculatePAScheduleRK1(makeInput({
      statements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          businessIncome: "12000",
          interestIncome: "300",
          dividendIncome: "200",
          netGainOrLoss: "900",
          netRentalIncome: "-1500",
          estateTrustIncome: "100",
          gamblingIncome: "50",
        },
        {
          entityName: "Beta Holdings LLC",
          entityEIN: "22-2222222",
          sourceDocument: "pa_nrk_1",
          businessIncome: "4000",
          interestIncome: "999",
          dividendIncome: "888",
          netGainOrLoss: "-250",
          netRentalIncome: "700",
          estateTrustIncome: "80",
          gamblingIncome: "25",
        },
      ],
    }));

    expect(result.statements[0]?.interestIncome.toNumber()).toBe(300);
    expect(result.statements[0]?.dividendIncome.toNumber()).toBe(200);
    expect(result.statements[1]?.interestIncome.toNumber()).toBe(0);
    expect(result.statements[1]?.dividendIncome.toNumber()).toBe(0);
    expect(result.statements[1]?.netGainOrLoss.toNumber()).toBe(-250);
    expect(result.lines.find((line) => line.line === "business-1")?.value.toNumber()).toBe(12000);
    expect(result.lines.find((line) => line.line === "interest-2")?.value.toNumber()).toBe(0);
  });

  it("PA Schedule RK-1/NRK-1 totals sum each Pennsylvania income class independently", () => {
    const result = calculatePAScheduleRK1(makeInput({
      statements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          businessIncome: "12000",
          interestIncome: "300",
          dividendIncome: "200",
          netGainOrLoss: "900",
          netRentalIncome: "-1500",
          estateTrustIncome: "100",
          gamblingIncome: "50",
        },
        {
          entityName: "Gamma Ventures Inc",
          entityEIN: "33-3333333",
          sourceDocument: "pa_rk_1",
          businessIncome: "-500",
          interestIncome: "25",
          dividendIncome: "0",
          netGainOrLoss: "1000",
          netRentalIncome: "250",
          estateTrustIncome: "0",
          gamblingIncome: "10",
        },
      ],
    }));

    expect(result.totalBusinessIncome.toNumber()).toBe(11500);
    expect(result.totalInterestIncome.toNumber()).toBe(325);
    expect(result.totalDividendIncome.toNumber()).toBe(200);
    expect(result.totalNetGainOrLoss.toNumber()).toBe(1900);
    expect(result.totalNetRentalIncome.toNumber()).toBe(-1250);
    expect(result.totalEstateTrustIncome.toNumber()).toBe(100);
    expect(result.totalGamblingIncome.toNumber()).toBe(60);
  });

  it("PA Schedule RK-1/NRK-1 withholding sums only positive NRK-1 withholding amounts", () => {
    const result = calculatePAScheduleRK1(makeInput({
      statements: [
        {
          entityName: "Alpha Partners LP",
          entityEIN: "11-1111111",
          sourceDocument: "pa_nrk_1",
          businessIncome: "12000",
          interestIncome: "0",
          dividendIncome: "0",
          netGainOrLoss: "900",
          netRentalIncome: "-1500",
          estateTrustIncome: "100",
          gamblingIncome: "50",
          nonresidentTaxWithheld: "307",
        },
        {
          entityName: "Beta Holdings LLC",
          entityEIN: "22-2222222",
          sourceDocument: "pa_rk_1",
          businessIncome: "4000",
          interestIncome: "300",
          dividendIncome: "200",
          netGainOrLoss: "0",
          netRentalIncome: "0",
          estateTrustIncome: "0",
          gamblingIncome: "0",
          nonresidentTaxWithheld: "999",
        },
        {
          entityName: "Gamma Ventures Inc",
          entityEIN: "33-3333333",
          sourceDocument: "pa_nrk_1",
          businessIncome: "1000",
          interestIncome: "0",
          dividendIncome: "0",
          netGainOrLoss: "0",
          netRentalIncome: "0",
          estateTrustIncome: "0",
          gamblingIncome: "0",
          nonresidentTaxWithheld: "-25",
        },
      ],
    }));

    expect(result.totalNonresidentTaxWithheld.toNumber()).toBe(307);
    expect(result.lines.find((line) => line.line === "withholding-1")?.value.toNumber()).toBe(307);
    expect(result.lines.find((line) => line.line === "withholding-2")?.value.toNumber()).toBe(0);
    expect(result.lines.find((line) => line.line === "withholding-3")?.value.toNumber()).toBe(0);
  });

  it("PA Schedule RK-1/NRK-1 totals are zero for an empty statement list", () => {
    const result = calculatePAScheduleRK1(makeInput());

    expect(result.totalBusinessIncome.toNumber()).toBe(0);
    expect(result.totalInterestIncome.toNumber()).toBe(0);
    expect(result.totalDividendIncome.toNumber()).toBe(0);
    expect(result.totalNetGainOrLoss.toNumber()).toBe(0);
    expect(result.totalNetRentalIncome.toNumber()).toBe(0);
    expect(result.totalEstateTrustIncome.toNumber()).toBe(0);
    expect(result.totalGamblingIncome.toNumber()).toBe(0);
    expect(result.totalNonresidentTaxWithheld.toNumber()).toBe(0);
  });

  it("PA Schedule RK-1/NRK-1 throws for unsupported tax year", () => {
    expect(() => calculatePAScheduleRK1(makeInput({ taxYear: 2023 })))
      .toThrow("PA Schedule RK-1 constants not available for tax year 2023");
  });
});
