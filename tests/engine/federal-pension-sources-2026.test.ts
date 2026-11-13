// Spec: spec/federal/form-1099-r.yaml. Test-only draft constants.
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

describe("2026 original pension source facts", () => {
  const pension = {
    payer: "Fictional pension", taxYear: 2026, accountHolder: "primary" as const,
    grossDistribution: "12000.12", distributionCode: "7", iraSepSimple: false,
    federalWithheld: "99.09",
  };
  function calculate(changes: Partial<NonNullable<TaxYearInput["form1099R"]>[number]>, year = 2026) {
    return calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
      form1099R: [{ ...pension, taxYear: year, ...changes }],
    });
  }

  it.each([
    {}, { employeeContributions: "2000.11" },
    { taxableAmount: "9000", taxableAmountNotDetermined: true },
    { distributionCode: "G" },
  ])("rejects a distribution without a determined taxable amount %j", (changes) => {
    expect(() => calculate(changes)).toThrow(/Box 2a or a complete/);
  });

  it.each([undefined, " ", "Z", "7G7", "76", "7H", "7P"])("requires the actual Box 7a code (%s)", (code) => {
    expect(() => calculate({ distributionCode: code, taxableAmount: "0" })).toThrow(/Box 7a/);
  });

  it("rejects a source explicitly from a different year", () => {
    expect(() => calculate({ taxYear: 2025, taxableAmount: "0" })).toThrow(/source year/);
  });

  it.each(["0", "9000.01"])("retains the known Code G taxable amount %s", (taxableAmount) => {
    const result = calculate({ distributionCode: "G", taxableAmount });
    expect(result.pensionDistributionsTaxable.eq(taxableAmount)).toBe(true);
    expect(result.pensionDistributionsGross.eq("12000.12")).toBe(true);
  });

  it.each(["6", "H", "4H", "4P", "7B"])("keeps the Code %s no-current-tax branch with withholding", (distributionCode) => {
    const result = calculate({ distributionCode, qualifiedRothDistribution: distributionCode === "7B" });
    expect(result.pensionDistributionsTaxable.isZero()).toBe(true);
    expect(result.form1099R?.federalWithholding.eq("99.09")).toBe(true);
  });

  it.each(["6", "4H", "7B"])("rejects taxable income reported against tax-free Code %s", (distributionCode) => {
    expect(() => calculate({ distributionCode, taxableAmount: "0.01", qualifiedRothDistribution: distributionCode === "7B" }))
      .toThrow(/contradictory facts/);
  });

  it.each(["", "-0.01", "12000.13"])("rejects an inconsistent pension taxable amount %s", (taxableAmount) => {
    expect(() => calculate({ taxableAmount })).toThrow(/valid Box 1 and Box 2a/);
  });

  it("uses the completed Simplified Method and requires an actual prior-recovery amount", () => {
    const worksheet = {
      taxableAmountNotDetermined: true, simplifiedMethodAnnuityStartingDate: "2026-01-01",
      simplifiedMethodCostInPlan: "24000", simplifiedMethodExpectedPayments: 240,
      simplifiedMethodPaymentsReceivedThisYear: 12,
    };
    expect(() => calculate(worksheet)).toThrow(/Box 2a or a complete/);
    expect(calculate({ ...worksheet, simplifiedMethodPriorYearRecovered: "0" }).pensionDistributionsTaxable.eq("10800.12")).toBe(true);
    expect(() => calculate({ ...worksheet, simplifiedMethodPriorYearRecovered: "0", simplifiedMethodCostInPlan: "-1" }))
      .toThrow(/Box 2a or a complete/);
    expect(() => calculate({ ...worksheet, simplifiedMethodPriorYearRecovered: "0", simplifiedMethodPaymentsReceivedThisYear: 1.5 }))
      .toThrow(/Box 2a or a complete/);
  });

  it("retains the historical calculation for a blank Box 2a with Box 5", () => {
    expect(calculate({ employeeContributions: "2000.11" }, 2025).pensionDistributionsTaxable.eq("10000.01")).toBe(true);
  });
});
