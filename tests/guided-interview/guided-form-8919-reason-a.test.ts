import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { form8919ReasonAFactErrors } from "@/lib/guided-form-8919-reason-a";
import { getGuidedSectionRoute, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
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
