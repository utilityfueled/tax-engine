// Spec: spec/federal/schedule-a.yaml, 5a-pa-estimated-payment-originals.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { snapshotPAOrdinaryReturnOriginals } from "@/engine/state/pa-ordinary-return-facts";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedPAOrdinarySourceInput, emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { confirmGuidedPAOrdinaryReturnFacts, updateGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { computeGuidedPreview, computeGuidedPreviewOutcome } from "@/lib/guided-preview-compute";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { guidedPAOrdinaryPanelFixture, required } from "../fixtures/guided-pa-ordinary-panels";

function establishEstimates({ amounts, refund, saved = [], january, itemized = false, priorRefund }: {
  amounts: string[]; refund: string; saved?: string[]; january?: string; itemized?: boolean; priorRefund?: string;
}) {
  const { data, facts, sources, state: starting } = guidedPAOrdinaryPanelFixture();
  let state = starting;
  if (january || itemized) {
    state = updateSectionData(state, "deductions", {
      ...emptyDeductionData, method: "itemized", realEstateTaxes: "18000", directItemizedAmountsTaxYear: 2025,
    });
  } else {
    const { deductions: _deductions, ...sectionData } = state.sectionData;
    state = { ...state, sectionData };
  }
  const editState = (patch: Partial<typeof starting.sectionData["state-return"]>) => {
    state = updateSectionData(state, "state-return", { ...required(state.sectionData["state-return"]), ...patch });
  };
  editState({ stateEstimatedPayments: saved.map(amount => ({ amount, date: "2025-04-15", state: "PA" })) });
  editState({ paResidencySources: confirmGuidedPAResidencySources(
    TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), data.paResidencySources,
  ) });
  const input = required(buildGuidedPAOrdinarySourceInput(state));
  const taxpayer = input.taxpayer.primary;
  const estimate = (amount: string, index: number, intendedInstallment: number, date: string) => ({
    intendedInstallment, sourceReference: `Fictional PA estimated receipt ${index}`,
    original: {
      amount, date, kind: "estimated", taxYear: 2025, returnType: "pa40",
      accountName: `${taxpayer.firstName} ${taxpayer.lastName}`, accountSsn: taxpayer.ssn,
      confirmationNumber: `Fictional payment confirmation ${index}`,
    } as const,
  });
  const rows = amounts.map((amount, index) => estimate(amount, index, 1, "2025-04-15"));
  if (january) rows.push(estimate(january, amounts.length, 4, "2026-01-15"));
  const asOfDate = january ? "2026-02-01" : facts.timing.asOfDate;
  const account = { accountName: `${taxpayer.firstName} ${taxpayer.lastName}`, accountSsn: taxpayer.ssn };
  const draft = updateGuidedPAOrdinaryReturnFacts(facts, {
    payments: {
      ...facts.payments, rows,
      ...(priorRefund === undefined ? {} : {
        priorReturn: { status: "return", sourceReference: "Fictional filed 2024 PA-40", filedConfirmed: true, fullYearResidentConfirmed: true,
          original: { ...account, taxYear: 2024, returnType: "pa40", residency: "resident", filingStatus: "S", filedOn: "2025-03-01", taxableIncome: "10000", taxForgivenessCredit: "0" } },
        priorCredit: { status: "available", sourceReference: "Fictional 2024 election and unchanged 2025 account",
          priorOriginalElection: { ...account, taxYear: 2024, creditElected: priorRefund },
          currentOriginalAccount: { ...account, taxYear: 2025, availableCredit: priorRefund, noOffsetsReversalsOrRefundsConfirmed: true } },
      }),
    },
    timing: { ...facts.timing, asOfDate },
    disposition: { kind: "allocation", sourceReference: "Fictional overpayment allocation", refundRequested: refund, nextYearCreditRequested: "0", donations: [] },
  });
  editState({ paOrdinaryReturnFacts: draft });
  const ordinary = confirmGuidedPAOrdinaryReturnFacts(required(buildGuidedPAOrdinarySourceInput(state)), draft);
  editState({ paOrdinaryReturnFacts: ordinary });
  const completionDraft = {
    ...sources, otherStateTaxes: { ...sources.otherStateTaxes, jurisdictions: sources.otherStateTaxes.jurisdictions.map(row => ({ ...row, completeThroughDate: asOfDate })) },
  };
  editState({ paOrdinaryReturnCompletionSources: completionDraft });
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(required(buildGuidedPAOrdinarySourceInput(state)), completionDraft, ordinary);
  editState({ paOrdinaryReturnCompletionSources: completion });
  const canonical = buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), state);
  return { state, canonical };
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
  expect(saveGuidedFlowState(storage, "fictional-pa-payments", state)).toBe(true);
  return required(loadGuidedFlowState(storage, "fictional-pa-payments"));
}

