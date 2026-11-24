// Spec: spec/federal/schedule-a.yaml, 5a-pa-estimated-payment-originals.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedPAOrdinarySourceInput, emptyDeductionData, loadGuidedFlowState, saveGuidedFlowState, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { confirmGuidedPAOrdinaryReturnFacts, updateGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { computeGuidedPreview, computeGuidedPreviewOutcome } from "@/lib/guided-preview-compute";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { guidedPAOrdinaryPanelFixture, required } from "../fixtures/guided-pa-ordinary-panels";

function establishEstimates({ amounts, refund, saved = [], january, itemized = false }: {
  amounts: string[]; refund: string; saved?: string[]; january?: string; itemized?: boolean;
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
  const draft = updateGuidedPAOrdinaryReturnFacts(facts, {
    payments: { ...facts.payments, rows }, timing: { ...facts.timing, asOfDate },
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
  const values = new Map<string, string>();
  const storage: Storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const reopen = (draft: typeof state) => {
    expect(saveGuidedFlowState(storage, "fictional-pa-last-estimate", draft)).toBe(true);
    return required(loadGuidedFlowState(storage, "fictional-pa-last-estimate"));
  };
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
