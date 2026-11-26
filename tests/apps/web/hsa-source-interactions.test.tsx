// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml#hsa-actual-contribution-sources
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { HsaSourceDetails } from "@/components/guided-interview/hsa-source-details";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type AdjustmentData, type FilingStatus } from "@/lib/guided-interview-flow";
import { completeHsaSources, completePersonalInfo, startCompleteInterview } from "../../guided-interview/complete-facts";

async function render(initial: AdjustmentData, run: (context: { latest: () => AdjustmentData; change: (label: string, value: string) => Promise<void>; click: (label: string) => Promise<void>; status: (value: FilingStatus) => Promise<void> }) => Promise<void>, taxYear = 2025) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  let latest = initial; let setStatus: (value: FilingStatus) => void = () => {};
  function Harness() { const [data, setData] = useState(initial); const [status, updateStatus] = useState<FilingStatus>("single"); setStatus = updateStatus; return <HsaSourceDetails data={data} filingStatus={status} taxYear={taxYear} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing control ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label); if (!button) throw new Error(`Missing button ${label}`); await act(async () => button.click()); }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, change, click, status: async value => { await act(async () => setStatus(value)); } }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
const confirm = "HSA 1: All HSA source facts checked after the last edit";
const monthlyReview = "HSA 1: Monthly eligibility checked against actual coverage records";
const timingReview = "HSA 1: Personal contributions were timely paid for the designated year";
const payrollReview = "HSA 1: Employer contribution worksheet checked against payroll and custodian records";
const excessReview = "HSA 1: Prior Form 5329 amounts and year-end HSA value checked for their actual years";

it("holds relabeled HSA years until the specific source facts are reviewed again", async () => {
  const account = { ...completeHsaSources, priorYearExcessContributions: "125", yearEndFairMarketValue: "5000" };
  let draft = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  draft = updateSectionData(draft, "adjustments", { ...emptyAdjustmentData, hsaAccounts: [account] });
  expect(validateSection(draft, "adjustments").status).toBe("complete");
  draft = updateSectionData(setInterviewTaxYear(draft, 2026), "personal-info", completePersonalInfo);
  const target = { storageKey: "hsa-source-years-2026" };
  const reopen = () => {
    expect(saveGuidedFlowState(window.sessionStorage, target, draft)).toBe(true);
    const reopened = loadGuidedFlowState(window.sessionStorage, target);
    if (!reopened?.sectionData.adjustments) throw new Error("The HSA facts did not reopen");
    return reopened;
  };
  try {
    await render(draft.sectionData.adjustments!, async ({ latest, change }) => {
      for (const [label, value] of [["HSA 1: Actual contribution tax year", "2026"], ["HSA 1: Actual prior excess-source tax year", "2025"], [confirm, "true"]]) {
        await change(label, value);
        draft = updateSectionData(draft, "adjustments", latest());
      }
    }, 2026);
    draft = reopen();
    expect(validateSection(draft, "adjustments").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(draft)).toBeNull();
    expect(draft.sectionData.adjustments!.hsaAccounts?.[0]).toMatchObject({
      contributionsMade: "3600.10", priorYearExcessContributions: "125", yearEndFairMarketValue: "5000",
      monthlyEligibilityConfirmed: null, contributionTimingConfirmed: null, employerWorksheetConfirmed: null,
    });

    await render(draft.sectionData.adjustments!, async ({ latest, change }) => {
      for (const label of [monthlyReview, timingReview, payrollReview, confirm]) {
        await change(label, "true");
        draft = updateSectionData(draft, "adjustments", latest());
      }
      expect(validateSection(draft, "adjustments").message).toMatch(/Prior Form 5329/i);
      await change(excessReview, "true");
      await change(confirm, "true");
      draft = updateSectionData(draft, "adjustments", latest());
    }, 2026);
    draft = reopen();
    expect(validateSection(draft, "adjustments").status).toBe("complete");
    const input = buildTaxInputFromGuidedData(draft);
    expect(input?.form8889ByOwner?.primary?.contributionsMade).toBe("3600.1");
    expect(input?.form5329HsaByOwner?.primary).toMatchObject({ priorYearSourceTaxYear: 2025, priorYearExcessContributions: "125", valueDec31: "5000" });
  } finally {
    window.sessionStorage.removeItem(target.storageKey);
  }
});

