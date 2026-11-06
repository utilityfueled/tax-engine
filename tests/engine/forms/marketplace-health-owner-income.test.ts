// Spec: spec/federal/marketplace-health-owner-income.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceOwnerDeductions } from "@/engine/forms/marketplace-health-owners.js";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";
import { d } from "@/utils/decimal.js";

function sources(advance = "0", income = "929"): MarketplaceHealthPremiumGroup[] {
  return [["scheduleC", "primary", "6000", income], ["scheduleF", "spouse", "3000", "46467"]].map(([id, owner, premium, earned]) => ({
    businessSourceId: id, accountHolder: owner as "primary" | "spouse", specifiedPremiums: d(premium), remainingEarnedIncome: d(earned), nonspecifiedDeduction: d(0),
    months: [{ month: 1, specifiedPremium: d(premium), sourcePremium: d(premium), advancePremiumTaxCredit: d(advance) }],
  }));
}
it("limits each owner independently before and after the actual credit", () => {
  const groups = sources();
  for (const year of [2025,2026]) {
    const result = calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: "married_filing_jointly", groups, stage: { kind: "maximum" }, specifiedDeduction: d("3929") });
    expect(result.owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["929", "3000"]);
    const completed = groups.map((row,index) => ({ businessSourceId: row.businessSourceId, accountHolder: row.accountHolder,
      allocatedCredit: d(index === 0 ? "4000" : "2000"), netPremiumsAfterCredit: d(index === 0 ? "2000" : "1000") }));
    const final = calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: "married_filing_jointly", groups,
      stage: { kind: "final", businesses: completed }, specifiedDeduction: d("1929") });
    expect(final.owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["929", "1000"]);
  }
  const w = calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: "married_filing_jointly", groups, stage: "w" });
  expect(w.preliminarySpecifiedDeduction.toFixed()).toBe("3929");
  expect(w.maximumSpecifiedDeduction.toFixed()).toBe("3929");
  expect(w.remainingEarnedIncome.toFixed()).toBe("47396");
});
it("keeps owner losses and historical advances separate without changing source cents", () => {
  const groups = sources("0", "-10.01"), before = groups[0].remainingEarnedIncome.toFixed();
  const result = calculateMarketplaceOwnerDeductions({ taxYear: 2026, filingStatus: "married_filing_jointly", groups, stage: { kind: "maximum" }, specifiedDeduction: d("3000") });
  expect(result.owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["0", "3000"]);
  expect(groups[0].remainingEarnedIncome.toFixed()).toBe(before);
  const cents = sources("0", "929.0100000000001");
  const exact = calculateMarketplaceOwnerDeductions({ taxYear: 2025, filingStatus: "married_filing_jointly", groups: cents.reverse(), stage: { kind: "worksheet-w" }, specifiedDeduction: d("3929.0100000000001") });
  expect(exact.owners.map(row => row.specifiedDeduction.toFixed())).toEqual(["929.0100000000001", "3000"]);
  expect(() => calculateMarketplaceOwnerDeductions({ taxYear: 2025, filingStatus: "married_filing_jointly", groups: sources("1"), stage: { kind: "maximum" }, specifiedDeduction: d("3929") })).toThrow(/earned.income|repayment|historical/i);
  expect(() => calculateMarketplaceOwnerDeductions({ taxYear: 2026, filingStatus: "married_filing_jointly", groups: sources(), stage: { kind: "maximum" }, specifiedDeduction: d("9000") })).toThrow(/reconcile|combined|deduction/i);
});
