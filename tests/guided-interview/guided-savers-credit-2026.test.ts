/** Spec: spec/federal/guided-savers-credit-2026.yaml. */
import assert from "node:assert/strict";
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, emptyCreditsData, emptyRetirementEntry, getGuidedSectionRoute, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildGuidedSaversCredit, type GuidedSaversCreditContext, type GuidedSaversCreditData, type GuidedSaversCreditDistribution } from "@/lib/guided-savers-credit";
import { TaxYearInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { simpleW2Fixture } from "../fixtures/simple-w2";
import { completeIraSources, completeW2Entry, startCompleteInterview } from "./complete-facts";

// Use the existing staged test preview. The actual constants retain their annual guard.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const context = {
  taxYear: 2026, filingStatus: "single", personal: {
    dateOfBirth: "1990-01-15", standardDeductionFacts: { primaryCanBeClaimedAsDependent: false },
  },
  iraContributions: {
    contributionTaxYear: "2026", contributionTimingConfirmed: true, specialContributionRulesRequired: false,
    sourceFactsConfirmed: true, primaryRothContributions: "2,000", primaryContributions: "0", primarySection501c18Contributions: "0",
    primaryCompensation: "30,000",
  },
  wageEntries: [], retirementEntries: [],
} satisfies GuidedSaversCreditContext;

const draft: GuidedSaversCreditData = {
  taxYear: "2026", sourceFactsConfirmed: true, ordinaryScopeConfirmed: true,
  contribution: { accountHolder: "primary", sourceReference: "trustee record R26", amount: "2000.00" },
  qualifyingStudentMonths: "0", dependentDeductionAllowedToAnotherTaxpayer: false,
  testingPeriod: { dueDate: "2027-04-15", distributionsConfirmed: true, distributions: [] },
};

const historicalRow = {
  sourceReference: "IRA payment receipt", accountHolder: "primary" as const, receivedDate: "2025-03-05", amount: "500.00",
  historicalProof: {
    originalTaxYear: "2025", originalReference: "IRA tax statement", originalIssuerEin: "12-3456789", receiptIssuerEin: "123456789",
    originalAccountLast4: "0042", receiptAccountLast4: "0042", recipientTaxIdLast4: "3333",
    grossDistribution: "500", taxableAmount: "500.00", distributionCode: "7", traditionalIraConfirmed: true,
    iraSepSimple: true, taxableAmountNotDetermined: false, sourceFactsConfirmed: true,
  },
};

function historicalInterview(row: GuidedSaversCreditDistribution = historicalRow, ...otherRows: GuidedSaversCreditDistribution[]) {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  state.sectionData["personal-info"] = { ...personal, dateOfBirth: "1960-01-15" };
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "30000", federalWithheld: "2000", socialSecurityWages: "30000", socialSecurityWithheld: "1860", medicareWages: "30000", medicareWithheld: "435" }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, iraContributions: { ...completeIraSources, ...context.iraContributions } };
  return updateSectionData(state, "credits", { ...emptyCreditsData, saversCredit: {
    ...draft, testingPeriod: { ...draft.testingPeriod, distributions: [row, ...otherRows] },
  } });
}

function reopenHistoricalInterview(state: ReturnType<typeof historicalInterview>) {
  const key = "synthetic-historical-ira-credit";
  const items = new Map<string, string>();
  const storage: Storage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: key => { items.delete(key); },
    clear: () => items.clear(),
    key: index => [...items.keys()][index] ?? null,
    get length() { return items.size; },
  };
  expect(saveGuidedFlowState(storage, key, state)).toBe(true);
  const reopened = loadGuidedFlowState(storage, key);
  assert.ok(reopened);
  return reopened;
}

