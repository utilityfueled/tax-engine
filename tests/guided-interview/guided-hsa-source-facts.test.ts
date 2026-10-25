// Spec: spec/federal/guided-input.yaml#hsa-actual-contribution-sources
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview, completeW2Entry, completeHsaSources as hsaSources } from "./complete-facts";


function stateWith(accounts: import("@/lib/guided-hsa-facts").HsaAccountData[] = [hsaSources]) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaDeduction: "3600", hsaAccounts: accounts };
  return state;
}

it("replaces an estimated deduction with actual HSA eligibility and contribution facts", () => {
  const state = stateWith();
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form8889ByOwner?.primary).toMatchObject({ accountOwner: "primary", contributionsMade: "3600.1", employerContributions: "0", useLastMonthRule: false, isDependent: false, medicareMonths: [] });
  expect(input?.adjustments?.hsaDeduction ?? "0").toBe("0");
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).form8889ByOwner?.primary?.line13.toString()).toBe("3600.1");
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaDeduction: "3600" };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(validateSection(state, "adjustments").status).toBe("partial");
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaAccounts: [{ ...hsaSources, contributionsMade: "0", yearEndFairMarketValue: "0" }] };
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.primary?.contributionsMade).toBe("0");
});

it("reconciles actual payroll sources by owner and preserves unknown source answers", () => {
  const state = stateWith(); state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, box12CodeW: "100.20" }] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.hsaAccounts = [{ ...hsaSources, employerW2Contributions: "100.20", employerPriorYearContributions: "0.10", employerFollowingYearContributions: "0.30" }];
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.primary?.employerContributions).toBe("100.4");
  expect(buildTaxInputFromGuidedData(state)?.w2s?.[0]?.box12CodeW).toBe("100.20");
  state.sectionData.adjustments!.hsaAccounts![0]!.excessEmployerContributionsAlreadyInWages = "";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.hsaAccounts![0]!.excessEmployerContributionsAlreadyInWages = "0";
  const changed = updateSectionData(state, "income-w2", state.sectionData["income-w2"]);
  expect(changed.sectionData.adjustments?.hsaAccounts?.[0]?.sourceFactsConfirmed).toBeNull();
  for (const patch of [{ contributionsMade: "" }, { contributionTaxYear: "2024" }, { sourceFactsConfirmed: false }, { medicareByMonth: Array(12).fill(null) }, { useLastMonthRule: null }, { archerMsaContributions: "1" }, { hasDistributions: true }, { correctionsRequired: true }]) {
    const other = stateWith([{ ...hsaSources, ...patch }]); expect(buildTaxInputFromGuidedData(other), JSON.stringify(patch)).toBeNull();
  }
  state.sectionData["income-w2"]!.entries[0]!.box12CodeW = ""; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("keeps actual spouses and family allocations distinct without silently dropping saved records", () => {
  const state = stateWith(); state.segmentation.filingStatus = "mfj";
  state.sectionData["personal-info"]!.spouse = { firstName: "Alex", lastName: "Example", ssn: "444-55-6666", dateOfBirth: "1980-01-01", usResidencyMonths: "12" };
  state.sectionData.adjustments!.hsaAccounts = [
    { ...hsaSources, coverageByMonth: Array(12).fill("family"), bothSpousesHaveHsas: true, spouseAllocatedLimit: "4000", otherSpouseAllocatedLimit: "4550", allocationWorksheetConfirmed: true },
    { ...hsaSources, id: "hsa-spouse", accountOwner: "spouse", coverageByMonth: Array(12).fill("family"), bothSpousesHaveHsas: true, spouseAllocatedLimit: "4550", otherSpouseAllocatedLimit: "4000", allocationWorksheetConfirmed: true, contributionsMade: "4500.20" },
  ];
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.spouse).toMatchObject({ accountOwner: "spouse", contributionsMade: "4500.2", spouseAllocatedLimit: "4550" });
  state.segmentation.filingStatus = "single"; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(state.sectionData.adjustments!.hsaAccounts).toHaveLength(2);
  state.segmentation.filingStatus = "mfj"; state.sectionData.adjustments!.hsaAccounts[1]!.otherSpouseAllocatedLimit = "4000.01"; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("preserves actual testing-period history and requires its dates and worksheet amounts", () => {
  const state = stateWith();
  state.sectionData.adjustments!.hsaAccounts = [{ ...hsaSources, testingPeriodFailure: true, testingPeriod: { failureDate: "2025-06-01", rule: "last_month_rule", deathOrDisabilityException: false, contributionTaxYear: "2024", lastMonthRuleContributions: "8300", redeterminedLimit: "691.67" } }];
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.primary).toMatchObject({ lastMonthRuleContributions: "8300", lastMonthRuleRedeterminedLimit: "691.67", testingPeriodFailureDueToDeathOrDisability: false });
  state.sectionData.adjustments!.hsaAccounts[0]!.testingPeriod!.redeterminedLimit = ""; expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.hsaAccounts[0]!.testingPeriod!.deathOrDisabilityException = true;
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.primary?.testingPeriodFailureDueToDeathOrDisability).toBe(true);
  state.sectionData.adjustments!.hsaAccounts[0]!.testingPeriod!.failureDate = "2026-06-01"; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});


