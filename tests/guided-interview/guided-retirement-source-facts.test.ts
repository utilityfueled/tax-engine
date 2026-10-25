// Spec: spec/federal/guided-input.yaml, retirement-ira-checkbox
import { expect, it } from "vitest";
import { buildGuidedFactAnswers, buildGuidedSyntheticDocuments, buildRetirementInputs, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { Form1099RSchema, TaxYearInputSchema } from "@/models/inputs";
import { calculateFederalTax } from "@/engine/federal";
import { completeRetirementSource, startCompleteInterview } from "./complete-facts";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { loadGuidedFlowState } from "@/lib/guided-interview-flow";

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

it("forwards actual recipient and matching state withholding without inventing local identity", () => {
  const state = startCompleteInterview({ filingStatus: "mfj", incomeTypes: ["retirement"], lifeEvents: [], stateCode: "PA" });
  state.sectionData.deductions!.nonW2IncomeTaxesDeductedElsewhere = "0";
  state.sectionData["income-retirement"] = { entries: [
    { ...completeRetirementSource, accountHolder: "spouse", stateTaxReporting: "single", state: "PA", stateWithheld: "0.10", stateDistribution: "1000" },
    { ...completeRetirementSource, payer: "Other payer", accountReference: "other", stateTaxReporting: "single", state: "NY", stateWithheld: "0.20", stateDistribution: "1000" },
  ] };
  expect(buildTaxInputFromGuidedData(state)?.form1099R?.[0]).toMatchObject({ accountHolder: "spouse", state: "PA", stateWithheld: "0.10", stateDistribution: "1000" });
  expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe("0.1");
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