it.each([2024, 2025] as const)("reopens guided %i historical proof and transfers the exact reduction only to Form 8880", taxYear => {
  const row = { ...historicalRow, receivedDate: `${taxYear}-03-05`, historicalProof: { ...historicalRow.historicalProof, originalTaxYear: String(taxYear) } };
  const reopened = reopenHistoricalInterview(historicalInterview(row));
  expect(reopened.sectionData.credits?.saversCredit?.testingPeriod.distributions).toEqual([row]);
  expect(validateSection(reopened, "credits").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
  expect(input.form1099R).toHaveLength(0);
  expect(input.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistribution).toMatchObject({
    original: { taxYear, recipientTaxIdLast4: "3333", accountReference: "0042" },
    issuerPayment: { sourceReference: row.sourceReference, receivedDate: row.receivedDate, amount: "500" },
  });
  const calculation = calculateFederalTax(input);
  expect(calculation.form8880?.line4a.toFixed()).toBe("500");
  expect(calculation.iraDistributionsGross.toFixed()).toBe("0");
  expect(calculation.schedule3?.retirementSavingsCredit.toFixed()).toBe("150");
});

it("reopens proof for both historical years and sums exact cents", () => {
  const prior = { ...historicalRow, sourceReference: "2024 receipt", receivedDate: "2024-03-05", amount: "0.75",
    historicalProof: { ...historicalRow.historicalProof, originalTaxYear: "2024", originalReference: "2024 statement", grossDistribution: "0.75", taxableAmount: "0.75" },
  };
  const reopened = reopenHistoricalInterview(historicalInterview(historicalRow, prior));
  expect(reopened.sectionData.credits?.saversCredit?.testingPeriod.distributions).toEqual([historicalRow, prior]);
  expect(validateSection(reopened, "credits").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
  expect(input.form1099R).toEqual([]);
  expect(input.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistribution).toBeUndefined();
  expect(input.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistributions?.payments).toMatchObject([
    { original: { taxYear: 2025 }, issuerPayment: { amount: "500" } },
    { original: { taxYear: 2024 }, issuerPayment: { amount: "0.75" } },
  ]);
  expect(calculateFederalTax(input).form8880?.line4a.toFixed()).toBe("500.75");

  const credit = reopened.sectionData.credits?.saversCredit;
  assert.ok(credit);
  const edited = updateSectionData(reopened, "credits", { ...emptyCreditsData, saversCredit: { ...credit,
    testingPeriod: { ...credit.testingPeriod, distributions: [historicalRow, { ...prior, sourceReference: "edited 2024 receipt" }] },
  } });
  expect(edited.sectionData.credits?.saversCredit?.testingPeriod).toMatchObject({ distributionsConfirmed: null, distributions: [
    { historicalProof: { sourceFactsConfirmed: null } }, { historicalProof: { sourceFactsConfirmed: null } },
  ] });
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();

  const noProof = (row: GuidedSaversCreditDistribution) => ({ ...row, historicalProof: undefined });
  const manual = historicalInterview(noProof(historicalRow), noProof(prior));
  const manualInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(manual));
  expect(manualInput.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistributions).toBeUndefined();
  expect(calculateFederalTax(manualInput).form8880?.line4a.toFixed()).toBe("500.75");
  for (const incomplete of [noProof(prior), { ...prior, receivedDate: "2025-03-05" }, {
    ...prior, receivedDate: "2025-03-05", historicalProof: { ...prior.historicalProof, originalTaxYear: "2025" },
  }]) {
    const incompleteState = historicalInterview(historicalRow, incomplete);
    expect(validateSection(incompleteState, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(incompleteState)).toBeNull();
  }
});

it("holds opted-in proof until the historical issuer records and primary owner match", () => {
  const proof = historicalRow.historicalProof;
  for (const [changed, message] of [
    [{ originalTaxYear: "2024" }, /year printed on Form 1099-R must match/],
    [{ originalTaxYear: "" }, /year printed on Form 1099-R must match/],
    [{ distributionCode: "7A" }, /Code 7/],
    [{ taxableAmountNotDetermined: true }, /determined taxable amount/],
    [{ receiptIssuerEin: "" }, /both issuer EINs/],
    [{ receiptIssuerEin: "98-7654321" }, /matching the issuer, account/],
    [{ receiptAccountLast4: "5432" }, /matching the issuer, account/],
    [{ originalAccountLast4: "123450042" }, /last four digits/],
    [{ originalReference: " IRA PAYMENT RECEIPT " }, /separately referenced/],
    [{ taxableAmount: "499.99" }, /fully taxable payment amount/],
    [{ recipientTaxIdLast4: "3433" }, /match the primary owner/],
    [{ sourceFactsConfirmed: null }, /after reviewing both records/],
  ] as const) {
    const updated = historicalInterview({ ...historicalRow, historicalProof: { ...proof, ...changed } });
    expect(validateSection(updated, "credits").fieldErrors?.saversCredit).toMatch(message);
    expect(buildTaxInputFromGuidedData(updated)).toBeNull();
  }

  const fresh = historicalInterview();
  for (const receivedDate of ["2023-12-31", "2026-01-01"]) {
    const outsideProofScope = historicalInterview({ ...historicalRow, receivedDate, historicalProof: { ...proof, originalTaxYear: receivedDate.slice(0, 4) } });
    expect(validateSection(outsideProofScope, "credits").fieldErrors?.saversCredit).toMatch(/requires a 2024 or 2025 payment/);
  }
  const credit = fresh.sectionData.credits?.saversCredit;
  const personal = fresh.sectionData["personal-info"];
  assert.ok(credit && personal);
  const tooYoung = historicalInterview();
  tooYoung.sectionData["personal-info"] = { ...personal, dateOfBirth: "1965-09-06" };
  expect(validateSection(tooYoung, "credits").fieldErrors?.saversCredit).toMatch(/ordinary distribution age/);
  expect(buildTaxInputFromGuidedData(tooYoung)).toBeNull();
  const secondDistribution = historicalInterview();
  secondDistribution.sectionData.credits = { ...emptyCreditsData, saversCredit: { ...credit,
    testingPeriod: { ...credit.testingPeriod, distributions: [historicalRow,
      { sourceReference: "another receipt", accountHolder: "primary", receivedDate: "2024-01-01", amount: "1" }] },
  } };
  expect(validateSection(secondDistribution, "credits").fieldErrors?.saversCredit).toMatch(/requires records for every listed payment/);

  const current = updateSectionData(fresh, "income-retirement", { entries: [{ ...emptyRetirementEntry, grossDistribution: "0" }] });
  expect(validateSection(current, "credits").fieldErrors?.saversCredit).toMatch(/without a current Form 1099-R/);
  expect(buildTaxInputFromGuidedData(current)).toBeNull();
  const manual = historicalInterview({ ...historicalRow, historicalProof: undefined });
  expect(validateSection(manual, "credits").status).toBe("complete");
  const manualInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(manual));
  expect(manualInput.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistribution).toBeUndefined();
  expect(calculateFederalTax(manualInput).form8880?.line4a.toFixed()).toBe("500");
});

it("retains historical evidence and requires renewed review after proof, owner or year changes", () => {
  const state = historicalInterview();
  const credit = state.sectionData.credits?.saversCredit;
  const personal = state.sectionData["personal-info"];
  assert.ok(credit && personal);
  const editPeriod = (row: GuidedSaversCreditDistribution) => updateSectionData(state, "credits", { ...emptyCreditsData,
    saversCredit: { ...credit, testingPeriod: { ...credit.testingPeriod, distributions: [row] } },
  });
  const changedReference = { ...historicalRow, sourceReference: "updated receipt label" };
  const changedReceiptDate = { ...historicalRow, receivedDate: "2024-03-05" };
  const changedEvidence = { ...historicalRow, historicalProof: { ...historicalRow.historicalProof, originalReference: "updated tax form label" } };
  for (const [changed, savedRow] of [
    [editPeriod(changedReference), changedReference],
    [editPeriod(changedReceiptDate), changedReceiptDate],
    [editPeriod(changedEvidence), changedEvidence],
    [updateSectionData(state, "personal-info", { ...personal, ssn: "555-55-3333" }), historicalRow],
    [updateSectionData(state, "personal-info", { ...personal, dateOfBirth: "1961-01-15" }), historicalRow],
    [setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026), historicalRow],
  ] as const) {
    expect(changed.sectionData.credits?.saversCredit).toMatchObject({ sourceFactsConfirmed: null,
      testingPeriod: { distributionsConfirmed: null, distributions: [{ ...savedRow, historicalProof: { ...savedRow.historicalProof, sourceFactsConfirmed: null } }] },
    });
    expect(validateSection(changed, "credits").status).toBe("partial");
  }

  const edited = editPeriod(changedReference);
  const editedCredit = edited.sectionData.credits?.saversCredit;
  assert.ok(editedCredit);
  const recordsReviewed = updateSectionData(edited, "credits", { ...emptyCreditsData, saversCredit: {
    ...editedCredit, testingPeriod: { ...editedCredit.testingPeriod, distributions: [changedReference] },
  } });
  const reviewedCredit = recordsReviewed.sectionData.credits?.saversCredit;
  assert.ok(reviewedCredit);
  expect(reviewedCredit.testingPeriod.distributions[0]?.historicalProof?.sourceFactsConfirmed).toBe(true);
  const periodReviewed = updateSectionData(recordsReviewed, "credits", { ...emptyCreditsData, saversCredit: {
    ...reviewedCredit, testingPeriod: { ...reviewedCredit.testingPeriod, distributionsConfirmed: true },
  } });
  const finalCredit = periodReviewed.sectionData.credits?.saversCredit;
  assert.ok(finalCredit);
  const rechecked = updateSectionData(periodReviewed, "credits", { ...emptyCreditsData, saversCredit: { ...finalCredit, sourceFactsConfirmed: true } });
  expect(validateSection(rechecked, "credits").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(rechecked)?.form8880?.sourceFacts2026?.priorYearOrdinaryIraDistribution?.issuerPayment.sourceReference).toBe(changedReference.sourceReference);
});

