import { assertPAGuidedPaymentBoundary } from "../fixtures/assert-pa-guided-payment-boundary";
// Spec: spec/federal/guided-input.yaml, retirement-ira-checkbox
import { expect, it } from "vitest";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildRetirementInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { Form1099RSchema, TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { calculateForm1099R } from "@/engine/forms/form-1099-r";
import { assertPdfExportAllowed } from "@/pdf/export-policy";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";
import { buildGuidedPennsylvaniaOverrides } from "@/lib/guided-state-engine-inputs";
import { completePersonalInfo, completeRetirementSource, startCompleteInterview } from "./complete-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { loadGuidedFlowState, parseGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type GuidedFlowState, type RetirementEntryData } from "@/lib/guided-interview-flow";

// Spec: spec/federal/guided-input.yaml, retirement-2025-simplified-method
it("calculates 2025 single-life pensions from actual Simplified Method facts while preserving original Box 2a", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Could not initialize guided household facts");
  const worksheet = {
    planReference: "Plan 42 annuity contract",
    qualifiedPlanConfirmed: true,
    singleLifeAnnuitantConfirmed: true,
    statementCoversContractConfirmed: true,
    costInPlan: "26,000.00",
    startingDate: "2025-01-15",
    ageAtStart: "65",
    monthsPaid: "12",
    priorRecovered: "0",
  };
  const statement = {
    ...completeRetirementSource,
    grossDistribution: "6000",
    federalWithheld: "125",
    taxableAmount: "",
    taxableAmountNotDetermined: true,
    taxableAmountConfirmed: null,
    simplifiedMethod: worksheet,
  };
  for (const [code, cost, age, dob, additionalTax] of [
    ["7", "26,000.00", "65", "1960-01-15", "0"],
    ["1", "36,000.00", "35", "1990-01-15", "480"],
  ]) {
    personal.dateOfBirth = dob;
    state.sectionData["income-retirement"] = { entries: [{ ...statement, distributionCode: code, simplifiedMethod: { ...worksheet, costInPlan: cost, ageAtStart: age } }] };
    const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(state) } as unknown as Storage, "retirement");
    expect(reopened?.sectionData["income-retirement"]).toMatchObject(state.sectionData["income-retirement"]);
    if (!reopened) throw new Error("Could not reopen guided pension draft");
    expect(validateSection(reopened, "income-retirement").status).toBe("complete");
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
    expect(input.form1099R?.[0]).toMatchObject({
      taxableAmount: undefined,
      taxableAmountNotDetermined: true,
      simplifiedMethodCostInPlan: cost.replaceAll(",", ""),
      simplifiedMethodAnnuityStartingDate: "2025-01-15",
      simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: Number(age),
      simplifiedMethodPaymentsReceivedThisYear: 12,
      simplifiedMethodPriorYearRecovered: "0",
    });
    expect(input.form1099R?.[0]?.simplifiedMethodExpectedPayments).toBeUndefined();
    expect(buildGuidedFactAnswers(reopened).find(fact => fact.factId === "retirement-distribution-review")?.answerText).toContain("Simplified Method");
    const result = calculateFederalTax(input);
    expect(result.pensionDistributionsGross.toFixed()).toBe("6000");
    expect(result.pensionDistributionsTaxable.toFixed()).toBe("4800");
    expect(result.totalWithholding.toFixed()).toBe("125");
    expect(result.form5329?.line4.toFixed() ?? "0").toBe(additionalTax);
  }
  personal.dateOfBirth = "1960-01-15";
  for (const change of [
    { simplifiedMethod: undefined }, { distributionCode: "" }, { distributionCode: "4" },
    { sourceFactsConfirmed: null }, { taxableAmountNotDetermined: null }, { taxableAmount: "0" }, { grossDistribution: "0" }, { additionalWorksheetRequired: true },
    { simplifiedMethod: { ...worksheet, monthsPaid: "" } },
    { simplifiedMethod: { ...worksheet, ageAtStart: "75" } },
    { simplifiedMethod: { ...worksheet, qualifiedPlanConfirmed: false } },
    { simplifiedMethod: { ...worksheet, statementCoversContractConfirmed: null } },
    { simplifiedMethod: { ...worksheet, startingDate: "2025-02-30" } },
    { simplifiedMethod: { ...worksheet, startingDate: "2025-12-01", monthsPaid: "12" } },
    { simplifiedMethod: { ...worksheet, priorRecovered: "" } },
    { simplifiedMethod: { ...worksheet, priorRecovered: "0.01" } },
  ]) {
    state.sectionData["income-retirement"] = { entries: [{ ...statement, ...change }] };
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
  }
  state.sectionData["income-retirement"] = { entries: [statement, { ...statement, accountReference: "other original", simplifiedMethod: { ...worksheet, planReference: " plan 42 annuity contract " } }] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();

  state.sectionData["income-retirement"] = { entries: [{ ...statement, simplifiedMethod: { ...worksheet, costInPlan: "0.00" } }] };
  const zeroCost = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(zeroCost.form1099R?.[0]?.simplifiedMethodCostInPlan).toBe("0.00");
  expect(calculateFederalTax(zeroCost).pensionDistributionsTaxable.toFixed()).toBe("6000");

  state.sectionData["income-retirement"] = { entries: [{
    ...statement, simplifiedMethod: { ...worksheet, startingDate: "2025-12-01", monthsPaid: "1" },
  }] };
  const decemberStart = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(calculateFederalTax(decemberStart).pensionDistributionsTaxable.toFixed()).toBe("5900");

  personal.dateOfBirth = "1936-01-15";
  state.sectionData["income-retirement"] = { entries: [{
    ...statement, simplifiedMethod: { ...worksheet, startingDate: "2001-01-15", priorRecovered: "25900.00" },
  }] };
  const nearlyRecovered = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(nearlyRecovered.form1099R?.[0]?.simplifiedMethodPriorYearRecovered).toBe("25900.00");
  expect(calculateFederalTax(nearlyRecovered).pensionDistributionsTaxable.toFixed()).toBe("5900");
});

it("holds a Code 1 pension at the owner's 2025 age threshold", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing synthetic retirement owner");
  personal.dateOfBirth = "1965-10-01";
  const worksheet = {
    planReference: "Confirmed pension contract",
    qualifiedPlanConfirmed: true, singleLifeAnnuitantConfirmed: true, statementCoversContractConfirmed: true,
    costInPlan: "31000", startingDate: "2025-07-01", ageAtStart: "59", monthsPaid: "6", priorRecovered: "0",
  };
  const statement = {
    ...completeRetirementSource, sourceTaxYear: "2025", distributionCode: "1",
    grossDistribution: "6000", taxableAmount: "", taxableAmountNotDetermined: true,
    taxableAmountConfirmed: null, simplifiedMethod: worksheet,
  };
  for (const [startingDate, monthsPaid] of [["2025-07-01", "6"], ["2025-04-01", "9"]]) {
    state.sectionData["income-retirement"] = { entries: [{ ...statement, simplifiedMethod: { ...worksheet, startingDate, monthsPaid } }] };
    const validation = validateSection(state, "income-retirement");
    expect(validation.status).toBe("partial");
    expect(validation.fieldErrors["retirement-0-taxable-worksheet"]).toContain("payment dates");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    expect(state.sectionData["income-retirement"].entries[0]?.distributionCode).toBe("1");
  }
  personal.dateOfBirth = "1990-07-01";
  state.sectionData["income-retirement"] = { entries: [{ ...statement, simplifiedMethod: { ...worksheet, ageAtStart: "35", costInPlan: "36000" } }] };
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.form1099R?.[0]?.distributionDate).toBeUndefined();
  expect(calculateFederalTax(input).form5329?.line4.toFixed()).toBe("540");
});

