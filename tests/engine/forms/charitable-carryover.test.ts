// Spec: spec/federal/charitable-carryover-sources.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateCharitableCarryover } from "@/engine/forms/charitable-carryover.js";
import { CharitableCarryoverSourcesSchema } from "@/models/charitable-carryover-sources.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const d = (value: string) => new Decimal(value);
const empty = { cashPublic: d("0"), noncashPublic: d("0"), capitalGainPublic: d("0"), cashPrivate: d("0"), noncashPrivate: d("0"), capitalGainPrivate: d("0") };
function vintage(year = 2024, amount = "1000", category = "cash_60", medium = "cash") {
  return { sourceId: `charity-${year}-${category}`, contributionYear: year, category, medium,
    sourceReference: "Synthetic filed worksheet", originalExcess: amount, originNolReduction: "0", openingCarryforward: amount,
    adjustedThroughTaxYear: 2024, allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
    history: Array.from({ length: 2024-year }, (_, index) => ({ taxYear: year+index+1, treatedAsPaid: "0", nolReduction: "0", sourceReference: "Synthetic intervening return" })) };
}
function fixture(vintages = [vintage()]) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, charitableCarryoverSources: {
    sourceTaxYear: 2025, sourceReference: "Synthetic source packet", sourceFactsConfirmed: true, allCarryoversIncluded: true,
    calendarYearTaxpayer: true, returnMembership: "continuous_individual", membershipUnchangedConfirmed: true,
    primaryName: "Jane Doe", primaryTaxpayerIdLast4: "6789", vintages,
  } });
}
function calc(vintages = [vintage()], current: Partial<typeof empty> = {}, base = "20000", itemizes = true) {
  return calculateCharitableCarryover(fixture(vintages), { contributionBase: d(base), current: { ...empty, ...current }, itemizes });
}
describe("actual charitable carryover sources", () => {
  it("preserves unknown and explicit false source facts on parsing", () => {
    expect(CharitableCarryoverSourcesSchema.parse({ sourceFactsConfirmed: false })).toEqual({ sourceFactsConfirmed: false });
    expect(TaxYearInputSchema.parse(simpleW2Fixture).charitableCarryoverSources).toBeUndefined();
  });
  it("validates actual category history without inventing missing years or amounts", () => {
    const input = fixture([vintage(2022, "1500.50")]);
    const source = input.charitableCarryoverSources?.vintages?.[0];
    if (!source?.history) throw new Error("Missing synthetic charitable history");
    source.history[0].treatedAsPaid = "200.25";
    source.history[1].nolReduction = "100.10";
    source.openingCarryforward = "1200.15";
    const before = JSON.stringify(input);
    expect(calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true }).priorDeduction.toString()).toBe("1200.15");
    expect(JSON.stringify(input)).toBe(before);
    for (const mutate of [
      () => { source.history?.pop(); },
      () => { if (source.history) source.history[0].treatedAsPaid = undefined; },
      () => { source.openingCarryforward = "1200.16"; },
      () => { source.category = undefined; },
    ]) {
      const original = structuredClone(source);
      mutate();
      expect(() => calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true })).toThrow(/history|amount|opening|category/i);
      Object.assign(source, original);
    }
  });
  it("matches published public cash carryover and exact FIFO capacities", () => {
    const result = calc([vintage()], { cashPublic: d("9500") });
    expect(result.currentCash.toString()).toBe("9500");
    expect(result.priorDeduction.toString()).toBe("1000");
    expect(result.totalDeduction.toString()).toBe("10500");
    const cents = calc([vintage(2023, "100.20"), vintage(2024, "100.20")], { cashPublic: d("500") }, "1000.49");
    expect(cents.priorDeduction.toString()).toBe("100.294");
    expect(cents.detail.map(row => row.treatedAsPaid.toString())).toEqual(["100.2", "0.094"]);
    expect(cents.carryforwards.map(row => row.amount.toString())).toEqual(["100.106"]);
  });
  it("matches published public capital carry before current private contributions", () => {
    const result = calc([vintage(2024, "5000", "capital_gain_30", "noncash")], { cashPublic: d("6000"), cashPrivate: d("3000") }, "24000");
    expect(result.currentCash.toString()).toBe("7000");
    expect(result.currentNoncash.toString()).toBe("0");
    expect(result.priorDeduction.toString()).toBe("5000");
    expect(result.totalDeduction.toString()).toBe("12000");
    expect(result.carryforwards).toEqual([{ sourceId: "current-other_30-cash", taxYear: 2025, category: "other_30", medium: "cash", amount: d("2000") }]);
  });
  it("limits current capital property before reserving ordinary public carry capacity", () => {
    const result = calc([vintage(2024, "10000", "noncash_50", "noncash")], { capitalGainPublic: d("40000") }, "50000");
    expect(result.currentNoncash.toString()).toBe("15000");
    expect(result.priorDeduction.toString()).toBe("10000");
    expect(result.totalDeduction.toString()).toBe("25000");
    expect(result.carryforwards[0].amount.toString()).toBe("25000");
  });
  it("uses the fifth year then expires its remainder with exact conservation", () => {
    const result = calc([vintage(2020, "1000.20"), vintage(2024, "500.10")], { cashPublic: d("500") }, "1000");
    expect(result.detail[0]).toMatchObject({ taxYear: 2020, amountAvailable: d("1000.20"), treatedAsPaid: d("100"), amountUsed: d("100"), amountExpired: d("900.20"), amountRemaining: d("0") });
    expect(result.carryforwards).toEqual([{ sourceId: "charity-2024-cash_60", taxYear: 2024, category: "cash_60", medium: "cash", amount: d("500.10") }]);
  });
  it("distinguishes carry absorption from a standard-deduction charitable deduction", () => {
    const result = calc([vintage(2024, "1000")], { cashPublic: d("9500") }, "20000", false);
    expect(result.priorDeduction.toString()).toBe("0");
    expect(result.totalDeduction.toString()).toBe("0");
    expect(result.priorTreatedAsPaid.toString()).toBe("1000");
    expect(result.carryforwards).toEqual([]);
  });
  it("rejects unsupported methods and contradictory legacy balances", () => {
    expect(() => calc([vintage()], { cashPublic: d("10000"), noncashPublic: d("1000") })).toThrow(/prior.*cash.*public.*property/i);
    const input = fixture();
    input.priorYear = TaxYearInputSchema.parse({ ...input, priorYear: { charitableCarryforward: "1001" } }).priorYear;
    expect(() => calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true })).toThrow(/legacy.*reconcile/i);
    input.priorYear = undefined;
    if (!input.charitableCarryoverSources) throw new Error("Missing synthetic charitable source packet");
    input.charitableCarryoverSources.primaryTaxpayerIdLast4 = "0000";
    expect(() => calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true })).toThrow(/identity/i);
    expect(() => calculateCharitableCarryover(TaxYearInputSchema.parse({ ...simpleW2Fixture, priorYear: { charitableCarryforward: "1" } }), { contributionBase: d("20000"), current: empty, itemizes: true })).toThrow(/actual.*source/i);
  });
  it("preserves fully allowed public gifts without inventing a binding priority", () => {
    const result = calc([vintage(2024, "1234.49")], { cashPublic: d("20000.49"), noncashPublic: d("10000.51") }, "100000");
    expect(result.currentCash.toString()).toBe("20000.49");
    expect(result.currentNoncash.toString()).toBe("10000.51");
    expect(result.priorCashDeduction.toString()).toBe("1234.49");
    expect(result.carryforwards).toEqual([]);
  });
  it("reconciles saved unknown categories only against complete actual source history", () => {
    const input = TaxYearInputSchema.parse({ ...fixture(), priorYear: { charitableCarryforwardByYear: [{ taxYear: 2024, amount: "1000" }] } });
    expect(calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true }).priorDeduction.toString()).toBe("1000");
    if (!input.priorYear) throw new Error("Missing synthetic prior charitable alias");
    input.priorYear.charitableCarryforwardByYear[0].amount = "1000.01";
    expect(() => calculateCharitableCarryover(input, { contributionBase: d("20000"), current: empty, itemizes: true })).toThrow(/legacy.*reconcile/i);
  });
});
