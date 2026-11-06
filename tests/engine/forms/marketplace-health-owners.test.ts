// Spec: spec/federal/marketplace-health-owners.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceOwnerDeductions } from "@/engine/forms/marketplace-health-owners.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";
import { d, sum } from "@/utils/decimal.js";

function group(id: string, owner: "primary" | "spouse", premium: string, advance: string, income: string): MarketplaceHealthPremiumGroup {
  return { businessSourceId: id, accountHolder: owner, specifiedPremiums: d(premium), remainingEarnedIncome: d(income), nonspecifiedDeduction: d(0),
    months: [{ month: 1, specifiedPremium: d(premium), sourcePremium: d(premium), advancePremiumTaxCredit: d(advance) }] };
}
const groups = () => [group("scheduleC", "primary", "6000", "3600", "27880"), group("scheduleF", "spouse", "4000", "2400", "18587")];
function run(stage: Parameters<typeof calculateMarketplaceOwnerDeductions>[0]["stage"], amount: string, actual = groups()) {
  return calculateMarketplaceOwnerDeductions({ taxYear: 2025, filingStatus: "married_filing_jointly", groups: actual, stage, specifiedDeduction: d(amount) });
}
function completed(credit = ["4795.2", "3196.8"], actual = groups()) {
  return actual.map((row,index) => ({ businessSourceId: row.businessSourceId, accountHolder: row.accountHolder,
    allocatedCredit: d(credit[index]), netPremiumsAfterCredit: row.specifiedPremiums.minus(d(credit[index])) }));
}
it("attributes net premiums to actual owners before any QBI gross-income allocation", () => {
  const result = run({ kind: "final", businesses: completed() }, "2008");
  expect(result.owners.map(row => [row.accountHolder, row.specifiedDeduction.toFixed()])).toEqual([["primary", "1204.8"], ["spouse", "803.2"]]);
  expect(sum(...result.owners.map(row => row.specifiedDeduction)).toFixed()).toBe("2008");
  const reversed = run({ kind: "final", businesses: completed().reverse() }, "2008", groups().reverse());
  expect(reversed.owners.map(row => [row.accountHolder, row.specifiedDeduction.toFixed()])).toEqual([["primary", "1204.8"], ["spouse", "803.2"]]);
});
it("derives temporary W and maximum deductions from exact separate owner sources", () => {
  expect(run({ kind: "worksheet-w" }, "4000").owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["2400", "1600"]);
  expect(run({ kind: "maximum" }, "10000").owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["6000", "4000"]);
  const funded = groups().map(row => ({ ...row, months: row.months.map(month => ({ ...month, advancePremiumTaxCredit: month.sourcePremium })) }));
  expect(run({ kind: "worksheet-w" }, "0", funded).owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["0", "0"]);
});
it("rejects cross-owner income borrowing and unresolved combined cap attribution", () => {
  const low = groups(); low[0].remainingEarnedIncome = d("5999.99");
  expect(() => run({ kind: "maximum" }, "10000", low)).toThrow(/owner.*earned.income/i);
  expect(() => run({ kind: "maximum" }, "4750")).toThrow(/repayment.cap|binding.*cap/i);
  expect(() => run({ kind: "final", businesses: completed() }, "2007")).toThrow(/binding.*cap|combined.*deduction/i);
  expect(() => calculateMarketplaceOwnerDeductions({ taxYear: 2025, filingStatus: "single", groups: groups(), stage: { kind: "maximum" }, specifiedDeduction: d("10000") })).toThrow(/joint/i);
});
it("retains exact source cents and rejects stale or duplicated computed records", () => {
  const source = [group("scheduleC", "primary", "1000.0100000000001", "0", "2000"), group("scheduleF", "spouse", "999.99", "0", "2000")];
  const before = source.map(row => row.specifiedPremiums.toFixed());
  const result = run({ kind: "maximum" }, "2000.0000000000001", source);
  expect(result.owners.map(row => row.specifiedDeduction.toFixed())).toEqual(before);
  expect(source.map(row => row.specifiedPremiums.toFixed())).toEqual(before);
  const zero = completed(["6000", "4000"]);
  expect(run({ kind: "final", businesses: zero }, "0").owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["0", "0"]);
  const bad = completed(); bad[0].accountHolder = "spouse";
  expect(() => run({ kind: "final", businesses: bad }, "2008")).toThrow(/owner/i);
  expect(() => run({ kind: "final", businesses: [...completed(), completed()[0]] }, "2008")).toThrow(/duplicate|unique/i);
  const stale = completed(); stale[0].netPremiumsAfterCredit = stale[0].netPremiumsAfterCredit.plus(".01");
  expect(() => run({ kind: "final", businesses: stale }, "2008")).toThrow(/reconcile/i);
  const duplicate = groups(); duplicate[0].months.push(duplicate[0].months[0]);
  expect(() => run({ kind: "maximum" }, "10000", duplicate)).toThrow(/month|reconcile/i);
  const nonfinite = groups(); nonfinite[0].remainingEarnedIncome = d(Infinity);
  expect(() => run({ kind: "maximum" }, "10000", nonfinite)).toThrow(/finite/i);
});
