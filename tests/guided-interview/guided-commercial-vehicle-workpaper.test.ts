// Spec: spec/federal/guided-commercial-vehicle-workpaper-2026.yaml
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { parseInput } from "@/ingest/loader";
import { guidedCommercialScheduleCContext } from "@/lib/guided-commercial-vehicle-schedule-c";
import { parseCommercialVehicleWorkpaperRecords, reviewCommercialVehicleWorkpaper, type GuidedCommercialVehicleWorkpaperRecords } from "@/lib/guided-commercial-vehicle-workpaper";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { parseGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { computeGuidedPreviewOutcome } from "@/lib/guided-preview-compute";
import { guidedCommercialWorkVanFixture } from "../fixtures/guided-commercial-work-van";

const provision = vi.hoisted(() => ({ enabled: false }));
// Exercise the qualified private calculation using provisional constants only.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 && provision.enabled ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

beforeEach(() => vi.setSystemTime(new Date(2027, 0, 1, 12)));
afterEach(() => { vi.useRealTimers(); provision.enabled = false; });

function reopen(draft: GuidedFlowState) {
  const state = parseGuidedFlowState(JSON.stringify(draft));
  if (!state) throw new Error("Expected the guided workpaper draft to reopen");
  return state;
}

it("drops unsupported document data from a saved workpaper while retaining the vehicle and ledger", () => {
  const { state, records } = guidedCommercialWorkVanFixture();
  const original = state.sectionData.credits?.vehicles?.commercialOriginal;
  const draft = saveRecords(state, records, "f".repeat(64));
  const raw = JSON.stringify(draft).replace('"mileage":{', '"mileage":{"documentBody":"synthetic original contents",');
  expect(raw).toContain("synthetic original contents");

  const reopened = parseGuidedFlowState(raw);
  if (!reopened) throw new Error("Expected the guided vehicle draft to reopen");
  expect(reopened.sectionData.credits?.vehicles?.commercialOriginal).toEqual({ ...original, workpaper: undefined });
  expect(JSON.stringify(reopened)).not.toContain("synthetic original contents");
  expect(buildTaxInputFromGuidedData(reopened)).toBeNull();
});

function saveRecords(draft: GuidedFlowState, records: GuidedCommercialVehicleWorkpaperRecords, reviewedFingerprint?: string) {
  const credits = draft.sectionData.credits;
  const vehicles = credits?.vehicles;
  const original = vehicles?.commercialOriginal;
  if (!credits || !vehicles || !original) throw new Error("Expected the retained commercial original");
  return updateSectionData(draft, "credits", { ...credits, vehicles: { ...vehicles, commercialOriginal: {
    ...original, workpaper: { records, reviewedFingerprint },
  } } });
}

function confirm(draft: GuidedFlowState) {
  const original = draft.sectionData.credits?.vehicles?.commercialOriginal;
  if (!original?.workpaper?.records) throw new Error("Expected the complete guided workpaper");
  const review = reviewCommercialVehicleWorkpaper(original, guidedCommercialScheduleCContext(draft));
  if (!review.fingerprint) throw new Error(review.message);
  return saveRecords(draft, original.workpaper.records, review.fingerprint);
}

function confirmWorkpaperAndPayments(draft: GuidedFlowState) {
  const confirmed = confirm(draft);
  const payments = confirmed.sectionData.payments;
  if (!payments?.estimatedTaxFacts) throw new Error("Expected the original payment facts for Form 2210");
  return reopen(updateSectionData(confirmed, "payments", {
    ...payments, estimatedTaxFacts: { ...payments.estimatedTaxFacts, sourceFactsConfirmed: true },
  }));
}

it("reopens an actual reviewed first-year work van and sends both verified source packets", () => {
  const { state, records, vehicle } = guidedCommercialWorkVanFixture();
  const imported = reopen(saveRecords(state, parseCommercialVehicleWorkpaperRecords(JSON.parse(JSON.stringify(records)))));
  expect(validateSection(imported, "credits").fieldErrors.commercialVehicleOriginal).toMatch(/review and confirm.*workpaper/i);
  expect(buildTaxInputFromGuidedData(imported)).toBeNull();

  const confirmed = confirmWorkpaperAndPayments(imported);
  expect(validateSection(confirmed, "credits").fieldErrors.commercialVehicleOriginal).toBeUndefined();
  const raw = buildTaxInputFromGuidedData(confirmed);
  expect(raw !== null).toBe(true);
  expect(raw?.scheduleC?.sourceFacts?.section45WFirstYear).toMatchObject({
    workpaper: records.workpaper, owner: { taxpayerReference: records.workpaper.basis.activity.taxpayerReference },
    ledger: { grossReceipts: "179185", expenses: { advertising: "125.25", officeExpense: "40.25", supplies: "19.5" } },
  });
  expect(raw?.form8936).toMatchObject({ commercialCleanVehicles: [vehicle], commercialCleanVehicleCurrentCredit: records.currentCredit });
  provision.enabled = true;
  const result = calculateFederalTax(parseInput(JSON.parse(JSON.stringify(raw))));
  expect(result.scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe("19000");
  expect(result.scheduleC?.netProfit.toFixed()).toBe("160000");
  expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe("8340");
  expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
  provision.enabled = false;
  expect(computeGuidedPreviewOutcome(confirmed)).toMatchObject({ metrics: null, blockedBy: expect.stringMatching(/2026.*incomplete|unavailable/i) });
});

it("keeps incomplete, conflicting and subsequently edited workpapers from canonical input", () => {
  const { state, records, vehicle } = guidedCommercialWorkVanFixture();
  const confirmed = confirm(state);
  const reviewedFingerprint = confirmed.sectionData.credits?.vehicles?.commercialOriginal?.workpaper?.reviewedFingerprint;
  expect(reviewedFingerprint).toBeDefined();
  const edited = saveRecords(confirmed, { ...records, currentCredit: { ...records.currentCredit,
    participation: { ...records.currentCredit.participation, actualHours: "654.26" },
  } }, reviewedFingerprint);
  const reverted = reopen(saveRecords(edited, records, edited.sectionData.credits?.vehicles?.commercialOriginal?.workpaper?.reviewedFingerprint));
  expect(reverted.sectionData.credits?.vehicles?.commercialOriginal?.workpaper).toEqual({ records });
  expect(buildTaxInputFromGuidedData(reverted)).toBeNull();

  for (const draft of [
    { ...records, currentCredit: { ...records.currentCredit, amtDepreciation: { ...records.currentCredit.amtDepreciation, amtAdjustedBasis: "18999.99" } } },
    { ...records, currentCredit: { ...records.currentCredit, creditInventory: { ...records.currentCredit.creditInventory, originalRecordReference: " ACTUAL  PARTICIPATION LOG " } } },
    { ...records, workpaper: { ...records.workpaper, basis: { ...records.workpaper.basis, commercialOriginalOwner: { ...records.workpaper.basis.commercialOriginalOwner, originalRecordReference: "Another owner's evidence" } } } },
  ]) {
    const rejected = reopen(saveRecords(state, draft, reviewedFingerprint));
    expect(validateSection(rejected, "credits").fieldErrors.commercialVehicleOriginal).toMatch(/reconcile/i);
    expect(buildTaxInputFromGuidedData(rejected)).toBeNull();
  }
  expect(() => parseCommercialVehicleWorkpaperRecords({ ...records, currentCredit: { ...records.currentCredit, priorYearCarryback: {} } })).toThrow(/complete original/i);
  expect(() => parseCommercialVehicleWorkpaperRecords({ ...records, workpaper: { basis: { vehicle }, depreciation: {} } })).toThrow(/complete original/i);
  const { basis, depreciation } = records.workpaper;
  for (const workpaper of [
    { basis: { ...basis, depreciationAsset: { ...basis.depreciationAsset, extraTaxpayerIdentifier: "synthetic original identifier" } }, depreciation },
    { basis, depreciation: { ...depreciation, mileage: { ...depreciation.mileage, documentBody: "synthetic original contents" } } },
  ]) {
    expect(() => parseCommercialVehicleWorkpaperRecords({ ...records, workpaper })).toThrow(/^Use complete original eligibility, depreciation and current credit records for one 2026 work van with a 100 percent bonus claim\.$/u);
  }

  const changedYear = reopen(setInterviewTaxYear(setInterviewTaxYear(confirmed, 2025), 2026));
  expect(changedYear.sectionData.credits?.vehicles?.commercialOriginal?.workpaper).toEqual({ records });
  expect(buildTaxInputFromGuidedData(changedYear)).toBeNull();

  const credits = confirmed.sectionData.credits;
  if (!credits?.vehicles) throw new Error("Expected confirmed vehicle credit records");
  const differentVin = "1M8GDM9AXKP042788";
  const mixed = reopen(updateSectionData(confirmed, "credits", { ...credits, vehicles: {
    ...credits.vehicles, entries: [{ vin: differentVin, kind: "new", owner: "primary" }],
  } }));
  expect(mixed.sectionData.credits?.vehicles?.entries[0]?.vin).toBe(differentVin);
  expect(validateSection(mixed, "credits").fieldErrors.commercialVehicleOriginal).toMatch(/no personal vehicle/i);
  expect(buildTaxInputFromGuidedData(mixed)).toBeNull();

  vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
  expect(validateSection(confirmed, "credits").fieldErrors.commercialVehicleOriginal).toMatch(/calendar year closes/i);
  expect(buildTaxInputFromGuidedData(confirmed)).toBeNull();
});

it("leaves a verified workpaper with unused credit subject to the canonical carryback hold", () => {
  const { state } = guidedCommercialWorkVanFixture("79185.00");
  const raw = buildTaxInputFromGuidedData(confirmWorkpaperAndPayments(state));
  const input = parseInput(JSON.parse(JSON.stringify(raw)));
  expect(input.form8936?.commercialCleanVehicleCurrentCredit?.priorYearCarryback).toBeUndefined();
  provision.enabled = true;
  expect(() => calculateFederalTax(input)).toThrow(/unused current.*actual 2025 Section 39 capacity/i);
});
