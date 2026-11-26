// @vitest-environment jsdom
// Spec: spec/federal/guided-card-tip-1099-k.yaml.
import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionAdditionalDeductions } from "@/components/guided-interview/section-additional-deductions";
import { SectionSelfEmployment } from "@/components/guided-interview/section-self-employment";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { emptyOvertimeDeduction, emptySchedule1AData } from "@/lib/guided-schedule-1-a-facts";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { completeBusinessSection, completeNecSource, startCompleteInterview } from "./complete-facts";

const statement = {
  sourceTaxYear: "2026", owner: "primary" as const, pse: "Actual payment processor", statementReference: "Original statement A",
  grossAmount: "5000.65", cardNotPresent: "130.07", cashTips: "1000.55", occupationCode: "102", federalWithheld: "0", noStateReportingConfirmed: true,
  sourceFactsConfirmed: true, confirmedFilingStatus: "single" as const,
};
const proof = {
  receiptLedgerReference: "Actual source and receipt ledger A", solePaymentCohortConfirmed: true,
  scheduleCBusinessReceiptsConfirmed: true, qualifiedTipsReconciledConfirmed: true,
};

function cardTipInterview() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: ["additional-deductions"], stateCode: null });
  state.taxYear = 2026;
  state.sectionData.review = { qof2026Disclosure: false };
  const business = { ...structuredClone(completeBusinessSection), manualGrossReceipts: statement.grossAmount,
    businessFacts: { ...completeBusinessSection.businessFacts, businessName: "Actual service" }, cardTipSource: { ...statement } };
  const schedule1A = { ...emptySchedule1AData, sourceTaxYear: "2026", sourceReference: "Actual deduction originals",
    sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0",
    businessTips: [{ businessSourceId: "scheduleC", owner: "primary" as const, occupationCode: "102",
      eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true,
      reportedTipSources: [{ sourceId: "form1099K:0", qualifiedTips: "1000.25" }], form1099KProof: { ...proof } }],
  };
  state.sectionData["income-self-employment"] = business;
  state.sectionData["additional-deductions"] = { schedule1A };
  return { state, business, schedule1A };
}

it("retains the actual statement and reconciles ledger receipts without adding them twice", () => {
  const { state } = cardTipInterview();
  expect(saveGuidedFlowState(localStorage, "actual-card-tip-1099-k", state)).toBe(true);
  const reopened = loadGuidedFlowState(localStorage, "actual-card-tip-1099-k");
  if (!reopened) throw new Error("Expected to reopen the saved card tip worksheet");
  expect(reopened.sectionData["income-self-employment"]?.cardTipSource).toEqual(statement);
  const input = buildTaxInputFromGuidedData(reopened);
  expect(input?.form1099K).toEqual([{ taxYear: 2026, accountHolder: "primary", pse: statement.pse,
    grossAmount: "5000.65", cardNotPresent: "130.07", cashTips: "1000.55", treasuryTippedOccupationCodes: ["102"], federalWithheld: "0", stateWithheld: "0", incomeType: "business",
    cardTipStatementEvidence: { statementReference: statement.statementReference, cardNotPresent: "130.07", federalWithheld: "0", noStateReportingConfirmed: true } }]);
  expect(input?.form1099Nec).toEqual([]);
  expect(input?.scheduleC?.grossReceipts).toBe("5000.65");
  expect(input?.schedule1A?.businessTips[0]).toMatchObject({ businessSourceId: "scheduleC", qualifiedReportedTips: "1000.25",
    reportedTipSources: [{ sourceId: "form1099K:0", qualifiedTips: "1000.25" }], form1099KProof: { ...proof, statementReference: statement.statementReference } });
  expect(input?.schedule1A?.businessTips[0]?.netProfit).toBeUndefined();
  expect(input?.schedule1A?.businessTips[0]?.otherAllocableDeductions).toBeUndefined();
});

