// Spec: spec/federal/passive-income-ordering.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const input = (wages = "50000", rentalLoss = "40000") => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: "20000" }],
  rentalProperties: [{ description: "Actual rental", rents: "0", otherExpenses: rentalLoss, propertyType: "single_family",
    rentalDays: 365, personalUseDays: 0, isActiveParticipant: true }],
});
it("calculates taxable benefits from allowed rental losses rather than suspended losses", () => {
  const actual = input();
  actual.formSSA1099 = [{ recipient: "primary", netBenefits: "20000", federalWithheld: "0" }];
  const result = calculateFederalTax(actual);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("50000");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("25000");
  expect(result.form8582?.suspendedLoss.toFixed()).toBe("15000");
  expect(result.socialSecurityBenefitsTaxable.toFixed()).toBe("5350");
  expect(result.agi.toFixed()).toBe("30350");
  expect(result.schedule1?.supplementalIncome.toFixed()).toBe("-25000");
});
it("calculates actual IRA deduction after passive loss allowance", () => {
  const actual = input("90000", "20000");
  actual.iraDeductionWorksheet = { primaryContributions: "7000", primaryIsActiveParticipant: true,
    primaryCompensation: "90000", primaryRothContributions: "0", primarySection501c18Contributions: "0", sourceFactsConfirmed: true };
  const result = calculateFederalTax(actual);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("90000");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("20000");
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("70000");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("7000");
  expect(result.agi.toFixed()).toBe("63000");
});
it("calculates the bond exclusion from post-passive income and taxable benefits", () => {
  const actual = TaxYearInputSchema.parse({ ...input(),
    formSSA1099: [{ recipient: "primary", netBenefits: "20000", federalWithheld: "0" }],
    form1099Int: [{ payer: "Actual Treasury custodian", interestIncome: "0", usSavingsBondInterest: "4000" }],
    savingsBondRedemptions: [{ interest: "4000", qualifiedExpenses: "10000", proceeds: "10000" }],
  });
  const result = calculateFederalTax(actual);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("54000");
  expect(result.socialSecurityBenefitsTaxable.toFixed()).toBe("8750");
  expect(result.form8815?.modifiedAGI.toFixed()).toBe("37750");
  expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("4000");
  expect(result.agi.toFixed()).toBe("33750");
});
