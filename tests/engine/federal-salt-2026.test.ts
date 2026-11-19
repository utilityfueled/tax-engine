// Spec: spec/federal/schedule-a.yaml, 5e-territory-sources-2026 and 5e-territory-conflicts-2026
import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

import { calculateFederalTax, parseInput } from "@/index.js";
import { calculateTaxableRefundWorksheet } from "@/engine/forms/taxable-refund-worksheet.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const base = {
  ...simpleW2Fixture,
  taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "505000" }],
  deductionElection: "itemized",
  scheduleA: { realEstateTaxes: "50000" },
  schedule1A: {
    sourceTaxYear: 2026, sourceReference: "Synthetic completed Schedule 1-A source records",
    sourceFactsConfirmed: true, allSourcesIncluded: true, primarySsnEligible: true,
    excludedPuertoRicoIncome: "0", form4563Exclusion: "0",
    employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: [],
  },
  form2210: {
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
    waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
    priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true, priorYearResidentAllYear: true,
    priorYearTaxForForm2210: "0", priorYearTaxComputationConfirmed: true,
  },
};

const territorySources = [
  { territory: "Puerto Rico", source: "excludedPuertoRicoIncome", alias: "excludedPuertoRicoIncome" },
  { territory: "American Samoa", source: "form4563Exclusion", alias: "form4563ExcludedIncome" },
] as const;

const otherTerritorySources = [
  { source: "Social Security", facts: (amount: string) => ({
    formSSA1099: [{ netBenefits: "1000" }],
    socialSecurityFacts: { sourceFactsConfirmed: true, puertoRicoIncomeExclusion: amount, americanSamoaIncomeExclusion: "0" },
  }) },
  { source: "student loan interest", facts: (amount: string) => ({
    studentLoanInterestFacts: { sourceTaxYear: 2026, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
      puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: amount, loans: [] },
  }) },
  { source: "Form 8815", facts: (amount: string) => ({
    form1099Int: [{ payer: "Treasury", interestIncome: "100", usSavingsBondInterest: "2000" }],
    savingsBondRedemptions: [{ sourceId: "synthetic-bond", proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01",
      redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true,
      faceValue: "16000", priorYearInterestReported: "0" }],
    form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true,
      priorYearInterestIncludedInCurrentStatements: "0", americanSamoaIncomeExclusion: amount, puertoRicoIncomeExclusion: "0",
      royaltyInterestAdjustment: "0", educationExpenses: [] },
  }) },
  { source: "Schedule 8812 Puerto Rico", facts: (amount: string) => ({
    childTaxCredit: { puertoRicoExcludedIncome: amount, form4563ExcludedIncome: "0" },
  }) },
  { source: "Schedule 8812 Form 4563", facts: (amount: string) => ({
    childTaxCredit: { puertoRicoExcludedIncome: "0", form4563ExcludedIncome: amount },
  }) },
  { source: "Schedule 8812 total", facts: (amount: string) => ({
    childTaxCredit: { possessionIncomeExclusion: amount },
  }) },
  { source: "Form 8863", facts: (amount: string) => ({
    educationExpenses: { possessionIncomeExclusion: amount, aocStudents: [], llcExpenses: "0" },
  }) },
  { source: "Form 8839", facts: (amount: string) => ({
    form8839: { eligibilityConfirmed: true, possessionIncomeExclusion: amount, children: [{
      sourceFactsComplete: true, childName: "Sam Example", childFirstName: "Sam", childLastName: "Example", childBirthYear: 2020,
      childIdentifyingNumber: "345-67-8901", childPermanentlyDisabled: false, isSpecialNeeds: false, isForeignAdoption: false,
      adoptionBecameFinal: true, adoptionFinalizedYear: 2026, expensesByYear: [], qualifiedExpenses: "0",
      employerBenefits: "0", priorYearCreditsClaimed: "0", priorYearExclusionsClaimed: "0",
    }] },
  }) },
  { source: "Form 8936", facts: (amount: string) => ({
    form8936: { agiAdjustmentsConfirmed: true, possessionIncomeExclusion: amount },
  }) },
  ...["americanSamoaAgiRestoration", "puertoRicoAgiRestoration"].map(restoration => ({
    source: `Form 8880 signed ${restoration}`,
    facts: (amount: string) => ({
      form8880: { primaryElectiveDeferrals: "2000", sourceFacts2026: {
        taxYear: 2026, testingPeriodComplete: true,
        primary: { qualifyingStudentMonths: 0, dependentDeductionAllowedToAnotherTaxpayer: false, testingPeriodDistributionReduction: "0" },
        americanSamoaAgiRestoration: "0", puertoRicoAgiRestoration: "0",
        [restoration]: amount === "0" ? "0" : `-${amount}`,
      } },
    }),
  })),
];