it("projects through the guided return and reconfirms after source changes", () => {
  const base = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  base.taxYear = 2026;
  const before = getGuidedSectionRoute(base);
  expect(before.map(section => section.id)).not.toContain("adjustments");
  base.currentSectionIndex = before.findIndex(section => section.id === "credits");
  const state = updateSectionData(base, "credits", { ...emptyCreditsData, saversCredit: structuredClone(draft) });
  const after = getGuidedSectionRoute(state);
  expect(after.map(section => section.id)).toContain("adjustments");
  expect(after[state.currentSectionIndex]?.id).toBe("credits");
  const wages = { entries: [{ ...completeW2Entry, wages: "30000", federalWithheld: "2000", socialSecurityWages: "30000", socialSecurityWithheld: "1860", medicareWages: "30000", medicareWithheld: "435" }] };
  state.sectionData["income-w2"] = wages;
  state.sectionData.adjustments = { ...emptyAdjustmentData, iraContributions: { ...completeIraSources, ...context.iraContributions } };
  state.sectionData.credits = { ...emptyCreditsData, saversCredit: structuredClone(draft) };

  expect(validateSection(state, "credits").status).toBe("complete");
  const guided = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(guided.form8880?.primaryIraContributions).toBe("2000");
  expect(calculateFederalTax(guided).schedule3?.retirementSavingsCredit.toFixed()).toBe("200");

  const edited = updateSectionData(state, "income-w2", { entries: [{ ...wages.entries[0], box12CodeD: "10" }] });
  expect(edited.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  expect(validateSection(edited, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const scrolledBack = setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026);
  expect(scrolledBack.sectionData.credits?.saversCredit).toMatchObject({ contribution: draft.contribution, sourceFactsConfirmed: null });

  const changedCredit = updateSectionData(state, "credits", { ...emptyCreditsData, saversCredit: { ...draft, qualifyingStudentMonths: "1" } });
  expect(changedCredit.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  const rechecked = updateSectionData(changedCredit, "credits", { ...emptyCreditsData, saversCredit: { ...draft, qualifyingStudentMonths: "1" } });
  expect(validateSection(rechecked, "credits").status).toBe("complete");

  const personal = state.sectionData["personal-info"];
  assert.ok(personal);
  const malformed = { ...state, sectionData: { ...state.sectionData, "personal-info": { ...personal, childTaxCredit: { bonaFidePuertoRicoResident: false, puertoRicoExcludedIncome: "abc" } } } };
  expect(validateSection(malformed, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(malformed)).toBeNull();

  const education = updateSectionData(state, "credits", { ...emptyCreditsData, saversCredit: draft,
    education: { ...emptyCreditsData.education, possessionIncomeExclusion: "500" } });
  expect(education.sectionData.credits?.saversCredit?.sourceFactsConfirmed).toBeNull();
  const conflicting = updateSectionData(education, "credits", { ...emptyCreditsData, saversCredit: draft,
    education: { ...emptyCreditsData.education, possessionIncomeExclusion: "500" } });
  expect(validateSection(conflicting, "credits").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(conflicting)).toBeNull();
});

function calculate(data: GuidedSaversCreditData, agi = "30000", dateOfBirth = "1990-01-15") {
  const form8880 = buildGuidedSaversCredit(data, {
    ...context, personal: { ...context.personal, dateOfBirth },
    iraContributions: { ...context.iraContributions, primaryCompensation: agi },
  });
  const wage = simpleW2Fixture.w2s[0];
  assert.ok(wage);
  return calculateFederalTax(TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth } },
    w2s: [{ ...wage, taxYear: 2026, wages: agi, socialSecurityWages: agi, medicareWages: agi,
      socialSecurityWithheld: d(agi).times("0.062").toFixed(2), medicareWithheld: d(agi).times("0.0145").toFixed(2) }],
    iraDeductionWorksheet: {
      sourceFactsConfirmed: true, primaryContributions: "0", primaryCompensation: agi,
      primaryIsActiveParticipant: false, primaryRothContributions: "2000", primarySection501c18Contributions: "0",
    },
    form8880,
  }));
}

