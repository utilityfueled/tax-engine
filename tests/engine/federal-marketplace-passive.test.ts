// Spec: spec/federal/marketplace-passive-ordering.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";

function actual(year = 2025) {
  const input = marketplaceHealthInput();
  if (!input.form7206 || !input.form8962 || !input.form7206.persons?.[0]) throw new Error("Missing synthetic actual health sources");
  input.taxpayer.taxYear = year;
  input.form7206.sourceTaxYear = year;
  input.form7206.persons[0].attainedAgeAtYearEnd = year - 1990;
  for (const policy of input.form1095A) {
    policy.taxYear = year;
    for (const month of policy.monthlyPremiums) month.slcsp = "500";
  }
  for (const month of input.form8962.monthlyReconciliation ?? []) month.slcsp = "500";
  for (const plan of input.form7206.plans ?? []) for (const payment of plan.payments ?? []) {
    payment.coverageTaxYear = year;
    if (!payment.datePaid) throw new Error("Missing synthetic actual payment date");
    payment.datePaid = payment.datePaid.replace("2026-", `${year}-`);
  }
  return input;
}
const rental = (description: string, rents: string, otherExpenses: string) => ({
  description, rents, otherExpenses, propertyType: "single_family" as const,
  rentalDays: 365, personalUseDays: 0, isActiveParticipant: true,
});
it("retains the actual rental allowance from the preceding health step", () => {
  const input = actual(); input.rentalProperties = [rental("Actual loss rental", "0", "10000")];
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("47656");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("10000");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "2")?.value.toFixed()).toBe("10000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("913");
  expect(result.schedule1?.supplementalIncome.toFixed()).toBe("-10000");
  expect(result.agi.toFixed()).toBe("35554");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("4777");
});
it("retains positive rental income and subtracts the allowed pool once", () => {
  const input = actual(); input.rentalProperties = [rental("Actual profit rental", "10000", "0"), rental("Actual loss rental", "0", "40000")];
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("46224");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("35000");
  expect(result.form8582?.suspendedLoss.toFixed()).toBe("5000");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet X" && row.line === "14")?.value.toFixed()).toBe("54067");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "2")?.value.toFixed()).toBe("35000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("0");
  expect(result.schedule1?.supplementalIncome.toFixed()).toBe("-25000");
  expect(result.agi.toFixed()).toBe("21467");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("6000");
});
it("computes the IRA only after the retained rental allowance", () => {
  const input = actual(); input.rentalProperties = [rental("Actual loss rental", "0", "10000")];
  input.iraDeductionWorksheet = { primaryContributions: "7000", primaryIsActiveParticipant: true,
    primaryCompensation: "46467", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("47656");
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("35554");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("7000");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Z 1" && row.line === "2")?.value.toFixed()).toBe("7000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("288");
  expect(result.agi.toFixed()).toBe("29179");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5498");
});
it("applies the uncapped source sequence without changing actual final eligibility", () => {
  const input = actual(2026); input.rentalProperties = [rental("Actual loss rental", "0", "10000")];
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("46487");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("10000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1922");
  expect(result.agi.toFixed()).toBe("34545");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3464");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("136");
  expect(result.form8962?.orderedDeductionInterim).not.toBe(true);
  expect(result.allLines.some(row => /^Pub974 Worksheet [XYZ]/.test(row.form))).toBe(false);
});
it("uses the no-advance method without a repayment worksheet", () => {
  const input = actual(); input.rentalProperties = [rental("Actual loss rental", "0", "10000")];
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.advancePremiumTaxCredit = "0";
  for (const month of input.form8962?.monthlyReconciliation ?? []) month.advancePremiumTaxCredit = "0";
  for (const plan of input.form7206?.plans ?? []) for (const payment of plan.payments ?? []) {
    payment.advancePremiumTaxCredit = "0"; payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) { person.advancePremiumTaxCredit = "0"; person.amountPaid = "500"; }
  }
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("48090");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("10000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("634");
  expect(result.agi.toFixed()).toBe("35833");
  expect(result.form8962?.netPTC.toFixed()).toBe("4753");
  expect(result.allLines.some(row => /^Pub974 Worksheet [XYZ]/.test(row.form))).toBe(false);
});
it("releases the actual prior rental pool through the ordered allowance", () => {
  const input = actual(); input.rentalProperties = [rental("Actual continuing rental", "6000", "0")];
  input.priorYear = { ...input.priorYear, suspendedPassiveLosses: [{ partnershipName: "Actual continuing rental", amount: "30000" }] };
  const result = calculateFederalTax(input);
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("46837");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("30000");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "2")?.value.toFixed()).toBe("30000");
  expect(result.schedule1?.supplementalIncome.toFixed()).toBe("-24000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("0");
  expect(result.agi.toFixed()).toBe("22467");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("6000");
  expect(result.carryforwards.suspendedPassiveLosses).toEqual([]);
});
it("refigures the phaseout allowance with ordinary health after final ineligibility", () => {
  const input = actual(2026);
  if (!input.scheduleC) throw new Error("Missing actual business source");
  input.scheduleC.grossReceipts = "110000";
  input.rentalProperties = [rental("Actual loss rental", "0", "30000")];
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.slcsp = "1200";
  for (const month of input.form8962?.monthlyReconciliation ?? []) month.slcsp = "1200";
  const result = calculateFederalTax(input);
  expect(result.allLines.find(row => row.form === "Pub974 Ordered Deductions" && row.line === "passive")?.value.toFixed()).toBe("20592");
  expect(result.marketplaceHealthInsurance?.method).toBe("ordinary-no-ptc-2026");
  expect(result.form8582?.modifiedAgi.toFixed()).toBe("104000");
  expect(result.form8582?.allowedLoss.toFixed()).toBe("23000");
  expect(result.form8582?.suspendedLoss.toFixed()).toBe("7000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("6000");
  expect(result.agi.toFixed()).toBe("73228");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("3600");
});
it("requires the separate K1 method instead of inferring rental participation", () => {
  const input = TaxYearInputSchema.parse({ ...actual(), rentalProperties: [rental("Actual loss rental", "0", "10000")],
    scheduleK1: [{ partnershipName: "Actual partnership", partnershipEIN: "12-3456789", ordinaryIncome: "1000", isPassiveActivity: true,
      accountHolder: "primary", selfEmploymentFactsConfirmed: true, selfEmploymentEarnings: "0", selfEmploymentNetEarningsAfterAdjustments: "0", selfEmploymentIncomeType: "nonfarm" }] });
  expect(() => calculateFederalTax(input)).toThrow(/K1 participation.*disposition.*business-loss/);
});
