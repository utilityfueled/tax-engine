// Spec: spec/federal/marketplace-health-separate-business.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";
import { d } from "@/utils/decimal.js";

function specified(remaining = "4000", nonspecified = "0"): MarketplaceHealthPremiumGroup {
  return { businessSourceId: "scheduleC", accountHolder: "primary", specifiedPremiums: d(6000), remainingEarnedIncome: d(remaining), nonspecifiedDeduction: d(nonspecified),
    months: [{ month: 1, specifiedPremium: d(6000), sourcePremium: d(6000), advancePremiumTaxCredit: d(3600) }] };
}
function separate(amount = "2000", remaining = "100000"): MarketplaceHealthPremiumGroup {
  return { businessSourceId: "scheduleF", accountHolder: "primary", specifiedPremiums: d(0), remainingEarnedIncome: d(remaining), nonspecifiedDeduction: d(amount), months: [] };
}
const base = { taxYear: 2025, filingStatus: "single" as const, householdIncomeAfterW: d(40000), federalPovertyLine: d(15060) };
it("subtracts the other business deduction without borrowing its earnings", () => {
  const groups = [specified(),separate()];
  const before = JSON.stringify(groups);
  const result = calculateMarketplaceHealthLimit({ ...base, groups });
  const value = (form: string, line: string) => result.lines.find(row => row.form === form && row.line === line)?.value.toFixed();
  expect(["13","14","15","16","17"].map(line => value("Pub974 Worksheet W",line))).toEqual(["4000","2000","2000","2000","4000"]);
  expect(["5","25","29","30","31"].map(line => value("Pub974 Worksheet X",line))).toEqual(["2000","975","2000","2000","4000"]);
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("2000");
  expect(result.maximumHealthDeduction.toFixed()).toBe("4000");
  expect(result.remainingEarnedIncome.toFixed()).toBe("2000");
  expect(result.lines.find(row => row.form === "Pub974 Separate Business Sources" && row.line === "outside-nonspecified")?.value.toFixed()).toBe("2000");
  const reversed = calculateMarketplaceHealthLimit({ ...base, groups: [separate("2000","1"),specified()] });
  expect(reversed.maximumHealthDeduction.eq(result.maximumHealthDeduction)).toBe(true);
  expect(JSON.stringify(groups)).toBe(before);
});
it("retains the separate deduction through ordered repayment tests and exact cents", () => {
  const result = calculateMarketplaceHealthLimit({ ...base, householdIncomeAfterW: d(46500), groups: [specified("9500","500"),separate("2000.01")],
    orderedDeductions: [{kind:"ira",amount:d(500)},{kind:"studentLoan",amount:d(1500)}] });
  const value = (form: string, line: string) => result.lines.find(row => row.form === form && row.line === line)?.value.toFixed();
  expect(value("Pub974 Worksheet W","13")).toBe("10000");
  expect(value("Pub974 Worksheet W","14")).toBe("2500.01");
  expect(value("Pub974 Worksheet W","15")).toBe("7499.99");
  expect(value("Pub974 Worksheet X","25")).toBe("1625");
  expect(value("Pub974 Worksheet Y","14")).toBe("975");
  expect(value("Pub974 Worksheet Z 1","14")).toBe("975");
  expect(result.maximumHealthDeduction.toFixed()).toBe("5875.01");
  const noAdvances = specified("9500","500");
  noAdvances.months[0].advancePremiumTaxCredit=d(0);
  const zero = calculateMarketplaceHealthLimit({ ...base, groups:[noAdvances,separate("2000.01")] });
  expect(zero.requiresWorksheetX).toBe(false);
  expect(zero.maximumHealthDeduction.toFixed()).toBe("8500.01");
});
it("rejects contradictory source groups and unrepresented owner or negative-limit combinations", () => {
  expect(() => calculateMarketplaceHealthLimit({ ...base, groups:[specified(),{...separate(),specifiedPremiums:d(1)}] })).toThrow(/specified.*month|month.*specified/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, groups:[specified(),{...separate("4000.01"),accountHolder:"spouse"}] })).toThrow(/negative.*owner|owner.*negative/i);
  const spouse = { ...specified(),businessSourceId:"scheduleK1:0",accountHolder:"spouse" as const };
  expect(() => calculateMarketplaceHealthLimit({ ...base, filingStatus:"married_filing_jointly",groups:[specified(),spouse,separate()] })).toThrow(/separate.*owner|owner.*separate/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, groups:[specified(),separate(),separate()] })).toThrow(/duplicate/i);
  const exactZero = calculateMarketplaceHealthLimit({ ...base, groups:[specified(),separate("4000")] });
  expect(exactZero.preliminarySpecifiedDeduction.toFixed()).toBe("0");
  expect(exactZero.maximumHealthDeduction.toFixed()).toBe("4000");
});
