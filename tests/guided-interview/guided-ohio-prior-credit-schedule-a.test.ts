// Spec: spec/state/guided-state-payment-reconciliation.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { buildOhioPaymentSource } from "@/engine/state/oh-payment-source";
import { buildGuidedW2SourceContext, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { confirmGuidedOhioPaymentFacts, type OhioPaymentDraft } from "@/lib/guided-ohio-payment-facts";
import { snapshotGuidedOhioOriginals } from "@/lib/guided-ohio-residency-facts";
import { confirmGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { computeGuidedPreviewEvaluation } from "@/lib/guided-preview-compute";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
import { completeTreasuryRouting } from "../fixtures/guided-state-routing-complete";
import { confirmCurrentOhioWorkspaceOriginals } from "../fixtures/oh-workspace-actual-originals";
import { required } from "../fixtures/guided-oh-school-district-complete";

function federalInput(state: GuidedFlowState) {
  return TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
}

function editAndConfirm(state: GuidedFlowState, draft: OhioPaymentDraft) {
  const edited = updateSectionData(state, "state-return", { ...required(state.sectionData["state-return"]), ohioPayments: draft });
  const pending = required(edited.sectionData["state-return"]);
  return updateSectionData(edited, "state-return", { ...pending, ohioPayments: confirmGuidedOhioPaymentFacts(federalInput(edited), pending.ohioPayments) });
}

function establishCredit(receipts: Array<{ date: string; amount: string }> = []) {
  const { state } = completeTreasuryRouting("OH", false);
  state.sectionData.deductions = { ...state.sectionData.deductions, method: "itemized", realEstateTaxes: "18000" };
  confirmCurrentOhioWorkspaceOriginals(state, receipts);
  const data = required(state.sectionData["state-return"]);
  const input = federalInput(state);
  const owner = input.taxpayer.primary;
  const draft = {
    ...required(data.ohioPayments), sourceFactsConfirmed: null,
    priorReturn: {
      status: "filed_return", taxYear: "2024", returnType: "it1040", periodStart: "2024-01-01", periodEnd: "2024-12-31",
      filingStatus: "single", owners: [{ accountHolder: "primary", name: `${owner.firstName} ${owner.lastName}`, ssn: owner.ssn }],
      returnKind: "original", filedDate: "2025-04-15", filingExtension: { kind: "none" }, line10: "2000", line16: "0",
      electedCreditCarryforward: "250.25", sourceReference: "Fictional filed 2024 Ohio return",
    },
    priorCreditCarryforward: {
      status: "actual_credit", sourceReference: "Fictional posted current Ohio account credit", electedAmount: "250.25",
      availableForThisReturn: "200.25", accountHolder: "primary", accountSsn: owner.ssn, appliedToThisReturnConfirmed: true,
    },
  };
  return editAndConfirm(state, draft);
}

function establishDatedPayment(kind: "balance" | "extension", date: string) {
  const { state } = completeTreasuryRouting("OH", false);
  state.sectionData.deductions = { ...state.sectionData.deductions, method: "itemized", realEstateTaxes: "18000" };
  const w2 = required(state.sectionData["income-w2"]?.entries[0]);
  const w2Sources = required(w2.stateLocalSources);
  w2.stateWithheld = "1200";
  w2.stateLocalSources = confirmGuidedW2StateLocalSources(required(buildGuidedW2SourceContext(state)), 0, {
    ...w2Sources, stateRows: w2Sources.stateRows.map(row => ({ ...row, withheld: "1200" })),
  });
  confirmCurrentOhioWorkspaceOriginals(state);
  const draft = required(state.sectionData["state-return"]?.ohioPayments);
  const owner = federalInput(state).taxpayer.primary;
  const common = { accountHolder: "primary", date, sourceReference: "Fictional bank payment credited to the Ohio IT 1040 account" };
  const amount = kind === "balance" ? "31.25" : "17";
  const original = {
    accountName: `${owner.firstName} ${owner.lastName}`, accountSsn: owner.ssn, taxYear: "2025", returnType: "it1040", kind, date,
    amount, confirmationNumber: "Fictional original Ohio payment confirmation",
  };
  return editAndConfirm(state, { ...draft, sourceFactsConfirmed: null, ...(kind === "balance" ? {
    remainingTaxPayment: { ...common, status: "actual_payment", sourceFactsConfirmed: true, amountAppliedToTax: "17", original },
  } : {
    paymentRows: [{ ...common, sourceId: "original", taxYear: "2025", returnType: "it1040", kind, amount, appliedToThisReturnConfirmed: true, original }],
  }) });
}

function reopen(state: GuidedFlowState) {
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  expect(saveGuidedFlowState(storage, "fictional-oh-carry", state)).toBe(true);
  return required(loadGuidedFlowState(storage, "fictional-oh-carry"));
}

function line5a(input: TaxYearInput) {
  return calculateFederalTax(input).allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed();
}

it("uses the verified 2024 Ohio credit on 2025 Schedule A in guided and reopened returns", () => {
  const state = reopen(establishCredit());
  const before = structuredClone(state);
  const canonical = buildGuidedStateOriginals(federalInput(state), state);
  const payment = buildOhioPaymentSource(canonical, canonical.ohioPayments);
  expect(payment.estimatedPayments.toFixed()).toBe("200.25");
  const preview = computeGuidedPreviewEvaluation(state);
  expect(preview.preview.blockedBy).toBeNull();
  expect(preview.preview.metrics?.state).toMatchObject({ stateWithholding: "2200", stateRefund: "983" });
  expect.soft(line5a(canonical)).toBe("2200.25");
  expect.soft(preview.preview.metrics?.taxableIncome).toBe("39800");
  expect(state).toEqual(before);
});

it("keeps actual cash receipts and canonical applied-credit mirrors separate", () => {
  const state = establishCredit([{ date: "2025-04-15", amount: "200.25" }, { date: "2026-01-15", amount: "100.50" }]);
  const canonical = buildGuidedStateOriginals(federalInput(state), state);
  const mirror = { type: "state", state: "oh", sourceTaxYear: 2024, amount: "200.250" } as const;
  const withCurrentPaymentProof = (input: TaxYearInput): TaxYearInput => ({
    ...input, ohioPayments: { ...required(input.ohioPayments), originalFederalSources: snapshotGuidedOhioOriginals(input) },
  });
  const withCredits = (...credits: NonNullable<TaxYearInput["adjustments"]>["priorYearAppliedCredits"]) => withCurrentPaymentProof({
    ...canonical, adjustments: { estimatedTaxPayments: [], extensionPayments: [], ...canonical.adjustments, priorYearAppliedCredits: credits },
  });
  expect.soft(line5a(canonical)).toBe("2400.5");
  expect.soft(line5a(withCredits(mirror))).toBe("2400.5");
  expect.soft(line5a(withCredits({ ...mirror, state: "PA", amount: "20" }))).toBe("2420.5");
  expect.soft(() => line5a(withCredits(mirror, mirror))).toThrow(/distinct|duplicate/i);
  expect.soft(() => line5a(withCredits({ ...mirror, amount: "200.24" }))).toThrow(/Ohio.*credit/i);
  expect.soft(() => line5a(withCredits({ ...mirror, state: undefined }))).toThrow(/jurisdiction/i);
  expect.soft(() => line5a(withCurrentPaymentProof({ ...canonical, scheduleA: { ...required(canonical.scheduleA), additionalStateLocalIncomeTaxes: "1" } }))).toThrow(/additional state and local/i);
});

it("holds a changed or missing previously confirmed Ohio credit until reconfirmed", () => {
  const state = reopen(establishCredit());
  const data = required(state.sectionData["state-return"]);
  const confirmed = required(data.ohioPayments);
  expect.soft(data).toHaveProperty("lastConfirmedOHScheduleAPaymentYear", 2025);

  const withoutProof = structuredClone(state);
  const unproven = required(withoutProof.sectionData["state-return"]);
  const { originalFederalSources: _proof, ...holding } = confirmed;
  unproven.ohioPayments = { ...holding, priorCreditCarryforward: { status: "none", sourceReference: "Fictional unavailable original" } };
  expect.soft(computeGuidedPreviewEvaluation(reopen(withoutProof)).preview).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/Ohio.*credit/i) });

  const edited = reopen(updateSectionData(state, "state-return", { ...data, ohioPayments: undefined }));
  expect.soft(computeGuidedPreviewEvaluation(edited).preview).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/Ohio.*credit/i) });

  const noneDraft = {
    ...confirmed, sourceFactsConfirmed: null, priorReturn: { ...confirmed.priorReturn, electedCreditCarryforward: "0" },
    priorCreditCarryforward: { status: "none", sourceReference: "Fictional confirmed no elected credit" },
  };
  const resolved = reopen(editAndConfirm(edited, noneDraft));
  expect.soft(required(resolved.sectionData["state-return"])).not.toHaveProperty("lastConfirmedOHScheduleAPaymentYear");
  expect.soft(computeGuidedPreviewEvaluation(resolved).preview).toMatchObject({ metrics: { taxableIncome: "40000" }, blockedBy: null });
});

