// Spec: spec/federal/guided-input.yaml#hsa-actual-contribution-sources
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview, completePersonalInfo, completeW2Entry, completeHsaSources as hsaSources } from "./complete-facts";


function stateWith(accounts: import("@/lib/guided-hsa-facts").HsaAccountData[] = [hsaSources]) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaDeduction: "3600", hsaAccounts: accounts };
  return state;
}

function reopenHsaDraft(draft: GuidedFlowState) {
  let raw: string | null = null;
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } } as unknown as Storage;
  const target = { storageKey: "hsa-direct-review" };
  expect(saveGuidedFlowState(storage, target, draft)).toBe(true);
  const saved = loadGuidedFlowState(storage, target);
  if (!saved?.sectionData.adjustments?.hsaAccounts) throw new Error("Could not reopen HSA sources");
  return { draft: saved, accounts: saved.sectionData.adjustments.hsaAccounts };
}

it("requires fresh review after replacing the same owner's HSA worksheet in one update", () => {
  const original = { ...hsaSources, priorYearExcessContributions: "125", yearEndFairMarketValue: "5000" };
  const initial = stateWith([original]);
  expect(validateSection(initial, "adjustments").status).toBe("complete");
  const current = updateSectionData(setInterviewTaxYear(initial, 2026), "personal-info", completePersonalInfo);
  const relabeled = { ...original, id: "replacement-hsa", contributionTaxYear: "2026", priorYearSourceTaxYear: "2025" };
  const edited = reopenHsaDraft(updateSectionData(current, "adjustments", { ...current.sectionData.adjustments, hsaAccounts: [relabeled] }));
  const generalReview = reopenHsaDraft(updateSectionData(edited.draft, "adjustments", {
    ...edited.draft.sectionData.adjustments, hsaAccounts: [{ ...edited.accounts[0], sourceFactsConfirmed: true }],
  }));
  expect(validateSection(generalReview.draft, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(generalReview.draft)).toBeNull();
  expect(generalReview.accounts[0]).toMatchObject({
    id: relabeled.id, contributionsMade: original.contributionsMade, priorYearExcessContributions: "125", yearEndFairMarketValue: "5000",
    monthlyEligibilityConfirmed: null, contributionTimingConfirmed: null, employerWorksheetConfirmed: null, annualExcessSourcesConfirmed: null,
  });
  const freshReview = reopenHsaDraft(updateSectionData(generalReview.draft, "adjustments", {
    ...generalReview.draft.sectionData.adjustments, hsaAccounts: [{ ...relabeled, annualExcessSourcesConfirmed: true }],
  }));
  expect(validateSection(freshReview.draft, "adjustments").status).toBe("complete");
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(freshReview.draft)).form8889ByOwner?.primary?.contributionsMade).toBe("3600.1");
});

it("scopes saved HSA review to the edited periods and actual owner", () => {
  const primary = { ...hsaSources, contributionTaxYear: "2026", priorYearSourceTaxYear: "2025" };
  const spouse = { ...primary, id: "spouse-hsa", accountOwner: "spouse" as const, contributionsMade: "1000", bothSpousesHaveHsas: true };
  const state = stateWith([{ ...primary, bothSpousesHaveHsas: true }]);
  state.taxYear = 2026;
  state.segmentation.filingStatus = "mfj";
  const edit = (draft: GuidedFlowState, hsaAccounts: typeof primary[]) => updateSectionData(draft, "adjustments", { ...draft.sectionData.adjustments, hsaAccounts });
  const reopen = reopenHsaDraft;
  const retained = { ...primary, bothSpousesHaveHsas: true, contributionsMade: "3,600.100", priorYearExcessContributions: "0.00" };
  const added = reopen(edit(state, [spouse, retained]));
  expect(validateSection(added.draft, "adjustments").status).toBe("complete");
  expect(added.accounts.map(row => row.sourceFactsConfirmed)).toEqual([true, true]);

  const julyMedicare = primary.medicareByMonth.map((value, index) => index === 6 ? true : value);
  const editedPeriod = reopen(edit(added.draft, [spouse, { ...retained, medicareByMonth: julyMedicare }]));
  expect(editedPeriod.accounts[1]).toMatchObject({
    monthlyEligibilityConfirmed: null, contributionTimingConfirmed: true, employerWorksheetConfirmed: true, sourceFactsConfirmed: null,
  });
  expect(editedPeriod.accounts[0]).toEqual(spouse);

  const correctedPriorSource = reopen(edit(added.draft, [spouse, { ...retained, priorYearSourceTaxYear: "2024" }]));
  const restoredLabel = reopen(edit(correctedPriorSource.draft, [spouse, retained]));
  const generalReview = reopen(edit(restoredLabel.draft, [spouse, { ...restoredLabel.accounts[1], sourceFactsConfirmed: true }]));
  expect(validateSection(generalReview.draft, "adjustments").message).toMatch(/Prior Form 5329/i);
  expect(generalReview.accounts[1]).toMatchObject({ priorYearExcessContributions: "0.00", monthlyEligibilityConfirmed: true, contributionTimingConfirmed: true, employerWorksheetConfirmed: true });

  const personal = added.draft.sectionData["personal-info"]!;
  const changedOwner = reopen(updateSectionData(added.draft, "personal-info", {
    ...personal, spouse: { ...personal.spouse!, firstName: "Different", ssn: "222-33-4445" },
  }));
  expect(changedOwner.accounts[0]).toMatchObject({
    monthlyEligibilityConfirmed: null, contributionTimingConfirmed: null, employerWorksheetConfirmed: null, contributionsMade: "1000",
  });
  expect(changedOwner.accounts[1]).toMatchObject({ monthlyEligibilityConfirmed: true, contributionTimingConfirmed: true, employerWorksheetConfirmed: true });
  const reassignedOwner = reopen(edit(state, [{ ...retained, accountOwner: "spouse" }]));
  expect(reassignedOwner.accounts[0]).toMatchObject({
    accountOwner: "spouse", contributionsMade: "3,600.100", monthlyEligibilityConfirmed: null,
    contributionTimingConfirmed: null, employerWorksheetConfirmed: null, annualExcessSourcesConfirmed: null,
  });
});

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