it("transfers the ordinary Roth contribution into Form 8880 and Schedule 3", async () => {
  const actual = await vi.importActual<typeof import("@/models/constants.js")>("@/models/constants.js");
  expect(() => actual.getConstants(2026)).toThrow(/incomplete/);
  const result = calculate(draft);
  expect(result.form8880?.line1a.toFixed()).toBe("2000");
  expect(result.form8880?.line2a.toFixed()).toBe("0");
  expect(result.form8880?.line4a.toFixed()).toBe("0");
  expect(result.form8880?.line9.toFixed()).toBe("0.1");
  expect(result.form8880?.line12.toFixed()).toBe("200");
  expect(result.schedule3?.retirementSavingsCredit.toFixed()).toBe("200");
});

it("sums distinct actual testing-period distributions without rounding cents", () => {
  const first = { sourceReference: "IRA 2024 transaction", accountHolder: "primary" as const, receivedDate: "2024-01-01", amount: "100.51" };
  const second = { sourceReference: "Plan 2027 transaction", accountHolder: "primary" as const, receivedDate: "2027-04-14", amount: "150.40" };
  const tested = { ...draft, testingPeriod: { ...draft.testingPeriod, distributions: [first, second] } };
  expect(calculate(tested).form8880?.line4a.toFixed()).toBe("250.91");
  expect(calculate(tested).form8880?.line12.toFixed()).toBe("175");
  for (const changed of [
    [first, { ...second, sourceReference: " IRA 2024 TRANSACTION " }],
    [{ ...first, receivedDate: "2023-12-31" }],
    [{ ...first, receivedDate: "2026-03-01" }],
    [{ ...second, receivedDate: "2027-04-15" }],
    [{ ...first, accountHolder: "spouse" as const }],
    [{ ...first, amount: "" }],
  ]) {
    expect(() => buildGuidedSaversCredit({ ...tested, testingPeriod: { ...tested.testingPeriod, distributions: changed } }, context)).toThrow(/distribution/i);
  }
});