// Spec: spec/federal/guided-input.yaml, retirement-2026-simplified-method
it("reopens confirmed 2026 single-life pension facts without enabling the annual return or PDF", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Could not initialize guided household facts");
  personal.dateOfBirth = "1961-01-15";
  const worksheet = {
    planReference: "Plan 42 annuity contract",
    qualifiedPlanConfirmed: true,
    singleLifeAnnuitantConfirmed: true,
    statementCoversContractConfirmed: true,
    costInPlan: "26,000.00",
    startingDate: "2026-01-15",
    ageAtStart: "65",
    monthsPaid: "12",
    priorRecovered: "0.00",
  };
  const statement = {
    ...completeRetirementSource, sourceTaxYear: "2026", grossDistribution: "6000", federalWithheld: "125",
    taxableAmount: "", taxableAmountNotDetermined: true, taxableAmountConfirmed: null, simplifiedMethod: worksheet,
  };
  const reopen = (draft: typeof state) => {
    const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(draft) } as unknown as Storage, "retirement");
    if (!reopened) throw new Error("Could not reopen guided pension draft");
    return reopened;
  };
  state.sectionData["income-retirement"] = { entries: [statement] };
  const reopened = reopen(state);
  expect(reopened.sectionData["income-retirement"]?.entries[0]).toMatchObject(statement);
  expect(validateSection(reopened, "income-retirement").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
  expect(input.form1099R?.[0]).toMatchObject({
    taxYear: 2026, distributionCode: "7", iraSepSimple: false, taxableAmount: undefined, taxableAmountNotDetermined: true,
    simplifiedMethodCostInPlan: "26000.00", simplifiedMethodAnnuityStartingDate: "2026-01-15",
    simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 65, simplifiedMethodPaymentsReceivedThisYear: 12,
    simplifiedMethodPriorYearRecovered: "0.00",
  });
  const source = calculateForm1099R(input.form1099R, { taxYear: 2026 });
  expect(source.pensionGrossReported.toFixed()).toBe("6000");
  expect(source.pensionTaxable.toFixed()).toBe("4800");
  expect(source.federalWithholding.toFixed()).toBe("125");
  expect(() => calculateFederalTax(input)).toThrow(/2026.*incomplete; calculation is unavailable/);
  expect(() => assertPdfExportAllowed(input.taxpayer.taxYear, input.taxpayer.taxYear)).toThrow(/No qualified review PDF mapping is available for tax year 2026/);

  for (const [change, taxable] of [
    [{ startingDate: "2026-12-01", monthsPaid: "1" }, "5900"],
    [{ startingDate: "2025-01-15", priorRecovered: "1200.00", ageAtStart: "64" }, "4800"],
  ] as const) {
    state.sectionData["income-retirement"].entries = [{ ...statement, simplifiedMethod: { ...worksheet, ...change } }];
    const annual = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopen(state)));
    expect(calculateForm1099R(annual.form1099R, { taxYear: 2026 }).pensionTaxable.toFixed()).toBe(taxable);
  }
  for (const change of [
    { sourceTaxYear: "2025" }, { distributionCode: "1" }, { distributionCode: "4" }, { taxableAmount: "0" }, { trumpAccount: true },
    { simplifiedMethod: { ...worksheet, statementCoversContractConfirmed: null } },
    { simplifiedMethod: { ...worksheet, priorRecovered: "" } },
    { simplifiedMethod: { ...worksheet, priorRecovered: "0.01" } },
    { simplifiedMethod: { ...worksheet, startingDate: "2026-12-01" } },
    { simplifiedMethod: { ...worksheet, startingDate: "2027-01-01" } },
  ]) {
    state.sectionData["income-retirement"].entries = [{ ...statement, ...change }];
    const unresolved = reopen(state);
    if (change.distributionCode === "1") {
      expect(unresolved.sectionData["income-retirement"]?.entries[0]?.distributionCode).toBe("1");
    }
    expect(validateSection(unresolved, "income-retirement").status, JSON.stringify(change)).toBe("partial");
    expect(buildTaxInputFromGuidedData(unresolved)).toBeNull();
  }
  const changedYear = reopen(setInterviewTaxYear(reopened, 2025));
  expect(changedYear.sectionData["income-retirement"]?.entries[0]?.sourceTaxYear).toBe("2026");
  expect(buildTaxInputFromGuidedData(changedYear)).toBeNull();
});

function editPensionEntries(state: GuidedFlowState, entries: RetirementEntryData[]) {
  return updateSectionData(state, "income-retirement", { entries });
}

function reopenPensionDraft(state: GuidedFlowState) {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) } as unknown as Storage;
  const target = { storageKey: "retirement-reducer" };
  expect(saveGuidedFlowState(storage, target, state)).toBe(true);
  const reopened = loadGuidedFlowState(storage, target);
  if (!reopened?.sectionData["income-retirement"]) throw new Error("Could not reopen guided pension draft");
  return { state: reopened, entries: reopened.sectionData["income-retirement"].entries };
}

function reviewedPensionDraft() {
  const start = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  start.taxYear = 2026;
  const birthday = "1960-01-01";
  const personal = { ...completePersonalInfo, dateOfBirth: birthday, spouse: { ...completePersonalInfo.spouse!, dateOfBirth: birthday } };
  start.sectionData["personal-info"] = personal;
  const worksheet = {
    planReference: "Plan 42", qualifiedPlanConfirmed: true, singleLifeAnnuitantConfirmed: true,
    statementCoversContractConfirmed: true, costInPlan: "26000", startingDate: "2025-01-15",
    ageAtStart: "65", monthsPaid: "12", priorRecovered: "1200",
  };
  const pension = {
    ...completeRetirementSource, sourceTaxYear: "2026", grossDistribution: "6000", taxableAmount: "",
    taxableAmountNotDetermined: true, taxableAmountConfirmed: null, simplifiedMethod: worksheet,
  };
  const spousePension = {
    ...pension, accountHolder: "spouse" as const, accountReference: "spouse original",
    simplifiedMethod: { ...worksheet, planReference: "Spouse plan", costInPlan: "32000" },
  };
  return { draft: editPensionEntries(start, [pension, spousePension]), personal, pension, spousePension, worksheet };
}

