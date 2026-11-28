// Spec: spec/federal/form-1099-r.yaml. Test-only draft constants.
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { Form1099RSchema, TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
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

  it.each(["Q", "G", "N", "R", "1P"])("preserves separately identified Code %s with no current taxable amount", (distributionCode) => {
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
    taxableAmountNotDetermined: false, federalWithheld: "99.09",
  };
  function pensionInput(changes: Partial<NonNullable<TaxYearInput["form1099R"]>[number]>, year = 2026) {
    return {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
      form1099R: [{ ...pension, taxYear: year, ...changes }],
    };
  }

  function calculate(changes: Partial<NonNullable<TaxYearInput["form1099R"]>[number]>, year = 2026) {
    return calculateFederalTax(pensionInput(changes, year));
  }

  const originalPension = { ...pension, payerTin: "12-3456789", accountReference: "Fictional plan 1", taxableAmount: "9000.01" };

  it("holds same-account copies before summing pension income and federal withholding", () => {
    const input = pensionInput(originalPension);
    const single = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(single.pensionDistributionsTaxable.toFixed(2)).toBe("9000.01");
    expect(single.form1099R?.federalWithholding.toFixed(2)).toBe("99.09");
    for (const other of [originalPension, {
      ...originalPension, payer: "Former fictional plan name", payerTin: "123456789", accountReference: "Fictional  plan 1",
      grossDistribution: "12000.120", federalWithheld: "99.090", taxableAmount: "9000.010", stateWithheld: "21.00",
    }]) {
      const duplicated = TaxYearInputSchema.parse({ ...input, form1099R: [originalPension, other] });
      expect(() => calculateFederalTax(duplicated)).toThrow(/reconcile indistinguishable Form 1099-R originals/i);
    }
  });

  it("preserves reporting distinctions between absent and explicit original boxes", () => {
    const input = pensionInput(originalPension);
    for (const explicitBoxes of [{ trumpAccount: false }, { excessContributionEarnings: "0" }]) {
      const form1099R = [originalPension, { ...originalPension, ...explicitBoxes }];
      const result = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form1099R }));
      expect(result.pensionDistributionsTaxable.toFixed(2)).toBe("18000.02");
      expect(result.form1099R?.federalWithholding.toFixed(2)).toBe("198.18");
    }
  });

  it("preserves different pension originals and historical aggregation", () => {
    const input = pensionInput(originalPension);
    const fromSeparateAccount = { ...originalPension, accountReference: "Fictional plan 2" };
    const differentOriginal = { ...originalPension, grossDistribution: "12100.12" };
    for (const form1099R of [[originalPension, fromSeparateAccount], [originalPension, differentOriginal]]) {
      const result = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form1099R }));
      expect(result.pensionDistributionsTaxable.toFixed(2)).toBe("18000.02");
      expect(result.form1099R?.federalWithholding.toFixed(2)).toBe("198.18");
    }
    const joint = calculateFederalTax(TaxYearInputSchema.parse({ ...input,
      taxpayer: { ...input.taxpayer, filingStatus: "married_filing_jointly",
        spouse: { ...input.taxpayer.primary, firstName: "Alex", ssn: "321-54-9876" } },
      w2s: input.w2s.map(w2 => ({ ...w2, accountHolder: "primary" })),
      form1099R: [originalPension, { ...originalPension, accountHolder: "spouse" }],
    }));
    expect(joint.pensionDistributionsTaxable.toFixed(2)).toBe("18000.02");
    const historical = pensionInput({}, 2025);
    const original2025 = { ...originalPension, taxYear: 2025 };
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...historical, form1099R: [original2025, original2025] }));
    expect(result.pensionDistributionsTaxable.toFixed(2)).toBe("18000.02");
  });

  it("holds unknown ordinary pension checkbox facts before or after parsing", () => {
    for (const unknown of [
      { taxableAmountNotDetermined: undefined },
      { iraSepSimple: undefined },
      { iraSepSimple: undefined, taxableAmountNotDetermined: undefined },
    ]) {
      const input = pensionInput({ taxableAmount: "9000.01", ...unknown });
      expect(() => calculateFederalTax(input)).toThrow(/confirmed unchecked.*Box 2b.*Box 7b/i);
      const restored = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
      expect(() => calculateFederalTax(restored)).toThrow(/confirmed unchecked.*Box 2b.*Box 7b/i);
    }
  });

  it("keeps confirmed ordinary pension amounts and historical omitted checkboxes", () => {
    for (const taxableAmount of ["0", "9000.01"]) {
      const result = calculateFederalTax(TaxYearInputSchema.parse(pensionInput({ taxableAmount })));
      expect(result.pensionDistributionsTaxable.eq(taxableAmount)).toBe(true);
      expect(result.form1099R?.federalWithholding.eq("99.09")).toBe(true);
      const historical = pensionInput({ taxableAmount, iraSepSimple: undefined, taxableAmountNotDetermined: undefined }, 2025);
      expect(calculateFederalTax(TaxYearInputSchema.parse(historical)).pensionDistributionsTaxable.eq(taxableAmount)).toBe(true);
    }
  });

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

  it.each(["37", "73", " 3 b "])("rejects a Code 3 pairing the IRS does not permit (%s)", (distributionCode) => {
    const input = TaxYearInputSchema.parse(pensionInput({ distributionCode, taxableAmount: "4200" }));
    expect(() => calculateFederalTax(input)).toThrow(/Box 7a.*Code 3.*Code D/);
  });

  it.each(["3D", "D3", " 3 d "])("preserves the allowed Code 3 and D pair (%s)", (distributionCode) => {
    const result = calculate({ distributionCode, taxableAmount: "4200" });
    expect(result.pensionDistributionsTaxable.eq("4200")).toBe(true);
    expect(result.form1099R?.federalWithholding.eq("99.09")).toBe(true);
  });

  it.each(["3D", "D3"])("rejects a Code 3 and D pair with a checked IRA box (%s)", (distributionCode) => {
    const source = Form1099RSchema.parse({ ...pension, taxableAmount: "4200", distributionCode, iraSepSimple: true });
    expect(() => calculateForm1099R([source], { taxYear: 2026 })).toThrow(/Box 7a.*Box 7b/);
  });

  it("validates a dated Code 3 pairing in direct aggregation without requiring a return year", () => {
    const source = Form1099RSchema.parse({ ...pension, taxableAmount: "4200", distributionCode: "37" });
    expect(() => calculateForm1099R([source])).toThrow(/Box 7a.*Code 3.*Code D/);
    expect(calculateForm1099R([{ ...source, taxYear: 2025 }]).pensionTaxable.eq("4200")).toBe(true);
  });

  it("rejects a source explicitly from a different year", () => {
    expect(() => calculate({ taxYear: 2025, taxableAmount: "0" })).toThrow(/source year/);
  });

  it.each(["0", "9000.01"])("retains the known Code G taxable amount %s", (taxableAmount) => {
    const result = calculate({ distributionCode: "G", taxableAmount });
    expect(result.pensionDistributionsTaxable.eq(taxableAmount)).toBe(true);
    expect(result.pensionDistributionsGross.eq("12000.12")).toBe(true);
  });

  it.each(["H", " 4 h ", "H4"])("rejects a checked IRA box on a dated Code H rollover (%s)", (distributionCode) => {
    const source = Form1099RSchema.parse({ ...pension, distributionCode, iraSepSimple: true, taxableAmount: "0" });
    expect(() => calculateForm1099R([source])).toThrow(/Code H.*Box 7b/);
    expect(() => calculateForm1099R([source], { taxYear: 2026 })).toThrow(/Code H.*Box 7b/);
    const valid = calculateForm1099R([{ ...source, iraSepSimple: false }], { taxYear: 2026 });
    expect(valid.iraGrossReported.isZero()).toBe(true);
    expect(valid.pensionGrossReported.eq("12000.12")).toBe(true);
    expect(valid.pensionTaxable.isZero()).toBe(true);
  });

  it.each(["H7", "BH"])("rejects an invalid dated Code H pair regardless of Box 7b (%s)", (distributionCode) => {
    for (const iraSepSimple of [true, false]) {
      const source = Form1099RSchema.parse({ ...pension, distributionCode, iraSepSimple, taxableAmount: "0" });
      expect.soft(() => calculateForm1099R([source])).toThrow(/Box 7a.*Code H.*Code 4/);
      expect.soft(() => calculateForm1099R([source], { taxYear: 2026 })).toThrow(/Box 7a.*Code H.*Code 4/);
    }
  });

  it("keeps the undated legacy Code H interpretation", () => {
    const source = Form1099RSchema.parse({ ...pension, taxYear: undefined, distributionCode: "H", iraSepSimple: true, taxableAmount: "0" });
    const historical = calculateForm1099R([source]);
    expect(historical.iraGrossReported.eq("12000.12")).toBe(true);
    expect(historical.iraTaxable.isZero()).toBe(true);
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
    it("holds a lump-sum ordinary election with unknown Box 2b", () => {
      const input = pensionInput({ distributionCode: "7A", qualifiedLumpSumReporting: "ordinary_pension",
        taxableAmount: "9000.01", taxableAmountNotDetermined: undefined });
      expect(() => calculateFederalTax(input)).toThrow(/Code A.*confirmed unchecked Box 2b/);
      const restored = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
      expect(() => calculateFederalTax(restored)).toThrow(/Code A.*confirmed unchecked Box 2b/);
    });
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
