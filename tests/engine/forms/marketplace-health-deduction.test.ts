// Spec: spec/federal/marketplace-health-deduction.yaml.
import { expect, it } from "vitest";
import { calculateMarketplaceHealthDeduction } from "@/engine/forms/marketplace-health-deduction.js";
import { calculateForm8962 } from "@/engine/forms/form-8962.js";
import { marketplaceHealthInput } from "../../fixtures/marketplace-health.js";
import { d } from "@/utils/decimal.js";

it("allocates actual monthly credit and retains each business income limit", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing source");
  const credit = calculateForm8962({ taxYear: 2026, filingStatus: "single", form1095A: input.form1095A,
    facts: { ...input.form8962, taxpayerModifiedAGI: "40467", selfEmployedHealthInsuranceCoordinationRequired: false } });
  const groups = [{ businessSourceId: "scheduleC", accountHolder: "primary" as const, specifiedPremiums: d(3000), remainingEarnedIncome: d(400), nonspecifiedDeduction: d(100),
    months: Array.from({ length: 6 }, (_, index) => ({ month: index + 1, specifiedPremium: d(500), sourcePremium: d(500), advancePremiumTaxCredit: d(300) })) }];
  const result = calculateMarketplaceHealthDeduction({ input, groups, credit });
  expect(result.businesses[0]?.allocatedCredit.toFixed()).toBe("2443.5");
  expect(result.specifiedDeduction.toFixed()).toBe("400");
  expect(result.nonspecifiedDeduction.toFixed()).toBe("100");
});
it("uses actual unequal monthly credits for partial-year specified premiums", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing source");
  input.form1095A[0].monthlyPremiums = [
    { month: 1, enrolleePremium: "600", slcsp: "700", advancePremiumTaxCredit: "200" },
    { month: 2, enrolleePremium: "600", slcsp: "500", advancePremiumTaxCredit: "200" },
  ];
  input.form8962.monthlyReconciliation = input.form1095A[0].monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false }));
  const credit = calculateForm8962({ taxYear: 2026, filingStatus: "single", form1095A: input.form1095A,
    facts: { ...input.form8962, taxpayerModifiedAGI: "40000", selfEmployedHealthInsuranceCoordinationRequired: false } });
  //255%, .0859,3436annual contribution,286monthly: January414,February214.
  expect(credit.ptcAllowed.toFixed()).toBe("628");
  const result = calculateMarketplaceHealthDeduction({ input, credit, groups: [{ businessSourceId: "scheduleC", accountHolder: "primary", specifiedPremiums: d(600), remainingEarnedIncome: d(1000), nonspecifiedDeduction: d(0),
    months: [{ month: 2, specifiedPremium: d(600), sourcePremium: d(600), advancePremiumTaxCredit: d(200) }] }] });
  expect(result.businesses[0]?.allocatedCredit.toFixed()).toBe("214");
  expect(result.specifiedDeduction.toFixed()).toBe("386");
});
it("requires the retained credit to reconcile its actual annual or monthly audit", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing source");
  const credit = calculateForm8962({ taxYear: 2026, filingStatus: "single", form1095A: input.form1095A,
    facts: { ...input.form8962, taxpayerModifiedAGI: "40467", selfEmployedHealthInsuranceCoordinationRequired: false } });
  const groups = [{ businessSourceId: "scheduleC", accountHolder: "primary" as const, specifiedPremiums: d(6000), remainingEarnedIncome: d(10000), nonspecifiedDeduction: d(0),
    months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, specifiedPremium: d(500), sourcePremium: d(500), advancePremiumTaxCredit: d(300) })) }];
  expect(() => calculateMarketplaceHealthDeduction({ input, groups, credit: { ...credit, lines: [] } })).toThrow(/audit|reconcile/i);
  expect(() => calculateMarketplaceHealthDeduction({ input, groups, credit: { ...credit, calculationMethod: "monthly" } })).toThrow(/audit|reconcile/i);
});
it("applies the combined limit once across actual businesses", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing source");
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.enrolleePremium = "1000";
  for (const month of input.form8962.monthlyReconciliation ?? []) month.enrolleePremium = "1000";
  const credit = calculateForm8962({ taxYear: 2026, filingStatus: "single", form1095A: input.form1095A,
    facts: { ...input.form8962, taxpayerModifiedAGI: "40467", selfEmployedHealthInsuranceCoordinationRequired: false } });
  expect(credit.ptcAllowed.toFixed()).toBe("4887");
  const groups = ["scheduleC", "scheduleF"].map((businessSourceId,index) => ({ businessSourceId, accountHolder: "primary" as const,
    specifiedPremiums: d(6000), remainingEarnedIncome: d(index === 0 ? 1000 : 7000), nonspecifiedDeduction: d(0),
    months: Array.from({ length: 12 }, (_,index) => ({ month: index + 1, specifiedPremium: d(500), sourcePremium: d(500), advancePremiumTaxCredit: d(150) })) }));
  const result = calculateMarketplaceHealthDeduction({ input, groups, credit });
  //Separate line7:3556.5 each; combined7113 is below the single8000 cap.
  expect(result.specifiedDeduction.toFixed()).toBe("7113");
  groups[1].remainingEarnedIncome = d(2000);
  expect(calculateMarketplaceHealthDeduction({ input, groups, credit }).specifiedDeduction.toFixed()).toBe("3000");
});