// Spec: spec/federal/guided-input.yaml, retirement-source-identity
it("holds carried pension coverage after a direct original or contract edit and reopen", () => {
  const { draft, pension, spousePension, worksheet } = reviewedPensionDraft();
  const newPension = { ...pension, accountReference: "additional original", simplifiedMethod: { ...worksheet, planReference: "Additional plan" } };
  const formattedPension = {
    ...pension, payerTin: "123456789", accountReference: "  SYNTHETIC-RETIREMENT-1  ",
    simplifiedMethod: { ...worksheet, planReference: "  PLAN 42  ", monthsPaid: "11" },
  };
  const reordered = reopenPensionDraft(editPensionEntries(draft, [newPension, { ...spousePension }, formattedPension]));
  expect(reordered.entries.map(entry => entry.simplifiedMethod?.statementCoversContractConfirmed)).toEqual([true, true, true]);
  expect(validateSection(reordered.state, "income-retirement").status).toBe("complete");

  for (const edit of [
    { accountReference: "corrected original" },
    { payerTin: "12-3456788" },
    { accountHolder: "spouse" as const },
    { simplifiedMethod: { ...worksheet, planReference: "Other contract" } },
  ]) {
    const changed = reopenPensionDraft(editPensionEntries(draft, [spousePension, { ...pension, ...edit }]));
    const incomingWorksheet = "simplifiedMethod" in edit ? edit.simplifiedMethod : worksheet;
    const [other, replacement] = changed.entries;
    expect(other?.simplifiedMethod?.statementCoversContractConfirmed).toBe(true);
    const onlyGeneralReview = reopenPensionDraft(editPensionEntries(changed.state, [other, { ...replacement, sourceFactsConfirmed: true }]));
    expect(validateSection(onlyGeneralReview.state, "income-retirement").message, JSON.stringify(edit)).toMatch(/Box 1 on this original reports all 2026 periodic payments/);
    expect(onlyGeneralReview.entries[1]).toMatchObject({
      sourceFactsConfirmed: true, taxableAmount: "", simplifiedMethod: { ...incomingWorksheet, statementCoversContractConfirmed: null },
    });
    expect(buildTaxInputFromGuidedData(onlyGeneralReview.state)).toBeNull();

    const reviewed = reopenPensionDraft(editPensionEntries(onlyGeneralReview.state, [
      other, { ...onlyGeneralReview.entries[1], simplifiedMethod: { ...incomingWorksheet, statementCoversContractConfirmed: true } },
    ]));
    expect(validateSection(reviewed.state, "income-retirement").status).toBe("complete");
    expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reviewed.state)).form1099R?.[1]).toMatchObject({
      taxableAmount: undefined, simplifiedMethodPaymentsReceivedThisYear: 12, simplifiedMethodPriorYearRecovered: "1200",
    });
  }

  const amendedYear = editPensionEntries(draft, [spousePension, { ...pension, sourceTaxYear: "2025" }]);
  expect(amendedYear.sectionData["income-retirement"]?.entries[1]?.simplifiedMethod).toEqual({
    ...worksheet, statementCoversContractConfirmed: null, monthsPaid: "", priorRecovered: "",
  });

  const collided = reopenPensionDraft(editPensionEntries(draft, [pension, {
    ...spousePension, accountHolder: pension.accountHolder, accountReference: pension.accountReference,
    simplifiedMethod: { ...spousePension.simplifiedMethod, planReference: worksheet.planReference },
  }]));
  expect(collided.entries.map(entry => entry.simplifiedMethod?.statementCoversContractConfirmed)).toEqual([null, null]);
  const resolved = reopenPensionDraft(editPensionEntries(collided.state, [{ ...collided.entries[1], sourceFactsConfirmed: true }]));
  expect(validateSection(resolved.state, "income-retirement").message).toMatch(/Box 1 on this original reports all 2026 periodic payments/);
});

// Spec: spec/federal/guided-input.yaml, retirement-source-identity
it("requires fresh coverage for simultaneous original removal and worksheet replacement", () => {
  const { draft, pension, worksheet } = reviewedPensionDraft();
  const otherOriginal = {
    ...pension, payerTin: "12-3456788",
    simplifiedMethod: { ...worksheet, costInPlan: "32000", priorRecovered: "0" },
  };
  const existing = editPensionEntries(draft, [pension]);
  const twoOriginals = editPensionEntries(existing, [pension, otherOriginal]);
  expect(validateSection(twoOriginals, "income-retirement").status).toBe("complete");
  const retained = reopenPensionDraft(editPensionEntries(twoOriginals, [{
    ...otherOriginal, simplifiedMethod: {
      ...otherOriginal.simplifiedMethod, planReference: "  PLAN 42 ", costInPlan: "32,000.00", priorRecovered: "0.00",
    },
  }]));
  expect(validateSection(retained.state, "income-retirement").status).toBe("complete");

  const replaced = reopenPensionDraft(editPensionEntries(twoOriginals, [{ ...pension, payerTin: otherOriginal.payerTin }]));
  const generalReview = reopenPensionDraft(editPensionEntries(replaced.state, [{ ...replaced.entries[0], sourceFactsConfirmed: true }]));
  expect(validateSection(generalReview.state, "income-retirement").message).toMatch(/Box 1 on this original reports all 2026 periodic payments/);
  expect(generalReview.entries[0]?.simplifiedMethod).toEqual({ ...worksheet, statementCoversContractConfirmed: null });
  const reviewed = reopenPensionDraft(editPensionEntries(generalReview.state, [{ ...generalReview.entries[0], simplifiedMethod: worksheet }]));
  expect(validateSection(reviewed.state, "income-retirement").status).toBe("complete");
});

// Spec: spec/federal/guided-input.yaml, retirement-2026-simplified-method
it("clears copied annual pension amounts when year and identity are corrected together", () => {
  const { draft, pension, worksheet } = reviewedPensionDraft();
  const formerWorksheet = { ...worksheet, startingDate: "2024-01-15", ageAtStart: "64" };
  const original = { ...pension, simplifiedMethod: formerWorksheet };
  const originalOnly = editPensionEntries(draft, [pension]);
  const confirmed = editPensionEntries(originalOnly, [original]);
  expect(validateSection(confirmed, "income-retirement").status).toBe("complete");
  const priorYearReturn = setInterviewTaxYear(confirmed, 2025);
  const corrected = { ...original, sourceTaxYear: "2025", payerTin: "12-3456788", accountReference: "corrected original" };
  const copiedWorksheet = { ...formerWorksheet, costInPlan: "26,000.00", priorRecovered: "1,200.00" };

  const replaced = reopenPensionDraft(editPensionEntries(priorYearReturn, [{ ...corrected, simplifiedMethod: copiedWorksheet }]));
  expect(replaced.entries[0]).toMatchObject({
    sourceTaxYear: "2025", accountReference: "corrected original", taxableAmount: "",
    simplifiedMethod: { ...copiedWorksheet, statementCoversContractConfirmed: null, monthsPaid: "", priorRecovered: "" },
  });
  const coverageOnly = reopenPensionDraft(editPensionEntries(replaced.state, [{
    ...replaced.entries[0], sourceFactsConfirmed: true,
    simplifiedMethod: { ...replaced.entries[0]?.simplifiedMethod, statementCoversContractConfirmed: true },
  }]));
  expect(validateSection(coverageOnly.state, "income-retirement").message).toMatch(/actual months covered by 2025 annuity payments/i);

  const newWorksheet = { ...formerWorksheet, monthsPaid: "8", priorRecovered: "300" };
  const independentlyEntered = reopenPensionDraft(editPensionEntries(priorYearReturn, [{ ...corrected, simplifiedMethod: newWorksheet }]));
  expect(independentlyEntered.entries[0]?.simplifiedMethod).toEqual({ ...newWorksheet, statementCoversContractConfirmed: null });
  const freshReview = reopenPensionDraft(editPensionEntries(independentlyEntered.state, [{
    ...independentlyEntered.entries[0], sourceFactsConfirmed: true, simplifiedMethod: newWorksheet,
  }]));
  expect(validateSection(freshReview.state, "income-retirement").status).toBe("complete");
});

