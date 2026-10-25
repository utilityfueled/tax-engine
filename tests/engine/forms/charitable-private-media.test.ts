// Spec: spec/federal/charitable-private-media.yaml
import { expect, it } from "vitest";
import { d } from "@/utils/decimal.js";
import { calculateCharitableContributionWorksheet } from "@/engine/forms/charitable-contribution-worksheet.js";
import { calculateCharitableCarryover } from "@/engine/forms/charitable-carryover.js";
import { validateCharitableCarryoverSources } from "@/engine/forms/charitable-carryover-source-validation.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { charitablePrivateMediaFixture, privateCharitableVintage } from "../../fixtures/charitable-private-media.js";
const empty = { cashPublic: d("0"), noncashPublic: d("0"), capitalGainPublic: d("0"), cashPrivate: d("0"), noncashPrivate: d("0"), capitalGainPrivate: d("0") };
function current(taxYear: number, base: string, cash: string, noncash: string, amounts: Partial<typeof empty> = {}) {
  return calculateCharitableContributionWorksheet({ taxYear, contributionBase: d(base),
    amounts: { ...empty, ...amounts, cashPrivate: d(cash), noncashPrivate: d(noncash) } });
}
it("preserves only determined current private cash and property allowances", () => {
  const full = current(2025, "100000", "1000.49", "2000.51");
  expect(full.allowedAfterFloor.other_30.toString()).toBe("3001");
  expect(full.cashDeduction.toString()).toBe("1000"); expect(full.nonCashDeduction.toString()).toBe("2001");
  expect(full.carryforwards).toEqual([]);
  const zero = current(2025, "0", "1000.49", "2000.51");
  expect(zero.totalDeduction.toString()).toBe("0");
  for (const [cash, noncash] of [["2000", "2000"], ["0.01", "4000"], ["4000", "0.01"]]) {
    expect(() => current(2025, "10000", cash, noncash)).toThrow(/partial.*cash.*noncash|partial.*media/i);
  }
  for (const [cash, noncash] of [["4000", "0"], ["0", "4000"]]) {
    expect(current(2025, "10000", cash, noncash).totalDeduction.toString()).toBe("3000");
  }
  const input = charitablePrivateMediaFixture(); input.charitableCarryoverSources = undefined;
  input.w2s[0].wages = "10000";
  input.donations[0].amount = "2000"; input.donations[1].amount = "2000"; input.donations[1].costBasis = "2000";
  expect(() => calculateFederalTax(input)).toThrow(/partial.*cash.*noncash|partial.*media/i);
  const sourced = charitablePrivateMediaFixture();
  if (!sourced.charitableCarryoverSources) throw new Error("Missing synthetic history");
  sourced.charitableCarryoverSources.vintages = [];
  expect(() => calculateCharitableCarryover(sourced, { contributionBase: d("10000"),
    current: { ...empty, cashPrivate: d("2000"), noncashPrivate: d("2000") }, itemizes: false }))
    .toThrow(/partial.*cash.*noncash|partial.*media/i);
});
it("groups same-year private media before FIFO use and expiry", () => {
  const input = charitablePrivateMediaFixture(), sources = input.charitableCarryoverSources;
  if (!sources) throw new Error("Missing synthetic history");
  sources.vintages = [privateCharitableVintage(2020, "cash", "100.20"), privateCharitableVintage(2020, "noncash", "200.30"),
    privateCharitableVintage(2024, "cash", "400.10")];
  const before = JSON.stringify(input);
  const calc = (base: string) => calculateCharitableCarryover(input, { contributionBase: d(base), current: empty, itemizes: true });
  const full = calc("2000");
  expect(full.detail.map(row => row.treatedAsPaid.toString())).toEqual(["100.2", "200.3", "299.5"]);
  expect(full.carryforwards.map(row => [row.medium, row.amount.toString()])).toEqual([["cash", "100.6"]]);
  const zero = calc("0");
  expect(zero.expired.toString()).toBe("300.5");
  expect(zero.detail.map(row => row.amountRemaining.toString())).toEqual(["0", "0", "400.1"]);
  expect(() => calc("1000")).toThrow(/partial.*cash.*noncash|partial.*media/i);
  sources.vintages.reverse();
  expect(calc("2000").detail).toEqual(full.detail);
  sources.vintages.reverse(); expect(JSON.stringify(input)).toBe(before);
  const standard = calculateCharitableCarryover(input, { contributionBase: d("2000"), current: empty, itemizes: false });
  expect(standard.totalDeduction.toString()).toBe("0");
  expect(standard.detail.map(row => row.treatedAsPaid.toString())).toEqual(["100.2", "200.3", "299.5"]);
  expect(standard.carryforwards).toEqual(full.carryforwards);
  input.priorYear = TaxYearInputSchema.parse({ ...input, priorYear: { ...input.priorYear, charitableCarryforward: "700.60", charitableCarryforwardByYear: [
    { taxYear: 2020, category: "other_30", amount: "300.50" }, { taxYear: 2024, category: "other_30", amount: "400.10" },
  ] } }).priorYear;
  expect(validateCharitableCarryoverSources(input)).toHaveLength(3);
  if (!input.priorYear) throw new Error("Missing synthetic legacy source alias");
  input.priorYear.charitableCarryforwardByYear[0].amount = "300.51";
  expect(() => validateCharitableCarryoverSources(input)).toThrow(/legacy.*reconcile/i);
  input.priorYear = undefined;
  const duplicate = structuredClone(sources.vintages[0]); duplicate.sourceId = "different-source-same-medium";
  sources.vintages.push(duplicate);
  expect(() => validateCharitableCarryoverSources(input)).toThrow(/duplicate.*medium/i);
});
it("retains exact private carry media after caps and the current floor", () => {
  const expected = [{ taxYear: 2025, category: "other_30", medium: "cash" as const, amount: d("1000.49") },
    { taxYear: 2025, category: "other_30", medium: "noncash" as const, amount: d("2000.51") }];
  expect(current(2025, "0", "1000.49", "2000.51").carryforwards).toEqual(expected);
  expect(current(2026, "100000", "100", "200").carryforwards).toEqual([]);
  expect(() => current(2026, "100000", "1000.49", "2000.51")).toThrow(/partial.*cash.*noncash|partial.*media/i);
  const full2026 = current(2026, "100000", "1000.49", "2000.51", { capitalGainPrivate: d("500") });
  expect(full2026.allowedAfterFloor.other_30.toString()).toBe("3001");
  expect(full2026.cashDeduction.toString()).toBe("1000"); expect(full2026.nonCashDeduction.toString()).toBe("2001");
  const zero2026 = current(2026, "100000", "100.49", "200.51", { cashPublic: d("70000") });
  expect(zero2026.carryforwards.filter(row => row.category === "other_30")).toEqual([
    { taxYear: 2026, category: "other_30", medium: "cash", amount: d("100.49") },
    { taxYear: 2026, category: "other_30", medium: "noncash", amount: d("200.51") },
  ]);
  const source = charitablePrivateMediaFixture();
  source.taxpayer.taxYear = 2026;
  if (!source.charitableCarryoverSources) throw new Error("Missing synthetic history");
  source.charitableCarryoverSources.sourceTaxYear = 2026;
  source.charitableCarryoverSources.vintages = expected.map(row => ({
    ...privateCharitableVintage(2025, row.medium, row.amount.toString()),
    contributionYear: row.taxYear, adjustedThroughTaxYear: 2025, history: [],
  }));
  expect(validateCharitableCarryoverSources(source).map(row => [row.medium, row.amount.toString()]))
    .toEqual([["cash", "1000.49"], ["noncash", "2000.51"]]);
  expect(() => calculateCharitableCarryover(source, { contributionBase: d("100000"), current: empty, itemizes: true }))
    .toThrow(/2026.*separate.*method/i);
});
