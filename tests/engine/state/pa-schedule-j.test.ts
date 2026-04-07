/**
 * Tests for Pennsylvania Schedule J — Income from Estates or Trusts
 * Spec: spec/state/pa-schedule-j.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateScheduleJ, type ScheduleJInput } from "@/engine/state/pa-schedule-j.js";

function makeInput(overrides: Partial<ScheduleJInput> = {}): ScheduleJInput {
  return {
    taxYear: 2025,
    statements: [],
    ...overrides,
  };
}

describe("Pennsylvania Schedule J — Income from Estates or Trusts", () => {
  it("PA Schedule J Column (c) - positive beneficiary income is included and negative income is disregarded", () => {
    const result = calculateScheduleJ(makeInput({
      statements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          incomeAmount: "1500",
        },
        {
          estateOrTrustName: "Beta Estate",
          federalEIN: "22-2222222",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "500",
        },
        {
          estateOrTrustName: "Gamma Trust",
          federalEIN: "33-3333333",
          sourceDocument: "federal_1041_k1",
          incomeAmount: "-250",
        },
      ],
    }));

    expect(result.statements).toHaveLength(3);
    expect(result.statements[0]?.taxableIncome.toNumber()).toBe(1500);
    expect(result.statements[1]?.taxableIncome.toNumber()).toBe(500);
    expect(result.statements[2]?.taxableIncome.toNumber()).toBe(0);
    expect(result.lines.find((line) => line.line === "c-1")?.value.toNumber()).toBe(1500);
    expect(result.lines.find((line) => line.line === "c-3")?.value.toNumber()).toBe(0);
  });

  it("PA Schedule J Total - sums positive beneficiary income and carries it to PA-40 Line 7", () => {
    const result = calculateScheduleJ(makeInput({
      statements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          incomeAmount: "1500",
        },
        {
          estateOrTrustName: "Decedent Estate",
          federalEIN: "22-2222222",
          sourceDocument: "federal_1041_k1",
          incomeAmount: "2500",
        },
      ],
    }));

    expect(result.totalEstateTrustIncome.toNumber()).toBe(4000);
    expect(result.lines.find((line) => line.line === "total")?.value.toNumber()).toBe(4000);
  });

  it("PA Schedule J withholding - sums only positive PA-41 NRK-1 withholding amounts", () => {
    const result = calculateScheduleJ(makeInput({
      statements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "1500",
          nonresidentTaxWithheld: "125",
        },
        {
          estateOrTrustName: "Beta Resident Trust",
          federalEIN: "22-2222222",
          sourceDocument: "pa_rk_1",
          incomeAmount: "900",
          nonresidentTaxWithheld: "999",
        },
        {
          estateOrTrustName: "Gamma Federal Trust",
          federalEIN: "33-3333333",
          sourceDocument: "federal_1041_k1",
          incomeAmount: "700",
          nonresidentTaxWithheld: "50",
        },
        {
          estateOrTrustName: "Delta NRK-1 Loss Trust",
          federalEIN: "44-4444444",
          sourceDocument: "pa_nrk_1",
          incomeAmount: "300",
          nonresidentTaxWithheld: "-20",
        },
      ],
    }));

    expect(result.totalNonresidentTaxWithheld.toNumber()).toBe(125);
    expect(result.lines.find((line) => line.line === "withholding-total")?.value.toNumber()).toBe(125);
  });

  it("PA Schedule J Total - empty statement list yields zero", () => {
    const result = calculateScheduleJ(makeInput());

    expect(result.totalEstateTrustIncome.toNumber()).toBe(0);
    expect(result.totalNonresidentTaxWithheld.toNumber()).toBe(0);
    expect(result.statements).toHaveLength(0);
  });

  it("PA Schedule J - 2024 tax year uses the same beneficiary-income rules", () => {
    const result = calculateScheduleJ(makeInput({
      taxYear: 2024,
      statements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          incomeAmount: "999",
        },
      ],
    }));

    expect(result.totalEstateTrustIncome.toNumber()).toBe(999);
  });

  it("PA Schedule J - throws for unsupported tax year", () => {
    expect(() => calculateScheduleJ(makeInput({ taxYear: 2023 })))
      .toThrow("PA Schedule J constants not available for tax year 2023");
  });

  it("PA Schedule J - audit trail records Schedule J lines", () => {
    const result = calculateScheduleJ(makeInput({
      statements: [
        {
          estateOrTrustName: "Alpha Family Trust",
          federalEIN: "11-1111111",
          sourceDocument: "pa_rk_1",
          incomeAmount: "1500",
        },
      ],
    }));

    expect(result.lines.every((line) => line.form === "PA-Schedule-J")).toBe(true);
  });
});
