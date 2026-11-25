// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, retirement-source-records
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SectionRetirementIncome } from "@/components/guided-interview/section-retirement-income";
import { SectionReview } from "@/components/guided-interview/section-review";
import { buildRetirementInputs } from "@/lib/guided-interview-bridge";
import { emptyRetirementEntry, getGuidedFlowStorageKey, loadGuidedFlowState, saveGuidedFlowState, validateSection, type RetirementEntryData } from "@/lib/guided-interview-flow";
import { completePersonalInfo, completeRetirementSource, startCompleteInterview } from "../../guided-interview/complete-facts";
import { iraEducationOwnerFingerprint } from "@/utils/ira-education-owner.js";

async function render(initial: RetirementEntryData[], run: (context: { latest: () => RetirementEntryData[]; container: HTMLDivElement; change: (label: string, value: string) => Promise<void> }) => Promise<void>, taxYear = 2025, ownerBirthDate = "1966-02-01") {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let latest = initial;
  function Harness() { const [entries, setEntries] = useState(initial); return <SectionRetirementIncome entries={entries} filingStatus="single" taxYear={taxYear} primaryDateOfBirth={ownerBirthDate} primaryOwnerFingerprint={iraEducationOwnerFingerprint(completePersonalInfo)} onEntriesChange={next => { latest = next; setEntries(next); }} />; }
  async function change(label: string, value: string) {
    const element = [...container.querySelectorAll("label")].find(entry => entry.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!element) throw new Error(`Missing control: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  try { await act(async () => root.render(<Harness />)); await run({ latest: () => latest, container, change }); }
  finally { await act(async () => root.unmount()); container.remove(); }
}
const confirm = "Have you checked all retirement source and taxability facts after the last edit?";
const publicSafetyOfficerElection = "Are you electing the retired public safety officer insurance premium exclusion for this pension?";

afterEach(() => vi.useRealTimers());

// Spec: spec/federal/form-1099-r-disability-guided-2026.yaml.
it("collects and reopens a 2026 Code 3 disability pension worksheet", async () => {
  vi.setSystemTime(new Date(2026, 9, 12, 12));
  const ownerBirthDate = "1966-08-01";
  const source = { ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "3", taxableAmount: "1000" };
  const personal = { ...completePersonalInfo, dateOfBirth: ownerBirthDate };
  const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  draft.taxYear = 2026;
  draft.sectionData["personal-info"] = personal;
  const key = "guided-code3-disability-regression";
  try {
    await render([source], async ({ latest, container, change }) => {
      const start = [...container.querySelectorAll("button")].find(button => button.textContent === "Enter a disability pension worksheet");
      if (!start) throw new Error("Missing the disability pension worksheet button");
      await act(async () => start.click());
      await change("Employer plan record reference", "Plan notice A");
      await change("Does the employer plan confirm this is a disability pension?", "true");
      await change("Does Box 1 report only this one disability pension payment?", "true");
      await change("Minimum retirement date shown by the employer plan", "2026-08-01");
      await change("Date the disability pension payment was received", "2026-07-31");
      await change("Is another retirement worksheet beyond this disability pension worksheet needed?", "false");
      await change(confirm, "true");
      draft.sectionData["income-retirement"] = { entries: latest() };
      expect(saveGuidedFlowState(window.sessionStorage, key, draft)).toBe(true);
      const legacy = loadGuidedFlowState(window.sessionStorage, key)?.sectionData["income-retirement"]?.entries;
      expect(legacy?.[0]?.code3DisabilitySource?.publicSafetyOfficerExclusionElected).toBeUndefined();
      expect(() => buildRetirementInputs(legacy, "single", 2026, undefined, { personal })).toThrow(/confirm whether you are electing.*public safety officer/i);
      await change(publicSafetyOfficerElection, "true");
      expect(container.textContent).toMatch(/review.*employer plan and paid premium records/i);
      await change(confirm, "true");
      expect(() => buildRetirementInputs(latest(), "single", 2026, undefined, { personal })).toThrow(/review.*employer plan and paid premium records/i);
      draft.sectionData["income-retirement"] = { entries: latest() };
      expect(saveGuidedFlowState(window.sessionStorage, key, draft)).toBe(true);
      const pendingElection = loadGuidedFlowState(window.sessionStorage, key);
      if (!pendingElection) throw new Error("The pending premium election did not reopen");
      const summary = renderToStaticMarkup(<SectionReview state={pendingElection} preview={null} onJumpToSection={() => {}} />);
      expect(summary).toContain("$1,000 reported in Box 2a");
      expect(summary).not.toContain("$1,000 taxable");
      await change(publicSafetyOfficerElection, "false");
      expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
      await change(confirm, "true");
      draft.sectionData["income-retirement"] = { entries: latest() };
      expect(saveGuidedFlowState(window.sessionStorage, key, draft)).toBe(true);
    }, 2026, ownerBirthDate);
    const reopened = loadGuidedFlowState(window.sessionStorage, key)?.sectionData["income-retirement"]?.entries;
    if (!reopened) throw new Error("The disability pension worksheet did not reopen");
    expect(reopened[0]?.code3DisabilitySource?.publicSafetyOfficerExclusionElected).toBe(false);
    expect(buildRetirementInputs(reopened, "single", 2026, undefined, { personal })[0]).toMatchObject({
      distributionCode: "3", distributionDate: "2026-07-31", disabilityPensionBeforeMinimumRetirementAge: true,
    });
    await render(reopened, async ({ container, latest, change }) => {
      expect(container.textContent).toContain("Employer plan record reference");
      await change("Payer TIN shown on the retirement form", "12-3456788");
      expect(container.textContent).toContain("Reconcile the saved disability pension worksheet");
      expect(() => buildRetirementInputs(latest(), "single", 2026, undefined, { personal })).toThrow(/reconcile.*disability pension/i);
    }, 2026, ownerBirthDate);
  } finally {
    window.sessionStorage.removeItem(getGuidedFlowStorageKey(key));
  }
});

it("distinguishes an entered zero from missing Box 2a on draft review", () => {
  const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  draft.sectionData["income-retirement"] = { entries: [
    { ...emptyRetirementEntry, payer: "Zero plan", taxableAmount: "0" },
    { ...emptyRetirementEntry, payer: "Incomplete plan", grossDistribution: "500", federalWithheld: "0" },
  ] };
  const summary = renderToStaticMarkup(<SectionReview state={draft} preview={null} onJumpToSection={() => {}} />);
  expect(summary).toContain("Zero plan");
  expect(summary).toContain("$0 reported in Box 2a, Box 4 amount not entered");
  expect(summary).toContain("Incomplete plan");
  expect(summary).toContain("Box 2a amount not entered, $0 withheld");
});

it("reviews reopened 2026 retirement codes and distinguishes pending, zero and confirmed blank Box 2a", () => {
  const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  draft.taxYear = 2026;
  const pension = {
    ...completeRetirementSource, sourceTaxYear: "2026", grossDistribution: "6000", taxableAmount: "",
    taxableAmountNotDetermined: true, taxableAmountConfirmed: null,
  };
  draft.sectionData["income-retirement"] = { entries: [
    { ...emptyRetirementEntry, payer: "Code and withholding only", sourceTaxYear: "2026", distributionCode: "G", federalWithheld: "0" },
    { ...pension, payer: "Pending pension", sourceFactsConfirmed: null },
    { ...pension, payer: "Unverified statement coverage", accountReference: "coverage-not-confirmed" },
    { ...emptyRetirementEntry, payer: "Explicit zero", sourceTaxYear: "2026", distributionCode: "7 D", taxableAmount: "0" },
    { ...pension, payer: "Confirmed pension", accountReference: "other-annuity", simplifiedMethod: {
      planReference: "Private plan reference", qualifiedPlanConfirmed: true, singleLifeAnnuitantConfirmed: true,
      statementCoversContractConfirmed: true, startingDate: "2026-01-15", ageAtStart: "35",
      costInPlan: "26000", monthsPaid: "12", priorRecovered: "0",
    } },
    { ...emptyRetirementEntry, payer: "Malformed code", sourceTaxYear: "2026", distributionCode: "992-87-6654" },
  ] };
  const target = { storageKey: "retirement-source-review-2026" };
  expect(saveGuidedFlowState(window.sessionStorage, target, draft)).toBe(true);
  const reopened = loadGuidedFlowState(window.sessionStorage, target);
  window.sessionStorage.removeItem(target.storageKey);
  if (!reopened) throw new Error("The retirement review draft did not reopen");
  const summary = renderToStaticMarkup(<SectionReview state={reopened} preview={null} onJumpToSection={() => {}} />);
  const review = new DOMParser().parseFromString(summary, "text/html");
  const row = (name: string) => [...review.querySelectorAll(".guided-review-row")]
    .find(element => element.querySelector(".guided-review-label")?.textContent === name)?.textContent ?? "";
  expect(row("Code and withholding only")).toContain("Box 2a amount not entered, $0 withheld, Box 7a distribution code G");
  expect(row("Pending pension")).toContain("Box 2a amount not entered");
  expect(row("Unverified statement coverage")).toContain("Box 2a amount not entered");
  expect(row("Explicit zero")).toContain("$0 reported in Box 2a, Box 4 amount not entered, Box 7a distribution code 7 D");
  expect(row("Confirmed pension")).toContain("Box 2a blank on the original");
  expect(row("Malformed code")).toContain("Box 7a distribution code needs review");
  expect(summary).not.toContain("992-87-6654");
  expect(summary).not.toContain("Private plan reference");
});

it("marks the reopened legacy distribution code as needing reconfirmation", () => {
  const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
  const target = { storageKey: "retirement-source-review-legacy" };
  const entries = [
    { ...emptyRetirementEntry, payer: "Legacy pension", distributionCode: "7", grossDistribution: "1000", taxableAmount: "0", federalWithheld: "0", isIraSepSimple: false },
    { ...emptyRetirementEntry, payer: "Year on original", sourceTaxYear: "2025", distributionCode: "G" },
  ];
  expect(saveGuidedFlowState(window.sessionStorage, target, { ...draft, factsVersion: undefined, sectionData: { ...draft.sectionData, "income-retirement": { entries } } })).toBe(true);
  const reopened = loadGuidedFlowState(window.sessionStorage, target);
  window.sessionStorage.removeItem(target.storageKey);
  if (!reopened) throw new Error("The legacy retirement review draft did not reopen");
  expect(validateSection(reopened, "income-retirement").fieldErrors["retirement-0-code"]).toMatch(/Reconfirm/);
  const summary = renderToStaticMarkup(<SectionReview state={reopened} preview={null} onJumpToSection={() => {}} />);
  expect(summary).toContain("Distribution code 7 needs reconfirmation");
  expect(summary).toContain("Box 7 distribution code G");
  expect(summary).not.toContain("Box 7a");
});

// Specs: spec/federal/form-5329-guided-code1-ira-2026.yaml, 1-4, and spec/federal/form-5329-first-home-guided-2026.yaml, 09-guided-source.
it("collects a 2026 Code 1 IRA date and offers first-home intake only before age 59½", async () => {
  vi.setSystemTime(new Date(2026, 7, 1, 12));
  const ownerBirthDate = "1967-02-01";
  const source = {
    ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "1", isIraSepSimple: true,
    grossDistribution: "6000", taxableAmount: "6000",
  };
  await render([source], async ({ latest, container, change }) => {
    await change("Does Box 1 report one payment with no other distributions?", "true");
    await change("Date the IRA payment was received", "2026-07-31");
    expect(latest()[0]?.code1IraAgeSource).toMatchObject({ ownerBirthDate, distributionDate: "2026-07-31" });
    expect(container.textContent).toContain("Enter a first-home IRA worksheet");
    await change("Date the IRA payment was received", "2026-08-01");
    expect(container.textContent).not.toContain("Enter a first-home IRA worksheet");
    await change("Is another retirement worksheet needed beyond this documented Code 1 age exception?", "false");
    await change(confirm, "true");
    const personal = { ...completePersonalInfo, dateOfBirth: ownerBirthDate };
    expect(buildRetirementInputs(latest(), "single", 2026, undefined, { personal })[0]).toMatchObject({
      distributionCode: "1", distributionDate: "2026-08-01",
    });
  }, 2026, ownerBirthDate);
});

// Spec: spec/federal/form-5329.yaml, Line 2, guided Code 1 age exception.
it("requires a real Code 1 IRA receipt date and invalidates it when the original changes", async () => {
  const source = { ...completeRetirementSource, distributionCode: "1", isIraSepSimple: true, grossDistribution: "6000", taxableAmount: "6000" };
  const basisContext = { personal: { ...completePersonalInfo, dateOfBirth: "1966-02-01" } };
  const onePayment = "Does Box 1 report one payment with no other distributions?";
  const actualDate = "Date the IRA payment was received";
  const otherWorksheet = "Is another retirement worksheet needed beyond this documented Code 1 age exception?";
  await render([source], async ({ latest, container, change }) => {
    expect(latest()[0]?.code1IraAgeSource).toBeUndefined();
    expect(container.textContent).not.toContain(otherWorksheet);
    await change(onePayment, "true");
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025, undefined, basisContext)).toThrow(/actual.*receipt date/i);

    await change(actualDate, "2025-07-31");
    expect(container.textContent).not.toContain(otherWorksheet);
    await change(actualDate, "2025-08-01");
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    expect(container.textContent).toContain(otherWorksheet);
    await change(otherWorksheet, "true");
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025, undefined, basisContext)).toThrow(/another retirement worksheet/i);
    await change(otherWorksheet, "false");
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025, undefined, basisContext)[0]).toMatchObject({ distributionCode: "1", distributionDate: "2025-08-01" });

    const draft = startCompleteInterview({ filingStatus: "single", incomeTypes: ["retirement"], lifeEvents: [], stateCode: null });
    draft.sectionData["income-retirement"] = { entries: latest() };
    const storage = window.sessionStorage;
    const key = "guided-code1-ira-date-regression";
    try {
      expect(saveGuidedFlowState(storage, key, draft)).toBe(true);
      const restored = loadGuidedFlowState(storage, key);
      expect(restored?.sectionData["income-retirement"]?.entries[0]?.code1IraAgeSource)
        .toEqual({ singlePaymentConfirmed: true, ownerBirthDate: "1966-02-01", distributionDate: "2025-08-01" });
    } finally {
      storage.removeItem(getGuidedFlowStorageKey(key));
    }

    await change("Distribution code (Box 7)", "7");
    expect(latest()[0]?.code1IraAgeSource).toBeUndefined();
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    expect(container.textContent).not.toContain(otherWorksheet);
    expect(container.textContent).not.toContain(actualDate);
  });
});

// Spec: spec/federal/form-5329.yaml, Line 2, guided Code 1 age exception.
it("requires removal or reconciliation of a saved Code 1 receipt date after another statement is entered", async () => {
  const source = {
    ...completeRetirementSource, distributionCode: "1", isIraSepSimple: true, grossDistribution: "6000", taxableAmount: "6000",
    code1IraAgeSource: { singlePaymentConfirmed: true, ownerBirthDate: "1966-02-01", distributionDate: "2025-08-01" },
  };
  const personal = { ...completePersonalInfo, dateOfBirth: "1966-02-01" };
  const ordinary = { ...completeRetirementSource, distributionCode: "7", accountReference: "second statement" };
  await render([source, ordinary], async ({ latest, container, change }) => {
    const build = () => buildRetirementInputs(latest(), "single", 2025, undefined, { personal });
    expect(build).toThrow(/saved.*Code 1 IRA receipt date/i);
    const removeDate = [...container.querySelectorAll("button")].find(button => button.textContent === "Remove saved IRA receipt date");
    expect(removeDate).toBeDefined();
    await act(async () => removeDate?.click());
    expect(latest()[0]).toMatchObject({ additionalWorksheetRequired: null, sourceFactsConfirmed: null });
    expect(latest()[0]?.code1IraAgeSource).toBeUndefined();
    expect(build).toThrow(/additional worksheet|retirement worksheets/i);
    const worksheet = "Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?";
    await change(worksheet, "true");
    await change(confirm, "true");
    expect(build).toThrow(/retirement worksheets/i);
    await change("Distribution code (Box 7)", "7");
    await change(worksheet, "false");
    await change(confirm, "true");
    expect(build()).toHaveLength(2);
    expect(build()[0]?.distributionDate).toBeUndefined();
  });
});

// Spec: spec/federal/guided-input.yaml, retirement-2025-simplified-method
it("collects and reconfirms the original blank Box 2a and the actual pension worksheet", async () => {
  const source = { ...completeRetirementSource, grossDistribution: "6000", taxableAmount: "", federalWithheld: "125" };
  const otherWorksheet = "Is a penalty exception or another retirement worksheet needed for this pension?";
  const box2b = "Is taxable amount not determined checked in Box 2b?";
  const priorRecovery = "Plan cost recovered or eligible for tax-free recovery through 2024";
  await render([source], async ({ latest, container, change }) => {
    await change(box2b, "true");
    expect(latest()[0]?.additionalWorksheetRequired).toBeNull();
    expect(container.textContent).toContain("2025 Simplified Method pension worksheet");
    expect(container.textContent).toContain("Printed taxable amount (Box 2a)");
    expect(latest()[0]?.simplifiedMethod).toBeUndefined();
    for (const [label, value] of [
      ["Local reference for the actual annuity contract", "Plan 42"],
      ["Are the payments from a qualified employee plan, qualified employee annuity or 403(b) plan?", "true"],
      ["Is the recipient the only annuitant, receiving periodic payments for their own life?", "true"],
      ["Does Box 1 report all 2025 periodic payments for this contract, with no other payments included?", "true"],
      ["Actual annuity starting date", "2025-01-15"],
      ["Annuitant age on the starting date", "65"],
      ["Net cost in the plan at the starting date", "26000"],
      ["Actual months covered by 2025 payments", "12"],
      [priorRecovery, "0"],
      [otherWorksheet, "false"],
      [confirm, "true"],
    ]) await change(label, value);
    expect(buildRetirementInputs(latest(), "single", 2025)[0]).toMatchObject({ taxableAmount: undefined, simplifiedMethodPriorYearRecovered: "0" });

    await change(priorRecovery, "");
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/amount recovered or eligible for tax-free recovery through 2024/);
    await change(priorRecovery, "0");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/after the last edit/);
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025)[0]?.taxableAmount).toBeUndefined();

    await change(box2b, "false");
    expect(container.textContent).toContain("2025 Simplified Method pension worksheet");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/reconcile the saved Simplified Method/i);
    await change(box2b, "true");
    expect(latest()[0]?.simplifiedMethod).toMatchObject({ startingDate: "2025-01-15", costInPlan: "26000", priorRecovered: "0" });
    expect(latest()[0]?.taxableAmount).toBe("");
  });
});

// Spec: spec/federal/guided-input.yaml, retirement-2026-simplified-method
it("requires new annual pension worksheet amounts after correcting the statement year", async () => {
  const initial = {
    ...completeRetirementSource, grossDistribution: "6000", taxableAmount: "", taxableAmountNotDetermined: true,
    taxableAmountConfirmed: null,
    simplifiedMethod: {
      planReference: "Plan 42", qualifiedPlanConfirmed: true, singleLifeAnnuitantConfirmed: true,
      statementCoversContractConfirmed: true, startingDate: "2025-01-15", ageAtStart: "65",
      costInPlan: "26000", monthsPaid: "12", priorRecovered: "0",
    },
  };
  await render([initial], async ({ latest, container, change }) => {
    expect(buildRetirementInputs(latest(), "single", 2025)[0]?.simplifiedMethodPaymentsReceivedThisYear).toBe(12);
    await change("Retirement statement tax year", "2026");
    expect(container.textContent).toContain("2026 Simplified Method pension worksheet");
    expect(container.textContent).toContain("Distribution code (Box 7a)");
    expect(container.textContent).toContain("Printed taxable amount (Box 2a)");
    expect(latest()[0]).toMatchObject({
      sourceTaxYear: "2026", sourceFactsConfirmed: null, taxableAmount: "",
      simplifiedMethod: { planReference: "Plan 42", startingDate: "2025-01-15", costInPlan: "26000",
        statementCoversContractConfirmed: null, monthsPaid: "", priorRecovered: "" },
    });
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2026)).toThrow(/all 2026 periodic payments/);
    await change("Does Box 1 report all 2026 periodic payments for this contract, with no other payments included?", "true");
    await change("Actual months covered by 2026 payments", "12");
    await change("Plan cost recovered or eligible for tax-free recovery through 2025", "1200.00");
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2026)[0]).toMatchObject({
      taxYear: 2026, taxableAmount: undefined, simplifiedMethodPaymentsReceivedThisYear: 12, simplifiedMethodPriorYearRecovered: "1200.00",
    });
  });
});

it("keeps a saved QCD worksheet visible and requires source confirmation after an edit", async () => {
  const initial = {
    ...completeRetirementSource,
    sourceTaxYear: "2026",
    distributionCode: "7",
    isIraSepSimple: true,
    qcdSource: { recipientName: "Original charity" },
  };
  await render([initial], async ({ latest, container, change }) => {
    expect(container.querySelector("legend")?.textContent).toContain("Qualified charitable distribution");
    await change("Charity named on the transfer and acknowledgment", "Corrected charity");
    expect(latest()[0]).toMatchObject({ qcdSource: { recipientName: "Corrected charity" }, sourceFactsConfirmed: null });
    await change("Distribution code (Box 7a)", "4");
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2026)).toThrow(/reconcile this QCD worksheet/i);
    const remove = [...container.querySelectorAll("button")].find(button => button.textContent === "Remove QCD worksheet");
    expect(remove).toBeDefined();
    await act(async () => remove?.click());
    expect(latest()[0]).toMatchObject({ qcdSource: undefined, sourceFactsConfirmed: null });
  });
});

it("records the qualified lump-sum reporting choice and clears it after a code edit", async () => {
  const method = "Qualified lump-sum reporting method";
  const source = { ...completeRetirementSource, sourceTaxYear: "2026", distributionCode: "4A" };
  await render([source], async ({ latest, change }) => {
    expect(latest()[0]?.qualifiedLumpSumReporting).toBeUndefined();
    await change(method, "form_4972");
    await change(confirm, "true");
    expect(latest()[0]?.qualifiedLumpSumReporting).toBe("form_4972");
    expect(() => buildRetirementInputs(latest(), "single", 2026)).toThrow(/separate Form 4972/i);
    await change(method, "ordinary_pension");
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2026)[0]?.qualifiedLumpSumReporting).toBe("ordinary_pension");
    await change("Distribution code (Box 7a)", "7A");
    expect(latest()[0]?.qualifiedLumpSumReporting).toBeNull();
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
  });
});

it("collects an actual ordinary retirement record without defaulting the checkbox, taxability or source zeros", async () => {
  await render([{ ...emptyRetirementEntry }], async ({ latest, container, change }) => {
    expect(latest()[0]?.isIraSepSimple).toBeNull();
    expect(container.querySelectorAll('select')).toSatisfy((controls: NodeListOf<HTMLSelectElement>) => [...controls].every(control => control.value === ""));
    for (const [label, value] of [
      ["Payer name (Box — top)", "Actual Plan"], ["Gross distribution (Box 1)", "1000.30"], ["Taxable amount (Box 2a)", "1000.10"], ["Federal tax withheld (Box 4)", "0"], ["Distribution code (Box 7)", "7"],
      ["Retirement statement tax year", "2026"], ["Payer TIN shown on the retirement form", "12-3456789"], ["Retirement account reference (last four digits or local statement label)", "plan-a"], ["Actual retirement distribution recipient", "spouse"],
      ["IRA / SEP / SIMPLE checkbox (Box 7b)", "false"], ["Is taxable amount not determined checked in Box 2b?", "false"], ["Have you established the actual taxable amount from the source and applicable basis records?", "true"],
      ["Employee contributions / insurance premiums (Box 5)", "0.20"], ["Capital gain included in Box 2a (Box 3)", "0"], ["Net unrealized appreciation (Box 6)", "0"], ["Other source amount (Box 8 / 2026 Box 8a)", "0"], ["Amount allocable to in-plan Roth rollover within five years (Box 10)", "0"],
      ["Is this an eligible governmental section 457(b) distribution?", "false"], ["Is this a U.S. military pension or survivor benefit?", "false"], ["Is this a qualified joint-and-survivor annuity benefit?", "false"],
      ["Is the Trump account checkbox in Box 7c checked?", "false"], ["Earnings on excess contributions (Box 7d)", "0"], ["Actual state reporting on this retirement form", "none"], ["Actual local reporting on this retirement form", "none"],
      ["Are basis, Roth or conversion, QCD, contribution-return, disaster, penalty-exception or other additional retirement worksheets needed?", "false"], [confirm, "true"],
    ]) await change(label, value);
    expect(buildRetirementInputs(latest(), "mfj", 2026)[0]).toMatchObject({ payer: "Actual Plan", accountHolder: "spouse", grossDistribution: "1000.30", taxableAmount: "1000.10", employeeContributions: "0.20", federalWithheld: "0", iraSepSimple: false });
    await change("Taxable amount (Box 2a)", "");
    expect(latest()[0]?.sourceFactsConfirmed).toBeNull();
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "mfj", 2026)[0]?.taxableAmount).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Add another 1099-R retirement distribution form"]')!.click());
    expect(latest()[1]?.isIraSepSimple).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove 1099-R #2"]')!.click());
    expect(latest()).toHaveLength(1);
  });
});

it("preserves actual state and local withholding and reopens changed special-distribution facts", async () => {
  await render([{ ...completeRetirementSource, isIraSepSimple: false, requiresIraConfirmation: true }], async ({ latest, change }) => {
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/IRA checkbox/);
    await change("IRA / SEP / SIMPLE checkbox (Box 7)", "true");
    await change("Do actual owner records establish zero nondeductible IRA basis?", "true");
    await change("Actual state reporting on this retirement form", "single");
    await change("Retirement source state (two-letter code)", "PA");
    await change("Retirement state tax withheld (Box 14)", "0.10");
    await change("Retirement state distribution (Box 16)", "1000");
    await change("Actual local reporting on this retirement form", "single");
    await change("Retirement source locality (Box 18)", "Actual locality");
    await change("Retirement local tax withheld (Box 17)", "0.20");
    await change("Retirement local distribution (Box 19)", "1000");
    await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025)[0]).toMatchObject({ iraSepSimple: true, iraBasisConfirmedZero: true, state: "PA", stateWithheld: "0.10", localTaxWithheld: "0.20", locality: "Actual locality" });
    await change("Distribution code (Box 7)", "G");
    await change("Do actual records confirm the completed direct rollover and its destination?", "true");
    await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/conversion/);
    await change("Taxable amount (Box 2a)", "0"); await change(confirm, "true");
    expect(buildRetirementInputs(latest(), "single", 2025)[0]?.taxableAmount).toBe("0");
    await change("Actual state reporting on this retirement form", "none"); await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/saved state/);
    expect(latest()[0]?.stateWithheld).toBe("0.10");
    await change("Distribution code (Box 7)", "J"); await change(confirm, "true");
    expect(() => buildRetirementInputs(latest(), "single", 2025)).toThrow(/special worksheet/);
    expect(latest()[0]?.distributionCode).toBe("J");
  });
});