// Spec: spec/federal/guided-input.yaml, retirement-source-identity
it("requires pension coverage again for a different taxpayer in the same recipient role", () => {
  const { draft, personal, spousePension } = reviewedPensionDraft();
  const equivalent = { ...personal, addressLine1: "15 Different Street", spouse: { ...personal.spouse, firstName: "  TAYLOR  ", ssn: "222334444" } };
  const formatted = reopenPensionDraft(updateSectionData(draft, "personal-info", equivalent));
  expect(formatted.entries.map(entry => entry.simplifiedMethod?.statementCoversContractConfirmed)).toEqual([true, true]);
  const changed = reopenPensionDraft(updateSectionData(formatted.state, "personal-info", {
    ...equivalent, spouse: { ...equivalent.spouse, firstName: "Casey", ssn: "222-33-4445" },
  }));
  expect(changed.entries[0].simplifiedMethod?.statementCoversContractConfirmed).toBe(true);
  const onlyGeneralReview = reopenPensionDraft(editPensionEntries(changed.state, [
    changed.entries[0], { ...changed.entries[1], sourceFactsConfirmed: true },
  ]));
  expect(validateSection(onlyGeneralReview.state, "income-retirement").message).toMatch(/Box 1 on this original reports all 2026 periodic payments/);
  expect(onlyGeneralReview.entries[1]?.simplifiedMethod).toEqual({ ...spousePension.simplifiedMethod, statementCoversContractConfirmed: null });
  const reviewed = reopenPensionDraft(editPensionEntries(onlyGeneralReview.state, [
    onlyGeneralReview.entries[0], { ...onlyGeneralReview.entries[1], simplifiedMethod: spousePension.simplifiedMethod },
  ]));
  expect(validateSection(reviewed.state, "income-retirement").status).toBe("complete");
});

it("requires actual retirement source ownership and preserves zero and unknown amounts", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.sectionData["income-retirement"] = { entries: [{ ...completeRetirementSource, grossDistribution: "0", taxableAmount: "0" }] };
  expect(buildTaxInputFromGuidedData(state)?.form1099R?.[0]).toMatchObject({ grossDistribution: "0", taxableAmount: "0", accountHolder: "primary", payerTin: "12-3456789", iraSepSimple: false });
  expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "1099-r")?.coverage).toBe("supported");
  for (const change of [{ isIraSepSimple: null }, { accountHolder: undefined }, { taxableAmount: "" }, { federalWithheld: "" }, { sourceTaxYear: "2026" }, { sourceFactsConfirmed: undefined }, { taxableAmountConfirmed: undefined }]) {
    state.sectionData["income-retirement"].entries = [{ ...completeRetirementSource, ...change }];
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    expect(buildGuidedSyntheticDocuments(state).find(document => document.kind === "1099-r")?.coverage).toBe("partially-supported");
  }
  expect(buildGuidedFactAnswers(state).find(fact => fact.factId === "retirement-distribution-review")?.answerText).not.toContain("confirmed");
});

// Spec: spec/federal/guided-input.yaml, retirement-distribution-code-spacing
it("carries a printed space in confirmed retirement codes through 2025 and 2026 guided input", () => {
  const cases = ([2025, 2026] as const).map(taxYear => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
    state.taxYear = taxYear;
    const personal = state.sectionData["personal-info"];
    if (!personal) throw new Error("Could not initialize guided household facts");
    personal.dateOfBirth = "1950-02-15";
    const statement = {
      ...completeRetirementSource, sourceTaxYear: String(taxYear), distributionCode: "7 D",
      grossDistribution: "1000", taxableAmount: "900.25", federalWithheld: "125",
    };
    state.sectionData["income-retirement"] = { entries: [statement] };
    const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(state) } as unknown as Storage, "retirement");
    if (!reopened) throw new Error("Could not reopen the guided retirement draft");
    expect(reopened.sectionData["income-retirement"]?.entries[0]?.distributionCode).toBe("7 D");
    return { taxYear, state, statement, reopened };
  });
  expect(cases.map(({ taxYear, reopened }) => ({ taxYear, status: validateSection(reopened, "income-retirement").status }))).toEqual([
    { taxYear: 2025, status: "complete" }, { taxYear: 2026, status: "complete" },
  ]);
  for (const { taxYear, state, statement, reopened } of cases) {
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
    expect(input.form1099R?.[0]).toMatchObject({ distributionCode: "7D", taxableAmount: "900.25", federalWithheld: "125" });
    expect(calculateForm1099R(input.form1099R, { taxYear }).pensionTaxable.toFixed(2)).toBe("900.25");
    if (taxYear === 2025) expect(calculateFederalTax(input).totalWithholding.toFixed()).toBe("125");

    state.sectionData["income-retirement"].entries = [{ ...statement, taxableAmount: "0.00" }];
    expect(buildTaxInputFromGuidedData(state)?.form1099R?.[0]?.taxableAmount).toBe("0.00");
    for (const change of [{ taxableAmount: "" }, { distributionCode: "" }, { distributionCode: "7 / D" }, { distributionCode: "7  D" }, { distributionCode: "7 J" }]) {
      state.sectionData["income-retirement"].entries = [{ ...statement, ...change }];
      expect(validateSection(state, "income-retirement").status).toBe("partial");
      expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    }
  }
});

