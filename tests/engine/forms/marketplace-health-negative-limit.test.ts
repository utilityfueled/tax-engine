// Spec: spec/federal/marketplace-health-negative-limit.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import { calculateMarketplaceNonspecifiedStop } from "@/engine/forms/marketplace-nonspecified-stop.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";
import { d } from "@/utils/decimal.js";

function groups(amount = "20000", advances = "3600"): MarketplaceHealthPremiumGroup[] {
  return [
    { businessSourceId: "scheduleC", accountHolder: "primary", specifiedPremiums: d(6000), remainingEarnedIncome: d(10000), nonspecifiedDeduction: d(0),
      months: [{ month: 1, specifiedPremium: d(6000), sourcePremium: d(6000), advancePremiumTaxCredit: d(advances) }] },
    { businessSourceId: "scheduleF", accountHolder: "primary", specifiedPremiums: d(0), remainingEarnedIncome: d(10000), nonspecifiedDeduction: d(amount), months: [] },
  ];
}
const base = { taxYear: 2025, filingStatus: "single" as const, householdIncomeAfterW: d(40000), federalPovertyLine: d(15060) };
it("retains negative W15 in W and X without manufacturing another stop", () => {
  const actual = groups(), before = JSON.stringify(actual);
  expect(calculateMarketplaceNonspecifiedStop(actual)).toBe(false);
  const result = calculateMarketplaceHealthLimit({ ...base, groups: actual });
  const value = (form: string, line: string) => result.lines.find(row => row.form === form && row.line === line)?.value.toFixed();
  expect(["13", "14", "15", "16", "17", "19"].map(line => value("Pub974 Worksheet W", line))).toEqual(["10000", "20000", "-10000", "-10000", "10000", "0"]);
  expect(["25", "26", "28", "29", "30", "31"].map(line => value("Pub974 Worksheet X", line))).toEqual(["975", "-9025", "-9025", "-10000", "-10000", "10000"]);
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("-10000");
  expect(result.maximumHealthDeduction.toFixed()).toBe("10000");
  expect(JSON.stringify(actual)).toBe(before);
});
it("keeps signed cents through zero-advance and ordered worksheet stages", () => {
  const noAdvance = calculateMarketplaceHealthLimit({ ...base, groups: groups("10000.01", "0") });
  expect(noAdvance.preliminarySpecifiedDeduction.toFixed()).toBe("-0.01");
  expect(noAdvance.maximumHealthDeduction.toFixed()).toBe("10000");
  expect(noAdvance.worksheetXCompleted).toBe(false);
  const ordered = calculateMarketplaceHealthLimit({ ...base, groups: groups("10000.01"), orderedDeductions: [{ kind: "ira", amount: d(1000) }, { kind: "studentLoan", amount: d(1500) }] });
  for (const form of ["Pub974 Worksheet Y", "Pub974 Worksheet Z 1"]) {
    expect(ordered.lines.find(row => row.form === form && row.line === "20")?.value.toFixed()).toBe("-0.01");
    expect(ordered.lines.find(row => row.form === form && row.line === "22")?.value.toFixed()).toBe("10000");
  }
});
it("rejects conflicting owners and preserves the completed nonspecified stop", () => {
  const conflicting = groups(); conflicting[1].accountHolder = "spouse";
  expect(() => calculateMarketplaceHealthLimit({ ...base, filingStatus: "married_filing_jointly", groups: conflicting })).toThrow(/owner/i);
  const stopped = groups(); stopped[0].remainingEarnedIncome = d(0); stopped[0].nonspecifiedDeduction = d(1000);
  expect(calculateMarketplaceNonspecifiedStop(stopped)).toBe(true);
});
