/**
 * Tests for Form 8889 HSA contribution deduction.
 * Spec: spec/federal/form-8889.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm8889, mergeW2Box12CodeWIntoForm8889Input } from "@/engine/forms/form-8889.js";
import { Form8889Schema, TaxYearInputSchema } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const constants = getConstants(2025);

describe("Form 8889 HSA contribution deduction", () => {
  const fullYearSelfOnly = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "4300",
  }, constants);

  const proratedFamilyMedicare = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1969-06-15",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: [
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
    ],
    medicareMonths: [7, 8, 9, 10, 11, 12],
    contributionsMade: "6000",
  }, constants);

  const archerLimited = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: [
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
    ],
    contributionsMade: "2000",
    archerMSAContributions: "3000",
  }, constants);

  const marriedFamilyAllocation = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("family"),
    contributionsMade: "5000",
    bothSpousesHaveHsas: true,
    spouseAllocatedLimit: "4275",
    employerContributions: "1200",
    qualifiedFundingDistribution: "300",
  }, constants);

  const w2SupportedEmployerContributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "4300",
    supportedW2EmployerContributions: "500",
  }, constants);

  const marriedFamilyAutomaticAllocation = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("family"),
    contributionsMade: "5000",
    bothSpousesHaveHsas: true,
  } as Parameters<typeof calculateForm8889>[1], constants);

  const marriedMixedCoverageCatchUp = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: [
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
    ],
    contributionsMade: "7000",
  }, constants);

  const marriedMixedCoverageAutomaticAllocation = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: [
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
    ],
    contributionsMade: "7000",
    bothSpousesHaveHsas: true,
  } as Parameters<typeof calculateForm8889>[1], constants);

  const spouseFamilyCoverageMonths = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    spouseFamilyCoverageMonths: [1, 2, 3, 4, 5, 6],
    contributionsMade: "7000",
    bothSpousesHaveHsas: true,
  } as Parameters<typeof calculateForm8889>[1], constants);

  const spouseFamilyLastMonthRule = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    spouseFamilyCoverageMonths: [12],
    contributionsMade: "6000",
    bothSpousesHaveHsas: true,
  } as Parameters<typeof calculateForm8889>[1], constants);

  const ignoredSpouseAllocationOverride = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("family"),
    contributionsMade: "5000",
    spouseAllocatedLimit: "1000",
  } as Parameters<typeof calculateForm8889>[1], constants);

  const taxableDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    excludedDistributions: "500",
    qualifiedMedicalExpenses: "1500",
    distributionsNotSubjectToAdditionalTax: "200",
  }, constants);

  const automaticExceptionOnlyScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "500",
    supported1099SAAutomaticExceptionDistributions: "1200",
  }, constants);

  const manualPlusAutomaticExceptionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "500",
    distributionsNotSubjectToAdditionalTax: "200",
    supported1099SAAutomaticExceptionDistributions: "1200",
  }, constants);

  const excludedDistributionOverflow = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "1500",
    excludedDistributions: "2000",
  }, constants);

  const medicalExpenseOverflow = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "1200",
    qualifiedMedicalExpenses: "1800",
  }, constants);

  const prohibitedTransactionDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1800",
    prohibitedTransactionDistributions: "2400",
  }, constants);

  const rolloverAndReturnedExcessDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    rolloverDistributions: "900",
    supported1099SAReturnedExcessContributions: "400",
    qualifiedMedicalExpenses: "600",
  }, constants);

  const testingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "7000",
    lastMonthRuleRedeterminedLimit: "4300",
    recaptureQualifiedFundingDistribution: "1500",
  }, constants);

  const excusedTestingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "7000",
    lastMonthRuleRedeterminedLimit: "4300",
    recaptureQualifiedFundingDistribution: "1500",
    testingPeriodFailureDueToDeathOrDisability: true,
  }, constants);

  const automaticRedeterminedLimitTestingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "4150",
    priorYearRedeterminedLimitWorksheet: {
      coverageByMonth: [
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "self_only",
        "self_only",
        "self_only",
      ],
      selfOnlyContributionLimit: "4150",
      familyContributionLimit: "8300",
      catchUpContribution: "1000",
    },
  } as Parameters<typeof calculateForm8889>[1], constants);

  const automaticSpouseAllocatedRedeterminedLimitTestingPeriodFailure = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "5150",
    priorYearRedeterminedLimitWorksheet: {
      filingStatus: "married_filing_jointly",
      coverageByMonth: [
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "family",
        "family",
        "family",
        "family",
        "family",
        "family",
      ],
      bothSpousesHaveHsas: true,
      selfOnlyContributionLimit: "4150",
      familyContributionLimit: "8300",
      catchUpContribution: "1000",
    },
  } as Parameters<typeof calculateForm8889>[1], constants);

  const missingRedeterminedLimitSupportTestingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "4150",
  }, constants);

  const filingStatusChangeRedeterminedLimitTestingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "5150",
    priorYearRedeterminedLimitWorksheet: {
      filingStatus: "married_filing_jointly",
      coverageByMonth: [
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "family",
        "family",
        "family",
        "family",
        "family",
        "family",
      ],
      bothSpousesHaveHsas: true,
      selfOnlyContributionLimit: "4150",
      familyContributionLimit: "8300",
      catchUpContribution: "1000",
    },
  } as Parameters<typeof calculateForm8889>[1], constants);

  const manualOverrideWithSupportedWorksheetTestingPeriodFailure = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    lastMonthRuleContributions: "4150",
    lastMonthRuleRedeterminedLimit: "1200",
    priorYearRedeterminedLimitWorksheet: {
      coverageByMonth: [
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "none",
        "self_only",
        "self_only",
        "self_only",
      ],
      selfOnlyContributionLimit: "4150",
      familyContributionLimit: "8300",
      catchUpContribution: "1000",
    },
  } as Parameters<typeof calculateForm8889>[1], constants);

  const age65FullYearDistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1959-12-31",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
  }, constants);

  const turns65MidYearDistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1960-07-01",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
  }, constants);

  const turns65MidYearWithValidatedPostAge65DistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1960-07-01",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
    distributionsAfterAge65: "1200",
  }, constants);

  const spouseOwnedAge65FullYearDistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1959-12-31",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1988-01-15",
    },
  }, {
    accountOwner: "spouse",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
  }, constants);

  const spouseOwnedTurns65MidYearDistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1960-07-01",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1988-01-15",
    },
  }, {
    accountOwner: "spouse",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
  }, constants);

  const spouseOwnedTurns65MidYearWithValidatedPostAge65DistributionScenario = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1960-07-01",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1988-01-15",
    },
  }, {
    accountOwner: "spouse",
    coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "0",
    distributionsReceived: "3000",
    qualifiedMedicalExpenses: "1000",
    distributionsAfterAge65: "1500",
  }, constants);

  const lastMonthRuleSelfOnly = calculateForm8889(simpleW2Fixture.taxpayer, {
    accountOwner: "primary",
    coverageByMonth: [
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "self_only",
      "self_only",
      "self_only",
      "self_only",
    ],
    contributionsMade: "4300",
  }, constants);

  const lastMonthRuleFamilyCatchUp = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1978-09-12",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1968-02-20",
    },
  }, {
    accountOwner: "primary",
    coverageByMonth: [
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
      "family",
      "family",
      "family",
      "family",
      "family",
      "family",
    ],
    contributionsMade: "9550",
  }, constants);

  const spouseOwnedFamilyCatchUp = calculateForm8889({
    ...simpleW2Fixture.taxpayer,
    filingStatus: "married_filing_jointly",
    spouse: {
      firstName: "Pat",
      lastName: "Example",
      ssn: "987-65-4321",
      dateOfBirth: "1968-03-18",
    },
    primary: {
      ...simpleW2Fixture.taxpayer.primary,
      dateOfBirth: "1988-01-15",
    },
  }, {
    accountOwner: "spouse",
    coverageByMonth: Array(12).fill("family"),
    contributionsMade: "9550",
  }, constants);

  it("Form 8889 Line 1 - coverage type reflects the eligible HDHP coverage reported for the year", () => {
    expect(fullYearSelfOnly.coverageType).toBe("self_only");
    expect(marriedFamilyAllocation.coverageType).toBe("family");
    expect(spouseFamilyCoverageMonths.coverageType).toBe("family");
    expect(spouseFamilyLastMonthRule.coverageType).toBe("family");
  });

  it("Form 8889 Line 2 - after-tax contributions populate the deductible contribution amount", () => {
    expect(fullYearSelfOnly.line2.toNumber()).toBe(4300);
  });

  it("Form 8889 Line 3 - monthly eligibility prorates the annual contribution limit", () => {
    expect(proratedFamilyMedicare.line3.toNumber()).toBe(4775);
    expect(marriedMixedCoverageCatchUp.line3.toNumber()).toBe(6425);
    expect(spouseFamilyCoverageMonths.line3.toNumber()).toBe(6425);
    expect(lastMonthRuleSelfOnly.line3.toNumber()).toBe(4300);
    expect(lastMonthRuleFamilyCatchUp.line3.toNumber()).toBe(8550);
    expect(spouseFamilyLastMonthRule.line3.toNumber()).toBe(8550);
  });

  it("Form 8889 Line 4 - Archer MSA contributions reduce the HSA contribution ceiling", () => {
    expect(archerLimited.line4.toNumber()).toBe(3000);
  });

  it("Form 8889 Line 5 - Archer MSA contributions cannot reduce the limit below zero", () => {
    expect(archerLimited.line5.toNumber()).toBe(0);
  });

  it("Form 8889 Line 6 - direct spouse allocation override replaces the default contribution limit", () => {
    expect(marriedFamilyAllocation.line6.toNumber()).toBe(4275);
  });

  it("Form 8889 Line 6 - default spouse allocation splits only the family-coverage portion when both spouses have HSAs", () => {
    expect(marriedFamilyAutomaticAllocation.line6.toNumber()).toBe(4275);
    expect(marriedMixedCoverageAutomaticAllocation.line6.toNumber()).toBe(4287.5);
    expect(spouseFamilyCoverageMonths.line6.toNumber()).toBe(4287.5);
    expect(spouseFamilyLastMonthRule.line6.toNumber()).toBe(4275);
  });

  it("Form 8889 Line 6 - spouse allocation overrides are ignored unless the spouse-allocation branch applies", () => {
    expect(ignoredSpouseAllocationOverride.line5.toNumber()).toBe(8550);
    expect(ignoredSpouseAllocationOverride.line6.toNumber()).toBe(8550);
  });

  it("Form 8889 Line 7 - married family coverage catch-up is prorated by eligible months", () => {
    expect(marriedFamilyAllocation.line7.toNumber()).toBe(1000);
    expect(marriedMixedCoverageCatchUp.line7.toNumber()).toBe(500);
    expect(spouseFamilyCoverageMonths.line7.toNumber()).toBe(500);
    expect(lastMonthRuleFamilyCatchUp.line7.toNumber()).toBe(1000);
    expect(spouseFamilyLastMonthRule.line7.toNumber()).toBe(1000);
    expect(spouseOwnedFamilyCatchUp.line7.toNumber()).toBe(1000);
  });

  it("Form 8889 Line 8 - spouse allocation and catch-up combine into the final contribution ceiling", () => {
    expect(marriedFamilyAllocation.line8.toNumber()).toBe(5275);
    expect(marriedMixedCoverageCatchUp.line8.toNumber()).toBe(6925);
    expect(marriedFamilyAutomaticAllocation.line8.toNumber()).toBe(5275);
    expect(marriedMixedCoverageAutomaticAllocation.line8.toNumber()).toBe(4787.5);
    expect(spouseFamilyCoverageMonths.line8.toNumber()).toBe(4787.5);
    expect(lastMonthRuleFamilyCatchUp.line8.toNumber()).toBe(9550);
    expect(spouseFamilyLastMonthRule.line8.toNumber()).toBe(5275);
  });

  it("Form 8889 Line 9 - employer contributions reduce the deductible amount", () => {
    expect(marriedFamilyAllocation.line9.toNumber()).toBe(1200);
  });

  it("Form 8889 Line 9 - W-2 Box 12 code W contributions default into employer contributions using owner-tagged attribution when available", () => {
    expect(w2SupportedEmployerContributionScenario.line9.toNumber()).toBe(500);
    expect(w2SupportedEmployerContributionScenario.line12.toNumber()).toBe(3800);

    const line9 = w2SupportedEmployerContributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "9"
    );

    expect(line9?.formula.toLowerCase()).toContain("supported w-2 box 12 code w");
    expect(line9?.inputs["Validated Form 8889 Line 9 input"]).toBe("0");
    expect(line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("500");

    const spouseTaggedInput = mergeW2Box12CodeWIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, [
      {
        employer: {
          name: "Primary Employer",
          ein: "11-1111111",
        },
        wages: "75000",
        federalWithheld: "9000",
        box12CodeW: "500",
        accountHolder: "primary",
      },
      {
        employer: {
          name: "Spouse Employer",
          ein: "22-2222222",
        },
        wages: "68000",
        federalWithheld: "8200",
        box12CodeW: "900",
        accountHolder: "spouse",
      },
    ], "married_filing_jointly");

    const spouseOwnedEmployerContributionScenario = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1978-09-12",
      },
    }, spouseTaggedInput!, constants);

    expect(spouseOwnedEmployerContributionScenario.line9.toNumber()).toBe(900);

    const spouseLine9 = spouseOwnedEmployerContributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "9"
    );

    expect(spouseLine9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("900");
  });

  it("Form 8889 Line 9 - spouse-owned forms do not infer untagged W-2 Box 12 code W amounts on joint returns", () => {
    const spouseUntaggedInput = mergeW2Box12CodeWIntoForm8889Input({
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "9550",
    }, [
      {
        employer: {
          name: "Primary Employer",
          ein: "11-1111111",
        },
        wages: "75000",
        federalWithheld: "9000",
        box12CodeW: "500",
      },
      {
        employer: {
          name: "Spouse Employer",
          ein: "22-2222222",
        },
        wages: "68000",
        federalWithheld: "8200",
        box12CodeW: "900",
      },
    ], "married_filing_jointly");

    const spouseOwnedEmployerContributionScenario = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1968-09-12",
      },
    }, spouseUntaggedInput!, constants);

    expect(spouseUntaggedInput?.supportedW2EmployerContributions).toBe("0");
    expect(spouseOwnedEmployerContributionScenario.line9.toNumber()).toBe(0);
    expect(spouseOwnedEmployerContributionScenario.line13.toNumber()).toBe(9550);

    const spouseLine9 = spouseOwnedEmployerContributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "9"
    );

    expect(spouseLine9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("0");
  });

  it("Form 8889 Line 9 - mixed tagged and untagged W-2 Box 12 code W amounts ignore the untagged amount", () => {
    const mixedAttributionInput = mergeW2Box12CodeWIntoForm8889Input({
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, [
      {
        employer: {
          name: "Primary Employer",
          ein: "11-1111111",
        },
        wages: "75000",
        federalWithheld: "9000",
        box12CodeW: "500",
        accountHolder: "primary",
      },
      {
        employer: {
          name: "Spouse Employer",
          ein: "22-2222222",
        },
        wages: "68000",
        federalWithheld: "8200",
        box12CodeW: "900",
        accountHolder: "spouse",
      },
      {
        employer: {
          name: "Untagged Employer",
          ein: "33-3333333",
        },
        wages: "12000",
        federalWithheld: "1000",
        box12CodeW: "700",
      },
    ], "married_filing_jointly");

    expect(mixedAttributionInput?.supportedW2EmployerContributions).toBe("500");

    const result = calculateForm8889(simpleW2Fixture.taxpayer, mixedAttributionInput!, constants);

    expect(result.line9.toNumber()).toBe(500);
    expect(result.line12.toNumber()).toBe(3800);
    expect(result.line13.toNumber()).toBe(3800);

    const line9 = result.lines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("500");
  });

  it("Form 8889 Line 9 - primary-owned joint-return forms do not infer multiple untagged W-2 Box 12 code W amounts", () => {
    const ambiguousJointReturnInput = mergeW2Box12CodeWIntoForm8889Input({
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
    }, [
      {
        employer: {
          name: "Primary Employer",
          ein: "11-1111111",
        },
        wages: "75000",
        federalWithheld: "9000",
        box12CodeW: "500",
      },
      {
        employer: {
          name: "Spouse Employer",
          ein: "22-2222222",
        },
        wages: "68000",
        federalWithheld: "8200",
        box12CodeW: "900",
      },
    ], "married_filing_jointly");

    expect(ambiguousJointReturnInput?.supportedW2EmployerContributions).toBe("0");

    const result = calculateForm8889({
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "Pat",
        lastName: "Example",
        ssn: "987-65-4321",
        dateOfBirth: "1988-03-18",
      },
    }, ambiguousJointReturnInput!, constants);

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(4300);
    expect(result.line13.toNumber()).toBe(4300);

    const line9 = result.lines.find((line) => line.form === "Form 8889" && line.line === "9");
    expect(line9?.inputs["Supported W-2 Box 12 code W employer contributions"]?.toString()).toBe("0");
  });

  it("Form 8889 Line 10 - qualified funding distributions reduce the remaining deductible room", () => {
    expect(marriedFamilyAllocation.line10.toNumber()).toBe(300);
  });

  it("Form 8889 Line 10 - audit trail preserves the validated IRA funding source for Form 8606 routing", () => {
    const sourcedFundingDistribution = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "4300",
      qualifiedFundingDistribution: "3000",
      qualifiedFundingDistributionSource: "roth_ira",
    }, constants);

    const line10 = sourcedFundingDistribution.lines.find(
      (line) => line.form === "Form 8889" && line.line === "10"
    );

    expect(sourcedFundingDistribution.line10.toNumber()).toBe(3000);
    expect(line10?.inputs["Qualified funding distribution source"]).toBe("roth_ira");
  });

  it("Form 8889 Line 10 - only traditional and Roth IRA funding sources are accepted for Form 8606 defaulting", () => {
    const traditional = Form8889Schema.safeParse({
      qualifiedFundingDistribution: "3000",
      qualifiedFundingDistributionSource: "traditional_ira",
    });
    const roth = Form8889Schema.safeParse({
      qualifiedFundingDistribution: "3000",
      qualifiedFundingDistributionSource: "roth_ira",
    });
    const sep = Form8889Schema.safeParse({
      qualifiedFundingDistribution: "3000",
      qualifiedFundingDistributionSource: "sep_ira",
    });
    const simple = Form8889Schema.safeParse({
      qualifiedFundingDistribution: "3000",
      qualifiedFundingDistributionSource: "simple_ira",
    });

    expect(traditional.success).toBe(true);
    expect(roth.success).toBe(true);
    expect(sep.success).toBe(false);
    expect(simple.success).toBe(false);
  });

  it("Form 8889 owner-specific input parsing defaults each spouse-specific account owner and rejects legacy conflicts", () => {
    const ownerSpecific = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: {
          firstName: "Pat",
          lastName: "Example",
          ssn: "987-65-4321",
          dateOfBirth: "1980-01-01",
        },
      },
      form8889ByOwner: {
        primary: {
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "4300",
        },
        spouse: {
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "2000",
        },
      },
    });

    const conflictingInputs = TaxYearInputSchema.safeParse({
      ...simpleW2Fixture,
      form8889: {
        coverageByMonth: Array(12).fill("self_only"),
        contributionsMade: "4300",
      },
      form8889ByOwner: {
        primary: {
          coverageByMonth: Array(12).fill("self_only"),
          contributionsMade: "4300",
        },
      },
    });

    expect(ownerSpecific.form8889ByOwner?.primary?.accountOwner).toBe("primary");
    expect(ownerSpecific.form8889ByOwner?.spouse?.accountOwner).toBe("spouse");
    expect(conflictingInputs.success).toBe(false);
  });

  it("Form 8889 Line 11 - employer contributions and funding distributions combine before the deduction cap", () => {
    expect(marriedFamilyAllocation.line11.toNumber()).toBe(1500);
  });

  it("Form 8889 Line 12 - remaining deductible room floors at zero", () => {
    expect(archerLimited.line12.toNumber()).toBe(0);
    expect(marriedFamilyAllocation.line12.toNumber()).toBe(3775);
  });

  it("Form 8889 Line 13 - deduction is limited to the smaller of personal contributions or remaining room", () => {
    expect(fullYearSelfOnly.line13.toNumber()).toBe(4300);
    expect(marriedFamilyAllocation.line13.toNumber()).toBe(3775);
    expect(marriedMixedCoverageCatchUp.line13.toNumber()).toBe(6925);
    expect(marriedMixedCoverageAutomaticAllocation.line13.toNumber()).toBe(4787.5);
    expect(lastMonthRuleSelfOnly.line13.toNumber()).toBe(4300);
    expect(lastMonthRuleFamilyCatchUp.line13.toNumber()).toBe(9550);
  });

  it("Form 8889 Line 14a - HSA distributions populate the gross distribution amount", () => {
    expect(taxableDistributionScenario.line14a.toNumber()).toBe(3000);
  });

  it("Form 8889 Line 14a - supported Form 1099-SA gross distributions default in when manual input is absent", () => {
    const supported1099SADefaultScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      supported1099SAGrossDistributions: "6600",
      supported1099SADeathDistributionDateOfDeathValue: "5000",
      supported1099SAProhibitedTransactionDistributions: "2400",
    }, constants);

    expect(supported1099SADefaultScenario.line14a.toNumber()).toBe(6600);

    const line14a = supported1099SADefaultScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "14a"
    );

    expect(line14a?.inputs["Validated Form 8889 Line 14a input"]).toBe("0");
    expect(line14a?.inputs["Supported Form 1099-SA gross distributions"]?.toString()).toBe("6600");
  });

  it("Form 8889 Line 14b - excluded distributions cannot exceed the gross HSA distributions", () => {
    expect(excludedDistributionOverflow.line14b.toNumber()).toBe(1500);
    expect(rolloverAndReturnedExcessDistributionScenario.line14b.toNumber()).toBe(1300);
  });

  it("Form 8889 Line 14c - net distributions equal gross distributions minus excluded amounts", () => {
    expect(taxableDistributionScenario.line14c.toNumber()).toBe(2500);
    expect(excludedDistributionOverflow.line14c.toNumber()).toBe(0);
    expect(rolloverAndReturnedExcessDistributionScenario.line14c.toNumber()).toBe(1700);
  });

  it("Form 8889 Line 15 - qualified medical expenses cannot offset prohibited-transaction deemed distributions", () => {
    expect(medicalExpenseOverflow.line15.toNumber()).toBe(1200);
    expect(prohibitedTransactionDistributionScenario.line15.toNumber()).toBe(600);
  });

  it("Form 8889 Line 15 - estate death distributions do not create a post-death medical-expense offset", () => {
    const estateDeathDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "6000",
      supported1099SADeathDistributionDateOfDeathValue: "6000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "6000",
      qualifiedMedicalExpenses: "1000",
    }, constants);

    const line15 = estateDeathDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(estateDeathDistributionScenario.line14a.toNumber()).toBe(6000);
    expect(estateDeathDistributionScenario.line15.toNumber()).toBe(0);
    expect(estateDeathDistributionScenario.line16.toNumber()).toBe(6000);
    expect(estateDeathDistributionScenario.line17aHasException).toBe(true);
    expect(estateDeathDistributionScenario.line17b.toNumber()).toBe(0);
    expect(line15?.inputs.estateDeathDistributionMedicalExpenseDisallowedAmount?.toString()).toBe("6000");
  });

  it("Form 8889 Line 15 - generic medical expenses alone do not offset a non-estate death distribution", () => {
    const otherBeneficiaryDeathDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "6000",
      supported1099SADeathDistributionDateOfDeathValue: "6000",
      supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue: "6000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "0",
      qualifiedMedicalExpenses: "1000",
    }, constants);

    const line15 = otherBeneficiaryDeathDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(otherBeneficiaryDeathDistributionScenario.line14a.toNumber()).toBe(6000);
    expect(otherBeneficiaryDeathDistributionScenario.line15.toNumber()).toBe(0);
    expect(otherBeneficiaryDeathDistributionScenario.line16.toNumber()).toBe(6000);
    expect(otherBeneficiaryDeathDistributionScenario.line17aHasException).toBe(true);
    expect(otherBeneficiaryDeathDistributionScenario.line17b.toNumber()).toBe(0);
    expect(line15?.inputs.ordinaryMedicalExpenseEligibleDistributions?.toString()).toBe("0");
    expect(line15?.inputs.otherBeneficiaryDeathDistributionEligibleAmount?.toString()).toBe("6000");
    expect(line15?.inputs.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath?.toString()).toBe("0");
  });

  it("Form 8889 Line 15 - non-estate death distributions allow only the beneficiary-only post-death medical-expense offset", () => {
    const otherBeneficiaryDeathDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "6000",
      supported1099SADeathDistributionDateOfDeathValue: "6000",
      supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue: "6000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "0",
      qualifiedMedicalExpenses: "1000",
      decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1000",
    }, constants);

    const line15 = otherBeneficiaryDeathDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(otherBeneficiaryDeathDistributionScenario.line14a.toNumber()).toBe(6000);
    expect(otherBeneficiaryDeathDistributionScenario.line15.toNumber()).toBe(1000);
    expect(otherBeneficiaryDeathDistributionScenario.line16.toNumber()).toBe(5000);
    expect(otherBeneficiaryDeathDistributionScenario.line17aHasException).toBe(true);
    expect(otherBeneficiaryDeathDistributionScenario.line17b.toNumber()).toBe(0);
    expect(line15?.inputs.ordinaryMedicalExpenseEligibleDistributions?.toString()).toBe("0");
    expect(line15?.inputs.otherBeneficiaryDeathDistributionEligibleAmount?.toString()).toBe("6000");
    expect(line15?.inputs.decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath?.toString()).toBe("1000");
    expect(line15?.inputs.estateDeathDistributionMedicalExpenseDisallowedAmount?.toString()).toBe("0");
  });

  it("Form 8889 Line 15 - code 6 death distributions infer the beneficiary-only post-death medical-expense offset", () => {
    const inferredCode6DeathDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "5000",
      supported1099SADeathDistributionDateOfDeathValue: "5000",
      supported1099SAOtherBeneficiaryDeathDistributionDateOfDeathValue: "5000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "0",
      decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1000",
    }, constants);

    const line15 = inferredCode6DeathDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(inferredCode6DeathDistributionScenario.line14a.toNumber()).toBe(5000);
    expect(inferredCode6DeathDistributionScenario.line15.toNumber()).toBe(1000);
    expect(inferredCode6DeathDistributionScenario.line16.toNumber()).toBe(4000);
    expect(line15?.inputs.supportedOtherBeneficiaryDeathDistributionDateOfDeathValue?.toString()).toBe("5000");
    expect(line15?.inputs.supportedUnknownBeneficiaryDeathDistributionDateOfDeathValue?.toString()).toBe("0");
    expect(line15?.inputs.otherBeneficiaryDeathDistributionEligibleAmount?.toString()).toBe("5000");
    expect(line15?.inputs.beneficiaryPostDeathMedicalExpenseOffset?.toString()).toBe("1000");
  });

  it("Form 8889 Line 15 - unlabeled death distributions do not create the beneficiary-only post-death medical-expense offset", () => {
    const unlabeledDeathDistributionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "6000",
      supported1099SADeathDistributionDateOfDeathValue: "6000",
      supported1099SAEstateDeathDistributionDateOfDeathValue: "0",
      decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1000",
    }, constants);

    const line15 = unlabeledDeathDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(unlabeledDeathDistributionScenario.line14a.toNumber()).toBe(6000);
    expect(unlabeledDeathDistributionScenario.line15.toNumber()).toBe(0);
    expect(unlabeledDeathDistributionScenario.line16.toNumber()).toBe(6000);
    expect(line15?.inputs.supportedOtherBeneficiaryDeathDistributionDateOfDeathValue?.toString()).toBe("0");
    expect(line15?.inputs.supportedUnknownBeneficiaryDeathDistributionDateOfDeathValue?.toString()).toBe("6000");
    expect(line15?.inputs.otherBeneficiaryDeathDistributionEligibleAmount?.toString()).toBe("0");
  });

  it("Form 8889 Line 15 - supported 1099-SA prohibited-transaction amounts still block medical offsets when no explicit deemed-distribution input is present", () => {
    const supportedProhibitedTransactionScenario = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      contributionsMade: "0",
      supported1099SAGrossDistributions: "3000",
      supported1099SAProhibitedTransactionDistributions: "2400",
      qualifiedMedicalExpenses: "1800",
    }, constants);

    const line15 = supportedProhibitedTransactionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "15"
    );

    expect(supportedProhibitedTransactionScenario.line14a.toNumber()).toBe(3000);
    expect(supportedProhibitedTransactionScenario.line15.toNumber()).toBe(600);
    expect(supportedProhibitedTransactionScenario.line16.toNumber()).toBe(2400);
    expect(supportedProhibitedTransactionScenario.line17b.toNumber()).toBe(480);
    expect(line15?.inputs.prohibitedTransactionDistributions?.toString()).toBe("2400");
  });

  it("Form 8889 Line 16 - prohibited-transaction deemed distributions remain taxable even when medical expenses are reported", () => {
    expect(taxableDistributionScenario.line16.toNumber()).toBe(1000);
    expect(medicalExpenseOverflow.line16.toNumber()).toBe(0);
    expect(prohibitedTransactionDistributionScenario.line16.toNumber()).toBe(2400);
    expect(rolloverAndReturnedExcessDistributionScenario.line16.toNumber()).toBe(1100);
  });

  it("Form 8889 Line 17a - exception flag turns on when part of the taxable amount is exempt from the 20 percent tax", () => {
    expect(taxableDistributionScenario.line17aHasException).toBe(true);
    expect(medicalExpenseOverflow.line17aHasException).toBe(false);
  });

  it("Form 8889 Line 17a - supported 1099-SA disability or death exceptions apply even without a manual exception input", () => {
    expect(automaticExceptionOnlyScenario.line16.toNumber()).toBe(2500);
    expect(automaticExceptionOnlyScenario.line17aHasException).toBe(true);
    expect(automaticExceptionOnlyScenario.line17b.toNumber()).toBe(260);
  });

  it("Form 8889 Line 17a - separately supplied manual exceptions stack on top of supported 1099-SA exceptions", () => {
    const line17a = manualPlusAutomaticExceptionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "17a"
    );

    expect(manualPlusAutomaticExceptionScenario.line16.toNumber()).toBe(2500);
    expect(manualPlusAutomaticExceptionScenario.line17aHasException).toBe(true);
    expect(line17a?.inputs["Supported Form 1099-SA automatic exception distributions"]?.toString()).toBe("1200");
    expect(line17a?.inputs["Validated manual exception amount"]?.toString()).toBe("200");
    expect(line17a?.inputs["Total supported and manual exception amount before Line 16 cap"]?.toString()).toBe("1400");
  });

  it("Form 8889 Line 17a - age-65 beneficiaries are automatically exempt only when they were already 65 on January 1", () => {
    expect(age65FullYearDistributionScenario.line17aHasException).toBe(true);
    expect(turns65MidYearDistributionScenario.line17aHasException).toBe(false);
    expect(spouseOwnedAge65FullYearDistributionScenario.line17aHasException).toBe(true);
    expect(spouseOwnedTurns65MidYearDistributionScenario.line17aHasException).toBe(false);
  });

  it("Form 8889 Line 17a - validated post-age-65 distributions exempt the partial-year amount from the 20 percent tax", () => {
    const primaryLine17a = turns65MidYearWithValidatedPostAge65DistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "17a"
    );
    const spouseLine17a = spouseOwnedTurns65MidYearWithValidatedPostAge65DistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "17a"
    );

    expect(turns65MidYearWithValidatedPostAge65DistributionScenario.line17aHasException).toBe(true);
    expect(primaryLine17a?.inputs["Validated post-age-65 distributions"]?.toString()).toBe("1200");
    expect(primaryLine17a?.inputs.exemptAmount?.toString()).toBe("1200");

    expect(spouseOwnedTurns65MidYearWithValidatedPostAge65DistributionScenario.line17aHasException).toBe(true);
    expect(spouseLine17a?.inputs["Validated post-age-65 distributions"]?.toString()).toBe("1500");
    expect(spouseLine17a?.inputs["Account owner"]).toBe("spouse");
  });

  it("Form 8889 Line 17b - additional tax applies only to the taxable amount not covered by an exception", () => {
    expect(taxableDistributionScenario.line17b.toNumber()).toBe(160);
    expect(medicalExpenseOverflow.line17b.toNumber()).toBe(0);
    expect(prohibitedTransactionDistributionScenario.line17b.toNumber()).toBe(480);
  });

  it("Form 8889 Line 17b - separately supplied manual exceptions reduce the tax after supported 1099-SA exceptions", () => {
    expect(manualPlusAutomaticExceptionScenario.line17b.toNumber()).toBe(220);
  });

  it("Form 8889 Line 17b - age-65 automatic relief only zeroes the tax for full-year post-65 distributions", () => {
    expect(age65FullYearDistributionScenario.line17b.toNumber()).toBe(0);
    expect(turns65MidYearDistributionScenario.line17b.toNumber()).toBe(400);
    expect(spouseOwnedAge65FullYearDistributionScenario.line17b.toNumber()).toBe(0);
    expect(spouseOwnedTurns65MidYearDistributionScenario.line17b.toNumber()).toBe(400);
  });

  it("Form 8889 Line 17b - validated post-age-65 distributions reduce the tax base for mid-year age-65 cases", () => {
    expect(turns65MidYearWithValidatedPostAge65DistributionScenario.line16.toNumber()).toBe(2000);
    expect(turns65MidYearWithValidatedPostAge65DistributionScenario.line17b.toNumber()).toBe(160);
    expect(spouseOwnedTurns65MidYearWithValidatedPostAge65DistributionScenario.line16.toNumber()).toBe(2000);
    expect(spouseOwnedTurns65MidYearWithValidatedPostAge65DistributionScenario.line17b.toNumber()).toBe(100);
  });

  it("Form 8889 Line 18 - last-month-rule recapture is the excess over the redetermined prior-year limit", () => {
    expect(testingPeriodFailure.line18.toNumber()).toBe(2700);
  });

  it("Form 8889 Line 18 - death or disability testing-period failures do not trigger recapture", () => {
    expect(excusedTestingPeriodFailure.line18.toNumber()).toBe(0);
  });

  it("Form 8889 Line 18 - prior-year worksheet inputs can recompute the redetermined limit when no manual override is provided", () => {
    expect(automaticRedeterminedLimitTestingPeriodFailure.line18.toNumber()).toBe(3112.5);
    expect(automaticSpouseAllocatedRedeterminedLimitTestingPeriodFailure.line18.toNumber()).toBe(2575);

    const line18 = automaticSpouseAllocatedRedeterminedLimitTestingPeriodFailure.lines.find(
      (line) => line.form === "Form 8889" && line.line === "18"
    );

    expect(line18?.formula).toContain("supported recomputed prior-year redetermined contribution limit");
    expect(
      line18?.inputs["Supported recomputed prior-year redetermined contribution limit"]?.toNumber()
    ).toBe(2575);
    expect(line18?.inputs["Redetermined limit source"]).toBe("supported_prior_year_worksheet");
  });

  it("Form 8889 Line 18 - missing redetermined-limit support does not invent recapture income", () => {
    expect(missingRedeterminedLimitSupportTestingPeriodFailure.line18.toNumber()).toBe(0);

    const line18 = missingRedeterminedLimitSupportTestingPeriodFailure.lines.find(
      (line) => line.form === "Form 8889" && line.line === "18"
    );

    expect(line18?.formula).toContain("neither a manual redetermined limit nor supported prior-year worksheet");
    expect(line18?.inputs["Missing redetermined-limit support"]).toBe("true");
    expect(line18?.inputs["Redetermined limit source"]).toBe("missing_support");
  });

  it("Form 8889 Line 18 - prior-year worksheet filing-status changes still recompute the contribution-year redetermined limit", () => {
    expect(filingStatusChangeRedeterminedLimitTestingPeriodFailure.line18.toNumber()).toBe(3075);

    const line18 = filingStatusChangeRedeterminedLimitTestingPeriodFailure.lines.find(
      (line) => line.form === "Form 8889" && line.line === "18"
    );

    expect(line18?.formula).toContain("supported recomputed prior-year redetermined contribution limit");
    expect(
      line18?.inputs["Supported recomputed prior-year redetermined contribution limit"]?.toNumber()
    ).toBe(2075);
    expect(line18?.inputs["Missing redetermined-limit support"]).toBe("false");
    expect(line18?.inputs["Current return filing status"]).toBe("single");
    expect(line18?.inputs["Supported prior-year worksheet filing status"]).toBe("married_filing_jointly");
    expect(line18?.inputs["Unsupported prior-year worksheet context"]).toBe("none");
  });

  it("Form 8889 Line 18 - validated manual redetermined limits stay authoritative even when a supported worksheet recomputation is also available", () => {
    expect(manualOverrideWithSupportedWorksheetTestingPeriodFailure.line18.toNumber()).toBe(2950);

    const line18 = manualOverrideWithSupportedWorksheetTestingPeriodFailure.lines.find(
      (line) => line.form === "Form 8889" && line.line === "18"
    );

    expect(line18?.formula).toContain("validated prior-year redetermined contribution limit");
    expect(line18?.inputs["Validated prior-year redetermined contribution limit"]).toBe("1200");
    expect(
      line18?.inputs["Supported recomputed prior-year redetermined contribution limit"]?.toNumber()
    ).toBe(1037.5);
    expect(line18?.inputs["Redetermined limit source"]).toBe("validated_manual_override");
    expect(line18?.inputs["Missing redetermined-limit support"]).toBe("false");
  });

  it("Form 8889 Line 19 - qualified funding distribution recapture carries through in full", () => {
    expect(testingPeriodFailure.line19.toNumber()).toBe(1500);
  });

  it("Form 8889 Line 19 - death or disability testing-period failures also suppress qualified funding recapture", () => {
    expect(excusedTestingPeriodFailure.line19.toNumber()).toBe(0);
  });

  it("Form 8889 Line 20 - total recapture income combines last-month-rule and qualified funding distribution amounts", () => {
    expect(testingPeriodFailure.line20.toNumber()).toBe(4200);
  });

  it("Form 8889 Line 20 - excused testing-period failures do not create Schedule 1 recapture income", () => {
    expect(excusedTestingPeriodFailure.line20.toNumber()).toBe(0);
  });

  it("Form 8889 Line 21 - additional tax applies only to the last-month-rule recapture amount", () => {
    expect(testingPeriodFailure.line21.toNumber()).toBe(270);
  });

  it("Form 8889 Line 21 - excused testing-period failures do not create recapture tax", () => {
    expect(excusedTestingPeriodFailure.line21.toNumber()).toBe(0);
  });

  it("Form 8889 spouse account owner path uses the spouse date of birth for catch-up eligibility", () => {
    expect(spouseOwnedFamilyCatchUp.line3.toNumber()).toBe(8550);
    expect(spouseOwnedFamilyCatchUp.line8.toNumber()).toBe(9550);
    expect(spouseOwnedFamilyCatchUp.line13.toNumber()).toBe(9550);
  });

  it("Form 8889 audit trail preserves the selected account owner on spouse-owned forms", () => {
    const spouseOwnedLine13 = spouseOwnedFamilyCatchUp.lines.find(
      (line) => line.form === "Form 8889" && line.line === "13"
    );
    const spouseOwnedLine17b = spouseOwnedAge65FullYearDistributionScenario.lines.find(
      (line) => line.form === "Form 8889" && line.line === "17b"
    );

    expect(spouseOwnedLine13?.inputs["Account owner"]).toBe("spouse");
    expect(spouseOwnedLine17b?.inputs["Account owner"]).toBe("spouse");
  });

  it("Form 8889 spouse account owner path requires spouse taxpayer information", () => {
    expect(() => calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "spouse",
      coverageByMonth: Array(12).fill("family"),
      contributionsMade: "9550",
    }, constants)).toThrow("Form 8889 spouse account owner requires spouse taxpayer information");
  });

  it("Form 8889 audit trail preserves separate Form 1099-SA disability and death exception support", () => {
    const auditAwareResult = calculateForm8889(simpleW2Fixture.taxpayer, {
      accountOwner: "primary",
      coverageByMonth: Array(12).fill("self_only"),
      distributionsReceived: "6600",
      excludedDistributions: "1500",
      rolloverDistributions: "300",
      distributionsNotSubjectToAdditionalTax: "6200",
      supported1099SAGrossDistributions: "6000",
      supported1099SAReturnedExcessContributions: "1400",
      supported1099SADeathDistributionDateOfDeathValue: "5000",
      supported1099SADisabilityExceptionDistributions: "1000",
      supported1099SAAutomaticExceptionDistributions: "6000",
      supported1099SAProhibitedTransactionDistributions: "2400",
    }, constants);

    const line14a = auditAwareResult.lines.find((line) => line.form === "Form 8889" && line.line === "14a");
    const line14b = auditAwareResult.lines.find((line) => line.form === "Form 8889" && line.line === "14b");
    const line17a = auditAwareResult.lines.find((line) => line.form === "Form 8889" && line.line === "17a");
    const line17b = auditAwareResult.lines.find((line) => line.form === "Form 8889" && line.line === "17b");

    expect(line14a?.formula).toContain("Validated Form 8889 Line 14a input or supported Form 1099-SA gross-distribution amount");
    expect(line14a?.inputs["Validated Form 8889 Line 14a input"]).toBe("6600");
    expect(line14a?.inputs["Supported Form 1099-SA gross distributions"]?.toString()).toBe("6000");
    expect(line14a?.inputs["Supported Form 1099-SA death-distribution amount"]?.toString()).toBe("5000");
    expect(line14a?.inputs["Supported Form 1099-SA prohibited-transaction distributions"]?.toString()).toBe("2400");

    expect(line14b?.formula).toContain("supported Form 1099-SA returned excess contributions");
    expect(line14b?.inputs["Validated Form 8889 Line 14b input"]).toBe("1500");
    expect(line14b?.inputs["Validated HSA rollover distributions"]).toBe("300");
    expect(line14b?.inputs["Supported Form 1099-SA returned excess contributions"]?.toString()).toBe("1400");

    expect(line17a?.formula).toContain("supported post-age-65, disability, death, or validated manual exception amount");
    expect(line17a?.inputs["Line 17a input amount before Line 16 cap"]?.toString()).toBe("6200");
    expect(line17a?.inputs["Supported Form 1099-SA disability exception distributions"]?.toString()).toBe("1000");
    expect(line17a?.inputs["Supported Form 1099-SA death-distribution exception amount"]?.toString()).toBe("5000");
    expect(line17a?.inputs["Supported Form 1099-SA automatic exception distributions"]?.toString()).toBe("6000");
    expect(line17a?.inputs["Validated manual exception amount"]?.toString()).toBe("200");

    expect(line17b?.formula).toContain("supported post-age-65, disability, death, or validated manual exceptions");
    expect(line17b?.inputs["Supported Form 1099-SA disability exception distributions"]?.toString()).toBe("1000");
    expect(line17b?.inputs["Supported Form 1099-SA death-distribution exception amount"]?.toString()).toBe("5000");
    expect(line17b?.inputs["Validated manual exception amount"]?.toString()).toBe("200");
  });
});