it("includes only in-year verified Pennsylvania estimates in guided and canonical federal calculations", () => {
  const { state, canonical } = establishEstimates({ amounts: ["100"], january: "50", refund: "150" });
  const federal = calculateFederalTax(canonical);
  const preview = computeGuidedPreview(state);
  expect(validateSection(state, "state-return").status).toBe("complete");
  expect(preview?.state).toMatchObject({ stateWithholding: "1689", stateRefund: "150" });
  expect.soft(federal.allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed()).toBe("1639");
  expect.soft(federal.deductionAmount.toFixed()).toBe("19639");
  expect.soft(preview?.taxableIncome).toBe("30481");
});

it("includes distinct exact-cents Pennsylvania receipts once under automatic itemization", () => {
  const { state, canonical } = establishEstimates({ amounts: ["7600.25", "7600.25"], saved: ["7600.250"], refund: "15201" });
  const federal = calculateFederalTax(canonical);
  expect(canonical.deductionElection).toBe("automatic");
  expect(canonical.scheduleA).toBeUndefined();
  expect.soft(federal.allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed()).toBe("16739.5");
  expect.soft(federal.deductionUsed).toBe("itemized");
  expect.soft(federal.deductionAmount.toFixed()).toBe("16740");
  expect.soft(computeGuidedPreview(JSON.parse(JSON.stringify(state)))?.taxableIncome).toBe("33380");
});

it("keeps payments expressly applied to a prior return in the actual cash year", () => {
  const { canonical } = establishEstimates({ amounts: ["100"], january: "50", refund: "150" });
  const facts = required(canonical.paOrdinaryReturnFacts);
  const amended = TaxYearInputSchema.parse({ ...canonical, adjustments: {
    ...canonical.adjustments, estimatedTaxPayments: [
      { type: "state", state: "PA", amount: "100.00", date: "2025-04-15", application: { taxYear: 2024, confirmed: true } },
    ],
  } });
  const current = { ...amended, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(amended, facts) };
  expect(calculateFederalTax(current).allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed()).toBe("1739");
});

it("holds a changed previously verified Pennsylvania receipt until reviewed again", () => {
  const { state } = establishEstimates({ amounts: ["100"], january: "50", refund: "150" });
  const data = required(state.sectionData["state-return"]);
  const facts = required(data.paOrdinaryReturnFacts);
  const receipt = required(facts.payments.rows[0]);
  const changed = updateSectionData(state, "state-return", {
    ...data, paOrdinaryReturnFacts: updateGuidedPAOrdinaryReturnFacts(facts, {
      payments: { ...facts.payments, rows: [{ ...receipt, original: { ...receipt.original, amount: "100.01" } }, ...facts.payments.rows.slice(1)] },
    }),
  });
  expect(computeGuidedPreviewOutcome(changed)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/confirm complete actual sources/i) });
});

