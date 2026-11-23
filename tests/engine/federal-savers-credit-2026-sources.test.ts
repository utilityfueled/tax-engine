/** Spec: spec/federal/form-8880-2026-sources.yaml. */
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8880, mergeW2RetirementContributionsIntoForm8880Input } from "@/engine/forms/form-8880.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { priorYearOrdinaryIraDistribution, twoPriorYearOrdinaryIraDistributions } from "../fixtures/form-8880-prior-ira.js";
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
  it.each([2024, 2025] as const)("derives line 4 from one matched %i issuer payment without changing return income", taxYear => {
    const prior = priorYearOrdinaryIraDistribution("500.25", taxYear);
    const input = TaxYearInputSchema.parse({
      ...raw,
      taxpayer: { ...raw.taxpayer, primary: { ...raw.taxpayer.primary, dateOfBirth: "1965-06-30" } },
      form8880: {
        primaryIraContributions: "2000",
        primaryElectiveDeferrals: "0",
        sourceFacts2026: {
          ...confirmed,
          primary: { ...contributor, testingPeriodDistributionReduction: "500.250" },
          priorYearOrdinaryIraDistribution: prior,
        },
      },
    });
    const replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(replay.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistribution).toEqual(prior);
    expect(replay.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistributions).toBeUndefined();
    expect(replay.form1099R ?? []).toEqual([]);
    const result = calculateFederalTax(replay);
    expect(result.iraDistributionsGross.toFixed()).toBe("0");
    expect(result.agi.toFixed()).toBe("39000");
    expect(result.form8880?.line4a.toFixed()).toBe("500.25");
    expect(result.form8880?.line5a.toFixed()).toBe("1499.75");
    expect(result.form8880?.line12.toFixed()).toBe("150");
    expect(result.schedule3?.retirementSavingsCredit.toFixed()).toBe("150");
  });

  it("sums matched 2024 and 2025 issuer payments without changing return income", () => {
    const prior = twoPriorYearOrdinaryIraDistributions();
    const input = TaxYearInputSchema.parse({
      ...raw,
      taxpayer: { ...raw.taxpayer, primary: { ...raw.taxpayer.primary, dateOfBirth: "1965-06-30" } },
      form8880: { primaryIraContributions: "2000", sourceFacts2026: {
        ...confirmed,
        primary: { ...contributor, testingPeriodDistributionReduction: "500.750" },
        priorYearOrdinaryIraDistributions: prior,
      } },
    });
    const replay = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(replay.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistributions).toEqual(prior);
    expect(replay.form1099R).toBeUndefined();
    const result = calculateFederalTax(replay);
    expect(result.iraDistributionsGross.toFixed()).toBe("0");
    expect(result.agi.toFixed()).toBe("39000");
    expect(result.form8880?.line4a.toFixed()).toBe("500.75");
    expect(result.form8880?.line5a.toFixed()).toBe("1499.25");
    expect(result.schedule3?.retirementSavingsCredit.toFixed()).toBe("150");
  });

  it("holds incomplete, duplicate and conflicting two-payment packets", () => {
    const pair = twoPriorYearOrdinaryIraDistributions();
    const [first, second] = pair.payments;
    const taxpayer = { ...raw.taxpayer, primary: { ...raw.taxpayer.primary, dateOfBirth: "1965-06-30" } };
    const positive = { ...confirmed, primary: { ...contributor, testingPeriodDistributionReduction: "500.75" }, priorYearOrdinaryIraDistributions: pair };
    const input = { ...raw, taxpayer, form8880: { primaryIraContributions: "2000", sourceFacts2026: positive } };
    const withPair = (change: object) => ({ ...input, form8880: { ...input.form8880, sourceFacts2026: {
      ...positive, priorYearOrdinaryIraDistributions: { ...pair, ...change },
    } } });
    for (const incompatible of [
      withPair({ payments: [first] }),
      withPair({ payments: [first, second, second] }),
      withPair({ payments: [first, { ...second, original: { ...second.original, taxYear: 2024 }, issuerPayment: { ...second.issuerPayment, receivedDate: "2024-12-31" } }] }),
      withPair({ payments: [first, { ...second, issuerPayment: { ...second.issuerPayment, receivedDate: "2024-12-31" } }] }),
      withPair({ payments: [first, { ...second, issuerPayment: { ...second.issuerPayment, sourceReference: ` ${first.original.sourceReference.toLowerCase()} ` } }] }),
      withPair({ payments: [first, { ...second, original: { ...second.original, distributionCode: "G" } }] }),
      withPair({ payments: [first, { ...second, noLine4ExclusionConfirmed: false }] }),
      withPair({ onlyIncludiblePaymentsForTestingPeriodConfirmed: undefined }),
      { ...input, taxpayer: { ...taxpayer, primary: { ...taxpayer.primary, dateOfBirth: "1966-06-30" } } },
      { ...input, form1099R: [{ payer: "Current issuer", taxYear: 2026, grossDistribution: "1" }] },
      { ...input, form8880: { ...input.form8880, sourceFacts2026: { ...positive, priorYearOrdinaryIraDistribution: priorYearOrdinaryIraDistribution("500.75") } } },
      { ...input, form8880: { ...input.form8880, sourceFacts2026: { ...positive, primary: { ...positive.primary, testingPeriodDistributionReduction: "500.74" } } } },
    ]) {
      expect(TaxYearInputSchema.safeParse(incompatible).success).toBe(false);
      expect(() => calculateFederalTax(incompatible as TaxYearInput)).toThrow(/Form 8880/i);
    }
  });

  it("holds conflicting historical originals at the request and calculation boundaries", () => {
    const prior = priorYearOrdinaryIraDistribution();
    const taxpayer = { ...raw.taxpayer, primary: { ...raw.taxpayer.primary, dateOfBirth: "1966-06-30" } };
    const positive = {
      ...confirmed,
      primary: { ...contributor, testingPeriodDistributionReduction: "500" },
      priorYearOrdinaryIraDistribution: prior,
    };
    const input = { ...raw, taxpayer, form8880: { primaryIraContributions: "2000", sourceFacts2026: positive } };
    const withOriginal = (change: object) => ({
      ...input, form8880: { ...input.form8880, sourceFacts2026: {
        ...positive, priorYearOrdinaryIraDistribution: { ...prior, ...change },
      } },
    });
    for (const incompatible of [
      withOriginal({ original: { ...prior.original, taxYear: 2024 } }),
      withOriginal({ original: { ...prior.original, taxYear: 2023 }, issuerPayment: { ...prior.issuerPayment, receivedDate: "2023-12-31" } }),
      withOriginal({ original: { ...prior.original, taxYear: 2026 }, issuerPayment: { ...prior.issuerPayment, receivedDate: "2026-01-01" } }),
      withOriginal({ original: { ...prior.original, accountHolder: "spouse" } }),
      withOriginal({ original: { ...prior.original, recipientTaxIdLast4: "1234" } }),
      withOriginal({ original: { ...prior.original, accountType: "roth-ira" } }),
      withOriginal({ original: { ...prior.original, distributionCode: "G" } }),
      withOriginal({ original: { ...prior.original, taxableAmountNotDetermined: true } }),
      withOriginal({ original: { ...prior.original, taxableAmount: "499.99" } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, payerTin: "12-3456789" } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, accountReference: "another account" } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, sourceReference: ` ${prior.original.sourceReference.toLowerCase()} ` } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, receivedDate: "2024-12-31" } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, receivedDate: "2026-01-01" } }),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, receivedDate: "2025-02-29" } }),
      withOriginal(priorYearOrdinaryIraDistribution("500", 2024)),
      withOriginal({ issuerPayment: { ...prior.issuerPayment, amount: "499.99" } }),
      withOriginal({ statementReportsThisSinglePaymentConfirmed: false }),
      withOriginal({ noLine4ExclusionConfirmed: false }),
      withOriginal({ onlyIncludiblePaymentForTestingPeriodConfirmed: false }),
      withOriginal({ onlyIncludiblePaymentForTestingPeriodConfirmed: undefined }),
      withOriginal({ issuerPayments: [prior.issuerPayment, prior.issuerPayment] }),
      { ...input, taxpayer: { ...taxpayer, primary: { ...taxpayer.primary, dateOfBirth: "1966-07-01" } } },
      { ...input, taxpayer: { ...taxpayer, filingStatus: "head_of_household" } },
      { ...input, form1099R: [{ payer: "Current issuer", taxYear: 2026, grossDistribution: "500" }] },
      { ...input, form8880: { ...input.form8880, sourceFacts2026: {
        ...positive, primary: { ...positive.primary, testingPeriodDistributionReduction: "499.99" },
      } } },
    ]) {
      expect(TaxYearInputSchema.safeParse(incompatible).success).toBe(false);
      expect(() => calculateFederalTax(incompatible as TaxYearInput)).toThrow(/Form 8880/i);
    }
  });

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
    for (const { source, worksheetError, federalError } of [
      {
        source: { taxYear: 2025, box12CodeD: "2000" },
        worksheetError: /requires an original 2026 W-2/,
        federalError: /Form W-2 source year 2025 must match the 2026 return/,
      },
      {
        source: { taxYear: undefined, box12CodeD: "2000" },
        worksheetError: /requires an original 2026 W-2/,
      },
      {
        source: { box12CodeG: "2000" },
        worksheetError: /confirmed eligible contribution total.*Code G/,
      },
    ]) {
      const input = TaxYearInputSchema.parse({
        ...raw,
        w2s: [{ ...raw.w2s[0], ...source }],
        form8880: { sourceFacts2026: confirmed },
      });
      expect(() => mergeW2RetirementContributionsIntoForm8880Input(
        input.form8880, input.w2s, input.taxpayer.filingStatus, input.taxpayer.taxYear,
      )).toThrow(worksheetError);
      expect(() => calculateFederalTax(input)).toThrow(federalError ?? worksheetError);
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
