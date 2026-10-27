/** Spec: spec/federal/savings-bond-reissue-return.yaml. */
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { savingsBondReissueReturnInput, savingsBondReissueCentsInput, savingsBondReissueHalfDollarInput } from "../fixtures/savings-bond-reissue-return.js";

it("preserves original precision below an aggregate reporting boundary", () => {
  const input = savingsBondReissueCentsInput(false), precision = Decimal.precision;
  const Source = Decimal.clone({ precision: 200 });
  const proceeds = new Source("250.125").minus("1e-65");
  const box3 = proceeds.minus(250).times(2).toFixed();
  for (const row of input.savingsBondRedemptions ?? []) row.proceeds = proceeds.toFixed();
  for (const row of input.form1099Int) row.usSavingsBondInterest = box3;
  for (const row of input.form8815?.reissueSources?.statements ?? []) row.box3 = box3;
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.totalInterest, result.agi]
    .map(value => value?.toFixed())).toEqual(["0", "0", "0", "80000"]);
  expect(JSON.stringify(input)).toBe(before); expect(Decimal.precision).toBe(precision);
});

it("aggregates exact source fractions and compares reported statement bounds", () => {
  const precision = Decimal.precision;
  for (const transfers of [true, false]) {
    const input = savingsBondReissueCentsInput(transfers), before = JSON.stringify(input);
    const result = calculateFederalTax(input);
    expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("1");
    expect(result.form8815?.lines.find(row => row.line === "current-reissue-interest")?.value.toFixed()).toBe(transfers ? "1" : "0");
    expect(result.totalInterest.toFixed()).toBe(transfers ? "1" : "0");
    expect(result.agi.toFixed()).toBe(transfers ? "80001" : "80000");
    expect(JSON.stringify(input)).toBe(before);
    input.savingsBondRedemptions?.reverse(); input.form8815?.reissueSources?.groups?.reverse();
    expect(calculateFederalTax(input).agi.eq(result.agi)).toBe(true);
  }
  expect(Decimal.precision).toBe(precision);
});

it("binds separate transfer and redemption originals after reordering", () => {
  const input = savingsBondReissueReturnInput(true), source = input.form8815?.reissueSources;
  const statement = source?.statements?.[0], original = input.form1099Int[0];
  if (!source || !statement || !original) throw new Error("Missing original statements");
  const redemption = { ...statement, sourceId: "redemption-statement", originalIndex: 0, accountHolder: "spouse" as const,
    accountReference: "FICTIONAL-REDEMPTION", box3: "400", currentTransfers: [] };
  const transfer = { ...statement, sourceId: "transfer-statement", originalIndex: 1, box3: "100", redemptionSourceIds: [] };
  source.statements = [transfer, redemption];
  input.form1099Int = [{ ...original, accountReference: "FICTIONAL-REDEMPTION", accountHolder: "spouse", usSavingsBondInterest: "400" },
    { ...original, usSavingsBondInterest: "100" }];
  input.savingsBondRedemptions?.reverse();
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.excludableSavingsBondInterest, result.scheduleB?.totalInterest, result.scheduleB?.taxableInterest]
    .map(value => value?.toFixed())).toEqual(["400", "500", "100"]);
  expect(JSON.stringify(input)).toBe(before);
  redemption.currentTransfers = [{ groupSourceId: "original-joint", owner: "primary" }];
  expect(() => calculateFederalTax(input)).toThrow(/duplicated/);
});

it("binds historical reissue and actual statement inclusion once", () => {
  const input = savingsBondReissueReturnInput(), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.scheduleB?.previouslyReportedSavingsBondInterest,
    result.scheduleB?.taxableInterest, result.agi].map(row => row?.toFixed())).toEqual(["400", "400", "100", "0", "80000"]);
  expect(JSON.stringify(input)).toBe(before);
});
it("preserves current transfer interest outside the education exclusion", () => {
  const input = savingsBondReissueReturnInput(true);
  const result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.scheduleB?.previouslyReportedSavingsBondInterest,
    result.scheduleB?.taxableInterest, result.agi].map(row => row?.toFixed())).toEqual(["400", "400", "0", "100", "80100"]);
  expect(result.form8815?.lines.find(row => row.line === "current-reissue-interest")?.value.toFixed()).toBe("100");
});
it("rejects missing stale or duplicated original statement facts", () => {
  for (const mode of ["missing", "stale", "owner", "unknown-prior", "duplicate", "missing-transfer"]) {
    const input = savingsBondReissueReturnInput(true), facts = input.form8815?.reissueSources;
    if (!facts) throw new Error("Missing actual reissue packet");
    const row = facts.statements?.[0];
    if (!row) throw new Error("Missing actual statement record");
    if (mode === "missing") facts.statements = undefined;
    if (mode === "stale") row.box3 = "499";
    if (mode === "owner") row.accountHolder = "spouse";
    if (mode === "unknown-prior") row.priorRecognizedInterestIncluded = undefined;
    if (mode === "duplicate") row.redemptionSourceIds?.push("bond-primary");
    if (mode === "missing-transfer") row.currentTransfers = [];
    expect(() => calculateFederalTax(input)).toThrow(/actual|source|statement|transfer|history/i);
  }
});
it("keeps exact thirds through current return reporting", () => {
  const input = savingsBondReissueReturnInput(true), facts = input.form8815?.reissueSources;
  const group = facts?.groups?.[0], row = input.savingsBondRedemptions?.[1], successor = group?.successors?.[1], statement = facts?.statements?.[0];
  if (!group || !row || !successor || !statement) throw new Error("Missing fictional originals");
  Object.assign(group, { originalFaceValue: "6000", taxpayerPurchaseFunds: "1000", spousePurchaseFunds: "2000", valueAtReissue: "4000" });
  successor.faceValue = "6000"; group.successors = [successor];
  Object.assign(row, { faceValue: "6000", proceeds: "5000" }); input.savingsBondRedemptions = [row];
  statement.redemptionSourceIds = ["bond-spouse"]; statement.box3 = "2000";
  const interest = input.form1099Int[0]; if (!interest) throw new Error("Missing original statement"); interest.usSavingsBondInterest = "2000";
  const result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.scheduleB?.taxableInterest, result.agi]
    .map(value => value?.toFixed())).toEqual(["1667", "1667", "333", "80333"]);
});

it("separates current transfer before rounding a half-dollar redemption", () => {
  const precision = Decimal.precision;
  for (const [amount, excluded, taxable] of [["0.49", "0", "1"], ["0.50", "1", "0"], ["0.51", "1", "0"]] as const) {
    const input = savingsBondReissueHalfDollarInput(amount), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.form8815?.totalInterest, result.form8815?.excludableSavingsBondInterest, result.totalInterest]
      .map(value => value?.toFixed())).toEqual([excluded, excluded, taxable]);
    expect(result.agi.toFixed()).toBe(taxable === "1" ? "80001" : "80000");
    expect(result.form8815?.redemptionResults.map(row => row.currentYearInterest?.toFixed())).toEqual([amount === "0.50" ? "0.5" : amount, "0"]);
    expect(JSON.stringify(input)).toBe(before);
  }
  expect(Decimal.precision).toBe(precision);
});
