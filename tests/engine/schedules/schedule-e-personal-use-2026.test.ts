import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/public-federal-return.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// Exercise the calculation boundary without enabling the public 2026 rule pack.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function rentalInput(taxYear: 2025 | 2026, personalUseDays: number) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    rentalProperties: [{ description: "Synthetic dwelling", accountHolder: "primary", allInvestmentAtRisk: true,
      sourceFactsConfirmed: true, personalUseDays, rentalDays: 90, rents: "2000", insurance: "1000" }],
  });
}

describe("2026 Schedule E personal-use admission", () => {
  it("holds subthreshold personal use in the direct 2026 Schedule E", () => {
    // $1,000 shared insurance for 90 rental and 10 personal days has a $900
    // rental share. The canonical amounts cannot distinguish shared costs.
    expect(() => calculateScheduleE(rentalInput(2026, 10))).toThrow(/Schedule E.*personal use.*expense allocation.*280A/i);
  });

  it("holds subthreshold personal use in the whole 2026 federal calculation", () => {
    expect(() => calculateFederalTax(rentalInput(2026, 10))).toThrow(/Schedule E.*personal use.*expense allocation.*280A/i);
  });

  it("preserves ordinary 2026 and historical 2025 calculation behavior", () => {
    const ordinary = rentalInput(2026, 0);
    expect(calculateScheduleE(ordinary).rentalProperties[0].totalExpenses.toFixed(2)).toBe("1000.00");
    expect(calculateFederalTax(ordinary).scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1000.00");
    const legacy = rentalInput(2025, 10);
    expect(calculateScheduleE(legacy).rentalProperties[0].totalExpenses.toFixed(2)).toBe("1000.00");
    expect(calculateFederalTax(legacy).scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1000.00");
  });
});