// Spec: spec/federal/guided-input.yaml, retirement-2026-disability-code-d-pair
it("carries either printed Code 3 and D order through the reopened 2026 retirement interview", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const statement = {
    ...completeRetirementSource, sourceTaxYear: "2026",
    grossDistribution: "1000", taxableAmount: "900.25", federalWithheld: "125",
  };
  for (const [printedCode, distributionCode] of [["3 D", "3D"], ["D 3", "D3"]]) {
    state.sectionData["income-retirement"] = { entries: [{ ...statement, distributionCode: printedCode }] };
    const reopened = loadGuidedFlowState({ getItem: () => JSON.stringify(state) } as unknown as Storage, "retirement");
    if (!reopened) throw new Error("Could not reopen the guided retirement draft");
    expect(reopened.sectionData["income-retirement"]?.entries[0]?.distributionCode).toBe(printedCode);
    expect.soft(validateSection(reopened, "income-retirement").status, printedCode).toBe("complete");
    const built = buildTaxInputFromGuidedData(reopened);
    expect.soft(built?.form1099R?.[0], printedCode).toMatchObject({
      taxYear: 2026, distributionCode, taxableAmount: "900.25", federalWithheld: "125",
      iraSepSimple: false, eligibleGovernmental457bPlan: false,
    });
    if (!built) continue;
    const input = TaxYearInputSchema.parse(built);
    expect(input.form1099R?.[0]?.disabilityPensionSource).toBeUndefined();
    const result = calculateForm1099R(input.form1099R, { taxYear: 2026 });
    expect(result.pensionTaxable.toFixed(2)).toBe("900.25");
    expect(result.federalWithholding.toFixed(2)).toBe("125.00");
  }
});

it("retains the guided Code D classifications and standalone Code 3 payment-period requirement", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const statement = { ...completeRetirementSource, sourceTaxYear: "2026" };
  const cases = [
    [{ distributionCode: "3 D", isIraSepSimple: true }, "retirement-0-nonqualified-plan"],
    [{ distributionCode: "D 3", eligibleGovernmental457bPlan: true, governmental457bTransferredTaxableAmount: "0" }, "retirement-0-nonqualified-plan"],
    [{ distributionCode: "3" }, "retirement-0-code3-disability"],
    [{ distributionCode: "3 7" }, "retirement-0-code"],
  ] as const;
  for (const [change, field] of cases) {
    state.sectionData["income-retirement"] = { entries: [{ ...statement, ...change }] };
    const validation = validateSection(state, "income-retirement");
    expect(validation.status).toBe("partial");
    expect(validation.fieldErrors).toHaveProperty(field);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  state.taxYear = 2025;
  state.sectionData["income-retirement"] = { entries: [{ ...completeRetirementSource, distributionCode: "3 D" }] };
  expect(validateSection(state, "income-retirement").fieldErrors).toHaveProperty("retirement-0-code");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("keeps the 2026 qualified lump-sum reporting decision for a spaced Code A pair", () => {
  const statement = { ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "4 A" };
  expect(() => buildRetirementInputs([statement], "single", 2026)).toThrow(/actual reporting method/i);
  expect(() => buildRetirementInputs([{ ...statement, qualifiedLumpSumReporting: "form_4972" }], "single", 2026)).toThrow(/separate Form 4972/i);
  expect(buildRetirementInputs([{ ...statement, qualifiedLumpSumReporting: "ordinary_pension" }], "single", 2026)[0])
    .toMatchObject({ distributionCode: "4A", qualifiedLumpSumReporting: "ordinary_pension", taxableAmount: "1000" });
  expect(() => buildRetirementInputs([{ ...statement, sourceTaxYear: "2025", qualifiedLumpSumReporting: "ordinary_pension" }], "single", 2025)).toThrow(/special worksheet/i);
});

it("forwards actual recipient and matching state withholding without inventing local identity", () => {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["retirement"], lifeEvents: [], stateCode: "PA" });
  state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0";
  state.sectionData["income-retirement"] = { entries: [
    { ...completeRetirementSource, accountHolder: "spouse", stateTaxReporting: "single", state: "PA", stateWithheld: "0.10", stateDistribution: "1000" },
    { ...completeRetirementSource, payer: "Other payer", accountReference: "other", stateTaxReporting: "single", state: "NY", stateWithheld: "0.20", stateDistribution: "1000" },
  ] };
  expect(buildTaxInputFromGuidedData(state)?.form1099R?.[0]).toMatchObject({ accountHolder: "spouse", state: "PA", stateWithheld: "0.10", stateDistribution: "1000" });
  assertPAGuidedPaymentBoundary(state, "0.1", "0");
  // The old zero is a whole-dollar legacy projection, not a qualified joint PA result.
  const legacy = calculatePAReturn(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), buildGuidedPennsylvaniaOverrides(state));
  expect(legacy.pa40.stateWithholding.toFixed()).toBe("0");
  const beforeRead = JSON.stringify(state), preview = computeGuidedPreview(state);
  expect(preview).not.toBeNull(); expect(preview?.state).toBeNull(); expect(JSON.stringify(state)).toBe(beforeRead);
  state.sectionData["income-retirement"].entries[0]!.stateTaxReporting = "none";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("keeps unsupported source and basis facts saved and requires actual 2026 source classifications", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  for (const change of [{ trumpAccount: undefined }, { trumpAccount: true }, { excessContributionEarnings: "0.01" }, { capitalGainIncluded: "0.01" }, { additionalWorksheetRequired: true }, { isIraSepSimple: true, iraBasisConfirmedZero: null }, { distributionCode: "J" }, { taxableAmountNotDetermined: true, employeeContributions: "1" }]) {
    const record = { ...completeRetirementSource, sourceTaxYear: "2026", ...change };
    state.sectionData["income-retirement"] = { entries: [record] };
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(change)).toBeNull();
    expect(state.sectionData["income-retirement"].entries[0]).toMatchObject(change);
  }
});

it("forwards the actual 2026 QCD worksheet without inventing Box 2a", () => {
  const qcdSource = {
    transferReference: "Trustee confirmation 42",
    distributionDate: "2026-10-30",
    recipientName: "Community charity",
    ordinaryTraditionalIraConfirmed: true,
    ageRequirementConfirmed: true,
    directTrusteeTransferConfirmed: true,
    eligibleRecipientAndAcknowledgmentConfirmed: true,
    transferAmount: "6,500.00",
    adjustmentWorksheetReference: "Owner's Pub. 590-B worksheet",
    allOwnerTransfersAndContributionsConfirmed: true,
    unusedPriorDeductedContributions: "4,000.00",
    currentDeductedContributions: "0",
  };
  const statement = {
    ...completeRetirementSource,
    sourceTaxYear: "2026",
    distributionCode: "Y7",
    isIraSepSimple: true,
    iraBasisConfirmedZero: true,
    grossDistribution: "6,500.00",
    taxableAmount: "",
    taxableAmountConfirmed: null,
    taxableAmountNotDetermined: true,
    trumpAccount: false,
    excessContributionEarnings: "0",
    qcdSource,
  };
  const inputs = buildRetirementInputs([statement], "single", 2026);
  expect(inputs).toMatchObject([{
    taxableAmount: undefined,
    taxableAmountNotDetermined: true,
    qcdSource: { ...qcdSource, transferAmount: "6500.00", unusedPriorDeductedContributions: "4000.00" },
  }]);
  const calculated = calculateForm1099R(inputs.map(input => Form1099RSchema.parse(input)), { taxYear: 2026 });
  expect(calculated.iraQualifiedCharitableDistributions.toFixed(2)).toBe("2500.00");
  expect(calculated.iraTaxable.toFixed(2)).toBe("4000.00");
  expect(buildRetirementInputs([{ ...statement, distributionCode: "Y 7" }], "single", 2026)).toEqual(inputs);
  expect(buildRetirementInputs([{ ...statement, distributionCode: "7" }], "single", 2026)[0]).toHaveProperty("qcdSource");
  expect(() => buildRetirementInputs([{ ...statement, distributionCode: "7Y" }], "single", 2026)).toThrow(/worksheet/i);
  expect(() => buildRetirementInputs([{ ...statement, distributionCode: "7 Y" }], "single", 2026)).toThrow(/worksheet/i);
  expect(() => buildRetirementInputs([{ ...statement, qcdSource: undefined }], "single", 2026)).toThrow(/QCD.*worksheet/i);
  expect(() => buildRetirementInputs([{ ...statement, qcdSource: { ...qcdSource, currentDeductedContributions: "" } }], "single", 2026)).toThrow(/current.*deducted/i);
  expect(() => buildRetirementInputs([{ ...statement, qcdSource: { ...qcdSource, distributionDate: "2026-02-30" } }], "single", 2026)).toThrow(/transfer date/i);
  expect(() => buildRetirementInputs([{ ...statement, sourceFactsConfirmed: null }], "single", 2026)).toThrow(/confirm/i);
});