it("requires complete and consistent return-year proof", () => {
  expect(buildGuidedSaversCredit(undefined, context)).toBeUndefined();
  for (const changed of [
    { taxYear: "2025" }, { sourceFactsConfirmed: null }, { ordinaryScopeConfirmed: false },
    { contribution: { ...draft.contribution, amount: "2000.01" } },
    { contribution: { ...draft.contribution, sourceReference: "" } },
    { contribution: { ...draft.contribution, accountHolder: "spouse" as const } },
    { qualifyingStudentMonths: "" }, { qualifyingStudentMonths: "13" },
    { dependentDeductionAllowedToAnotherTaxpayer: null }, { dependentDeductionAllowedToAnotherTaxpayer: true },
    { testingPeriod: { ...draft.testingPeriod, dueDate: "" } },
    { testingPeriod: { ...draft.testingPeriod, distributionsConfirmed: null } },
  ]) expect(() => buildGuidedSaversCredit({ ...draft, ...changed }, context)).toThrow();
  for (const changed of [
    { taxYear: 2025 }, { filingStatus: "mfj" as const }, { iraContributions: undefined },
    { iraContributions: { ...context.iraContributions, primaryRothContributions: "2000.01" } },
    { iraContributions: { ...context.iraContributions, primaryContributions: "1" } },
    { iraContributions: { ...context.iraContributions, primaryCompensation: "1999.99" } },
    { iraContributions: { ...context.iraContributions, contributionTimingConfirmed: false } },
    { iraContributions: { ...context.iraContributions, specialContributionRulesRequired: true } },
    { personal: { ...context.personal, dateOfBirth: "1990-02-30" } },
    { hasConflictingIncomeExclusions: true },
    { wageEntries: [{ box12CodeD: "1" }] }, { retirementEntries: [{ grossDistribution: "1" }] },
  ]) expect(() => buildGuidedSaversCredit(draft, { ...context, ...changed })).toThrow();
});

it("uses actual student months, birth date and AGI for the statutory boundaries", () => {
  expect(calculate({ ...draft, qualifyingStudentMonths: "4" }).form8880?.line12.toFixed()).toBe("200");
  expect(calculate({ ...draft, qualifyingStudentMonths: "5" }).form8880?.line12.toFixed()).toBe("0");
  expect(calculate(draft, "30000", "2009-01-01").form8880?.line12.toFixed()).toBe("200");
  expect(calculate(draft, "30000", "2009-01-02").form8880?.line12.toFixed()).toBe("0");
  expect(calculate(draft, "40250").form8880?.line12.toFixed()).toBe("200");
  expect(calculate(draft, "40251").form8880?.line12.toFixed()).toBe("0");
});