it("renews tracked annual HSA review after completing a previously blank amount", async () => {
  const account = { ...completeHsaSources, contributionTaxYear: "2026", priorYearSourceTaxYear: "2025", priorYearExcessContributions: "125" };
  let draft = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
  draft.taxYear = 2026;
  draft = updateSectionData(draft, "adjustments", { ...emptyAdjustmentData, hsaAccounts: [account] });
  expect(validateSection(draft, "adjustments").status).toBe("complete");
  const target = { storageKey: "hsa-annual-amount-after-review" };
  const priorTax = "HSA 1: Prior-year HSA additional tax";
  try {
    await render(draft.sectionData.adjustments!, async ({ latest, change }) => {
      const edit = async (label: string, value: string) => {
        await change(label, value);
        draft = updateSectionData(draft, "adjustments", latest());
      };
      await edit(priorTax, "");
      await edit(excessReview, "true");
      expect(buildTaxInputFromGuidedData(draft)).toBeNull();
      await edit(priorTax, "1.25");
      await edit(confirm, "true");
      expect(saveGuidedFlowState(window.sessionStorage, target, draft)).toBe(true);
      const reopened = loadGuidedFlowState(window.sessionStorage, target);
      if (!reopened?.sectionData.adjustments) throw new Error("The HSA worksheet did not reopen");
      expect(validateSection(reopened, "adjustments").status).toBe("partial");
      expect(reopened.sectionData.adjustments.hsaAccounts?.[0]).toMatchObject({
        priorYearAdditionalTax: "1.25", annualExcessSourcesConfirmed: null, sourceFactsConfirmed: true,
      });
      expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
      await edit(excessReview, "true");
      await edit(confirm, "true");
      expect(buildTaxInputFromGuidedData(draft)?.form5329HsaByOwner?.primary?.priorYearAdditionalTax).toBe("1.25");
    }, 2026);
  } finally {
    window.sessionStorage.removeItem(target.storageKey);
  }
});

it("collects actual monthly HSA sources and keeps blank and exact zero distinct", async () => {
  await render({ ...emptyAdjustmentData, hsaDeduction: "3600" }, async ({ latest, click, change }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
    const input = () => { state.sectionData.adjustments = latest(); return buildTaxInputFromGuidedData(state); };
    expect(input()).toBeNull(); await click("Add HSA owner worksheet");
    expect(latest().hsaAccounts?.[0]?.coverageByMonth).toEqual(Array(12).fill("")); expect(input()).toBeNull();
    for (const [label, value] of [["Account owner", "primary"], ["Actual contribution tax year", "2025"], ["Actual prior excess-source tax year", "2024"], ["Can someone else claim this owner as a dependent?", "false"], ["January HDHP coverage", "self_only"], ["January Medicare enrollment", "false"], ["January other disqualifying coverage", "false"]]) await change(`HSA 1: ${label}`, value);
    await click("HSA 1: Apply January answers to all months");
    expect(latest().hsaAccounts?.[0]?.medicareByMonth).toEqual(Array(12).fill(false));
    for (const [label, value] of [
      ["Monthly eligibility checked against actual coverage records", "true"], ["Personal HSA contributions paid for this tax year", "3600.10"], ["Current W-2 code W total for this owner", "0"], ["Code W amounts designated for the prior year", "0"], ["Following-year employer amounts designated for this year", "0"], ["Archer MSA contributions for the HSA limitation", "0"], ["Qualified IRA-to-HSA funding distributions", "0"], ["Prior-year HSA excess contributions", "0"], ["Prior-year HSA additional tax", "0"], ["Year-end fair market value of this owner's HSAs", "9007199254740993.01"], ["Personal contributions were timely paid for the designated year", "true"], ["Employer contribution worksheet checked against payroll and custodian records", "true"], ["Both spouses have separate HSAs", "false"], ["Use the last-month rule instead of only monthly eligibility", "false"], ["Any HSA distributions during this year", "false"], ["Any returned contributions or correction relief requiring a worksheet", "false"], ["A last-month-rule or IRA-funding testing period failed during this year", "false"],
    ]) await change(`HSA 1: ${label}`, value);
    await change(confirm, "true");
    expect(input()?.form8889ByOwner?.primary?.contributionsMade).toBe("3600.1"); expect(input()?.form5329HsaByOwner?.primary?.valueDec31).toBe("9007199254740993.01");
    await change("HSA 1: July Medicare enrollment", "true"); expect(latest().hsaAccounts?.[0]?.sourceFactsConfirmed).toBeNull(); await change(confirm, "true"); expect(input()).toBeNull();
    await change(monthlyReview, "true"); await change(confirm, "true"); expect(input()?.form8889ByOwner?.primary?.medicareMonths).toEqual([7]);
    await change("HSA 1: December other disqualifying coverage", "true"); await change(monthlyReview, "true"); await change(confirm, "true"); expect(input()?.form8889ByOwner?.primary?.coverageByMonth?.[11]).toBe("none");
    await change("HSA 1: Personal HSA contributions paid for this tax year", ""); await change(confirm, "true"); expect(input()).toBeNull();
    await change("HSA 1: Personal HSA contributions paid for this tax year", "0"); await change(timingReview, "true"); await change(confirm, "true"); expect(input()?.form8889ByOwner?.primary?.contributionsMade).toBe("0");
    await click("HSA 1: Remove this owner worksheet"); expect(latest().hsaAccounts).toEqual([]); expect(input()).toBeNull();
    await click("Clear saved HSA deduction estimate"); expect(latest().hsaDeduction).toBe("");
  });
});

