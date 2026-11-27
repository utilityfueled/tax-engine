import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { form8919ReasonAFactErrors } from "@/lib/guided-form-8919-reason-a";
import { emptyStateReturnData, getGuidedSectionRoute, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { emptyOvertimeDeduction, emptySchedule1AData, schedule1ACompensationSources } from "@/lib/guided-schedule-1-a-facts";
import { calculateForm8919 } from "@/engine/forms/form-8919";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll";
import { getConstants } from "@/models/constants";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed";
import { TaxYearInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { startCompleteInterview } from "./complete-facts";
import { actualTipIncome, actualTipW2 } from "./guided-tip-income-fixtures";

const original = {
  taxYear: "2026", firmName: "Example Services", employerEin: "65-4321098",
  determinationDate: "2025-10-15", wages: "1,000.25", confirmed: true,
};

function interview() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["additional-deductions"], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-w2"] = { entries: [{
    ...actualTipW2, sourceTaxYear: "2026", wages: "183,500", medicareWages: "183,500", socialSecurityWages: "183,500", socialSecurityTips: "0",
  }] };
  state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original } };
  return state;
}

function wageStatement(state: ReturnType<typeof interview>) {
  const entry = state.sectionData["income-w2"]?.entries[0];
  assert.ok(entry);
  return entry;
}

const originalNec = {
  statementReference: "Synthetic employee compensation statement",
  payerName: original.firmName,
  payerTin: original.employerEin,
  recipientTin: "111-22-3333",
  nonemployeeCompensation: "1,000.25",
  federalWithheld: "100.00",
  qualifiedOvertimeCompensation: "200.00",
  currentOriginalNoCorrectionsOrVoidsConfirmed: true,
  noDirectSalesOrParachutePaymentConfirmed: true,
  noTipsOrStateBoxesConfirmed: true,
  federalOnlyConfirmed: true,
};

function interviewWithOriginalNec() {
  const state = interview();
  state.sectionData["additional-deductions"] = { form8919ReasonA: {
    ...original, determinationDate: "2026-02-12", determinationReceivedDate: "2026-02-14",
    determinationReference: "Synthetic SS-8 determination", originalNec,
  } };
  return state;
}

it("projects a verified original 1099-NEC as employee compensation without creating business income", () => {
  const state = interviewWithOriginalNec();
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form8919?.reasonANecSource).toMatchObject({
    necSourceId: "form1099Nec:0", determinationReceivedDate: "2026-02-14",
    determinationReference: "Synthetic SS-8 determination", federalOnlyConfirmed: true,
  });
  expect(input?.form1099Nec).toEqual([expect.objectContaining({
    accountHolder: "primary", nonemployeeCompensation: "1000.25",
    federalWithheld: "100", qualifiedOvertimeCompensation: "200",
  })]);
  expect(input?.scheduleC).toBeUndefined();
  expect(input?.taxpayer.stateResidency).toBe("full-year");
});