const qcdWorksheet = {
  transferReference: "Fictional current-year trustee transfer",
  distributionDate: "2026-10-30",
  recipientName: "Fictional charity",
  ordinaryTraditionalIraConfirmed: true,
  ageRequirementConfirmed: true,
  directTrusteeTransferConfirmed: true,
  eligibleRecipientAndAcknowledgmentConfirmed: true,
  transferAmount: "6500.00",
  adjustmentWorksheetReference: "Fictional owner adjustment worksheet",
  allOwnerTransfersAndContributionsConfirmed: true,
  unusedPriorDeductedContributions: "4000.00",
  currentDeductedContributions: "0",
};
const qcdStatement = {
  ...completeRetirementSource,
  sourceTaxYear: "2026",
  distributionCode: "Y7",
  isIraSepSimple: true,
  iraBasisConfirmedZero: true,
  grossDistribution: "6500.00",
  taxableAmount: "",
  taxableAmountConfirmed: null,
  taxableAmountNotDetermined: true,
  trumpAccount: false,
  excessContributionEarnings: "0",
  qcdSource: qcdWorksheet,
};

function jointQcdDraft() {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.taxYear = 2026;
  const spouse = completePersonalInfo.spouse;
  if (!spouse) throw new Error("Missing joint fixture owner");
  const personal = { ...completePersonalInfo, dateOfBirth: "1952-02-15", spouse: { ...spouse, dateOfBirth: "1954-02-15" } };
  state.sectionData["personal-info"] = personal;
  return { state, personal };
}

it("revokes old QCD evidence when the same household role is a different person", () => {
  const { state, personal } = jointQcdDraft();
  for (const role of ["primary", "spouse"] as const) {
    const entry = { ...qcdStatement, accountHolder: role };
    const confirmed = updateSectionData(state, "income-retirement", { entries: [entry] });
    expect(buildTaxInputFromGuidedData(confirmed)?.form1099R?.[0]?.qcdSource).toMatchObject(qcdWorksheet);
    const movedStatement = updateSectionData(confirmed, "income-retirement", {
      entries: [{ ...entry, accountHolder: role === "primary" ? "spouse" : "primary" }],
    });
    expect(movedStatement.sectionData["income-retirement"]?.entries[0]).toMatchObject({
      iraBasisConfirmedZero: null, sourceFactsConfirmed: null,
      qcdSource: { allOwnerTransfersAndContributionsConfirmed: null, currentDeductedContributions: "0" },
    });
    const moved = updateSectionData(confirmed, "personal-info", { ...personal, city: "Another City" });
    const otherPerson = role === "primary"
      ? { ...personal, spouse: { ...personal.spouse, ssn: "222-88-4444" } }
      : { ...personal, ssn: "111-88-3333" };
    const otherChanged = updateSectionData(moved, "personal-info", otherPerson);
    expect(otherChanged.sectionData["income-retirement"]?.entries[0]?.qcdSource).toMatchObject(qcdWorksheet);
    expect(parseGuidedFlowState(JSON.stringify(otherChanged))?.sectionData["income-retirement"]?.entries[0]?.qcdSource).toMatchObject(qcdWorksheet);
    const replacement = role === "primary"
      ? { ...otherPerson, ssn: "111-77-3333", dateOfBirth: "1955-01-15" }
      : { ...otherPerson, spouse: { ...otherPerson.spouse, ssn: "222-77-4444", dateOfBirth: "1955-01-15" } };
    const changed = updateSectionData(otherChanged, "personal-info", replacement);
    expect(changed.sectionData["income-retirement"]?.entries[0]).toMatchObject({
      accountHolder: role, sourceFactsConfirmed: null, iraBasisConfirmedZero: null,
      qcdSource: {
        transferReference: qcdWorksheet.transferReference, distributionDate: qcdWorksheet.distributionDate,
        adjustmentWorksheetReference: qcdWorksheet.adjustmentWorksheetReference,
        unusedPriorDeductedContributions: "4000.00", currentDeductedContributions: "0",
        ageRequirementConfirmed: null, allOwnerTransfersAndContributionsConfirmed: null,
        directTrusteeTransferConfirmed: null, eligibleRecipientAndAcknowledgmentConfirmed: null,
        ordinaryTraditionalIraConfirmed: null,
      },
    });
    const pending = changed.sectionData["income-retirement"]?.entries[0];
    if (!pending) throw new Error("Missing retained original");
    const onlyOuterConfirmed = updateSectionData(changed, "income-retirement", { entries: [{ ...pending, sourceFactsConfirmed: true }] });
    const reopened = parseGuidedFlowState(JSON.stringify(onlyOuterConfirmed));
    expect(reopened).not.toBeNull();
    expect(reopened && buildTaxInputFromGuidedData(reopened)).toBeNull();
    const correctedBirthDate = role === "primary"
      ? { ...personal, dateOfBirth: "1952-01-15" }
      : { ...personal, spouse: { ...personal.spouse, dateOfBirth: "1954-01-15" } };
    expect(updateSectionData(confirmed, "personal-info", correctedBirthDate)
      .sectionData["income-retirement"]?.entries[0]?.qcdSource?.ageRequirementConfirmed).toBeNull();
  }
});

