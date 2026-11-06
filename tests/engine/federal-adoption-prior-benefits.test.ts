// Spec: spec/federal/form-8839-prior-benefits-return.yaml.
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { foreignAdoptionHistoryChild } from "../fixtures/form-8839-prior-benefits.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

function actual(wages = "100000", current = "2000") {
  const child = foreignAdoptionHistoryChild();
  child.employerBenefits = current;
  const payroll = d(wages).plus(current);
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, firstName: "Jordan", lastName: "Example" } },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2025, accountHolder: "primary", wages,
      socialSecurityWages: payroll.toFixed(), socialSecurityWithheld: payroll.times(".062").toFixed(),
      medicareWages: payroll.toFixed(), medicareWithheld: payroll.times(".0145").toFixed(), box12CodeT: current }],
    form8839: { eligibilityConfirmed: true, children: [child], exclusionMagi: payroll.toFixed(),
      foreignEarnedIncomeExclusion: "0", foreignHousingExclusion: "0", possessionIncomeExclusion: "0", carryforwards: [] },
  });
}
function adoption(input: ReturnType<typeof actual>) {
  if (!input.form8839) throw new Error("Missing actual adoption fixture");
  return input.form8839;
}
describe("Historical adoption canonical source transfer", () => {
  it("transfers prior-only current and mixed benefits once with actual identity", () => {
    for (const [current, expectedAgi, expected31, expected1f] of [
      ["0", "92000", "0", "-8000"], ["2000", "92000", "0", "-8000"], ["20000", "102720", "2720", "2720"],
    ]) {
      const input = actual("100000", current);
      const result = calculateFederalTax(input);
      expect(result.agi.toFixed()).toBe(expectedAgi);
      expect(result.form8839?.taxableEmployerBenefits.toFixed()).toBe(expected31);
      expect(result.form8839?.adoptionIncomeAdjustment.toFixed()).toBe(expected1f);
      expect(result.form8839?.magi.toFixed()).toBe(expectedAgi);
      const line = result.allLines.filter(row => row.form === "1040" && row.line === "1f");
      expect(line).toHaveLength(1); expect(line[0].value.toFixed()).toBe(expected1f);
      expect(adoption(input).children[0].priorYearForeignBenefits).toBe("8000");
    }
    const currentOnly = actual();
    adoption(currentOnly).children[0].priorYearForeignBenefits = "0";
    adoption(currentOnly).children[0].priorYearForeignBenefitHistory = undefined;
    expect(calculateFederalTax(currentOnly).agi.toFixed()).toBe("100000");
  });
  it("retains the physical exclusion addback and final actual credit MAGI", () => {
    const input = actual("22000"); input.formSSA1099 = [{ netBenefits: "20000", federalWithheld: "0", benefitsReceived: "20000", benefitsRepaid: "0" }];
    adoption(input).exclusionMagi = "28500";
    const result = calculateFederalTax(input);
    // Other14000 + half benefits10000 + physical exclusion10000 =34000.
    // Taxable benefits4500; actual AGI18500. Full exclusion, not signed-8000, is added back.
    expect(result.form8839?.allowableExclusion.toFixed()).toBe("10000");
    expect(result.socialSecurityBenefitsWorksheet?.lines.find(row => row.form === "Pub915 WS1" && row.line === "5")?.value.toFixed()).toBe("10000");
    expect(result.socialSecurityBenefitsTaxable.toFixed()).toBe("4500");
    expect(result.agi.toFixed()).toBe("18500");
    expect(result.form8839?.magi.toFixed()).toBe("18500");
  });
  it("keeps historical benefits in final Pub974 and Form8962 income", () => {
    const input = marketplaceHealthInput(), child = foreignAdoptionHistoryChild(); child.employerBenefits = "0";
    const { form7206, form8962 } = input;
    if (!form7206?.persons?.length || !form7206.plans?.[0].payments || !form8962) throw new Error("Missing actual health fixture");
    input.taxpayer.taxYear = 2025; input.taxpayer.primary.firstName = "Jordan"; input.taxpayer.primary.lastName = "Example";
    form7206.sourceTaxYear = 2025; form7206.persons[0].name = "Jordan Example"; form7206.persons[0].attainedAgeAtYearEnd = 35;
    for (const policy of input.form1095A) {
      policy.taxYear = 2025;
      for (const month of policy.monthlyPremiums) { month.slcsp = "500"; month.advancePremiumTaxCredit = "0"; }
    }
    form8962.monthlyReconciliation = input.form1095A[0].monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false }));
    for (const payment of form7206.plans[0].payments) {
      payment.coverageTaxYear = 2025; payment.datePaid = payment.datePaid?.replace("2026-", "2025-");
      payment.ownerOrBusinessPaid = "500"; payment.advancePremiumTaxCredit = "0";
      for (const person of payment.personAmounts ?? []) { person.amountPaid = "500"; person.advancePremiumTaxCredit = "0"; }
    }
    input.form8839 = adoption(actual("0", "0")); input.form8839.children = [child]; input.form8839.exclusionMagi = "45623";
    form8962.taxpayerModifiedAGI = "37623";
    const result = calculateFederalTax(input);
    // SE7065/half3533; source income50000-3533-8000=38467.
    // Max-health6000 gives32467,215%FPL15060; 2.60% contribution844.
    // Step3health844; finalAGI37623,249%FPL,3.96% contribution1490 -> PTC4510.
    expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("844");
    expect(result.agi.toFixed()).toBe("37623");
    expect(result.form8962?.ptcAllowed.toFixed()).toBe("4510");
    expect(result.form8839?.adoptionIncomeAdjustment.toFixed()).toBe("-8000");
    expect(result.form8839?.magi.toFixed()).toBe("37623");
    expect(result.allLines.filter(row => row.form === "1040" && row.line === "1f")).toHaveLength(1);
    expect(input.form8839.children[0].priorYearForeignBenefits).toBe("8000");
  });
  it("rejects unknown or contradictory original source and current payroll facts", () => {
    const wrongOwner = actual(); wrongOwner.taxpayer.primary.ssn = "234-56-7890";
    expect(() => calculateFederalTax(wrongOwner)).toThrow(/recipient identity/);
    const wrongCurrent = actual(); wrongCurrent.w2s[0].box12CodeT = "2001";
    expect(() => calculateFederalTax(wrongCurrent)).toThrow(/W-2 adoption benefits/);
    const missingHistory = actual("100000", "0"); adoption(missingHistory).children[0].priorYearForeignBenefitHistory = undefined;
    expect(() => calculateFederalTax(missingHistory)).toThrow(/historical exclusion worksheet/);
  });
});