it("holds removal of the last previously confirmed Pennsylvania receipt until the empty ledger is confirmed", () => {
  const { state } = establishEstimates({ amounts: ["100"], refund: "100", itemized: true });
  const restored = reopen(state);
  const data = required(restored.sectionData["state-return"]);
  const facts = required(data.paOrdinaryReturnFacts);
  expect(data.lastConfirmedPAEstimateYear).toBe(2025);
  expect(data.stateEstimatedPayments).toEqual([]);
  expect(computeGuidedPreview(restored)?.taxableIncome).toBe("30481");

  const removed = updateSectionData(restored, "state-return", {
    ...data, paOrdinaryReturnFacts: updateGuidedPAOrdinaryReturnFacts(facts, {
      payments: { ...facts.payments, rows: [] },
      disposition: { ...facts.disposition, kind: "no_overpayment", refundRequested: "0" },
    }),
  });
  const reopened = reopen(removed);
  const pending = required(reopened.sectionData["state-return"]);
  expect(required(pending.paOrdinaryReturnFacts).sourceFactsConfirmed).toBeNull();
  expect(pending.lastConfirmedPAEstimateYear).toBe(2025);
  expect.soft(computeGuidedPreviewOutcome(reopened)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/confirm complete actual sources/i) });

  const confirmed = updateSectionData(reopened, "state-return", {
    ...pending, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(
      required(buildGuidedPAOrdinarySourceInput(reopened)), pending.paOrdinaryReturnFacts,
    ),
  });
  expect.soft(computeGuidedPreviewOutcome(confirmed)).toMatchObject({ metrics: { taxableIncome: "30581" }, blockedBy: null });

  const confirmedData = required(confirmed.sectionData["state-return"]);
  const confirmedFacts = required(confirmedData.paOrdinaryReturnFacts);
  expect(confirmedData).not.toHaveProperty("lastConfirmedPAEstimateYear");
  const unrelated = updateSectionData(confirmed, "state-return", {
    ...confirmedData, paOrdinaryReturnFacts: updateGuidedPAOrdinaryReturnFacts(confirmedFacts, { sourceReference: "Renamed no-estimate source" }),
  });
  expect.soft(computeGuidedPreviewOutcome(unrelated)).toMatchObject({ metrics: { taxableIncome: "30581" }, blockedBy: null });

  const standard = updateSectionData(reopened, "deductions", emptyDeductionData);
  expect.soft(computeGuidedPreviewOutcome(standard)).toMatchObject({ metrics: { taxableIncome: "34370" }, blockedBy: null });

  const { lastConfirmedPAEstimateYear: _storedYear, ...legacyData } = data;
  const legacy = { ...restored, sectionData: { ...restored.sectionData, "state-return": legacyData } };
  expect(computeGuidedPreview(legacy)?.taxableIncome).toBe("30481");
  const removedFromLegacy = updateSectionData(legacy, "state-return", { ...legacyData, paOrdinaryReturnFacts: pending.paOrdinaryReturnFacts });
  expect(computeGuidedPreviewOutcome(removedFromLegacy)).toMatchObject({ metrics: null });

  const incomplete = JSON.parse(JSON.stringify(legacy)) as typeof state;
  const incompleteData = required(incomplete.sectionData["state-return"]);
  const incompleteReceipt = required(incompleteData.paOrdinaryReturnFacts).payments.rows[0];
  Reflect.deleteProperty(required(incompleteReceipt), "original");
  const removedIncomplete = updateSectionData(incomplete, "state-return", { ...incompleteData, paOrdinaryReturnFacts: pending.paOrdinaryReturnFacts });
  expect(removedIncomplete.sectionData["state-return"]).not.toHaveProperty("lastConfirmedPAEstimateYear");

  const { state: zeroState } = establishEstimates({ amounts: ["0.00"], refund: "0", itemized: true });
  const zeroData = required(zeroState.sectionData["state-return"]);
  const zeroFacts = required(zeroData.paOrdinaryReturnFacts);
  expect(zeroData).not.toHaveProperty("lastConfirmedPAEstimateYear");
  const zeroRemoved = updateSectionData(zeroState, "state-return", {
    ...zeroData, paOrdinaryReturnFacts: updateGuidedPAOrdinaryReturnFacts(zeroFacts, {
      payments: { ...zeroFacts.payments, rows: [] },
    }),
  });
  expect(computeGuidedPreviewOutcome(zeroRemoved)).toMatchObject({ metrics: { taxableIncome: "30581" }, blockedBy: null });
});