it("preserves an actual residency answer and requires explicit federal-only scope for the linked original", () => {
  const state = interviewWithOriginalNec();
  const profile = state.sectionData["personal-info"];
  const form = state.sectionData["additional-deductions"]?.form8919ReasonA;
  assert.ok(profile && form);
  profile.stateResidency = "part-year";
  expect(buildTaxInputFromGuidedData(state)?.taxpayer.stateResidency).toBe("part-year");
  state.sectionData["additional-deductions"] = {
    form8919ReasonA: { ...form, originalNec: { ...originalNec, federalOnlyConfirmed: false } },
  };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("holds selected and saved state returns even with federal-only scope confirmed", () => {
  const state = interviewWithOriginalNec();
  for (const stateDraft of [
    { ...state, segmentation: { ...state.segmentation, stateCode: "OH" as const } },
    { ...state, sectionData: { ...state.sectionData, "state-return": { ...emptyStateReturnData, additionalStateWithholding: "100" } } },
  ]) {
    expect(form8919ReasonAFactErrors(stateDraft).form8919ReasonA).toMatch(/federal/i);
    expect(buildTaxInputFromGuidedData(stateDraft)).toBeNull();
    expect(stateDraft.sectionData["additional-deductions"]?.form8919ReasonA?.originalNec).toEqual(originalNec);
  }
});

it("holds an enterable original 1099-NEC if its recipient TIN is different from the filer", () => {
  const state = interviewWithOriginalNec();
  const source = state.sectionData["additional-deductions"]?.form8919ReasonA;
  assert.ok(source);
  state.sectionData["additional-deductions"] = {
    form8919ReasonA: { ...source, originalNec: { ...originalNec, recipientTin: "123-45-6789" } },
  };
  expect(validateSection(state, "additional-deductions").status).not.toBe("complete");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("links one qualified overtime claim to the wage original and preserves invalid drafts for correction", () => {
  const state = interviewWithOriginalNec();
  const personal = state.sectionData["personal-info"];
  const additional = state.sectionData["additional-deductions"];
  assert.ok(personal && additional?.form8919ReasonA);
  personal.employmentValidSsnIssuedByDueDate = true;
  const linkedSource = schedule1ACompensationSources(state).find(source => source.kind === "form8919Nec");
  assert.ok(linkedSource);
  const overtime = { ...emptyOvertimeDeduction, owner: "primary" as const, compensationSourceId: linkedSource.sourceId,
    qualifiedPremium: "200.00", requiredByFlsa: true, reportingSourceReference: originalNec.statementReference };
  const schedule1A = { ...emptySchedule1AData, sourceTaxYear: "2026", sourceReference: "Synthetic Schedule 1-A inventory",
    sourceFactsConfirmed: true, allSourcesIncluded: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", overtime: [overtime] };
  state.sectionData["additional-deductions"] = { ...additional, schedule1A };
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.schedule1A?.overtime).toEqual([expect.objectContaining({
    compensationSourceId: "form1099Nec:0", qualifiedPremium: "200", reportedCompensation: "1000.25",
  })]);

  for (const claims of [[{ ...overtime, qualifiedPremium: "200.01" }], [{ ...overtime, reportingSourceReference: "Different original" }],
    [{ ...overtime, qualifiedPremium: "100" }, { ...overtime, qualifiedPremium: "100" }]]) {
    state.sectionData["additional-deductions"] = { ...additional, schedule1A: { ...schedule1A, overtime: claims } };
    expect(validateSection(state, "additional-deductions").status).not.toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }

  const changed = updateSectionData(state, "additional-deductions", { ...additional, schedule1A,
    form8919ReasonA: { ...additional.form8919ReasonA, determinationReceivedDate: "2026-02-11" } });
  expect(changed.sectionData["additional-deductions"]?.form8919ReasonA).toMatchObject({
    originalNec, determinationReceivedDate: "2026-02-11", confirmed: false,
  });
  expect(changed.sectionData["additional-deductions"]?.schedule1A?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it("projects confirmed source wages to the real payroll calculation", () => {
  const state = interview();
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = buildTaxInputFromGuidedData(state);
  expect(input?.form8919).toEqual({ accountHolder: "primary", wagesNotReportedOnW2: "1000.25" });
  assert.ok(input?.form8919);
  const result = calculateForm8919(input.form8919, FEDERAL_2026_CONSTANTS, { socialSecurityWagesAndTipsAlreadyReported: d(input.w2s[0]?.socialSecurityWages) });
  expect(result.line8.toFixed()).toBe("183500");
  expect(result.line10.toFixed()).toBe("1000");
  expect(result.line13.toFixed()).toBe("77");
  expect(() => getConstants(2026)).toThrow(/incomplete/);
});

it("rejects incomplete or overlapping wage evidence", () => {
  for (const changes of [{ taxYear: "2025" }, { wages: "0" }, { confirmed: false }, { determinationDate: "2026-02-30" }, { determinationDate: "2099-01-01" }]) {
    const state = interview();
    state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original, ...changes } };
    expect(validateSection(state, "additional-deductions").status).not.toBe("complete");
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  for (const changes of [{ employerEin: original.employerEin }, { employerEin: "" }, { socialSecurityTips: "" }, { sourceTaxYear: undefined }]) {
    const state = interview();
    const entry = wageStatement(state);
    state.sectionData["income-w2"] = { entries: [{ ...entry, ...changes }] };
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  const state = interview();
  const entry = wageStatement(state);
  const changed = updateSectionData(state, "income-w2", { entries: [{ ...entry, socialSecurityWages: "183499" }] });
  expect(changed.sectionData["additional-deductions"]?.form8919ReasonA).toEqual({ ...original, confirmed: false });
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it("retains a saved draft in the route and holds changed scope", () => {
  const state = interview();
  state.segmentation.lifeEvents = [];
  expect(getGuidedSectionRoute(state).map(section => section.id)).toContain("additional-deductions");
  expect(buildTaxInputFromGuidedData(state)?.form8919).toBeDefined();
  for (const segmentation of [{ ...state.segmentation, filingStatus: "mfj" as const }, { ...state.segmentation, stateCode: "OH" }]) {
    expect(buildTaxInputFromGuidedData({ ...state, segmentation })).toBeNull();
  }
  expect(buildTaxInputFromGuidedData({ ...state, taxYear: 2025 })).toBeNull();
});

function interviewWithAllocatedTips() {
  const state = interview();
  state.sectionData["income-w2"] = { entries: [{ ...wageStatement(state), allocatedTips: "500" }] };
  return state;
}

function confirmedTipAccount() {
  const account = actualTipIncome();
  account.sourceTaxYear = "2026";
  account.noncashTipsNotIncludedInWages = "0";
  const employer = account.employers[0];
  assert.ok(employer);
  Object.assign(employer, {
    allocatedTips: "500", cashAndChargeTipsReceived: "500", tipsReportedToEmployer: "0", smallTipMonths: [],
  });
  return account;
}

it("holds a positive W-2 Box 8 pending actual tip evidence", () => {
  const state = interviewWithAllocatedTips();
  expect(validateSection(state, "additional-deductions").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it.each([
  ["500", "184000", "500", "46"],
  ["350", "183850", "650", "55"],
])("uses reconciled Form 4137 line 10 in Form 8919 payroll for $%s of documented tips", (reportedTips, line8, line10, line13) => {
  const state = interviewWithAllocatedTips();
  const tipAccount = confirmedTipAccount();
  const tipEmployer = tipAccount.employers[0];
  assert.ok(tipEmployer);
  tipEmployer.cashAndChargeTipsReceived = reportedTips;
  state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original }, tipIncomeAccounts: [tipAccount] };
  expect(validateSection(state, "additional-deductions").status).toBe("complete");
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const tips = calculateUnreportedTipPayroll(input, FEDERAL_2026_CONSTANTS).forms[0];
  assert.ok(tips && input.form8919);
  expect(tips.line10.toFixed()).toBe(reportedTips);
  const result = calculateForm8919(input.form8919, FEDERAL_2026_CONSTANTS, {
    socialSecurityWagesAndTipsAlreadyReported: d(input.w2s[0]?.socialSecurityWages),
    w2SocialSecurityTipsAlreadyReported: d(input.w2s[0]?.socialSecurityTips),
    form4137SocialSecurityTipsAlreadyReported: tips.line10,
  });
  expect([result.line8, result.line10, result.line13].map(amount => amount.toFixed())).toEqual([line8, line10, line13]);

  const changed = updateSectionData(state, "additional-deductions", {
    form8919ReasonA: { ...original }, tipIncomeAccounts: [{ ...tipAccount, sourceReference: "Corrected diary" }],
  });
  expect(changed.sectionData["additional-deductions"]?.form8919ReasonA?.confirmed).toBe(false);
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});

it("holds an employer shared by both payroll forms and an unlinked allocated-tip statement", () => {
  const state = interviewWithAllocatedTips();
  const account = confirmedTipAccount();
  state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original }, tipIncomeAccounts: [account] };
  const w2 = wageStatement(state);
  state.sectionData["income-w2"] = { entries: [w2, { ...w2, employerEin: "45-1234567", employerName: "Unlinked Cafe" }] };
  expect(form8919ReasonAFactErrors(state).form8919ReasonA).toMatch(/allocated W-2 Box 8/);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();

  state.sectionData["income-w2"] = { entries: [w2] };
  const employer = account.employers[0];
  assert.ok(employer);
  account.employers.push({
    ...employer, sourceId: "reason-a-employer", employerEin: original.employerEin, employerName: original.firmName,
    w2SourceIds: [], allocatedTips: "0", cashAndChargeTipsReceived: "100",
  });
  expect(form8919ReasonAFactErrors(state).form8919ReasonA).toMatch(/separate employers/);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});

it("holds noncash tips lacking separate employer attribution", () => {
  const state = interview();
  const account = { ...confirmedTipAccount(), noncashTipsNotIncludedInWages: "100", employers: [] };
  state.sectionData["additional-deductions"] = { form8919ReasonA: { ...original }, tipIncomeAccounts: [account] };
  expect(form8919ReasonAFactErrors(state).form8919ReasonA).toMatch(/noncash tips.*employer/i);
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