it("holds unbound saved QCD confirmations and keeps ordinary Code 7", () => {
  const { state } = jointQcdDraft();
  const ordinary = {
    ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "7",
    isIraSepSimple: true, iraBasisConfirmedZero: true, trumpAccount: false, excessContributionEarnings: "0",
    accountReference: "Different fictional ordinary IRA account",
  };
  const reopened = parseGuidedFlowState(JSON.stringify({
    ...state, sectionData: { ...state.sectionData, "income-retirement": { entries: [qcdStatement, ordinary] } },
  }));
  expect(reopened?.sectionData["income-retirement"]?.entries).toMatchObject([
    {
      sourceFactsConfirmed: null, iraBasisConfirmedZero: null,
      qcdSource: {
        allOwnerTransfersAndContributionsConfirmed: null, ageRequirementConfirmed: null,
        transferReference: qcdWorksheet.transferReference, currentDeductedContributions: "0",
      },
    },
    { distributionCode: "7", sourceFactsConfirmed: true, iraBasisConfirmedZero: true },
  ]);
  expect(reopened?.sectionData["income-retirement"]?.entries[1]?.qcdSource).toBeUndefined();
  expect(reopened && buildTaxInputFromGuidedData(reopened)).toBeNull();
  const pending = reopened?.sectionData["income-retirement"]?.entries[0];
  if (!reopened || !pending?.qcdSource) throw new Error("Missing retained QCD worksheet");
  const partial = updateSectionData(reopened, "income-retirement", {
    entries: [{ ...pending, qcdSource: { ...pending.qcdSource, ageRequirementConfirmed: true } }, ordinary],
  });
  const reopenedPartial = parseGuidedFlowState(JSON.stringify(partial));
  const partialEntry = reopenedPartial?.sectionData["income-retirement"]?.entries[0];
  if (!reopenedPartial || !partialEntry?.qcdSource) throw new Error("Could not reopen partial QCD review");
  expect(partialEntry.qcdSource).toMatchObject({
    ageRequirementConfirmed: true, allOwnerTransfersAndContributionsConfirmed: null, currentDeductedContributions: "0",
  });
  const reviewed = updateSectionData(reopenedPartial, "income-retirement", {
    entries: [{ ...partialEntry, qcdSource: qcdWorksheet, iraBasisConfirmedZero: true, sourceFactsConfirmed: true }, ordinary],
  });
  const bound = parseGuidedFlowState(JSON.stringify(reviewed));
  const fingerprint = bound?.sectionData["income-retirement"]?.entries[0]?.qcdSource?.reviewedSourceFingerprint;
  expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  if (!bound || !fingerprint) throw new Error("Missing confirmed local QCD owner");
  const canonical = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(bound));
  expect(canonical.form1099R?.[0]?.qcdSource).toEqual(qcdWorksheet);
  expect(JSON.stringify([canonical, buildGuidedFactAnswers(bound), buildGuidedSyntheticDocuments(bound)])).not.toContain(fingerprint);
  const forms = calculateForm1099R(canonical.form1099R, { taxYear: 2026, hasJointSpouse: true, qcdReturnContext: canonical });
  expect(forms.iraQualifiedCharitableDistributions.toFixed()).toBe("2500");
  expect(forms.iraTaxable.toFixed()).toBe("5000");
});

it("holds a saved QCD review after an age-eligible birth date is replaced", () => {
  const { state, personal } = jointQcdDraft();
  const confirmed = updateSectionData(state, "income-retirement", { entries: [qcdStatement] });
  confirmed.sectionData["personal-info"] = { ...personal, dateOfBirth: "1953-05-20" };
  const reopened = parseGuidedFlowState(JSON.stringify(confirmed));
  expect(reopened?.sectionData["income-retirement"]?.entries[0]).toMatchObject({
    sourceFactsConfirmed: null, iraBasisConfirmedZero: null,
    qcdSource: { ageRequirementConfirmed: null, allOwnerTransfersAndContributionsConfirmed: null, currentDeductedContributions: "0" },
  });
  expect(reopened && buildTaxInputFromGuidedData(reopened)).toBeNull();
});

it("holds saved QCD evidence that changed outside review", () => {
  for (const edited of [
    { qcdSource: { ...qcdWorksheet, unusedPriorDeductedContributions: "0" } },
    { qcdSource: { ...qcdWorksheet, transferReference: "Another receipt" } },
    { accountReference: "Another IRA account" },
  ]) {
    const { state } = jointQcdDraft();
    const confirmed = updateSectionData(state, "income-retirement", { entries: [qcdStatement] });
    const retirement = confirmed.sectionData["income-retirement"];
    const original = retirement?.entries[0];
    if (!retirement || !original?.qcdSource) throw new Error("Missing reviewed QCD draft");
    retirement.entries = [{
      ...original, accountReference: "accountReference" in edited ? edited.accountReference : original.accountReference,
      qcdSource: { ...original.qcdSource, ...("qcdSource" in edited ? edited.qcdSource : {}) },
    }];
    const reopened = parseGuidedFlowState(JSON.stringify(confirmed));
    expect(reopened?.sectionData["income-retirement"]?.entries[0]).toMatchObject({
      sourceFactsConfirmed: null, iraBasisConfirmedZero: null,
      qcdSource: {
        allOwnerTransfersAndContributionsConfirmed: null, currentDeductedContributions: "0",
        unusedPriorDeductedContributions: edited.qcdSource?.unusedPriorDeductedContributions ?? "4000.00",
        transferReference: edited.qcdSource?.transferReference ?? qcdWorksheet.transferReference,
      },
    });
    expect(reopened && buildTaxInputFromGuidedData(reopened)).toBeNull();
  }
});

it("preserves independent QCD confirmations across a legitimate worksheet edit and reload", () => {
  const { state } = jointQcdDraft();
  const confirmed = updateSectionData(state, "income-retirement", { entries: [qcdStatement] });
  const original = confirmed.sectionData["income-retirement"]?.entries[0];
  if (!original?.qcdSource) throw new Error("Missing reviewed QCD draft");
  const edited = updateSectionData(confirmed, "income-retirement", {
    entries: [{ ...original, qcdSource: { ...original.qcdSource, unusedPriorDeductedContributions: "0" } }],
  });
  const reopened = parseGuidedFlowState(JSON.stringify(edited));
  const entry = reopened?.sectionData["income-retirement"]?.entries[0];
  expect(entry).toMatchObject({
    sourceFactsConfirmed: null, iraBasisConfirmedZero: true,
    qcdSource: {
      ageRequirementConfirmed: true, directTrusteeTransferConfirmed: true, allOwnerTransfersAndContributionsConfirmed: null,
      unusedPriorDeductedContributions: "0", currentDeductedContributions: "0",
    },
  });
  expect(reopened && buildTaxInputFromGuidedData(reopened)).toBeNull();
  if (!reopened || !entry?.qcdSource) throw new Error("Missing reopened partial review");
  const reviewed = updateSectionData(reopened, "income-retirement", {
    entries: [{ ...entry, qcdSource: { ...entry.qcdSource, allOwnerTransfersAndContributionsConfirmed: true }, sourceFactsConfirmed: true }],
  });
  const restored = parseGuidedFlowState(JSON.stringify(reviewed));
  const canonical = TaxYearInputSchema.parse(restored && buildTaxInputFromGuidedData(restored));
  const forms = calculateForm1099R(canonical.form1099R, { taxYear: 2026, hasJointSpouse: true, qcdReturnContext: canonical });
  expect(forms.iraQualifiedCharitableDistributions.toFixed()).toBe("6500");
  expect(forms.iraTaxable.toFixed()).toBe("0");
});

