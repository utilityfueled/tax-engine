// Spec: spec/federal/marketplace-health-limit.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";

function actual2025() {
  const input = marketplaceHealthInput();
  input.taxpayer.taxYear = 2025;
  if (!input.form7206 || !input.form7206.persons) throw new Error("Missing source fixture");
  input.form7206.sourceTaxYear = 2025;
  input.form7206.persons[0].attainedAgeAtYearEnd = 35;
  for (const policy of input.form1095A) { policy.taxYear = 2025; for (const month of policy.monthlyPremiums) month.slcsp = "500"; }
  for (const month of input.form8962?.monthlyReconciliation ?? []) month.slcsp = "500";
  for (const payment of input.form7206.plans?.[0]?.payments ?? []) { payment.coverageTaxYear = 2025; payment.datePaid = payment.datePaid?.replace("2026-","2025-"); }
  return input;
}
it("uses W and X before the final2025 deduction and credit", () => {
  const input = actual2025();
  const result = calculateFederalTax(input);
  // Profit50000-SE deduction3533=46467. W16=6000-3600=2400;
  // X14=44067; after975 ->43092/15060=286%, so X25=975 and X30=3375.
  // Step2:43092 at286%*.0544=2344 contribution; PTC3656. Deduction2344.
  // Final44123 at292%*.0568=2506 contribution; PTC3494,repayment106.
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("3375");
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("3656");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("2344");
  expect(result.agi.toFixed()).toBe("44123");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3494");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("106");
  expect(result.form8962?.repaymentCap?.toFixed()).toBe("975");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet X" && row.line === "25")?.value.toFixed()).toBe("975");
  expect(input.form8962?.selfEmployedHealthInsuranceCoordinationRequired).toBe(true);
});
it("retains X25 when final income enters another Table5 band", () => {
  const input = actual2025();
  if (!input.scheduleC) throw new Error("Missing source");
  input.scheduleC.grossReceipts = "52000";
  const result = calculateFederalTax(input);
  //48326 before health; W16=2400, X14=45926. X21=floor(44951/15060*100)=298.
  //X25=975. Step2 MAGI44951*.0592=2661, so Step3deduction2661.
  //Final45665 is303% and ordinary Table5 would say1625; actualX still975.
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("2661");
  expect(result.agi.toFixed()).toBe("45665");
  expect(result.form8962?.fplPercentageForTable.toFixed()).toBe("303");
  expect(result.form8962?.repaymentCap?.toFixed()).toBe("975");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("376");
  expect(result.form8962?.lines.find(row => row.line === "28")?.formula).toMatch(/Pub974/);
});
it("skips X for zero advances and handles ordinary no-credit premiums", () => {
  const input = actual2025();
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.advancePremiumTaxCredit = "0";
  for (const month of input.form8962?.monthlyReconciliation ?? []) month.advancePremiumTaxCredit = "0";
  for (const payment of input.form7206?.plans?.[0]?.payments ?? []) {
    payment.advancePremiumTaxCredit = "0"; payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) { person.advancePremiumTaxCredit = "0"; person.amountPaid = "500"; }
  }
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("6000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1910");
  expect(result.form8962?.netPTC.toFixed()).toBe("3416");
  expect(result.allLines.some(row => row.form === "Pub974 Worksheet X")).toBe(false);
  if (!input.scheduleC) throw new Error("Missing source");
  input.scheduleC.grossReceipts = "5000";
  const ordinary = calculateFederalTax(input);
  // ScheduleSE4a rounds4617.50 to4618; lines10/11 round573+134=707.
  // Half707 rounds354, leaving an actual health earned-income limit4646.
  expect(ordinary.schedule1?.seHealthInsurance.toFixed()).toBe("4646");
  expect(ordinary.form7206?.deductionToSchedule1.toFixed()).toBe("4646");
  expect(ordinary.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(ordinary.agi.toFixed()).toBe("0");
});
