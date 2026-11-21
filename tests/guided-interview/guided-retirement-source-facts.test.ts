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
import { completeRetirementSource, startCompleteInterview } from "./complete-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { loadGuidedFlowState, setInterviewTaxYear, validateSection } from "@/lib/guided-interview-flow";

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