it("requires original payment and tip facts on the normal guided route", () => {
  const { state, business, schedule1A } = cardTipInterview();
  expect(validateSection(state, "income-self-employment").status).toBe("complete");
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  for (const patch of [{ grossAmount: "5000.66" }, { cardNotPresent: "" }, { cashTips: "5000.66" }, { sourceTaxYear: "2025" }, { owner: "spouse" as const },
    { federalWithheld: "" }, { occupationCode: "" }, { occupationCode: "999" }, { noStateReportingConfirmed: null }]) {
    const edited = updateSectionData(state, "income-self-employment", { ...business, cardTipSource: { ...statement, ...patch } });
    expect(buildTaxInputFromGuidedData(edited)).toBeNull();
    expect(edited.sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBeNull();
    expect(edited.sectionData["additional-deductions"]?.schedule1A?.businessTips[0]?.form1099KProof).toEqual({
      receiptLedgerReference: proof.receiptLedgerReference, solePaymentCohortConfirmed: null,
      scheduleCBusinessReceiptsConfirmed: null, qualifiedTipsReconciledConfirmed: null,
    });
  }
  const duplicate = updateSectionData(state, "income-self-employment", { ...business, necEntries: [completeNecSource] });
  expect(buildTaxInputFromGuidedData(duplicate)).toBeNull();
  const [businessTip] = schedule1A.businessTips;
  assert(businessTip);
  const over = { ...businessTip, reportedTipSources: [{ sourceId: "form1099K:0", qualifiedTips: "1000.56" }] };
  const otherOccurrence = { ...businessTip, occupationCode: "103" };
  const noLedger = { ...businessTip, form1099KProof: { ...proof, receiptLedgerReference: "" } };
  for (const row of [over, otherOccurrence, noLedger]) {
    const edited = structuredClone(state);
    edited.sectionData["additional-deductions"] = { schedule1A: { ...schedule1A, businessTips: [row] } };
    expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  }
  const prior = setInterviewTaxYear(state, 2025);
  expect(prior.sectionData["income-self-employment"]?.cardTipSource).toMatchObject({ ...statement, sourceFactsConfirmed: null, confirmedFilingStatus: null });
  expect(prior.sectionData["additional-deductions"]?.schedule1A?.businessTips[0]?.form1099KProof).toMatchObject({
    receiptLedgerReference: proof.receiptLedgerReference, scheduleCBusinessReceiptsConfirmed: null,
  });
  expect(buildTaxInputFromGuidedData(prior)).toBeNull();
});

it("requires fresh recipient proof after the actual owner or filing context changes", () => {
  const { state, schedule1A, business } = cardTipInterview();
  const person = state.sectionData["personal-info"];
  assert(person);
  expect(buildTaxInputFromGuidedData(state)?.form1099K).toHaveLength(1);
  const changed = updateSectionData(state, "personal-info", { ...person, ssn: "123-45-6789" });
  expect(changed.sectionData["income-self-employment"]?.cardTipSource).toMatchObject({
    statementReference: statement.statementReference, sourceFactsConfirmed: null, confirmedFilingStatus: null,
  });
  const actualDeductions = changed.sectionData["additional-deductions"]?.schedule1A;
  assert(actualDeductions);
  expect(actualDeductions.businessTips[0]?.form1099KProof).toEqual({
    receiptLedgerReference: proof.receiptLedgerReference, solePaymentCohortConfirmed: null,
    scheduleCBusinessReceiptsConfirmed: null, qualifiedTipsReconciledConfirmed: null,
  });
  const onlyGenericConfirmation = updateSectionData(changed, "additional-deductions", { schedule1A: { ...actualDeductions, sourceFactsConfirmed: true } });
  expect(buildTaxInputFromGuidedData(onlyGenericConfirmation)).toBeNull();

  const changedFilingStatus = { ...state, segmentation: { ...state.segmentation, filingStatus: "mfj" as const } };
  expect(buildTaxInputFromGuidedData(changedFilingStatus)).toBeNull();
  const refreshed = updateSectionData(changedFilingStatus, "income-self-employment", { ...business,
    cardTipSource: { ...statement, confirmedFilingStatus: "mfj" },
  });
  expect(buildTaxInputFromGuidedData(refreshed)).toBeNull();
  const renewedProof = updateSectionData(refreshed, "additional-deductions", { schedule1A });
  const rechecked = updateSectionData(renewedProof, "additional-deductions", { schedule1A });
  expect(buildTaxInputFromGuidedData(rechecked)?.form1099K).toHaveLength(1);
});

it("makes the same-owner card statement reachable only for the business tip claim", () => {
  const { state, business, schedule1A } = cardTipInterview();
  const renderBusiness = (taxYear: number, cardTipSource?: typeof statement) => renderToStaticMarkup(createElement(SectionSelfEmployment, {
    workspace: createWorkspaceRecord("card-tip-workspace"), flowState: { ...state, taxYear }, necEntries: [], cardTipSource,
    manualGrossReceipts: business.manualGrossReceipts, expenses: business.expenses, bankStatementAnalyses: [], incomeDocumentAnalyses: [], onSectionChange: () => {},
  }));
  expect(renderBusiness(2025)).not.toContain("Add 2026 Form 1099-K");
  expect(renderBusiness(2026)).toContain("Add 2026 Form 1099-K business tip statement");
  expect(renderBusiness(2026, statement)).toContain("1099-K Box 1b card-not-present transactions");

  const draft = { ...schedule1A, overtime: [{ ...emptyOvertimeDeduction, owner: "primary" as const }] };
  const renderAdditional = () => {
    const document = new DOMParser().parseFromString(renderToStaticMarkup(createElement(SectionAdditionalDeductions, {
      state, data: { schedule1A: draft }, onChange: () => {},
    })), "text/html");
    return (label: string) => [...document.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label);
  };
  const field = renderAdditional();
  expect(field("Business tips 1: Reported source 1")?.querySelector('option[value="form1099K:0"]')?.textContent).toContain(statement.pse);
  expect(field("Business tips 1: Business receipt ledger reference")?.querySelector("input")?.value).toBe(proof.receiptLedgerReference);
  expect(field("Overtime 1: Compensation source")?.querySelector('option[value="form1099K:0"]')).toBeNull();
});
