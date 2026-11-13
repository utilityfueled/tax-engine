import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Test only. The production 2026 federal entry point stays closed.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const move = {
  moveReference: "synthetic-move-1",
  accountHolder: "primary",
  domesticSameYearConfirmed: true,
  date: "2026-07-01",
  eligibility: { kind: "military", activeDuty: true, permanentChangeOfStationOrdered: true },
  lineAmountsConfirmed: true,
  transportationAndStorage: "12.37",
  travel: { transportationAndLodging: "0", vehicle: { method: "none" } },
};
const base = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 } };

describe("2026 moving expense draft federal integration", () => {
  it("routes 2026 deduction and excess through separate draft return lines", () => {
    const input = TaxYearInputSchema.parse({
      ...base, form3903: { taxYear: 2026, moves: [
        { ...move, reimbursementsExcludedFromIncome: "0" },
        { ...move, moveReference: "synthetic-move-2", date: "2026-08-01", reimbursementsExcludedFromIncome: "16.38" },
      ] },
    });
    const result = calculateFederalTax(input);
    expect(result.allLines.find(line => line.form === "1040" && line.line === "1a")?.value.toString()).toBe("85000");
    expect(result.allLines.find(line => line.form === "1040" && line.line === "1h")?.value.toString()).toBe("4.01");
    expect(result.schedule1.armedForcesMovingExpenses.toString()).toBe("12.37");
    expect(result.totalWages.toString()).toBe("85004.01");
    expect(result.agi.toString()).toBe("84991.64");
  });

  it("requires a separate allocation method for Form 2555 composition", () => {
    const input = TaxYearInputSchema.parse({
      ...base,
      form2555: { taxYear: 2026, foreignEarnedIncome: "4000", qualifyingDays: 365, totalDaysInYear: 365 },
      form3903: { taxYear: 2026, moves: [{ ...move, reimbursementsExcludedFromIncome: "0" }] },
    });
    expect(() => calculateFederalTax(input)).toThrow(/Form 3903.*Form 2555.*allocation/i);
  });

  it("binds a supplied Code P original and omitted excess to the typed annual return", () => {
    const w2s = [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", taxYear: 2026, box12CodeP: "12.37" }];
    const form3903 = { taxYear: 2026, moves: [{ ...move, reimbursementsExcludedFromIncome: "16.38", omittedTaxableExcess: "4.01" }] };
    const input = TaxYearInputSchema.parse({ ...base, w2s, form3903 });
    expect(input.w2s[0].box12CodeP).toBe("12.37");
    const calculated = calculateFederalTax(input);
    expect(calculated.allLines.find(line => line.form === "1040" && line.line === "1a")?.value.toString()).toBe("85000");
    expect(calculated.allLines.find(line => line.form === "1040" && line.line === "1h")?.value.toString()).toBe("4.01");
    expect(calculated.schedule1.armedForcesMovingExpenses.isZero()).toBe(true);
    expect(() => calculateFederalTax({ ...input, form3903: undefined })).toThrow(/Code P.*moving/iu);
    expect(() => calculateFederalTax({ ...input, w2s: [{ ...input.w2s[0], box12CodeP: "12.36" }] })).toThrow(/reconcile/iu);
    expect(() => calculateFederalTax({ ...input, w2s: [{ ...input.w2s[0], taxYear: 2025 }] })).toThrow(/2026/iu);
    expect(() => calculateFederalTax({ ...input, w2s: [{ ...input.w2s[0], accountHolder: "spouse" }] })).toThrow(/owner/iu);
    expect(() => calculateFederalTax({ ...input, w2s: [{ ...input.w2s[0], box12CodeP: undefined }] })).toThrow(/original/iu);
    const inconsistent = TaxYearInputSchema.parse({
      ...base, w2s, form3903: { taxYear: 2026, moves: [{ ...move, reimbursementsExcludedFromIncome: "16.38", omittedTaxableExcess: "4.00" }] },
    });
    expect(() => calculateFederalTax(inconsistent)).toThrow(/documented taxable moving excess.*reconcile/iu);
    const checkedZero = TaxYearInputSchema.parse({
      ...base, form3903: { taxYear: 2026, moves: [{ ...move, reimbursementsExcludedFromIncome: "12.37", omittedTaxableExcess: "0" }] },
    });
    expect(() => calculateFederalTax(checkedZero)).toThrow(/original Code P/iu);
  });
});
