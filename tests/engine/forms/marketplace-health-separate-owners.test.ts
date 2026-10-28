// Spec: spec/federal/marketplace-health-separate-owners.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import type { MarketplaceHealthPremiumGroup } from "@/engine/forms/marketplace-health-premiums.js";
import { d } from "@/utils/decimal.js";

function sources(): MarketplaceHealthPremiumGroup[] {
  return [
    { businessSourceId: "formW2:0", accountHolder: "primary", specifiedPremiums: d(6000), remainingEarnedIncome: d(40000), nonspecifiedDeduction: d(0),
      creditAllocationMethod: "monthly_eligible_plan_enrollment", months: [{ month: 1, specifiedPremium: d(6000), sourcePremium: d(6000), creditAllocationPremium: d(6000), advancePremiumTaxCredit: d(0) }] },
    { businessSourceId: "formW2:1", accountHolder: "spouse", specifiedPremiums: d(3000), remainingEarnedIncome: d(40000), nonspecifiedDeduction: d(0),
      creditAllocationMethod: "monthly_eligible_plan_enrollment", months: [{ month: 1, specifiedPremium: d(3000), sourcePremium: d(3000), creditAllocationPremium: d(3000), advancePremiumTaxCredit: d(0) }] },
    { businessSourceId: "formW2:2", accountHolder: "primary", specifiedPremiums: d(0), remainingEarnedIncome: d(7600), nonspecifiedDeduction: d(2400), months: [] },
  ];
}
const calculate = (groups: MarketplaceHealthPremiumGroup[]) => calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: "married_filing_jointly", groups });

it("conserves separate claims once without transferring business or spouse capacity", () => {
  const groups = sources();
  const before = JSON.stringify(groups);
  const result = calculate(groups);
  expect(["13", "14", "15", "16", "17"].map(line => result.lines.find(row => row.form === "Pub974 Worksheet W" && row.line === line)?.value.toFixed())).toEqual(["80000", "2400", "77600", "9000", "11400"]);
  expect(result.maximumHealthDeduction.toFixed()).toBe("11400");
  expect(result.requiresWorksheetX).toBe(false);
  expect(JSON.stringify(groups)).toBe(before);
  const opposite = sources();
  opposite[2].accountHolder = "spouse";
  opposite[2].remainingEarnedIncome = d(1);
  expect(calculate(opposite.reverse()).maximumHealthDeduction.toFixed()).toBe("11400");
});

it("rejects one-cent business owner and combined shortfalls and positive original advances", () => {
  const business = sources();
  business[0].remainingEarnedIncome = d("5999.99");
  business.push({ ...business[0], businessSourceId: "formW2:3", remainingEarnedIncome: d(100000) });
  expect(() => calculate(business)).toThrow(/separate.*business|business.*separate/i);
  const owner = sources();
  owner[0].remainingEarnedIncome = d("8399.99");
  expect(() => calculate(owner)).toThrow(/separate.*owner|owner.*separate/i);
  const combined = sources();
  combined[0].remainingEarnedIncome = d(6000);
  combined[1].remainingEarnedIncome = d("5399.99");
  expect(() => calculate(combined)).toThrow(/separate|combined/i);
  const advance = sources();
  advance[0].months[0].advancePremiumTaxCredit = d(".01");
  advance[0].months[0].specifiedAdvancePremiumTaxCredit = d(0);
  expect(() => calculate(advance)).toThrow(/separate.*advance|advance.*separate/i);
  const negative = sources();
  negative[2].remainingEarnedIncome = d("-.01");
  expect(() => calculate(negative)).toThrow(/separate.*negative|negative.*separate/i);
});

it("preserves exact equality source order and explicit zero separately from unknown", () => {
  const precision = Decimal.precision;
  const groups = sources();
  groups[0].remainingEarnedIncome = d("8400.00000000000000000000000000000000000000001");
  groups[2].nonspecifiedDeduction = d("2400.00000000000000000000000000000000000000001");
  expect(calculate(groups).preliminarySpecifiedDeduction.toFixed()).toBe("9000");
  expect(calculate([...groups].reverse()).remainingEarnedIncome.toFixed()).toBe("46000");
  const unknown = sources();
  unknown[0].creditAllocationMethod = undefined;
  expect(() => calculate(unknown)).toThrow(/separate.*method|method.*separate/i);
  const zero = sources();
  zero[2].nonspecifiedDeduction = d(0);
  expect(calculate(zero).maximumHealthDeduction.toFixed()).toBe("9000");
  expect(Decimal.precision).toBe(precision);
});