it("requires new employer payroll review when the matching Code W original changes", () => {
  const primary = {
    ...hsaSources, contributionTaxYear: "2026", priorYearSourceTaxYear: "2025", bothSpousesHaveHsas: true,
    employerW2Contributions: "100", employerPriorYearContributions: "20",
  };
  const spouse = { ...primary, id: "spouse-hsa", accountOwner: "spouse" as const, employerW2Contributions: "80", employerPriorYearContributions: "0" };
  const state = stateWith([primary, spouse]);
  state.taxYear = 2026;
  state.segmentation.filingStatus = "mfj";
  const w2 = { ...completeW2Entry, sourceTaxYear: "2026", box12CodeW: "100" };
  const spouseW2 = { ...w2, employerEin: "30-1234567", accountHolder: "spouse" as const, box12CodeW: "80" };
  state.sectionData["income-w2"] = { entries: [w2, spouseW2] };
  expect(buildTaxInputFromGuidedData(state)?.form8889ByOwner?.primary?.employerContributions).toBe("80");
  const updatePayroll = (editedW2: typeof w2) => reopenHsaDraft(updateSectionData(state, "income-w2", { entries: [spouseW2, editedW2] }));
  const formatted = updatePayroll({ ...w2, employerName: "  SYNTHETIC   EMPLOYER ", employerEin: "123456789", box12CodeW: "100.00" });
  expect(formatted.accounts.map(account => account.employerWorksheetConfirmed)).toEqual([true, true]);

  const replacement = updatePayroll({ ...w2, employerName: "Replacement Employer", employerEin: "12-3456788" });
  expect(replacement.accounts[0]).toMatchObject({
    employerW2Contributions: "100", employerPriorYearContributions: "20",
    monthlyEligibilityConfirmed: true, contributionTimingConfirmed: true, employerWorksheetConfirmed: null,
  });
  expect(replacement.accounts[1]?.employerWorksheetConfirmed).toBe(true);
  const onlyGeneralReview = reopenHsaDraft(updateSectionData(replacement.draft, "adjustments", {
    ...replacement.draft.sectionData.adjustments,
    hsaAccounts: replacement.accounts.map(account => ({ ...account, sourceFactsConfirmed: true })),
  }));
  expect(validateSection(onlyGeneralReview.draft, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(onlyGeneralReview.draft)).toBeNull();
  const freshReview = reopenHsaDraft(updateSectionData(onlyGeneralReview.draft, "adjustments", {
    ...onlyGeneralReview.draft.sectionData.adjustments,
    hsaAccounts: [{ ...onlyGeneralReview.accounts[0], employerWorksheetConfirmed: true }, onlyGeneralReview.accounts[1]],
  }));
  expect(buildTaxInputFromGuidedData(freshReview.draft)?.form8889ByOwner?.primary?.employerContributions).toBe("80");
  for (const change of [{ box12CodeW: "100.01" }, { sourceTaxYear: "2025" }]) {
    expect(updatePayroll({ ...w2, ...change }).accounts[0]?.employerWorksheetConfirmed).toBeNull();
  }
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
