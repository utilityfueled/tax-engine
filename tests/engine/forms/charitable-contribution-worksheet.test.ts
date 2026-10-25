// Spec: spec/federal/charitable-contribution-worksheet.yaml
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateCharitableContributionWorksheet } from "@/engine/forms/charitable-contribution-worksheet.js";
const d = (v: string) => new Decimal(v);
const empty = { cashPublic: d("0"), noncashPublic: d("0"), capitalGainPublic: d("0"), cashPrivate: d("0"), noncashPrivate: d("0"), capitalGainPrivate: d("0") };
const calc = (amounts: Partial<typeof empty>, agi = "100000") => calculateCharitableContributionWorksheet({ taxYear: 2026, contributionBase: d(agi), amounts: { ...empty, ...amounts } });
describe("2026 charitable category limits", () => {
  it("uses cash before ordinary public property under the 50% coordination", () => {
    const result = calc({ cashPublic: d("70000"), noncashPublic: d("50000") });
    expect(result.cashDeduction.toString()).toBe("59500");
    expect(result.nonCashDeduction.toString()).toBe("0");
    expect(result.carryforwards).toEqual([{ taxYear: 2026, category: "cash_60", amount: d("10500") }, { taxYear: 2026, category: "noncash_50", amount: d("50000") }]);
  });
  it("applies the new 10% cash adjustment to second-category headroom", () => {
    const result = calc({ cashPublic: d("50000"), cashPrivate: d("20000") });
    expect(result.cashDeduction.toString()).toBe("59500");
    expect(result.carryforwards).toEqual([{ taxYear: 2026, category: "other_30", amount: d("10500") }]);
  });
  it("preserves separate 30% and 20% capital-gain categories", () => {
    const result = calc({ capitalGainPublic: d("10000"), capitalGainPrivate: d("30000") });
    expect(result.allowedBeforeFloor.capital_gain_30.toString()).toBe("10000");
    expect(result.allowedBeforeFloor.capital_gain_20.toString()).toBe("20000");
    expect(result.nonCashDeduction.toString()).toBe("29500");
    expect(result.carryforwards).toEqual([{ taxYear: 2026, category: "capital_gain_20", amount: d("10500") }]);
  });
  it("reserves public property without its special 30% cap when limiting private ordinary gifts", () => {
    const result = calc({ capitalGainPublic: d("50000"), cashPrivate: d("20000") });
    expect(result.allowedBeforeFloor.other_30.toString()).toBe("0");
    expect(result.allowedBeforeFloor.capital_gain_30.toString()).toBe("30000");
  });
  it("handles zero or negative contribution base without negative deductions", () => {
    expect(calc({ cashPublic: d("1000") }, "-100").totalDeduction.toString()).toBe("0");
    expect(calc({ cashPublic: d("1000") }, "0").carryforwards[0].amount.toString()).toBe("1000");
  });
  it("rejects negative amounts and unsupported years", () => {
    expect(() => calc({ cashPublic: d("-1") })).toThrow(/nonnegative/i);
    expect(() => calculateCharitableContributionWorksheet({ taxYear: 2024, contributionBase: d("100000"), amounts: empty })).toThrow(/year/i);
  });
});
describe("2026 charitable floor and carryforward", () => {
  it.each([["499", "0"], ["500", "0"], ["501", "1"], ["1000", "500"]])("applies the 0.5% floor to %s of cash", (amount, expected) => {
    const result = calc({ cashPublic: d(amount) });
    expect(result.totalDeduction.toString()).toBe(expected);
    expect(result.carryforwards).toEqual([]);
  });
  it("consumes the floor in statutory D,C,B,A,G order", () => {
    const result = calc({ cashPublic: d("1000"), noncashPublic: d("100"), capitalGainPublic: d("100"), cashPrivate: d("100"), capitalGainPrivate: d("100") });
    expect(result.allowedAfterFloor).toEqual({ cash_60: d("900"), noncash_50: d("0"), capital_gain_30: d("0"), other_30: d("0"), capital_gain_20: d("0") });
    expect(result.totalDeduction.toString()).toBe("900");
    expect(result.carryforwards).toEqual([]);
  });
  it("carries floor amounts in their own category only when a percentage excess exists", () => {
    const result = calc({ cashPublic: d("70000"), capitalGainPrivate: d("100") });
    expect(result.carryforwards.some(entry => entry.category === "capital_gain_20" && entry.amount.eq("100"))).toBe(true);
    expect(result.carryforwards.every(entry => entry.taxYear === 2026)).toBe(true);
  });
  it("does not create a floor-only carryover at the exact 60% ceiling", () => {
    const result = calc({ cashPublic: d("60000") });
    expect(result.totalDeduction.toString()).toBe("59500");
    expect(result.carryforwards).toEqual([]);
  });
});
