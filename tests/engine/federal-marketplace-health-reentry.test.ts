// Spec: spec/federal/marketplace-health-reentry.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";
import { actualNolInput } from "../fixtures/net-operating-loss.js";

function renewedEligibility() {
  const input = marketplaceHealthInput();
  const { scheduleC, form7206, form8962 } = input;
  if (!scheduleC || !form7206?.plans?.[0]?.payments || !form8962) throw new Error("Missing actual source fixture");
  scheduleC.grossReceipts = "106000";
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) {
    month.enrolleePremium = "1000"; month.slcsp = "1000"; month.advancePremiumTaxCredit = "500";
  }
  form8962.monthlyReconciliation = input.form1095A[0].monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false }));
  for (const payment of form7206.plans[0].payments) {
    payment.grossPremium = "1000"; payment.advancePremiumTaxCredit = "500"; payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) { person.amountPaid = "500"; person.advancePremiumTaxCredit = "500"; }
  }
  form8962.taxFamilySize = 2;
  input.taxpayer.dependents = [{ firstName: "Actual", lastName: "Dependent", ssn: "999-88-7777", relationship: "child",
    dateOfBirth: "2000-05-15", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false }];
  input.iraDeductionWorksheet = { primaryContributions: "7500", primaryIsActiveParticipant: true, primaryCompensation: "98511",
    primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  return input;
}
it("uses the alternative actual calculation when ordinary refiguring restores eligibility", () => {
  const result = calculateFederalTax(renewedEligibility());
  // Alternative initial:98511-12000-3370=83141; round(*.0996)=8281,
  // initialPTC=3719. Final health8281 ->IRA MAGI90230 ->IRA580 ->89650.
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-alternative-reentry-2026");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("3719");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("8281");
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("90230");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("580");
  expect(result.agi.toFixed()).toBe("89650");
  expect(result.form8962?.modifiedAGI.toFixed()).toBe("89650");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("6000");
  expect(result.form8962?.orderedDeductionInterim).not.toBe(true);
  expect(result.allLines.find(row => row.form === "Pub974 Alternative Reentry" && row.line === "initial-household-income")?.value.toFixed()).toBe("83141");
  expect(result.allLines.filter(row => row.form === "Sched 1" && row.line === "17")).toHaveLength(1);
  expect(result.allLines.filter(row => row.form === "Form 8962" && row.line === "24")).toHaveLength(1);
});
it("reconciles final income without mutating or retaining interim source amounts", () => {
  const input = renewedEligibility();
  if (!input.form8962) throw new Error("Missing actual household source");
  input.form8962.taxpayerModifiedAGI = "89650";
  const before = JSON.stringify(input);
  expect(calculateFederalTax(input).agi.toFixed()).toBe("89650");
  expect(JSON.stringify(input)).toBe(before);
  input.form8962.taxpayerModifiedAGI = "83141";
  expect(() => calculateFederalTax(input)).toThrow(/supplied taxpayer modified income.*canonical/i);
  input.form8962.taxpayerModifiedAGI = undefined;
  input.form1095A[0].monthlyPremiums[0].enrolleePremium = "1000.01";
  expect(() => calculateFederalTax(input)).toThrow(/premium|source|reconcil/i);
});
it("keeps only final actual NOL carry after renewed eligibility", () => {
  const input = renewedEligibility();
  if (!input.scheduleC || !input.iraDeductionWorksheet) throw new Error("Missing actual business and IRA sources");
  input.scheduleC.grossReceipts = "107076";
  input.iraDeductionWorksheet.primaryCompensation = "99511";
  input.netOperatingLoss = actualNolInput("0").netOperatingLoss;
  const sources = input.netOperatingLoss, vintage = sources?.vintages?.[0];
  if (!sources || !vintage) throw new Error("Missing actual loss history");
  sources.sourceTaxYear = 2026;
  vintage.adjustedThroughTaxYear = 2025;
  vintage.originalLoss = "1000"; vintage.openingCarryforward = "1000";
  const before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-alternative-reentry-2026");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("8281");
  expect(result.agi.toFixed()).toBe("89650");
  expect(result.netOperatingLoss?.deduction.toFixed()).toBe("1000");
  expect(result.netOperatingLoss?.absorbed.toFixed()).toBe("1000");
  expect(result.netOperatingLoss?.finalIncome.agi.eq(result.agi)).toBe(true);
  expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe("0");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("0");
  expect(result.allLines.filter(row => row.form === "Section172 Canonical Income" && row.line === "actual-limit")).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
});