it("keeps a distinct ordinary Code 7 that replaces a removed QCD statement", () => {
  const { state } = jointQcdDraft();
  const confirmed = updateSectionData(state, "income-retirement", { entries: [qcdStatement] });
  const ordinary = {
    ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "7",
    isIraSepSimple: true, iraBasisConfirmedZero: true, trumpAccount: false, excessContributionEarnings: "0",
    accountReference: "Different fictional ordinary IRA account",
  };
  const updated = updateSectionData(confirmed, "income-retirement", { entries: [ordinary] });
  expect(updated.sectionData["income-retirement"]?.entries).toEqual([ordinary]);
  expect(buildTaxInputFromGuidedData(updated)?.form1099R?.[0]).toMatchObject({
    distributionCode: "7", accountReference: ordinary.accountReference, iraBasisConfirmedZero: true,
  });
});

it("preserves a first explicit QCD No after reopening the draft", () => {
  const { state } = jointQcdDraft();
  const source = {
    transferReference: qcdWorksheet.transferReference,
    distributionDate: qcdWorksheet.distributionDate,
    recipientName: qcdWorksheet.recipientName,
    transferAmount: qcdWorksheet.transferAmount,
    adjustmentWorksheetReference: qcdWorksheet.adjustmentWorksheetReference,
    unusedPriorDeductedContributions: "0",
    currentDeductedContributions: "0",
  };
  const started = { ...qcdStatement, sourceFactsConfirmed: null, qcdSource: source };
  const draft = updateSectionData(state, "income-retirement", { entries: [started] });
  const reviewed = updateSectionData(draft, "income-retirement", {
    entries: [{ ...started, qcdSource: { ...source, directTrusteeTransferConfirmed: false } }],
  });
  const reopened = parseGuidedFlowState(JSON.stringify(reviewed));
  const entry = reopened?.sectionData["income-retirement"]?.entries[0];
  expect(entry).toMatchObject({
    iraBasisConfirmedZero: true,
    sourceFactsConfirmed: null,
    qcdSource: { ...source, directTrusteeTransferConfirmed: false },
  });
  if (!reopened || !entry) throw new Error("Missing reopened QCD statement");
  const generalReview = updateSectionData(reopened, "income-retirement", {
    entries: [{
      ...entry, sourceFactsConfirmed: true,
      qcdSource: { ...qcdWorksheet, ...source, directTrusteeTransferConfirmed: false },
    }],
  });
  expect(validateSection(generalReview, "income-retirement").fieldErrors).toHaveProperty("retirement-0-qcd-directTrusteeTransferConfirmed");
  expect(buildTaxInputFromGuidedData(generalReview)).toBeNull();
});

it("counts actual local withholding in the allocation once and rejects duplicate or contradictory sources", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const source = { ...completeRetirementSource, localTaxReporting: "single" as const, locality: "Actual locality", localTaxWithheld: "0.30", localDistribution: "1000" };
  state.sectionData["income-retirement"] = { entries: [source] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0.30";
  expect(buildTaxInputFromGuidedData(state)?.form1099R?.[0]?.localTaxWithheld).toBe("0.30");
  state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0.31";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  for (const change of [{ accountHolder: "spouse" as const }, { eligibleGovernmental457bPlan: false, governmental457bTransferredTaxableAmount: "1" }, { isIraSepSimple: true, militaryPensionOrSurvivorBenefit: true }]) {
    expect(() => buildRetirementInputs([{ ...source, ...change }], "single", 2025)).toThrow();
  }
  expect(() => buildRetirementInputs([source, { ...source }], "single", 2025)).toThrow(/duplicate/);
});

it("binds retirement duplicate identity to the actual recipient and normalized payer TIN", () => {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const primary = { ...completeRetirementSource, accountReference: " Plan 0123 ",
    grossDistribution: "1500.10", taxableAmount: "1250.10", federalWithheld: "10.01" };
  const spouse = { ...primary, accountHolder: "spouse" as const,
    grossDistribution: "600.20", taxableAmount: "500.20", federalWithheld: "0.00" };
  const alternatePunctuation = { ...primary, payerTin: "123456789", accountReference: "plan 0123" };

  expect(() => buildRetirementInputs([primary, alternatePunctuation], "mfj", 2025)).toThrow(/duplicate/i);
  state.sectionData["income-retirement"] = { entries: [primary, alternatePunctuation] };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(buildGuidedSyntheticDocuments(state).filter(document => document.kind === "1099-r").some(
    document => document.coverage === "partially-supported")).toBe(true);

  state.sectionData["income-retirement"].entries = [primary, spouse];
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form1099R).toMatchObject([
    { accountHolder: "primary", payerTin: "12-3456789", accountReference: "Plan 0123", taxableAmount: "1250.10" },
    { accountHolder: "spouse", payerTin: "12-3456789", accountReference: "Plan 0123", taxableAmount: "500.20", federalWithheld: "0.00" },
  ]);
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.pensionDistributionsTaxable.toFixed(2)).toBe("1750.30");
});

it("preserves legacy unchecked IRA answers as unconfirmed and leaves actual source answers unchanged on reload", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const legacy = { payer: "Old plan", grossDistribution: "0", taxableAmount: "0", federalWithheld: "0", distributionCode: "7", isIraSepSimple: false };
  state.sectionData["income-retirement"] = { entries: [legacy] };
  const load = () => loadGuidedFlowState({ getItem: () => JSON.stringify(state) } as unknown as Storage, "retirement");
  expect(load()?.sectionData["income-retirement"]?.entries[0]).toMatchObject({ ...legacy, requiresIraConfirmation: true });
  state.sectionData["income-retirement"].entries = [{ ...completeRetirementSource }];
  expect(load()?.sectionData["income-retirement"]?.entries[0]).toMatchObject({ isIraSepSimple: false, sourceFactsConfirmed: true, requiresIraConfirmation: false });
});

it("retains the actual IRA checkbox through schema validation and IRA income routing", () => {
  const source = { ...completeRetirementSource, payer: "Actual IRA custodian", grossDistribution: "25000", taxableAmount: "25000", federalWithheld: "3000", distributionCode: "7", isIraSepSimple: true };
  expect(Form1099RSchema.parse(buildRetirementInputs([source])[0]).iraSepSimple).toBe(true);
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  state.sectionData["personal-info"]!.dateOfBirth = "1950-01-01";
  state.sectionData["income-retirement"] = { entries: [source] };
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(result.iraDistributionsTaxable.toFixed()).toBe("25000");
  expect(result.pensionDistributionsTaxable.toFixed()).toBe("0");
});