it("uses only actual Ohio balance principal paid during the federal cash year", () => {
  const inYear = reopen(establishDatedPayment("balance", "2025-12-31"));
  const nextYear = reopen(establishDatedPayment("balance", "2026-01-02"));
  const canonical = buildGuidedStateOriginals(federalInput(inYear), inYear);
  const actual = buildOhioPaymentSource(canonical, canonical.ohioPayments);
  expect(actual.estimatedPayments.toFixed()).toBe("0");
  expect(actual.datedPayments?.map(row => ({ ...row, amount: row.amount.toFixed() }))).toEqual([{ date: "2025-12-31", amount: "17" }]);
  expect.soft(line5a(canonical)).toBe("1217");
  expect.soft(computeGuidedPreviewEvaluation(inYear).preview).toMatchObject({
    metrics: { taxableIncome: "40783", state: { stateTax: "1217", stateWithholding: "1200" } }, blockedBy: null,
  });
  const missing = reopen(updateSectionData(inYear, "state-return", { ...required(inYear.sectionData["state-return"]), ohioPayments: undefined }));
  expect.soft(computeGuidedPreviewEvaluation(missing).preview).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/Ohio.*balance/i) });
  expect.soft(line5a(buildGuidedStateOriginals(federalInput(nextYear), nextYear))).toBe("1200");
  expect.soft(computeGuidedPreviewEvaluation(nextYear).preview).toMatchObject({ metrics: { taxableIncome: "40800" }, blockedBy: null });
});