it("requires reconciliation of hidden testing history and different spouse coverage patterns", () => {
  const state = stateWith([{ ...hsaSources, testingPeriodFailure: false, testingPeriod: { failureDate: "2025-06-01", rule: "qualified_funding", deathOrDisabilityException: false, fundingDistributionDate: "2024-06-15", fundingDistributionAmount: "100.10" } }]);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.hsaAccounts![0]!.testingPeriod = undefined;
  expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  state.segmentation.filingStatus = "mfj";
  state.sectionData.adjustments!.hsaAccounts = [
    { ...hsaSources, coverageByMonth: Array(12).fill("family"), bothSpousesHaveHsas: true, spouseAllocatedLimit: "4000", otherSpouseAllocatedLimit: "4550", allocationWorksheetConfirmed: true },
    { ...hsaSources, id: "spouse", accountOwner: "spouse", bothSpousesHaveHsas: true },
  ];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.segmentation.filingStatus = "mfs"; state.sectionData.adjustments!.hsaAccounts = [state.sectionData.adjustments!.hsaAccounts[0]!];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});


it("forwards separate actual prior-year excess and fair-market-value sources for each owner", () => {
  const state = stateWith(); state.segmentation.filingStatus = "mfj";
  state.sectionData.adjustments!.hsaAccounts = [
    { ...hsaSources, bothSpousesHaveHsas: true, contributionsMade: "5000", yearEndFairMarketValue: "200.10" },
    { ...hsaSources, id: "spouse", accountOwner: "spouse", bothSpousesHaveHsas: true, contributionsMade: "0", priorYearExcessContributions: "100", priorYearAdditionalTax: "6", yearEndFairMarketValue: "9007199254740993.01" },
  ];
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form5329).toBeUndefined();
  expect(input?.form5329HsaByOwner?.primary).toMatchObject({ sourceTaxYear: 2025, priorYearSourceTaxYear: 2024, priorYearExcessContributions: "0", priorYearAdditionalTax: "0", valueDec31: "200.1", returnedExcessContributionsUnder9100Relief: "0" });
  expect(input?.form5329HsaByOwner?.spouse).toMatchObject({ priorYearExcessContributions: "100", priorYearAdditionalTax: "6", valueDec31: "9007199254740993.01" });
  state.sectionData.adjustments!.hsaAccounts[1]!.priorYearAdditionalTax = "";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments!.hsaAccounts[1]!.priorYearAdditionalTax = "6";
  state.sectionData.adjustments!.hsaAccounts[1]!.priorYearSourceTaxYear = "2023";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
