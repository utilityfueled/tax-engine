// Spec: spec/federal/form-1099-r.yaml. Test-only draft constants.
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { ordinaryIraBasisFixture } from "../fixtures/ira-basis.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

describe("2026 ordinary IRA owner facts", () => {
  type Retirement = NonNullable<TaxYearInput["form1099R"]>[number] & { iraBasisConfirmedZero?: boolean };
  const source = {
    payer: "Fictional IRA trustee", accountHolder: "primary" as const, taxYear: 2026,
    grossDistribution: "12000.12", iraSepSimple: true, distributionCode: "7",
    trumpAccount: false, excessContributionEarnings: "0", taxableAmountNotDetermined: true,
  };
  function calculate(changes: Partial<Retirement> = {}, year = 2026) {
    return calculateFederalTax({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
      form1099R: [{ ...source, taxYear: year, ...changes }],
    });
  }

  it.each([
    {}, { taxableAmount: "12000.12" }, { taxableAmount: "0", taxableAmountNotDetermined: false },
    { taxableAmount: "12000.12", taxableAmountNotDetermined: false, iraBasisConfirmedZero: false },
    { distributionCode: "S", iraSepSimple: false },
  ])("requires affirmative applicable basis evidence %j", (changes) => {
    expect(() => calculate(changes)).toThrow(/zero nondeductible IRA basis/);
  });

  it.each([undefined, "12000.12"])("uses exact fully taxable gross for confirmed zero basis with printed amount %s", (taxableAmount) => {
    const result = calculate({ iraBasisConfirmedZero: true, taxableAmount });
    expect(result.iraDistributionsTaxable.eq("12000.12")).toBe(true);
  });

  it.each([
    [{ taxYear: undefined }, /source year/],
    [{ taxYear: 2025 }, /source year/],
    [{ distributionCode: undefined }, /Box 7a/],
    [{ iraBasisConfirmedZero: true, taxableAmount: "12000.11" }, /Box 2a/],
    [{ iraBasisConfirmedZero: true, employeeContributions: "0.01" }, /basis/],
    [{ iraBasisConfirmedZero: true, accountHolder: undefined }, /owner/],
    [{ iraBasisConfirmedZero: true, accountHolder: "spouse" }, /owner/],
    [{ iraBasisConfirmedZero: true, trumpAccount: undefined }, /Box 7c/],
    [{ iraBasisConfirmedZero: true, trumpAccount: true }, /Trump account/],
    [{ iraBasisConfirmedZero: true, excessContributionEarnings: undefined }, /Box 7d/],
    [{ iraBasisConfirmedZero: true, excessContributionEarnings: "0.01" }, /Box 7d/],
  ] as const)("rejects missing or conflicting original facts %j", (changes, error) => {
    expect(() => calculate(changes)).toThrow(error);
  });

  it("takes taxable amounts from the validated, separately bound owner worksheets", () => {
    const input = ordinaryIraBasisFixture();
    input.taxpayer.taxYear = 2026;
    input.w2s = input.w2s.map(w2 => ({ ...w2, accountHolder: "primary" as const }));
    input.iraBasisSources.taxYear = 2026;
    for (const owner of input.iraBasisSources.owners) for (const account of owner.accounts) account.taxYear = 2026;
    for (const distribution of input.iraBasisSources.distributions) distribution.taxYear = 2026;
    input.form1099R = input.form1099R.map((form) => ({
      ...form, taxYear: 2026, trumpAccount: false, excessContributionEarnings: "0",
    }));
    expect(calculateFederalTax(input).iraDistributionsTaxable.eq("2268")).toBe(true);

    input.form1099R.push({ ...input.form1099R[0], iraSepSimple: false, distributionCode: "S" });
    expect(() => calculateFederalTax(input)).toThrow(/every original IRA distribution/);
    input.form1099R.pop();

    input.iraBasisSources.distributions[0].grossDistribution = "1001.50";
    expect(() => calculateFederalTax(input)).toThrow(/original distribution/);
  });

  it.each(["Q", "G", "Y7", "N", "R", "1P"])("preserves separately identified Code %s with no current taxable amount", (distributionCode) => {
    const result = calculate({ distributionCode });
    expect(result.iraDistributionsTaxable.isZero()).toBe(true);
  });

  it("retains the historical ordinary IRA fallback", () => {
    expect(calculate({}, 2025).iraDistributionsTaxable.eq("12000.12")).toBe(true);
  });
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

  describe("2026 qualified lump-sum reporting decision", () => {
    const ordinaryLumpSum = { distributionCode: "7A", qualifiedLumpSumReporting: "ordinary_pension" as const };

    it("requires current-year non-IRA original evidence for the ordinary decision", () => {
      const entry = { ...ordinaryLumpSum, taxableAmount: "9000.01" };
      expect(() => calculate({ ...entry, taxYear: undefined })).toThrow(/Code A.*source year/);
      expect(() => calculate({ ...entry, iraSepSimple: undefined })).toThrow(/Code A.*non-IRA/);
      expect(calculate({ ...entry, taxYear: undefined }, 2025).pensionDistributionsTaxable.eq("9000.01")).toBe(true);
    });

    it("holds an unknown lump-sum Box 2a even with periodic pension worksheet inputs", () => {
      const worksheet = {
        simplifiedMethodAnnuityStartingDate: "2026-01-01", simplifiedMethodCostInPlan: "24000",
        simplifiedMethodExpectedPayments: 240, simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
      };
      expect(() => calculate({ ...ordinaryLumpSum, ...worksheet })).toThrow(/Code A.*determined Box 2a/);
      expect(() => calculate({ ...ordinaryLumpSum, ...worksheet, taxableAmount: "0", taxableAmountNotDetermined: true }))
        .toThrow(/Code A.*determined Box 2a/);
      expect(() => calculate({ ...ordinaryLumpSum, grossDistribution: "0" })).toThrow(/Code A.*determined Box 2a/);
      const result = calculate({ ...ordinaryLumpSum, ...worksheet, taxableAmount: "0", taxableAmountNotDetermined: false });
      expect(result.pensionDistributionsTaxable.isZero()).toBe(true);
      expect(result.form1099R?.federalWithholding.eq("99.09")).toBe(true);
    });

    it("requires reconciliation of a retained lump-sum choice on a non-Code A statement", () => {
      const entry = { ...ordinaryLumpSum, distributionCode: "7", taxableAmount: "9000.01" };
      expect(() => calculate(entry)).toThrow(/reporting decision.*requires Code A/);
    });

    it("reports included Box 3 only once when the ordinary method is chosen", () => {
      const entry = { distributionCode: "7A", taxableAmount: "9000.01", qualifiedLumpSumReporting: "ordinary_pension" as const,
        capitalGainIncluded: "2000.02", taxableAmountNotDetermined: false };
      const result = calculate(entry);
      expect(result.pensionDistributionsTaxable.toFixed(2)).toBe("9000.01");
      expect(result.form1099R?.federalWithholding.toFixed(2)).toBe("99.09");
      for (const change of [{ capitalGainIncluded: "9000.02" }, { capitalGainIncluded: "-0.01" }, { capitalGainIncluded: "" },
        { capitalGainIncluded: "invalid" }, { taxableAmount: undefined }, { taxableAmountNotDetermined: true }]) {
        expect(() => calculate({ ...entry, ...change })).toThrow(/Box 3.*Box 2a/u);
      }
      expect(() => calculate({ ...entry, distributionCode: "F", qualifiedLumpSumReporting: undefined }))
        .toThrow(/Box 3.*separate method/u);
    });
    it.each(["4A", "A4", "7A", "A7"])("requires the reporting decision for Code %s before using Box 2a", (distributionCode) => {
      const entry = { distributionCode, taxableAmount: "9000.01" };
      expect(() => calculate(entry)).toThrow(/reporting decision/);
      const electForm4972 = { ...entry, qualifiedLumpSumReporting: "form_4972" as const };
      expect(() => calculate(electForm4972)).toThrow(/Form 4972 election/);
      const reportOrdinary = { ...entry, qualifiedLumpSumReporting: "ordinary_pension" as const };
      expect(calculate(reportOrdinary).pensionDistributionsTaxable.eq("9000.01")).toBe(true);
    });
    it.each(["A", "1A", "PA", "AG"])("rejects an incompatible Code A combination %s", (distributionCode) => {
      const reportOrdinary = { distributionCode, taxableAmount: "9000.01", qualifiedLumpSumReporting: "ordinary_pension" as const };
      expect(() => calculate(reportOrdinary)).toThrow(/Box 7a code combination/);
    });
    it("rejects a Code A record classified as an IRA", () => {
      expect(() => calculate({ distributionCode: "7A", iraSepSimple: true })).toThrow(/non-IRA qualified plan/);
    });
  });
});
