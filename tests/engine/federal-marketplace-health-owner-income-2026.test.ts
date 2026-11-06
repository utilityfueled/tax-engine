// Spec: spec/federal/marketplace-health-owner-income.yaml. Isolated constants, not qualification.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";

it("refigures binding and nonbinding final owner deductions with actual2026 advances", () => {
  for (const advances of ["none", "full"] as const) for (const [profit, maximum, deduction, agi, credit, primaryQbi, spouseQbi] of [
    ["1000", "3929", "2111", "45285", "5176", "929", "1182"],
    ["5000", "7646", "3547", "47566", "4842", "2365", "1182"],
  ]) {
    const input = twoOwnerMarketplaceHealthInput(2026, advances);
    if (!input.scheduleC || !input.scheduleF) throw new Error("Missing actual synthetic businesses");
    input.scheduleC.grossReceipts = profit; input.scheduleF.salesOfProductsRaised = "50000";
    const before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe(maximum);
    expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("5453");
    expect(result.schedule1?.seHealthInsurance.toFixed()).toBe(deduction);
    expect(result.agi.toFixed()).toBe(agi);
    expect(result.form8962?.ptcAllowed.toFixed()).toBe(credit);
    expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe(advances === "none" ? "0" : profit === "1000" ? "3824" : "4158");
    const qbi = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC", "scheduleF"].includes(row.line));
    expect(qbi.map(row => row.inputs["SE health insurance"].toString())).toEqual([primaryQbi, spouseQbi]);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it("keeps ordinary no-credit deductions on the actual limited owners", () => {
  const input = twoOwnerMarketplaceHealthInput(2026, "full");
  if (!input.scheduleC || !input.scheduleF) throw new Error("Missing actual synthetic businesses");
  input.scheduleC.grossReceipts = "1000"; input.scheduleF.salesOfProductsRaised = "100000";
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("ordinary-no-ptc-2026");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("3929");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("3929");
  expect(result.agi.toFixed()).toBe("89935");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("9000");
  expect(result.form7206?.businesses.map(row => [row.accountHolder, row.deduction?.toFixed()])).toEqual([["primary", "929"], ["spouse", "3000"]]);
});
it("retains owner limits through renewed eligibility and the final actual refigure", () => {
  const input = twoOwnerMarketplaceHealthInput(2026, "full");
  const spousePlan = input.form7206?.plans?.[1];
  if (!input.scheduleC || !input.scheduleF || !input.form8962 || !spousePlan?.payments) throw new Error("Missing actual synthetic sources");
  input.scheduleC.grossReceipts = "1000"; input.scheduleF.salesOfProductsRaised = "157096";
  input.form8962.taxFamilySize = 4;
  input.taxpayer.dependents = ["One", "Two"].map((firstName, index) => ({ firstName, lastName: "Dependent", ssn: index === 0 ? "999-88-7777" : "999-88-6666",
    relationship: "child", dateOfBirth: "2000-05-15", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false }));
  for (const [index, policy] of input.form1095A.entries()) for (const month of policy.monthlyPremiums) {
    month.enrolleePremium = index === 0 ? "500" : "1000"; month.slcsp = "750"; month.advancePremiumTaxCredit = month.enrolleePremium;
  }
  for (const month of input.form8962.monthlyReconciliation ?? []) { month.enrolleePremium = "1500"; month.slcsp = "1500"; month.advancePremiumTaxCredit = "1500"; }
  for (const payment of spousePlan.payments) {
    payment.grossPremium = "1000"; payment.advancePremiumTaxCredit = "1000";
    for (const person of payment.personAmounts ?? []) person.advancePremiumTaxCredit = "1000";
  }
  input.iraDeductionWorksheet = { primaryContributions: "0", primaryIsActiveParticipant: false, primaryCompensation: "929",
    spouseContributions: "7500", spouseIsActiveParticipant: true, spouseCompensation: "145997",
    primarySection501c18Contributions: "0", primaryRothContributions: "0", spouseSection501c18Contributions: "0", spouseRothContributions: "0", sourceFactsConfirmed: true };
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-alternative-reentry-2026");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("12929");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("5215");
  expect(result.allLines.find(row => row.form === "Pub974 Alternative Reentry" && row.line === "initial-household-income")?.value.toFixed()).toBe("128367");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("9452");
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("137474");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("4330");
  expect(result.agi.toFixed()).toBe("133144");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("18000");
  const qbi = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC", "scheduleF"].includes(row.line));
  expect(qbi.map(row => row.inputs["SE health insurance"].toString())).toEqual(["929", "8523"]);
  expect(result.allLines.filter(row => row.form === "Form 8962" && row.line === "24")).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
});
