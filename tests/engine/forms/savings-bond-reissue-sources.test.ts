/** Spec: spec/federal/savings-bond-reissue-sources.yaml. */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { SavingsBondReissueSourcesSchema } from "@/models/savings-bond-reissue-sources.js";
import { calculateSavingsBondReissueSources } from "@/engine/forms/savings-bond-reissue-sources.js";
import { roundEducationSourceAmounts } from "@/utils/annual-cash-qtp.js";
import { savingsBondReissueInput } from "../../fixtures/savings-bond-reissue.js";

function group(input: ReturnType<typeof savingsBondReissueInput>) {
  const value = input.sources.groups[0];
  if (!value) throw new Error("Missing fictional group");
  return value;
}
function checked(input: ReturnType<typeof savingsBondReissueInput>) {
  const result = calculateSavingsBondReissueSources(input);
  if (!result) throw new Error("Missing actual history calculation");
  return result;
}
function reported(value: { numerator: Decimal; denominator: Decimal }) {
  return roundEducationSourceAmounts([{ amount: new Decimal(0), ...value }]).toFixed();
}

describe("actual savings-bond reissue source history", () => {
  it("preserves unknown false and exact original history values", () => {
    expect(SavingsBondReissueSourcesSchema.parse({})).toEqual({});
    const original = { sourceFactsConfirmed: false, groups: [{ communityProperty: false,
      taxpayerPurchaseFunds: "9007199254740993.000000000000000000001" }] };
    expect(SavingsBondReissueSourcesSchema.parse(original)).toEqual(original);
    expect(calculateSavingsBondReissueSources({ ...savingsBondReissueInput(), redemptions: [], sources: undefined })).toBeUndefined();
    expect(() => calculateSavingsBondReissueSources({ ...savingsBondReissueInput(), sources: undefined })).toThrow(/complete history/i);
  });
  it("derives both published separate-reissue examples from original funds", () => {
    const equal = savingsBondReissueInput();
    const before = JSON.stringify(equal);
    const first = checked(equal);
    expect(reported(first.currentTransferInterest.primary)).toBe("0");
    expect(first.redemptions.map(row => [row.sourceId, reported(row.redemptionInterest)])).toEqual([
      ["bond-primary", "250"], ["bond-spouse", "250"],
    ]);
    const sole = structuredClone(equal);
    Object.assign(group(sole), { taxpayerPurchaseFunds: "500", spousePurchaseFunds: "0" });
    const second = checked(sole);
    expect(second.groups.map(row => reported(row.recognizedAtReissue.primary))).toEqual(["100"]);
    expect(second.redemptions.map(row => reported(row.redemptionInterest))).toEqual(["250", "150"]);
    expect(reported(second.currentTransferInterest.primary)).toBe("0");
    expect(JSON.stringify(equal)).toBe(before);
    expect(JSON.stringify(first)).not.toContain("900-70-");
    expect(JSON.stringify(first)).not.toContain("Fictional original");
  });
  it("separates current reissue recognition from actual redemption interest", () => {
    const input = savingsBondReissueInput();
    Object.assign(group(input), { taxpayerPurchaseFunds: "500", spousePurchaseFunds: "0", reissueDate: "2025-06-01" });
    const result = checked(input);
    expect(reported(result.currentTransferInterest.primary)).toBe("100");
    expect(result.redemptions.map(row => reported(row.redemptionInterest))).toEqual(["250", "150"]);
    expect(result.redemptions.map(row => reported(row.previouslyRecognizedInterest))).toEqual(["0", "0"]);
    expect(roundEducationSourceAmounts([
      { amount: new Decimal(0), ...result.currentTransferInterest.primary },
      ...result.redemptions.map(row => ({ amount: new Decimal(0), ...row.redemptionInterest })),
    ]).toFixed()).toBe("500");
  });
  it("retains one third ownership and aggregates before dollar reporting", () => {
    const input = savingsBondReissueInput();
    Object.assign(group(input), { originalFaceValue: "6000", taxpayerPurchaseFunds: "1000", spousePurchaseFunds: "2000",
      valueAtReissue: "4000", reissueDate: "2025-06-01" });
    const successor = group(input).successors[1];
    const redemption = input.redemptions[1];
    if (!successor || !redemption) throw new Error("Missing fictional spouse originals");
    successor.faceValue = "6000";
    group(input).successors = [successor];
    Object.assign(redemption, { faceValue: "6000", proceeds: "5000" });
    input.redemptions = [redemption];
    const beforePrecision = Decimal.precision;
    const result = checked(input), transfer = result.currentTransferInterest.primary;
    expect(transfer.numerator.times(3).eq(transfer.denominator.times(1000))).toBe(true);
    const current = result.redemptions[0]?.redemptionInterest;
    if (!current) throw new Error("Missing calculated redemption");
    expect(current.numerator.times(3).eq(current.denominator.times(5000))).toBe(true);
    expect(reported(current)).toBe("1667");
    expect(roundEducationSourceAmounts([{ amount: new Decimal(0), ...transfer }, { amount: new Decimal(0), ...current }]).toFixed()).toBe("2000");
    expect(Decimal.precision).toBe(beforePrecision);
  });
  it("conserves actual pre and post reissue reporting separately", () => {
    const input = savingsBondReissueInput();
    const successor = group(input).successors[1], redemption = input.redemptions[1];
    if (!successor || !redemption) throw new Error("Missing fictional spouse originals");
    Object.assign(group(input), { taxpayerPreviouslyReportedInterest: "20", spousePreviouslyReportedInterest: "10" });
    Object.assign(successor, { faceValue: "1000", postReissuePriorInterestReported: "30" });
    group(input).successors = [successor];
    Object.assign(redemption, { faceValue: "1000", proceeds: "1000", priorYearInterestReported: "140" });
    input.redemptions = [redemption];
    const result = checked(input);
    expect(reported(result.groups[0]?.recognizedAtReissue.primary ?? { numerator: new Decimal(-1), denominator: new Decimal(1) })).toBe("80");
    expect(result.redemptions.map(row => [reported(row.previouslyRecognizedInterest), reported(row.redemptionInterest)])).toEqual([["140", "360"]]);
  });
  it("keeps held successors and reordered originals without duplicate interest", () => {
    const input = savingsBondReissueInput();
    input.redemptions.reverse(); group(input).successors.reverse();
    const result = checked(input);
    expect(result.redemptions.map(row => [row.sourceId, reported(row.redemptionInterest)]).sort()).toEqual([["bond-primary", "250"], ["bond-spouse", "250"]]);
    const held = group(input).successors.find(row => row.registeredOwner === "spouse");
    if (!held) throw new Error("Missing fictional held successor");
    Object.assign(held, { status: "held", redemptionSourceId: undefined });
    input.redemptions = input.redemptions.filter(row => row.registeredOwner === "taxpayer");
    expect(checked(input).redemptions.map(row => row.sourceId)).toEqual(["bond-primary"]);
  });
  it("rejects missing contradictory and stale actual sources", () => {
    const mutations: Array<(input: ReturnType<typeof savingsBondReissueInput>) => void> = [
      input => { Object.assign(input.sources, { sourceFactsConfirmed: undefined }); },
      input => { input.sources.primary.ssnLast4 = "9999"; },
      input => { input.sources.sourceTaxYear = 2026; },
      input => { Object.assign(group(input), { allPriorReportingCompleteConfirmed: undefined }); },
      input => { group(input).allSuccessorsCompleteConfirmed = false; },
      input => { Object.assign(group(input), { communityProperty: undefined }); },
      input => { group(input).communityProperty = true; },
      input => { group(input).reissueDate = "2025-12-31"; },
      input => { group(input).taxpayerPurchaseFunds = "250.00000000000000000000000000000000000000001"; },
      input => { group(input).taxpayerPreviouslyReportedInterest = "101"; },
      input => { group(input).successors.pop(); },
      input => { const row = group(input).successors[0]; if (row) row.furtherOwnershipChanges = true; },
      input => { const row = input.redemptions[0]; if (row) row.issueDate = "2001-01-01"; },
      input => { Object.assign(group(input), { taxpayerPurchaseFunds: "300", spousePurchaseFunds: "200" }); },
      input => { const row = input.redemptions[0]; if (row) Object.assign(row, { priorYearInterestReported: "1" }); },
    ];
    for (const mutate of mutations) { const input = savingsBondReissueInput(); mutate(input); expect(() => checked(input)).toThrow(/actual|source|history|reissue|prior|owner|fund|face|date|community|proportional/i); }
  });
  it("binds actual original and successor bond identifiers independently of row keys", () => {
    const missing = savingsBondReissueInput();
    Object.assign(group(missing), { originalBondIdentifier: undefined });
    expect(() => checked(missing)).toThrow(/actual.*identifier/i);
    const mismatched = savingsBondReissueInput();
    const row = mismatched.redemptions[0];
    if (!row) throw new Error("Missing fictional original");
    row.bondIdentifier = "DIFFERENT-ORIGINAL";
    expect(() => checked(mismatched)).toThrow(/identifier/i);
    const duplicate = savingsBondReissueInput(2026), copied = structuredClone(group(duplicate));
    copied.sourceId = "different-row-key";
    copied.originalBondIdentifier = "  ee-fictional-original  ";
    for (const successor of copied.successors) {
      successor.sourceId += "-copy"; successor.bondIdentifier += "-copy";
      Object.assign(successor, { status: "held", redemptionSourceId: undefined });
    }
    duplicate.sources.groups.push(copied);
    expect(() => checked(duplicate)).toThrow(/duplicate.*identifier|identifier.*duplicate/i);
    expect(checked(savingsBondReissueInput(2026)).redemptions.map(row => reported(row.redemptionInterest))).toEqual(["250", "250"]);
  });
});
