// Spec: spec/federal/marketplace-health-limit.yaml. IRS Pub974 Carla example.
import { expect, it } from "vitest";
import { d } from "@/utils/decimal.js";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";

function group(premium = "13000", advance = "4200", remaining = "25381"): MarketplaceHealthPremiumGroup {
  return { businessSourceId: "scheduleC", accountHolder: "primary", specifiedPremiums: d(premium), remainingEarnedIncome: d(remaining), nonspecifiedDeduction: d(0),
    months: [{ month: 1, specifiedPremium: d(premium), sourcePremium: d(premium), advancePremiumTaxCredit: d(advance) }] };
}
it("reproduces Carla's published W and X maximum", () => {
  const result = calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: "married_filing_jointly", groups: [group()], householdIncomeAfterW: d(100675), federalPovertyLine: d(31200) });
  expect(result.preliminarySpecifiedDeduction.toFixed()).toBe("8800");
  expect(result.repaymentLimit?.toFixed()).toBe("3250");
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("12050");
  expect(result.maximumHealthDeduction.toFixed()).toBe("12050");
  const x = (line: string) => result.lines.find(row => row.form === "Pub974 Worksheet X" && row.line === line)?.value.toFixed();
  expect([x("14"),x("18"),x("21"),x("24"),x("25"),x("30")]).toEqual(["100675","320","316","312","3250","12050"]);
});
it("tests repayment thresholds after the actual remaining-income reduction", () => {
  const calculate = (income: string, remaining = "10000") => calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: "single", groups: [group("6000","3600",remaining)], householdIncomeAfterW: d(income), federalPovertyLine: d(15060) });
  // Exact200% after375 deduction proceeds to the975 tier; one cent below does not.
  expect(calculate("30494.99").repaymentLimit?.toFixed()).toBe("375");
  expect(calculate("30495").repaymentLimit?.toFixed()).toBe("975");
  // Only100 remaining after W16: use100 rather than the nominal375 in each test.
  expect(calculate("30220", "2500").repaymentLimit?.toFixed()).toBe("975");
  expect(calculate("100000").repaymentLimit?.toFixed()).toBe("3600");
  expect(calculate("0").repaymentLimit?.toFixed()).toBe("375");
});
it("retains signed combined limits and skips X for actual zero advances", () => {
  const loss = { ...group("2000","0","-1000"), businessSourceId: "scheduleF" };
  const result = calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: "single", groups: [group("3000","0","4000"),loss] });
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("3000");
  expect(result.worksheetXCompleted).toBe(false);
  expect(result.repaymentLimit).toBeNull();
  expect(result.lines.some(row => row.form === "Pub974 Worksheet X")).toBe(false);
});
it("requires actual finite worksheet inputs and unique premium sources", () => {
  const base = { taxYear: 2025, filingStatus: "single" as const, groups: [group()], householdIncomeAfterW: d(50000), federalPovertyLine: d(15060) };
  expect(() => calculateMarketplaceHealthLimit({ ...base, householdIncomeAfterW: undefined })).toThrow(/actual.*income/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, federalPovertyLine: d(0) })).toThrow(/poverty/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, householdIncomeAfterW: d("NaN") })).toThrow(/finite/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, groups: [group(),group()] })).toThrow(/duplicate/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, groups: [group("1000","1001")] })).toThrow(/advance/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, taxYear: 2024 })).toThrow(/2025/i);
});
it("recomputes Y and Z in the published deduction order", () => {
  const base = { taxYear: 2025, filingStatus: "single" as const, groups: [group("6000","3600","10000")], householdIncomeAfterW: d(46500), federalPovertyLine: d(15060) };
  const result = calculateMarketplaceHealthLimit({ ...base, orderedDeductions: [
    { kind: "ira", amount: d(500) }, { kind: "studentLoan", amount: d(1500) },
  ] });
  // X: (46500-975)/15060 >=300%, so1625. Y: (46000-975) <300%, so975.
  // Z: (44500-375)/15060 >=200%, but (44500-975)<300%, so975.
  expect(result.repaymentLimit?.toFixed()).toBe("975");
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("3375");
  const value = (form: string, line: string) => result.lines.find(row => row.form === form && row.line === line)?.value.toFixed();
  expect(value("Pub974 Worksheet X","25")).toBe("1625");
  expect(value("Pub974 Worksheet Y","3")).toBe("46000");
  expect(value("Pub974 Worksheet Y","14")).toBe("975");
  expect(value("Pub974 Worksheet Z 1","3")).toBe("44500");
  expect(value("Pub974 Worksheet Z 1","14")).toBe("975");
  expect(() => calculateMarketplaceHealthLimit({ ...base, orderedDeductions: [
    { kind: "studentLoan", amount: d(1) }, { kind: "ira", amount: d(1) },
  ] })).toThrow(/order/i);
  expect(() => calculateMarketplaceHealthLimit({ ...base, orderedDeductions: [{ kind: "ira", amount: d(-1) }] })).toThrow(/nonnegative/i);
});