it("holds a cash-year gross-only Ohio extension receipt for principal reconciliation", () => {
  const state = establishDatedPayment("extension", "2025-12-31");
  const canonical = buildGuidedStateOriginals(federalInput(state), state);
  expect(buildOhioPaymentSource(canonical, canonical.ohioPayments).estimatedPayments.toFixed()).toBe("17");
  expect.soft(() => line5a(canonical)).toThrow(/Ohio.*extension.*principal/i);
  expect.soft(computeGuidedPreviewEvaluation(state).preview).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/Ohio.*extension.*principal/i) });
  const nextYear = establishDatedPayment("extension", "2026-01-02");
  expect.soft(line5a(buildGuidedStateOriginals(federalInput(nextYear), nextYear))).toBe("1200");
  expect.soft(computeGuidedPreviewEvaluation(nextYear).preview).toMatchObject({ metrics: { taxableIncome: "40800" }, blockedBy: null });
});

it("keeps the Ohio historical payment hold when confirmed known-none leaves unpaid tax", () => {
  const state = establishDatedPayment("balance", "2025-12-31");
  const prior = required(state.sectionData["state-return"]?.ohioPayments);
  const disproved = editAndConfirm(state, { ...prior, sourceFactsConfirmed: null,
    remainingTaxPayment: { status: "no_remaining_tax", sourceFactsConfirmed: true, sourceReference: "Fictional account claim without complete settlement" },
  });
  const afterUnrelatedSave = updateSectionData(disproved, "deductions", required(disproved.sectionData.deductions));
  const reopened = reopen(afterUnrelatedSave);
  const data = required(reopened.sectionData["state-return"]);
  expect.soft(required(data.ohioPayments).sourceFactsConfirmed).toBe(true);
  expect.soft(data).toHaveProperty("lastConfirmedOHScheduleAPaymentYear", 2025);
  expect.soft(computeGuidedPreviewEvaluation(reopened).preview).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/remaining.tax|settlement/i) });
});

it("uses explicit prior-year Ohio estimates in the federal cash year without merging current state receipts", () => {
  for (const date of ["2025-01-15", "2025-04-15"]) {
    const { state } = completeTreasuryRouting("OH", false);
    state.sectionData.deductions = { ...state.sectionData.deductions, method: "itemized", realEstateTaxes: "18000" };
    const receipts = [{ date: "2025-04-15", amount: "100.25" }];
    confirmCurrentOhioWorkspaceOriginals(state, receipts);
    const baseline = buildGuidedStateOriginals(federalInput(state), state);
    const direct = { ...baseline, adjustments: {
      estimatedTaxPayments: [{ date, amount: "100.25", type: "state" as const, state: "OH", application: { taxYear: 2024, confirmed: true as const } }],
      extensionPayments: [], priorYearAppliedCredits: [],
    } };
    expect.soft(() => line5a({ ...direct, ohioPayments: { ...required(direct.ohioPayments), originalFederalSources: snapshotGuidedOhioOriginals(direct) } })).not.toThrow();

    const data = required(state.sectionData["state-return"]);
    data.stateEstimatedPayments = [{ date, amount: "100.25", state: "OH", application: { taxYear: "2024", confirmed: true } }];
    confirmCurrentOhioWorkspaceOriginals(state, receipts);
    const restored = reopen(state);
    const canonical = buildGuidedStateOriginals(federalInput(restored), restored);
    expect.soft(canonical.adjustments?.estimatedTaxPayments[0]?.application).toEqual({ taxYear: 2024, confirmed: true });
    expect.soft(validateSection(restored, "state-return").status).toBe("complete");
    expect.soft(() => expect(line5a(canonical)).toBe("2200.5")).not.toThrow();
    expect.soft(computeGuidedPreviewEvaluation(restored).preview).toMatchObject({
      metrics: { taxableIncome: "39799", state: { stateWithholding: "2100" } }, blockedBy: null,
    });
  }
});
