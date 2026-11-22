// Spec: spec/state/guided-ohio-retirement-credit.yaml.
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { evaluateGuidedRenderState, setInterviewTaxYear, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { ohioRetirementCreditOriginal } from "@/lib/guided-ohio-retirement-credit";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { buildGuidedOhioOverlay, buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { explicitlyConfirmFullYearOhioNavigationFixture } from "../fixtures/guided-ohio-source-navigation";
import { completeRetirementSource, completeW2Entry, startCompleteInterview } from "./complete-facts";

function ohioFlow(distributionCode = "1") {
  let state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages", "retirement"], lifeEvents: [], stateCode: "OH" });
  state = updateSectionData(state, "income-w2", {
    entries: [{ ...completeW2Entry, sourceTaxYear: "2025", wages: "60000", medicareWages: "60000", socialSecurityWages: "60000", socialSecurityWithheld: "3720", medicareWithheld: "870" }],
  });
  state = updateSectionData(state, "income-retirement", {
    entries: [{ ...completeRetirementSource, grossDistribution: "6000", taxableAmount: "6000", distributionCode }],
  });
  return explicitlyConfirmFullYearOhioNavigationFixture(state);
}

function federalInput(state: GuidedFlowState) {
  return TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
}

function addWithdrawal(state: GuidedFlowState, withdrawnBeforeRetirement: boolean | null = true, sourceReference = "Synthetic early withdrawal payment advice") {
  const original = ohioRetirementCreditOriginal(federalInput(state));
  const stateReturn = state.sectionData["state-return"];
  if (!original || !stateReturn) throw new Error("Expected the synthetic Ohio retirement original and source packet");
  const draft = { original, sourceReference, withdrawnBeforeRetirement };
  const drafted = updateSectionData(state, "state-return", { ...stateReturn, ohioRetirementCredit: { ...draft, sourceFactsConfirmed: null } });
  const confirmed = updateSectionData(drafted, "state-return", { ...stateReturn, ohioRetirementCredit: { ...draft, sourceFactsConfirmed: true } });
  return { drafted, confirmed };
}

function ohioResult(state: GuidedFlowState) {
  const input = buildGuidedStateOriginals(federalInput(state), state);
  const federal = calculateFederalTax(input);
  const overlay = buildGuidedOhioOverlay(input, state, federal.taxExemptInterest);
  const ohio = calculateOhioResidentReturn(buildOhioResidentReturnInput(input, federal, overlay));
  return { ohio, overlay };
}

describe("Ohio retirement credit originals", () => {
  it("holds the Ohio credit until the original early withdrawal is confirmed", () => {
    const state = ohioFlow();

    expect(validateSection(state, "income-retirement").status).toBe("complete");
    expect(computeGuidedPreview(state)?.agi).toBe("66000");
    expect(validateSection(state, "state-return").status).toBe("partial");
    expect(computeGuidedPreview(state)?.state).toBeNull();
    const evaluation = evaluateGuidedRenderState(state);
    expect(ohioRetirementCreditOriginal(evaluation.originalInput)).toBeDefined();
    expect(() => ohioResult(state)).toThrow(/payment circumstances/);

    const { drafted, confirmed } = addWithdrawal(state);
    expect(validateSection(drafted, "state-return").status).toBe("partial");
    expect(validateSection(confirmed, "state-return").status).toBe("complete");
    const { ohio, overlay } = ohioResult(confirmed);
    expect(overlay.retirementIncomeOverride).toBe("0");
    expect(ohio.scheduleOfCredits?.line2_retirementIncomeCredit.toFixed()).toBe("0");
    expect(ohio.it1040.line3_ohioAgi.toFixed()).toBe("66000");
    expect(computeGuidedPreview(confirmed)).toMatchObject({ agi: "66000", state: { stateTax: "1444" } });
  });

  it("retains evidence but holds Ohio after an affected source or year edit", () => {
    const { confirmed } = addWithdrawal(ohioFlow());
    const data = confirmed.sectionData["state-return"];
    const draft = data?.ohioRetirementCredit;
    const retirement = confirmed.sectionData["income-retirement"]?.entries[0];
    if (!data || !draft || !retirement) throw new Error("Expected the confirmed Ohio and Form 1099-R facts");

    const changedDocument = updateSectionData(confirmed, "state-return", {
      ...data, ohioRetirementCredit: { ...draft, sourceReference: "New synthetic payment advice" },
    });
    expect(changedDocument.sectionData["state-return"]?.ohioRetirementCredit?.sourceFactsConfirmed).toBeNull();
    expect(computeGuidedPreview(changedDocument)?.state).toBeNull();

    const changedRetirement = updateSectionData(confirmed, "income-retirement", {
      entries: [{ ...retirement, accountReference: "replacement-synthetic-account" }],
    });
    expect(changedRetirement.sectionData["state-return"]?.ohioRetirementCredit).toEqual({ ...draft, sourceFactsConfirmed: null });
    const changedOriginals = explicitlyConfirmFullYearOhioNavigationFixture(changedRetirement);
    expect(validateSection(changedOriginals, "state-return").fieldErrors?.ohioRetirementCredit).toMatch(/current Form 1099-R/);

    const restoredYear = setInterviewTaxYear(setInterviewTaxYear(confirmed, 2026), 2025);
    expect(restoredYear.sectionData["state-return"]?.ohioRetirementCredit).toEqual({ ...draft, sourceFactsConfirmed: null });
    expect(() => ohioResult(restoredYear)).toThrow();
  });

  it("holds unknown and other Code 1 circumstances while leaving ordinary Code 7 treatment available", () => {
    const state = ohioFlow();
    for (const alternative of [addWithdrawal(state, null), addWithdrawal(state, false), addWithdrawal(state, true, " ")]) {
      expect(computeGuidedPreview(alternative.confirmed)?.state).toBeNull();
    }
    const ordinary = ohioFlow("7");
    expect(validateSection(ordinary, "state-return").status).toBe("complete");
    expect(ohioResult(ordinary).ohio.scheduleOfCredits?.line2_retirementIncomeCredit.toFixed()).toBe("130");
  });
});