it("requires actual testing dates and acknowledgments and preserves saved spouse ownership", async () => {
  await render({ ...emptyAdjustmentData, hsaAccounts: [structuredClone(completeHsaSources)] }, async ({ latest, change, status, click }) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
    const input = () => { state.sectionData.adjustments = latest(); return buildTaxInputFromGuidedData(state); };
    await change("HSA 1: Use the last-month rule instead of only monthly eligibility", "true"); await change(confirm, "true"); expect(input()).toBeNull();
    await change("HSA 1: I understand the last-month-rule testing period through December of the following year", "true"); await change(confirm, "true"); expect(input()?.form8889ByOwner?.primary?.useLastMonthRule).toBe(true);
    await change("HSA 1: A last-month-rule or IRA-funding testing period failed during this year", "true");
    for (const [label, value] of [["Actual testing-period failure date", "2025-06-01"], ["Actual failed testing rule", "both"], ["Failure was caused by death or disability", "false"], ["Actual prior last-month contribution year", "2024"], ["Actual contributions under that prior last-month rule", "8300"], ["Actual redetermined prior-year limit without the last-month rule", "691.67"], ["Actual IRA-to-HSA funding date", "2024-06-15"], ["Actual qualified funding distribution subject to recapture", "100.10"]]) await change(`HSA 1: ${label}`, value);
    await change(confirm, "true"); expect(input()?.form8889ByOwner?.primary).toMatchObject({ lastMonthRuleContributions: "8300", lastMonthRuleRedeterminedLimit: "691.67", recaptureQualifiedFundingDistribution: "100.1" });
    await change("HSA 1: Actual testing-period failure date", "2025-07-01"); await change(confirm, "true"); expect(input()).toBeNull();
    await change("HSA 1: Actual testing-period failure date", "2025-06-01"); await change("HSA 1: Account owner", "spouse"); await change(confirm, "true"); expect(input()).toBeNull();
    await status("mfj"); state.segmentation.filingStatus = "mfj"; expect(input()).toBeNull();
    const confirmOwner = async () => {
      for (const label of [monthlyReview, timingReview, payrollReview, excessReview, "HSA 1: I understand the last-month-rule testing period through December of the following year", confirm]) await change(label, "true");
    };
    await confirmOwner(); expect(input()?.form8889ByOwner?.spouse?.accountOwner).toBe("spouse");
    await status("single"); state.segmentation.filingStatus = "single"; expect(input()).toBeNull(); expect(latest().hsaAccounts?.[0]?.accountOwner).toBe("spouse");
    await change("HSA 1: Account owner", "primary");
    await change("HSA 1: A last-month-rule or IRA-funding testing period failed during this year", "false"); await change(confirm, "true"); expect(input()).toBeNull();
    expect(latest().hsaAccounts?.[0]?.testingPeriod?.fundingDistributionAmount).toBe("100.10");
    await click("HSA 1: Clear saved testing-period history"); await confirmOwner();
    expect(input()?.form8889ByOwner?.primary?.accountOwner).toBe("primary");
    expect(input()?.form8889ByOwner?.primary?.recaptureQualifiedFundingDistribution).toBeUndefined();
  });
});