it("requires distinct verified Pennsylvania identity, exact mirrors and an unambiguous deduction", () => {
  const { canonical } = establishEstimates({ amounts: ["100"], january: "50", refund: "150" });
  const facts = required(canonical.paOrdinaryReturnFacts);
  const receipt = required(facts.payments.rows[0]);
  const duplicate = { ...receipt, sourceReference: "Different description", original: {
    ...receipt.original, confirmationNumber: receipt.original.confirmationNumber.toLowerCase(),
  } };
  expect(() => calculateFederalTax({ ...canonical, paOrdinaryReturnFacts: {
    ...facts, payments: { ...facts.payments, rows: [...facts.payments.rows, duplicate] },
  } })).toThrow(/duplicate actual payment receipt identity/i);

  const check = (changes: object) => {
    const input = TaxYearInputSchema.parse({ ...canonical, ...changes });
    return calculateFederalTax({ ...input, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(input, facts) });
  };
  expect(() => check({ adjustments: { estimatedTaxPayments: [
    { type: "state", state: "PA", amount: "100.01", date: "2025-04-15" },
  ] } })).toThrow(/distinct actual original receipt/i);
  expect(() => check({ scheduleA: { ...canonical.scheduleA, additionalStateLocalIncomeTaxes: "100" } }))
    .toThrow(/reconcile the additional state and local income tax total/i);
  const standard = check({ scheduleA: undefined, deductionElection: "standard" });
  expect(standard.deductionUsed).toBe("standard");
  expect(standard.allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed()).toBe("1539");
});

const line5a = (result: ReturnType<typeof calculateFederalTax>) =>
  result.allLines.find(line => line.form === "Sched A" && line.line === "5a")?.value.toFixed();

it("includes the verified prior Pennsylvania refund in guided and canonical line 5a", () => {
  const { state, canonical } = establishEstimates({ amounts: [], refund: "25", itemized: true, priorRefund: "25.25" });
  expect(validateSection(state, "state-return").status).toBe("complete");
  expect.soft(computeGuidedPreview(reopen(state))).toMatchObject({ taxableIncome: "30556", state: { stateWithholding: "1564", stateRefund: "25" } });
  const federal = calculateFederalTax(canonical);
  expect.soft(line5a(federal)).toBe("1564.25");
  expect.soft(federal.deductionAmount.toFixed()).toBe("19564");

  const { canonical: combined } = establishEstimates({ amounts: ["100"], refund: "175", january: "50", priorRefund: "25.25" });
  expect.soft(line5a(calculateFederalTax(combined))).toBe("1664.25");
});

it("reconciles one matching generic Pennsylvania applied refund and preserves unrelated credits", () => {
  const { canonical } = establishEstimates({ amounts: [], refund: "25", itemized: true, priorRefund: "25.25" });
  const native = required(canonical.paOrdinaryReturnFacts);
  const mirror = { sourceTaxYear: 2024, type: "state", state: "pa", amount: "25.250" };
  const other = { ...mirror, state: "CA", amount: "3.75" };
  const federal = { ...mirror, state: undefined, type: "federal", amount: "10" };
  const withCredits = (credits: object[], packet = native) => {
    const input = TaxYearInputSchema.parse({ ...canonical, adjustments: { priorYearAppliedCredits: credits } });
    return calculateFederalTax({ ...input, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(input, packet) });
  };
  const genericOnly = TaxYearInputSchema.parse({ ...canonical, paOrdinaryReturnFacts: undefined, adjustments: { priorYearAppliedCredits: [mirror] } });
  expect(line5a(calculateFederalTax(genericOnly))).toBe("1564.25");
  expect.soft(line5a(withCredits([mirror, other, federal]))).toBe("1568");
  expect.soft(line5a(withCredits([other]))).toBe("1568");
  for (const credits of [[mirror, mirror], [{ ...mirror, sourceTaxYear: 2023 }], [{ ...mirror, amount: "25.24" }], [{ ...mirror, state: undefined }]]) {
    expect.soft(() => withCredits(credits)).toThrow(/Pennsylvania.*prior|prior.*Pennsylvania/i);
  }
  const noCredit = { ...native, payments: { ...native.payments, priorCredit: { status: "none", sourceReference: "Fictional confirmed no credit" } } };
  expect.soft(() => withCredits([mirror], noCredit)).toThrow(/Pennsylvania.*prior|prior.*Pennsylvania/i);
});