describe("2026 federal SALT territory addbacks", () => {
  it.each(territorySources)("holds the $territory return until its actual deduction allocation is supported", ({ source, alias }) => {
    const scheduleA = { realEstateTaxes: "12000" };
    const raw = { ...base, scheduleA, schedule1A: { ...base.schedule1A, [source]: "100000" } };
    for (const deductionElection of ["itemized", "standard", "nonitemized", "automatic", undefined]) {
      const omitted = parseInput({ ...raw, deductionElection });
      const equal = parseInput({ ...raw, deductionElection, scheduleA: { ...scheduleA, [alias]: "100000.00" } });
      expect(omitted.scheduleA?.[alias]).toBeUndefined();
      expect(equal.scheduleA?.[alias]).toBe("100000.00");
      expect(() => calculateFederalTax(omitted)).toThrow(/territory income.*deduction allocation/i);
      expect(() => calculateFederalTax(equal)).toThrow(/territory income.*deduction allocation/i);
    }
    const standaloneAlias = parseInput({ ...raw, schedule1A: undefined, scheduleA: { ...scheduleA, [alias]: "100000" } });
    expect(() => calculateFederalTax(standaloneAlias)).toThrow(/territory income.*deduction allocation/i);
  });

  it.each(territorySources)("rejects the entered $territory alias when it contradicts the confirmed exclusion", ({ source, alias }) => {
    const differentReports = [
      { canonical: "100000", entered: "0" },
      { canonical: "0", entered: "100000" },
      { canonical: "100000", entered: "-100000" },
    ];
    for (const { canonical, entered } of differentReports) {
      const input = parseInput({ ...base, schedule1A: { ...base.schedule1A, [source]: canonical },
        scheduleA: { ...base.scheduleA, [alias]: entered } });
      expect(input.scheduleA?.[alias]).toBe(entered);
      expect(() => calculateFederalTax(input)).toThrow(/Schedule A.*exclusion.*Schedule 1-A/i);
    }
  });

  it("accepts matching confirmed zeros for both territory exclusions", () => {
    const scheduleA = { ...base.scheduleA, excludedPuertoRicoIncome: "0", form4563ExcludedIncome: "0" };
    const input = parseInput({ ...base, scheduleA });
    expect(calculateFederalTax(input).scheduleA?.saltDeduction.toFixed()).toBe("40400");
    expect(calculateFederalTax(parseInput(base))).toEqual(calculateFederalTax(input));

    const withoutPacket = parseInput({ ...base, schedule1A: undefined, scheduleA, deductionElection: "standard" });
    const withoutAliases = parseInput({ ...base, schedule1A: undefined, deductionElection: "standard" });
    expect(calculateFederalTax(withoutPacket).deductionAmount.toFixed()).toBe("16100");
    expect(calculateFederalTax(withoutPacket)).toEqual(calculateFederalTax(withoutAliases));
  });

  it.each(otherTerritorySources)("holds a 2026 return when $source discloses a territory exclusion", ({ facts }) => {
    const raw = { ...base, schedule1A: undefined, taxpayer: { ...base.taxpayer,
      primary: { ...base.taxpayer.primary, dateOfBirth: "1980-01-01" } } };
    const zero = parseInput({ ...raw, ...facts("0") });
    const excluded = parseInput({ ...raw, ...facts("100000") });
    expect(calculateFederalTax(zero).scheduleA?.saltDeduction.gt(0)).toBe(true);
    expect(() => calculateFederalTax(excluded)).toThrow(/territory income.*deduction allocation/i);
  });

  it.each(territorySources)("prevents a negative standalone $territory alias from reducing SALT MAGI", ({ alias }) => {
    const raw = { ...base, schedule1A: undefined, w2s: [{ ...base.w2s[0], wages: "605000" }] };
    const zero = parseInput({ ...raw, scheduleA: { ...raw.scheduleA, [alias]: "0" } });
    const negative = parseInput({ ...raw, scheduleA: { ...raw.scheduleA, [alias]: "-100000" } });
    expect(calculateFederalTax(zero).scheduleA?.saltDeduction.toFixed()).toBe("10400");
    expect(() => calculateFederalTax(negative)).toThrow(/territory income.*deduction allocation/i);
  });

  it("accepts a separately confirmed prior-year Form 8936 possession exclusion", () => {
    const input = parseInput({ ...base, form8936: {
      priorYearAgi: "300000", priorYearFilingStatus: "single", priorYearAgiAdjustmentsConfirmed: true,
      priorYearPossessionIncomeExclusion: "100000",
    } });
    const result = calculateFederalTax(input);
    expect(result.scheduleA?.saltDeduction.toFixed()).toBe("40400");
    expect(result.form8936?.lines.find(line => line.line === "4")?.value.toFixed()).toBe("400000");
  });

  it.each([{ sourceFactsConfirmed: false }, { sourceTaxYear: 2025 }])("requires a complete and same-year Schedule 1-A packet: %j", (unverified) => {
    const input = parseInput({ ...base, schedule1A: { ...base.schedule1A, excludedPuertoRicoIncome: "100000", ...unverified } });
    expect(() => calculateFederalTax(input)).toThrow(/complete confirmed sources for this return year/i);
  });

  it("keeps the 2025 Schedule A alias path and the independent historical refund replay", () => {
    const prior = { ...base, taxpayer: { ...base.taxpayer, taxYear: 2025 },
      schedule1A: { ...base.schedule1A, sourceTaxYear: 2025, excludedPuertoRicoIncome: "100000" } };
    expect(calculateFederalTax(parseInput(prior)).scheduleA?.saltDeduction.toFixed()).toBe("38500");
    expect(calculateFederalTax(parseInput({ ...prior, scheduleA: { ...prior.scheduleA, excludedPuertoRicoIncome: "100000" } }))
      .scheduleA?.saltDeduction.toFixed()).toBe("10000");

    const refund = calculateTaxableRefundWorksheet([{ stateLocalIncomeTaxRefund: "40000", refundExpenseTaxYear: 2026 }], {
      priorTaxYear: 2026, priorYearItemized: true, priorYearFilingStatus: "single", priorYearStateLocalTaxElection: "income",
      priorYearItemizedTotal: "60000", priorYearStandardDeduction: "16100", priorYearStateLocalTaxesPaid: "50000",
      priorYearPropertyTaxesPaid: "0", priorYearSaltMagi: "605000",
    }, 2027);
    expect(refund.taxableRefund.toFixed()).toBe("400");
  });
});
