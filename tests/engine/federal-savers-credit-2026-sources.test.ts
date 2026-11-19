/** Spec: spec/federal/form-8880-2026-sources.yaml. */
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8880 } from "@/engine/forms/form-8880.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { mixedCapitalServicesFixture } from "../fixtures/form-2555-mixed-capital-services.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year),
  };
});

const contributor = {
  qualifyingStudentMonths: 0,
  dependentDeductionAllowedToAnotherTaxpayer: false,
  testingPeriodDistributionReduction: "0",
};
const confirmed = {
  taxYear: 2026,
  testingPeriodComplete: true,
  primary: contributor,
  americanSamoaAgiRestoration: "0",
  puertoRicoAgiRestoration: "0",
};
const raw = {
  ...simpleW2Fixture,
  taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
  w2s: [{
    ...simpleW2Fixture.w2s[0],
    taxYear: 2026,
    wages: "39000",
    socialSecurityWages: "39000",
    socialSecurityWithheld: "2418",
    medicareWages: "39000",
    medicareWithheld: "565.50",
  }],
};

function tax(sources: unknown, contributions: Record<string, string> = { primaryElectiveDeferrals: "2000" }) {
  const input = TaxYearInputSchema.parse({ ...raw, form8880: { ...contributions, sourceFacts2026: sources } });
  return calculateFederalTax(input).form8880;
}

