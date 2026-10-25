// Spec: spec/federal/marketplace-health-reentry.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceHealthReentry } from "@/engine/forms/marketplace-health-reentry.js";
import { calculateMarketplaceHealthDeduction } from "@/engine/forms/marketplace-health-deduction.js";
import { calculateForm8962 } from "@/engine/forms/form-8962.js";
import { marketplaceHealthInput } from "../../fixtures/marketplace-health.js";
import { d } from "@/utils/decimal.js";

it("requires a verified actual maximum and credit before alternative re-entry", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing actual source");
  const facts = input.form8962;
  const actualCredit = (income: string) => calculateForm8962({ taxYear: 2026, filingStatus: "single", form1095A: input.form1095A,
    facts: { ...facts, taxpayerModifiedAGI: income, selfEmployedHealthInsuranceCoordinationRequired: false } });
  const groups = [{ businessSourceId: "scheduleC", accountHolder: "primary" as const, specifiedPremiums: d(6000), remainingEarnedIncome: d(10000), nonspecifiedDeduction: d(0),
    months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, specifiedPremium: d(500), sourcePremium: d(500), advancePremiumTaxCredit: d(300) })) }];
  const credit = actualCredit("40467"), ineligible = actualCredit("100000");
  const ordinaryDeduction = calculateMarketplaceHealthDeduction({ input, groups, credit: ineligible });
  const before = JSON.stringify({ input, groups, credit, ordinaryDeduction });
  const result = calculateMarketplaceHealthReentry({ input, groups, credit, ordinaryDeduction });
  expect(result.specifiedDeduction.toFixed()).toBe("1113");
  expect(result.maximumSpecifiedDeduction.toFixed()).toBe("6000");
  expect(result.method).toBe("pub974-alternative-reentry-2026");
  expect(JSON.stringify({ input, groups, credit, ordinaryDeduction })).toBe(before);
  expect(() => calculateMarketplaceHealthReentry({ input, groups, credit: { ...credit, orderedDeductionInterim: true }, ordinaryDeduction })).toThrow(/interim/);
  expect(() => calculateMarketplaceHealthReentry({ input, groups, credit: ineligible, ordinaryDeduction })).toThrow(/renewed eligibility/);
  expect(() => calculateMarketplaceHealthReentry({ input, groups, credit: { ...credit, lines: [] }, ordinaryDeduction })).toThrow(/audit/);
  expect(() => calculateMarketplaceHealthReentry({ input, groups, credit, ordinaryDeduction: { ...ordinaryDeduction, specifiedDeduction: d(5999) } })).toThrow(/verified combined maximum/);
  expect(() => calculateMarketplaceHealthReentry({ input: { ...input, taxpayer: { ...input.taxpayer, taxYear: 2025 } }, groups, credit, ordinaryDeduction })).toThrow(/actual2026/);
  // Actual distinct business caps can make ordinary health less than the
  // combined maximum; do not label that initial amount alternative step1.
  const split = ["scheduleC", "scheduleF"].map((businessSourceId, index) => ({ ...groups[0], businessSourceId,
    specifiedPremiums: d(3000), remainingEarnedIncome: d(index === 0 ? 1000 : 7000),
    months: groups[0].months.map(month => ({ ...month, specifiedPremium: d(250), sourcePremium: d(250), advancePremiumTaxCredit: d(150) })) }));
  const splitOrdinary = calculateMarketplaceHealthDeduction({ input, groups: split, credit: ineligible });
  expect(splitOrdinary.specifiedDeduction.toFixed()).toBe("4000");
  expect(() => calculateMarketplaceHealthReentry({ input, groups: split, credit, ordinaryDeduction: splitOrdinary })).toThrow(/differing business limits/);
});