it("holds a changed Pennsylvania prior refund after reopening until the current originals are confirmed", () => {
  const { state, canonical } = establishEstimates({ amounts: [], refund: "25", itemized: true, priorRefund: "25.25" });
  const saved = reopen(state);
  const data = required(saved.sectionData["state-return"]);
  const facts = required(data.paOrdinaryReturnFacts);
  const replaceSnapshot = (originalFederalSources: Record<string, unknown>) => reopen({ ...saved, sectionData: {
    ...saved.sectionData, "state-return": { ...data, paOrdinaryReturnFacts: { ...facts, originalFederalSources } },
  } });
  expect.soft(computeGuidedPreviewOutcome(replaceSnapshot({ w2s: [null] }))).toMatchObject({ metrics: null });
  const staleInput = structuredClone(canonical);
  required(staleInput.w2s[0]).employer.name = "Different original employer at unchanged wages";
  const staleSnapshot = snapshotPAOrdinaryReturnOriginals(staleInput);
  expect(TaxYearInputSchema.safeParse(staleSnapshot).success).toBe(true);
  expect.soft(computeGuidedPreviewOutcome(replaceSnapshot(staleSnapshot))).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/current originals differ/i) });

  const removed = reopen(updateSectionData(saved, "state-return", {
    ...data, paOrdinaryReturnFacts: updateGuidedPAOrdinaryReturnFacts(facts, {
      payments: { ...facts.payments, priorCredit: { status: "none", sourceReference: "Fictional actual no credit remains" } },
      disposition: { ...facts.disposition, kind: "no_overpayment", refundRequested: "0" },
    }),
  }));
  expect.soft(computeGuidedPreviewOutcome(removed)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/confirm.*actual sources/i) });
  const pending = required(removed.sectionData["state-return"]);
  for (const invalidSnapshot of [staleSnapshot, { w2s: [null] }]) {
    const staleReopenedEmpty = reopen({ ...removed, sectionData: { ...removed.sectionData, "state-return": {
      ...pending, paOrdinaryReturnFacts: { ...required(pending.paOrdinaryReturnFacts), sourceFactsConfirmed: true, originalFederalSources: invalidSnapshot },
    } } });
    expect.soft(computeGuidedPreviewOutcome(staleReopenedEmpty)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/current originals differ/i) });
    const unrelatedSave = reopen(updateSectionData(staleReopenedEmpty, "deductions", staleReopenedEmpty.sectionData.deductions));
    expect.soft(unrelatedSave.sectionData["state-return"]?.lastConfirmedPAEstimateYear).toBe(2025);
    expect.soft(computeGuidedPreviewOutcome(unrelatedSave)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/current originals differ/i) });
  }
  const confirmed = updateSectionData(removed, "state-return", {
    ...pending, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(required(buildGuidedPAOrdinarySourceInput(removed)), pending.paOrdinaryReturnFacts),
  });
  expect(reopen(confirmed).sectionData["state-return"]).not.toHaveProperty("lastConfirmedPAEstimateYear");
  expect.soft(computeGuidedPreviewOutcome(reopen(confirmed))).toMatchObject({ metrics: { taxableIncome: "30581", state: { stateRefund: "0" } }, blockedBy: null });
});