describe("Confirmed annual Form 8880 sources", () => {
  it("requires complete annual facts at schema and calculation boundaries", () => {
    for (const sourceFacts2026 of [
      undefined,
      { ...confirmed, taxYear: 2025 },
      { ...confirmed, testingPeriodComplete: false },
      { ...confirmed, primary: { ...contributor, testingPeriodDistributionReduction: undefined } },
      { ...confirmed, primary: { ...contributor, testingPeriodDistributionReduction: "-0.01" } },
      { ...confirmed, primary: { ...contributor, qualifyingStudentMonths: 13 } },
      { ...confirmed, puertoRicoAgiRestoration: undefined },
      { ...confirmed, spouse: contributor },
    ]) {
      const data = { ...raw, form8880: { primaryElectiveDeferrals: "2000", sourceFacts2026 } };
      expect(TaxYearInputSchema.safeParse(data).success).toBe(false);
      expect(() => calculateFederalTax(data as TaxYearInput)).toThrow(/Form 8880/);
    }
    expect(TaxYearInputSchema.safeParse({
      ...simpleW2Fixture, form8880: { primaryElectiveDeferrals: "2000", sourceFacts2026: confirmed },
    }).success).toBe(false);
    expect(TaxYearInputSchema.safeParse({
      ...simpleW2Fixture, form8880: { primaryElectiveDeferrals: "2000" },
    }).success).toBe(true);
    expect(tax(confirmed)?.line4a.toFixed()).toBe("0");
    const polluted = {
      ...raw, form8880: { sourceFacts2026: confirmed, primaryElectiveDeferrals: "2000", agi: "23000", taxYear: 2025 },
    };
    expect(TaxYearInputSchema.safeParse(polluted).success).toBe(false);
    expect(() => calculateFederalTax(polluted as TaxYearInput)).toThrow(/Form 8880/);
    const differentDependency = {
      ...raw,
      standardDeductionFacts: {
        ...raw.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "39000",
      },
      form8880: { sourceFacts2026: confirmed, primaryElectiveDeferrals: "2000" },
    };
    expect(TaxYearInputSchema.safeParse(differentDependency).success).toBe(false);
    expect(() => calculateFederalTax(differentDependency as TaxYearInput)).toThrow(/Form 8880.*dependency/);
    const straySpouse = { ...raw, form8880: { sourceFacts2026: confirmed, spouseIraContributions: "1" } };
    expect(TaxYearInputSchema.safeParse(straySpouse).success).toBe(false);
    expect(() => calculateFederalTax(straySpouse as TaxYearInput)).toThrow(/Form 8880 spouse/);
  });

  it("uses confirmed testing-period reductions and student months", () => {
    const primary = { ...contributor, testingPeriodDistributionReduction: "500.25", qualifyingStudentMonths: 4 };
    const eligible = tax({ ...confirmed, primary });
    expect(eligible?.line4a.toFixed()).toBe("500.25");
    expect(eligible?.line7.toFixed()).toBe("1499.75");
    expect(eligible?.line12.toFixed()).toBe("150");
    expect(tax({ ...confirmed, primary: { ...primary, qualifyingStudentMonths: 5 } })?.line12.toFixed()).toBe("0");
    const dependent = calculateFederalTax(TaxYearInputSchema.parse({
      ...raw,
      standardDeductionFacts: {
        ...raw.standardDeductionFacts, primaryCanBeClaimedAsDependent: true, dependentEarnedIncome: "39000",
      },
      form8880: {
        primaryElectiveDeferrals: "2000",
        sourceFacts2026: { ...confirmed, primary: { ...primary, dependentDeductionAllowedToAnotherTaxpayer: true } },
      },
    }));
    expect(dependent.form8880?.line12.toFixed()).toBe("0");
  });

  it("uses original W-2 deferrals only when the confirmed contribution is omitted", () => {
    const data = { ...raw, w2s: [{ ...raw.w2s[0], box12CodeD: "2500" }] };
    const form8880 = { sourceFacts2026: confirmed };
    const fromW2 = calculateFederalTax(TaxYearInputSchema.parse({ ...data, form8880 })).form8880;
    expect(fromW2?.line2a.toFixed()).toBe("2500");
    expect(fromW2?.line7.toFixed()).toBe("2000");
    const explicitZero = calculateFederalTax(TaxYearInputSchema.parse({
      ...data, form8880: { ...form8880, primaryElectiveDeferrals: "0" },
    })).form8880;
    expect(explicitZero?.line2a.toFixed()).toBe("0");
  });

  it("refuses W-2 fallback from the wrong year or ambiguous Code G", () => {
    for (const delta of [
      { taxYear: 2025, box12CodeD: "2000" },
      { taxYear: undefined, box12CodeD: "2000" },
      { box12CodeG: "2000" },
    ]) {
      const input = TaxYearInputSchema.parse({
        ...raw,
        w2s: [{ ...raw.w2s[0], ...delta }],
        form8880: { sourceFacts2026: confirmed },
      });
      expect(() => calculateFederalTax(input)).toThrow(/2026 W-2|Code G/);
    }
    const withActualEligibleTotal = calculateFederalTax(TaxYearInputSchema.parse({
      ...raw,
      w2s: [{ ...raw.w2s[0], box12CodeG: "2000" }],
      form8880: { sourceFacts2026: confirmed, primaryElectiveDeferrals: "700" },
    }));
    expect(withActualEligibleTotal.form8880?.line2a.toFixed()).toBe("700");
  });

  it.each([
    { territory: "American Samoa", source: "americanSamoaAgiRestoration" },
    { territory: "Puerto Rico", source: "puertoRicoAgiRestoration" },
  ])("holds the ordinary return for a positive $territory restoration", ({ source }) => {
    expect(() => tax({ ...confirmed, [source]: "500.25" })).toThrow(/territory income.*deduction allocation/i);
  });

  it("restores the statutory exclusions before selecting the credit rate", () => {
    const base = {
      taxYear: 2026,
      filingStatus: "single" as const,
      agi: "-5000",
      primaryDateOfBirth: "1990-01-15",
      primaryIsFullTimeStudent: false,
      primaryCanBeClaimedAsDependent: false,
      primaryRecentDistributions: "0",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    };
    const zeros = { foreignHousingDeduction: d("0"), americanSamoa: d("0"), puertoRico: d("0") };
    const restored = { ...zeros, foreignIncomeReduction: d("0"), americanSamoa: d("500.25"), puertoRico: d("749.75") };
    const atLimit = calculateForm8880({ ...base, agi: "39000", agiRestorations: restored });
    expect(atLimit.line8.toFixed()).toBe("40250");
    expect(atLimit.line12.toFixed()).toBe("200");
    const overLimit = calculateForm8880({ ...base, agi: "39000", agiRestorations: { ...restored, puertoRico: d("749.76") } });
    expect(overLimit.line8.toFixed()).toBe("40250.01");
    expect(overLimit.line12.toFixed()).toBe("0");
    expect(overLimit.lines.find(line => line.line === "8")?.formula).toContain("§25B(e)");

    const signedStartingAgi = calculateForm8880({
      ...base, agiRestorations: { ...zeros, foreignIncomeReduction: d("29250") },
    });
    expect(signedStartingAgi.line8.toFixed()).toBe("24250");
    expect(signedStartingAgi.line9.toFixed()).toBe("0.5");
    const reversedDeduction = calculateForm8880({
      ...base, agi: "500", agiRestorations: { ...zeros, foreignIncomeReduction: d("-1000") },
    });
    expect(reversedDeduction.line8.toFixed()).toBe("-500");

    // The documented service-income packet has line 43 of 10,000 and line 44 of 9,366.
    const actualForeign = calculateFederalTax(TaxYearInputSchema.parse({
      ...mixedCapitalServicesFixture(2026),
      form8880: { sourceFacts2026: confirmed },
      form2210: {
        calendarYearTaxpayer: true,
        residentReturn: true,
        disasterReliefClaimed: false,
        farmerOrFisher: false,
        waiverRequested: false,
        calculationMethod: "regular",
        withholdingMethod: "equal-installments",
        priorYearTaxStatus: "no-tax-liability",
        priorYearFullYear: true,
        priorYearResidentAllYear: true,
        priorYearTaxComputationConfirmed: true,
        priorYearTaxForForm2210: "0",
      },
    }));
    expect(actualForeign.form2555?.totalIncomeReduction.toFixed()).toBe("634");
    expect(actualForeign.form8880?.line8.minus(actualForeign.agi).toFixed()).toBe("634");
  });
});
