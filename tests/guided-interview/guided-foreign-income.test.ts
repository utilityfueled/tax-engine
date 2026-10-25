// Spec: spec/federal/guided-foreign-income.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, buildSectionRoute, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildForeignIncomeInput, emptyForeignIncome, emptyForeignIncomeSource, foreignIncomeFactErrors, foreignIncomePartIVKeys, type ForeignIncomeData } from "@/lib/guided-foreign-income";
import { completeW2Entry, completeBusinessSection, startCompleteInterview } from "./complete-facts";

export function foreignIncomeFixture(): ForeignIncomeData {
  return { ...structuredClone(emptyForeignIncome), sourceTaxYear: "2025", sourceReference: "Original foreign pay and presence worksheet", accountHolder: "primary",
    taxpayerName: "Jordan Example", taxpayerTaxIdLast4: "3333", sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
    taxHomeCountry: "United Kingdom", taxHomeStartDate: "2025-01-01", taxHomeEndDate: "2025-12-31", taxHomeConfirmed: true, foreignCountriesQualify: true,
    citizenshipStatus: "us_citizen", servicesQualify: true, qualificationMethod: "physical_presence", qualificationReference: "Actual travel diary",
    testPeriodStartDate: "2025-01-01", testPeriodEndDate: "2025-12-31", testPeriodCompleted: true, qualifyingDays: "365",
    fullForeignPeriods: [{ country: "United Kingdom", startDate: "2025-01-01", endDate: "2025-12-31" }],
    electionsValidConfirmed: true, claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false,
    partIV: { ...Object.fromEntries(foreignIncomePartIVKeys.map(key => [key, "0"])), wages: "120000" } as ForeignIncomeData["partIV"],
    sources: [{ ...structuredClone(emptyForeignIncomeSource), sourceId: "formW2:0", sourceTaxYear: "2025", accountHolder: "primary", sourceReference: "Employer wage statement", payerName: "Foreign Employer", payerEin: "12-3456789", foreignEarnedIncome: "120000", priorYearIncomeReceived: "0" }],
    qualifiedHousingExpenses: "0", housingExpensesQualificationConfirmed: false, housingNoDuplicateClaimConfirmed: true,
    nontaxableGovernmentHousingAllowance: "0", deductionsAllocableToExcludedIncome: "0", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "0",
    deductionWorksheetReference: "Original zero allocable deductions worksheet", priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0",
  };
}
export function foreignIncomeState(data = foreignIncomeFixture()) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["foreign-earned-income"], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, employerName: "Foreign Employer", employerEin: "12-3456789", sourceTaxYear: "2025", wages: "160000", socialSecurityWages: "160000", medicareWages: "160000" }] };
  state.sectionData.adjustments = { ...structuredClone(emptyAdjustmentData), foreignIncome: data };
  return state;
}
const build = (data = foreignIncomeFixture()) => buildForeignIncomeInput(data, foreignIncomeState(data));
it("validates actual completed qualification periods and known ineligibility", () => {
  expect(build()?.qualifyingDays).toBe(365);
  for (const patch of [{ sourceTaxYear: "" }, { accountHolder: "spouse" }, { taxpayerTaxIdLast4: "4444" }, { testPeriodCompleted: null },
    { testPeriodEndDate: "2025-12-30" }, { taxHomeConfirmed: null }, { qualifyingDays: "364" }, { fullForeignPeriods: [{ country: "UK", startDate: "2025-01-01", endDate: "2025-11-25" }] }]) {
    expect(() => build({ ...foreignIncomeFixture(), ...patch } as ForeignIncomeData)).toThrow();
  }
  const falseSource = { ...foreignIncomeFixture(), servicesQualify: false, qualifyingDays: "0" };
  expect(build(falseSource)?.eligibilityConfirmed).toBe(false);
  const residence = { ...foreignIncomeFixture(), qualificationMethod: "bona_fide_residence" as const, fullForeignPeriods: [], bonaFideResidenceConfirmed: true,
    nonresidenceStatementDisqualifies: false, citizenshipStatus: "resident_alien" as const, treatyResidentEligibilityConfirmed: true };
  expect(build(residence)?.eligibilityConfirmed).toBe(true);
  expect(() => build({ ...residence, treatyResidentEligibilityConfirmed: null })).toThrow(/treaty|resident/i);
  expect(() => build({ ...residence, testPeriodStartDate: "2025-02-01" })).toThrow(/entire|calendar|period/i);
});
it("binds original foreign receipts with exact zero and unknown handling", () => {
  expect(buildForeignIncomeInput(undefined, foreignIncomeState())).toBeUndefined();
  const data = foreignIncomeFixture(); const state = foreignIncomeState(data);
  expect(buildForeignIncomeInput(data, state)?.incomeSources?.foreignEmploymentIncomeIncludedOnW2).toBe("120000");
  data.partIV.wages = "9007199254740993.03"; data.sources[0].foreignEarnedIncome = data.partIV.wages;
  const w2 = state.sectionData["income-w2"]?.entries[0]; if (!w2) throw new Error("Missing fixture W2"); w2.wages = data.partIV.wages;
  expect(buildForeignIncomeInput(data, state)?.foreignEarnedIncome).toBe("9007199254740993.03");
  for (const value of ["", "NaN", "-1"]) expect(() => build({ ...foreignIncomeFixture(), partIV: { ...foreignIncomeFixture().partIV, allowanceOther: value } })).toThrow();
  for (const [patch, reason] of [[{ sourceTaxYear: "" }, /year/i], [{ accountHolder: "spouse" }, /owner/i], [{ employerEin: "98-7654321" }, /employer/i],
    [{ aiSuggestedFields: { wages: { value: "160000", status: "pending-confirmation" } } }, /suggestions/i]] as const) {
    const original = foreignIncomeFixture(); const fresh = foreignIncomeState(original); const source = fresh.sectionData["income-w2"]?.entries[0];
    if (!source) throw new Error("Missing original W2"); Object.assign(source, patch);
    expect(() => buildForeignIncomeInput(original, fresh)).toThrow(reason);
  }
  const duplicate = foreignIncomeFixture(); duplicate.sources.push(structuredClone(duplicate.sources[0]));
  expect(() => build(duplicate)).toThrow(/duplicate|reconcile/i);
});
it("preserves housing and prior-income sources without inferred amounts", () => {
  const data = foreignIncomeFixture(); data.claimHousingExclusionOrDeduction = true; data.qualifiedHousingExpenses = "30000.25";
  data.housingExpensesQualificationConfirmed = true; data.housingExpenseReference = "Actual paid housing ledger";
  data.housingLocationPeriods = [{ locationId: "default", days: "365", noticeTaxYear: "2025", priorYearLocationId: "" }];
  expect(build(data)?.qualifiedHousingExpenses).toBe("30000.25");
  expect(() => build({ ...data, housingLocationPeriods: [] })).toThrow(/location|housing/i);
  data.sources[0].priorYearIncomeReceived = "1000.50"; data.priorYearIncomeExclusion = "1000.50"; data.priorYearIncomeExclusionTaxYear = "2024";
  data.priorYearIncomeStatementConfirmed = true; data.priorYearIncomeAlreadyReportedConfirmed = true; data.priorYearUnusedExclusion = "2000"; data.priorYearIncomeReference = "Actual prior-year exclusion statement";
  expect(build(data)?.priorYearIncomeReceived).toBe("1000.5");
  expect(() => build({ ...data, priorYearUnusedExclusion: "" })).toThrow(/prior|unused/i);
  expect(() => build({ ...data, housingNoDuplicateClaimConfirmed: false })).toThrow(/duplicate|housing/i);
  expect(() => build({ ...data, nontaxableGovernmentHousingAllowance: "1" })).toThrow(/government|allowance/i);
});
it("calculates actual foreign income once through the canonical return", () => {
  const state = foreignIncomeState(); expect(validateSection(state, "adjustments").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state); expect(input?.form2555?.foreignEarnedIncome).toBe("120000");
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe("40000"); expect(result.taxableIncome.toFixed()).toBe("24250"); expect(result.ordinaryTax.toFixed()).toBe("5820");
  const separate = foreignIncomeFixture(); separate.sources[0] = { ...separate.sources[0], sourceId: "foreignEmployment:payroll", payerEin: "", notIncludedInW2Confirmed: true };
  const separateState = foreignIncomeState(separate); const w2 = separateState.sectionData["income-w2"]?.entries[0]; if (!w2) throw new Error("Missing W2"); w2.wages = "40000"; w2.socialSecurityWages = "40000"; w2.medicareWages = "40000";
  const second = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(separateState)));
  expect(second.agi.toFixed()).toBe("40000"); expect(second.taxableIncome.toFixed()).toBe("24250");
  const current = foreignIncomeFixture(); current.sourceTaxYear = "2026"; current.taxHomeStartDate = "2026-01-01"; current.taxHomeEndDate = "2026-12-31";
  current.testPeriodStartDate = "2026-01-01"; current.testPeriodEndDate = "2026-12-31"; current.fullForeignPeriods = [{ country: "United Kingdom", startDate: "2026-01-01", endDate: "2026-12-31" }]; current.sources[0].sourceTaxYear = "2026";
  const currentState = foreignIncomeState(current); currentState.taxYear = 2026; const currentW2 = currentState.sectionData["income-w2"]?.entries[0]; if (!currentW2) throw new Error("Missing2026 source"); currentW2.sourceTaxYear = "2026";
  expect(buildForeignIncomeInput(current, currentState)?.taxYear).toBe(2026);
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(currentState)))).toThrow(/2026.*(not|incomplete)|incomplete.*2026/i);
});
it("routes foreign work and revokes stale source confirmation", () => {
  const state = foreignIncomeState();
  expect(buildSectionRoute({ ...state.segmentation, incomeTypes: [] }).map(section => section.id)).toContain("adjustments");
  const changed = updateSectionData(state, "income-w2", { entries: [{ ...state.sectionData["income-w2"]?.entries[0], wages: "150000" }] });
  expect(changed.sectionData.adjustments?.foreignIncome?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.foreignIncome?.sources[0].foreignEarnedIncome).toBe("120000");
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const confirmed = updateSectionData(state, "adjustments", { ...state.sectionData.adjustments, foreignIncome: foreignIncomeFixture() });
  expect(confirmed.sectionData.adjustments?.foreignIncome?.sourceFactsConfirmed).toBe(true);
  expect(foreignIncomeFactErrors({ ...state, taxYear: undefined })).not.toEqual({});
});

