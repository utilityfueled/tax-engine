// Spec: spec/federal/guided-hsa-timely-excess-correction.yaml
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { assertPdfExportAllowed } from "@/pdf/export-policy";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, saveGuidedFlowState, loadGuidedFlowState, validateSection, updateSectionData, setInterviewTaxYear } from "@/lib/guided-interview-flow";
import { buildHsaInputs } from "@/lib/guided-hsa-facts";
import { exportWorkspaceRecovery, importWorkspaceRecovery, type RecoveryDocumentStore } from "@/lib/workspace-recovery";
import { ensureWorkspace } from "@/lib/workspace-storage";
import type { HsaDistributionSource } from "@/lib/guided-hsa-distribution-facts";
import { completeHsaSources, completeW2Entry, startCompleteInterview } from "./complete-facts";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 11, 31, 12)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing synthetic source"); return value; }
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; } }; }
function fixture() {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2"], lifeEvents: ["hsa-contributions"], stateCode: null });
  state.taxYear = 2026;
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "85000", medicareWages: "85000", socialSecurityWages: "85000", federalWithheld: "15000" }] };
  const correction = {
    contributionReference: "Synthetic trustee contribution original A", returnReference: "Synthetic trustee posted correction A",
    recipientFirstName: "Jordan", recipientLastName: "Example", recipientSsn: "111-22-3333", payerTin: "12-3456789", accountReference: "HSA-1234", contributionTaxYear: "2026",
    contributionDate: "2026-02-01", contributionAmount: "5000", returnReceivedDate: "2026-12-15", returnedPrincipal: "600", postedGross: "625", postedEarnings: "25",
    hsaAccountConfirmed: true, personalContributionConfirmed: true, completePersonalContributionInventoryConfirmed: true,
    postedAndNotReversed: true, allAttributableIncomeReturned: true, onlyCorrectionForOwner: true, ordinaryCalendarYearTaxpayer: true, noSpecialRelief: true,
  };
  const source = { id: "trustee-A", sourceReference: "Synthetic trustee posted correction A", recipientSsn: "111-22-3333", sourceTaxYear: "2026", accountOwner: "primary", payer: "Synthetic trustee", payerTin: "12-3456789", accountReference: "HSA-1234", accountType: "hsa", distributionCode: "2", grossDistribution: "625", earningsOnExcessContributions: "25", trusteeToTrusteeTransfer: false, sourceFactsConfirmed: true, excessCorrection: correction, events: [{ id: "posted-A", distributionDate: "2026-12-15", grossDistribution: "625", medicalExpenses: "0", rolloverAmount: "0" }] } as HsaDistributionSource & { sourceReference: string; recipientSsn: string; excessCorrection: typeof correction };
  const account = { ...structuredClone(completeHsaSources), contributionTaxYear: "2026", priorYearSourceTaxYear: "2025", contributionsMade: "4400", hasDistributions: true, distributions: [source], correctionsRequired: true };
  state.sectionData.adjustments = { ...emptyAdjustmentData, hsaAccounts: [account] };
  return { state, account, source, correction, event: required(source.events[0]), personal: required(state.sectionData["personal-info"]) };
}
it("hands a complete2026 personal correction to the canonical owner calculation", () => {
  const { state, account, source, correction } = fixture();
  const input = required(buildTaxInputFromGuidedData(state));
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(input.form8889ByOwner?.primary?.contributionsMade).toBe("4400");
  expect(input.form1099SA?.[0]).toMatchObject({ taxYear: 2026, sourceReference: source.sourceReference, recipientSsn: source.recipientSsn, payerTin: source.payerTin, accountReference: source.accountReference, accountHolder: "primary", distributionCode: "2", grossDistribution: "625", earningsOnExcessContributions: "25" });
  expect(input.form5329HsaByOwner?.primary?.timelyPersonalContributionReturn).toMatchObject({ contributionTaxYear: 2026, accountOwner: "primary", contributionSourceReference: correction.contributionReference, distributionSourceReference: correction.returnReference, originalPersonalContributions: "5000", returnedPrincipal: "600", postedGross: "625", postedEarnings: "25", sourceFactsConfirmed: true });
  const result = calculateFederalTax(TaxYearInputSchema.parse(input)), owner = result.form8889ByOwner?.primary;
  expect([owner?.line2.toString(), owner?.line13.toString(), owner?.line14a.toString(), owner?.line14b.toString(), owner?.line16.toString(), owner?.line17b.toString()]).toEqual(["4400", "4400", "625", "625", "0", "0"]);
  expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
  expect(result.form5329HsaByOwner?.primary?.requiresForm5329).toBe(false);
  expect(result.totalIncome.toString()).toBe("85025");
  expect(() => buildHsaInputs([account])).toThrow(/HSA/);
});
it("keeps another owners excess and known zero earnings separate", () => {
  const { state, account, source, correction, event } = fixture(); state.segmentation.filingStatus = "mfj"; account.bothSpousesHaveHsas = true;
  required(state.sectionData.adjustments?.hsaAccounts).push({ ...structuredClone(completeHsaSources), id: "hsa-spouse", accountOwner: "spouse", contributionTaxYear: "2026", priorYearSourceTaxYear: "2025", contributionsMade: "5000", bothSpousesHaveHsas: true });
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
  expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("0"); expect(result.form5329HsaByOwner?.spouse?.line47.toString()).toBe("600"); expect(result.form5329HsaByOwner?.spouse?.line49.toString()).toBe("36");
  source.earningsOnExcessContributions = correction.postedEarnings = "0"; source.grossDistribution = correction.postedGross = event.grossDistribution = "600";
  expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state))).totalIncome.toString()).toBe("85000");
  source.earningsOnExcessContributions = ""; expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it("binds spouse correction originals independently and holds reused sources", () => {
  const f = fixture(); f.state.segmentation.filingStatus = "mfj";
  const spouse = required(f.personal.spouse);
  f.account.accountOwner = f.source.accountOwner = "spouse";
  f.source.recipientSsn = f.correction.recipientSsn = spouse.ssn;
  f.correction.recipientFirstName = spouse.firstName; f.correction.recipientLastName = spouse.lastName;
  const result = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state)));
  expect(result.form8889ByOwner?.spouse?.line2.toString()).toBe("4400");
  expect(result.form8889ByOwner?.spouse?.line14b.toString()).toBe("625");
  expect(result.form5329HsaByOwner?.spouse?.requiresForm5329).toBe(false);
  f.correction.recipientSsn = f.source.recipientSsn = f.personal.ssn;
  expect(buildTaxInputFromGuidedData(f.state)).toBeNull();
  const primary = fixture(), second = fixture(); primary.state.segmentation.filingStatus = "mfj";
  primary.account.bothSpousesHaveHsas = second.account.bothSpousesHaveHsas = true;
  second.account.id = "second-owner"; second.account.accountOwner = second.source.accountOwner = "spouse";
  second.source.id = "second-source"; second.event.id = "second-event";
  second.correction.accountReference = second.source.accountReference = "separate-spouse-HSA";
  second.correction.recipientFirstName = spouse.firstName; second.correction.recipientLastName = spouse.lastName;
  second.correction.recipientSsn = second.source.recipientSsn = spouse.ssn;
  required(primary.state.sectionData.adjustments?.hsaAccounts).push(second.account);
  expect(buildTaxInputFromGuidedData(primary.state)).toBeNull(); // two actual references cannot be copied to a new owner
  second.correction.contributionReference += " spouse";
  expect(buildTaxInputFromGuidedData(primary.state)).toBeNull();
  second.correction.returnReference += " spouse"; second.source.sourceReference = second.correction.returnReference;
  const separate = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(primary.state)));
  expect(separate.totalIncome.toString()).toBe("85050");
  expect(separate.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
  expect(separate.form5329HsaByOwner?.spouse?.line47.toString()).toBe("0");
});
it("holds missing conflicting and outside-cohort originals", () => {
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
    f => { delete (f.source as { excessCorrection?: unknown }).excessCorrection; },
    ...Object.keys(fixture().correction).map(key => (f: ReturnType<typeof fixture>) => { Object.assign(f.correction, { [key]: typeof f.correction[key as keyof typeof f.correction] === "boolean" ? null : "" }); }),
    f => { f.source.sourceReference = "other"; }, f => { f.source.recipientSsn = "222-33-4444"; },
    f => { f.correction.recipientSsn = "222-33-4444"; }, f => { f.correction.recipientFirstName = "Taylor"; }, f => { f.correction.payerTin = "98-7654321"; }, f => { f.correction.accountReference = "other"; },
    f => { f.correction.contributionTaxYear = "2025"; }, f => { f.correction.contributionDate = "2025-12-31"; }, f => { f.correction.returnReceivedDate = f.event.distributionDate = "2027-01-01"; }, f => { f.correction.returnReceivedDate = "2026-01-01"; }, f => { f.correction.returnReceivedDate = "2026-12-14"; },
    f => { f.correction.returnedPrincipal = "599.99"; }, f => { f.correction.postedGross = "624.99"; }, f => { f.correction.postedEarnings = "24.99"; }, f => { f.correction.contributionAmount = "4999.99"; }, f => { f.account.contributionsMade = "4399.99"; }, f => { f.correction.returnedPrincipal = "0"; },
    f => { f.source.grossDistribution = f.correction.postedGross = "625.000"; }, f => { f.source.earningsOnExcessContributions = f.correction.postedEarnings = "25.000"; }, f => { f.account.contributionsMade = "4400.000"; },
    f => { f.correction.contributionAmount = "1000000000000"; }, f => { f.correction.returnedPrincipal = "6e2"; },
    f => { f.event.medicalExpenses = "1"; }, f => { f.event.rolloverAmount = "1"; }, f => { f.account.correctionsRequired = false; }, f => { f.account.sourceFactsConfirmed = null; },
    f => { f.account.employerW2Contributions = "1"; }, f => { f.account.priorYearExcessContributions = "1"; }, f => { f.account.priorYearAdditionalTax = "1"; }, f => { f.account.coverageByMonth[0] = "family"; }, f => { f.account.useLastMonthRule = true; },
    f => { f.personal.dateOfBirth = "1971-01-01"; }, f => { f.personal.dateOfBirth = "2026-03-01"; }, f => { f.source.distributionCode = "1"; }, f => { f.source.events = []; },
    f => { f.account.distributions.push({ ...f.source, id: "extra", distributionCode: "1", grossDistribution: "375", earningsOnExcessContributions: "0", events: [{ ...f.event, id: "extra-event", grossDistribution: "375" }] }); },
  ];
  for (const [index, change] of changes.entries()) { const f = fixture(); change(f); expect(buildTaxInputFromGuidedData(f.state), `control ${index}`).toBeNull(); expect(validateSection(f.state, "adjustments").status, `control ${index}`).toBe("partial"); }
});
it("reopens actual guided correction originals without granting stale ownership", () => {
  const { state } = fixture(), store = storage(); saveGuidedFlowState(store, "hsa", state); const reopened = required(loadGuidedFlowState(store, "hsa"));
  expect(reopened.sectionData.adjustments?.hsaAccounts).toEqual(state.sectionData.adjustments?.hsaAccounts); expect(buildTaxInputFromGuidedData(reopened)).not.toBeNull();
  required(reopened.sectionData["personal-info"]).ssn = "222-33-4444"; expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
  expect(reopened.sectionData.adjustments?.hsaAccounts).toEqual(state.sectionData.adjustments?.hsaAccounts);
  required(reopened.sectionData["personal-info"]).ssn = "111-22-3333";
  const changedYear = setInterviewTaxYear(reopened, 2025); expect(buildTaxInputFromGuidedData(changedYear)).toBeNull();
  const changedOwner = updateSectionData(reopened, "personal-info", { ...required(reopened.sectionData["personal-info"]), firstName: "Different actual owner" });
  expect(changedOwner.sectionData.adjustments?.hsaAccounts?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(changedOwner.sectionData.adjustments?.hsaAccounts?.[0]?.distributions).toEqual(reopened.sectionData.adjustments?.hsaAccounts?.[0]?.distributions);
  expect(buildTaxInputFromGuidedData(changedOwner)).toBeNull();
});
it("restores confirmed originals through encrypted workspace recovery", async () => {
  const { state } = fixture(), store = storage(); ensureWorkspace(store, "hsa"); saveGuidedFlowState(store, "hsa", state);
  const documents: RecoveryDocumentStore = { read: async () => null, write: async () => {}, remove: async () => {} };
  const archive = await exportWorkspaceRecovery(store, "hsa", "Synthetic HSA backup password", { documents });
  expect(await archive.text()).not.toContain("111-22-3333"); expect(await archive.text()).not.toContain("Synthetic trustee");
  const restored = await importWorkspaceRecovery(store, archive, "Synthetic HSA backup password", { documents });
  const flow = required(loadGuidedFlowState(store, restored.workspaceId)); expect(restored.workspaceId).not.toBe("hsa");
  expect(flow.sectionData.adjustments).toEqual(state.sectionData.adjustments); expect(buildTaxInputFromGuidedData(flow)).toEqual(buildTaxInputFromGuidedData(state)); expect(buildTaxInputFromGuidedData(flow)).not.toBeNull();
  for (const earnings of ["", "0"]) {
    const source = required(flow.sectionData.adjustments?.hsaAccounts?.[0]?.distributions?.[0]);
    source.earningsOnExcessContributions = required(source.excessCorrection).postedEarnings = earnings;
    source.grossDistribution = required(source.excessCorrection).postedGross = required(source.events[0]).grossDistribution = "600";
    saveGuidedFlowState(store, restored.workspaceId, flow);
    const nextArchive = await exportWorkspaceRecovery(store, restored.workspaceId, "Synthetic HSA backup password", { documents });
    const next = await importWorkspaceRecovery(store, nextArchive, "Synthetic HSA backup password", { documents });
    const reopened = required(loadGuidedFlowState(store, next.workspaceId));
    expect(reopened.sectionData.adjustments).toEqual(flow.sectionData.adjustments);
    if (earnings === "") expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
    else expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened))).totalIncome.toString()).toBe("85000");
  }
});
it("holds future posted originals at the fixed guided review date and accepts its boundary", () => {
  vi.setSystemTime(new Date(2026, 10, 21, 12));
  const f = fixture();
  f.correction.contributionDate = "2026-12-30";
  f.correction.returnReceivedDate = f.event.distributionDate = "2026-12-31";
  expect(validateSection(f.state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(f.state)).toBeNull();
  f.correction.contributionDate = "2026-11-20";
  f.correction.returnReceivedDate = f.event.distributionDate = "2026-11-22";
  expect(validateSection(f.state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(f.state)).toBeNull();
  for (const contributionDate of ["2026-11-20", "2026-11-21"]) {
    f.correction.contributionDate = contributionDate;
    f.correction.returnReceivedDate = f.event.distributionDate = "2026-11-21";
    expect(validateSection(f.state, "adjustments").status).toBe("complete");
    const input = required(buildTaxInputFromGuidedData(f.state));
    expect(input.form5329HsaByOwner?.primary?.timelyPersonalContributionReturn?.receivedDate).toBe("2026-11-21");
    expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalIncome.toString()).toBe("85025");
  }
  // At 8pm Eastern the UTC ISO day is already tomorrow. It is not a received local date yet.
  vi.stubEnv("TZ", "America/New_York");
  vi.setSystemTime(new Date("2026-11-22T01:00:00Z"));
  expect(new Date().getDate()).toBe(21);
  expect(new Date().toISOString().slice(0, 10)).toBe("2026-11-22");
  f.correction.returnReceivedDate = f.event.distributionDate = "2026-11-22";
  expect(validateSection(f.state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(f.state)).toBeNull();
  f.correction.returnReceivedDate = f.event.distributionDate = "2026-11-21";
  expect(validateSection(f.state, "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(f.state)).not.toBeNull();
  // Reopening the same saved facts under an earlier review clock cannot promote a future payment.
  const store = storage(); saveGuidedFlowState(store, "as-of-hsa", f.state);
  vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 59));
  const reopened = required(loadGuidedFlowState(store, "as-of-hsa"));
  expect(validateSection(reopened, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
});
it("keeps2026 whole-return and export gates closed", async () => {
  const original = await vi.importActual<typeof import("@/models/constants.js")>("@/models/constants.js");
  expect(() => original.getConstants(2026)).toThrow(/incomplete/); expect(() => assertPdfExportAllowed(2026, 2026)).toThrow();
});