it("requires actual eligible foreign geography and travel facts", () => {
  const source = foreignIncomeFixture();
  expect(() => build({ ...source, foreignCountriesQualify: null })).toThrow(/countr|geograph/i);
  for (const country of ["United States", "U.S.", "Puerto Rico", "Guam", "Antarctica", "International waters"]) {
    expect(() => build({ ...source, taxHomeCountry: country })).toThrow(/countr|geograph/i);
    expect(() => build({ ...source, fullForeignPeriods: [{ ...source.fullForeignPeriods[0], country }] })).toThrow(/countr|geograph/i);
  }
  expect(build({ ...source, foreignCountriesQualify: false, qualifyingDays: "0" })?.eligibilityConfirmed).toBe(false);
  const cuba = { ...source, taxHomeCountry: "Cuba", fullForeignPeriods: [{ ...source.fullForeignPeriods[0], country: "Cuba" }] };
  expect(() => build(cuba)).toThrow(/Cuba|travel/i);
  expect(build({ ...cuba, cubaTravelPermittedConfirmed: true })?.qualifyingDays).toBe(365);
  expect(build({ ...cuba, cubaTravelPermittedConfirmed: false, qualifyingDays: "0" })?.eligibilityConfirmed).toBe(false);
  expect(() => build({ ...source, fullForeignPeriods: [...source.fullForeignPeriods, source.fullForeignPeriods[0]] })).toThrow(/overlap|duplicate/i);
});
it("binds complete personal-service business sources without an income override", () => {
  const source = foreignIncomeFixture(); source.partIV.wages = "0"; source.partIV.businessPersonalServices = "1000.03"; source.businessCapitalMaterialIncomeProducing = false;
  source.sources = [{ ...structuredClone(emptyForeignIncomeSource), sourceId: "scheduleC", sourceTaxYear: "2025", accountHolder: "primary", sourceReference: "Original business ledger", payerName: "Foreign design", payerEin: "12-3456789", foreignEarnedIncome: "1000.03", priorYearIncomeReceived: "0", businessGrossReceipts: "1200.03", businessReturnsAndAllowances: "0", businessCostOfGoodsSold: "0", businessOtherIncome: "0" }];
  const state = foreignIncomeState(source); state.sectionData["income-self-employment"] = { ...structuredClone(completeBusinessSection), manualGrossReceipts: "1200.03", businessFacts: { ...structuredClone(completeBusinessSection.businessFacts), businessName: "Foreign design", ein: "12-3456789" } };
  expect(buildForeignIncomeInput(source, state)?.incomeSources?.foreignBusinessIncomeAlreadyReported).toBe("1000.03");
  const original = state.sectionData["income-self-employment"];
  state.sectionData["income-self-employment"] = { ...original, manualGrossReceipts: "", necEntries: [{ id: "actual-nec", payerName: "Client", payerTin: "98-7654321", accountHolder: "primary", nonemployeeCompensation: "1200.03" }] as typeof original.necEntries };
  expect(() => buildForeignIncomeInput(source, state)).toThrow(/manual|complete|receipts/i);
  state.sectionData["income-self-employment"] = original;
  expect(() => buildForeignIncomeInput({ ...source, businessCapitalMaterialIncomeProducing: null }, state)).toThrow(/capital|classification/i);
  expect(() => buildForeignIncomeInput({ ...source, businessCapitalMaterialIncomeProducing: true }, state)).toThrow(/30-percent/i);
  source.sources[0].businessGrossReceipts = "1200.04";
  expect(() => buildForeignIncomeInput(source, state)).toThrow(/reconcile/i);
});

it("reconciles actual household alien status without reinterpreting residency months", () => {
  const source = foreignIncomeFixture(); const state = foreignIncomeState(source); const personal = state.sectionData["personal-info"];
  if (!personal?.standardDeductionFacts) throw new Error("Missing actual household fixture");
  personal.standardDeductionFacts.nonresidentAlien = true; personal.standardDeductionFacts.residentJointElection = false;
  expect(() => buildForeignIncomeInput(source, state)).toThrow(/nonresident|citizen|household/i);
  source.citizenshipStatus = "resident_alien";
  expect(() => buildForeignIncomeInput(source, state)).toThrow(/nonresident|joint|election/i);
  personal.standardDeductionFacts.residentJointElection = true;
  expect(() => buildForeignIncomeInput(source, state)).toThrow(/joint/i);
  state.segmentation.filingStatus = "mfj";
  expect(buildForeignIncomeInput(source, state)?.eligibilityConfirmed).toBe(true);
  personal.usResidencyMonths = "0";
  expect(buildForeignIncomeInput(source, state)?.qualifyingDays).toBe(365);
});
