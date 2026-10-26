// Spec: spec/federal/marketplace-health-owners.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";
import { TaxYearInputSchema } from "@/models/inputs.js";

it("coordinates actual two-owner2025 policies and preserves their separate QBI deductions", () => {
  const input = twoOwnerMarketplaceHealthInput();
  const before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  // Separate SE:3435+803=4238/2119 and2290+536=2826/1413.
  // Step1=50000-3532-9000=37468;
  //183% of20440,rate.0132=>495 contribution,7905PTC. Premium ratio2:1
  //gives5270/2635 credit and730/365 deduction, not joint gross-income60:40.
  //Final45373,221%,rate.0284=>1289 contribution and7111PTC.
  expect(result.scheduleSE.perTaxpayer.map(row => [row.accountHolder, row.deductibleHalf.toFixed()])).toEqual([["primary", "2119"], ["spouse", "1413"]]);
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("7905");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("9000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1095");
  expect(result.agi.toFixed()).toBe("45373");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("7111");
  const rows = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC", "scheduleF"].includes(row.line));
  expect(rows.map(row => [row.line, row.inputs.Owner, row.inputs["SE health insurance"].toString()])).toEqual([["scheduleC", "primary", "730"], ["scheduleF", "spouse", "365"]]);
  // The existing monthly credit allocation retains Decimal division precision;
  // these independently derived owner amounts agree at the monetary boundary.
  expect(result.allLines.filter(row => row.form === "Pub974 Owner Allocation" && row.line.endsWith(":deduction")).map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([["primary:deduction", "730"], ["spouse:deduction", "365"]]);
  expect(result.allLines.filter(row => row.form === "Form 8962" && row.line === "24")).toHaveLength(1);
  expect(JSON.stringify(input)).toBe(before);
});
it("keeps binding2025 owner income with advances and capped joint repayments as explicit methods", () => {
  const poorOwner = twoOwnerMarketplaceHealthInput(2025, "full");
  if (!poorOwner.scheduleC) throw new Error("Missing synthetic business");
  poorOwner.scheduleC.grossReceipts = "5000";
  expect(() => calculateFederalTax(poorOwner)).toThrow(/owner.*earned.income/i);
  expect(() => calculateFederalTax(twoOwnerMarketplaceHealthInput(2025, "full"))).toThrow(/repayment.cap|binding.*cap/i);
  const wrong = twoOwnerMarketplaceHealthInput();
  if (!wrong.form7206?.plans?.[1]) throw new Error("Missing synthetic plan");
  wrong.form7206.plans[1].accountHolder = "primary";
  expect(() => calculateFederalTax(wrong)).toThrow(/actual.*owner|plan.*owner|relationship/i);
});
it("keeps same-owner business gross-income allocation separate from spouse premiums", () => {
  const input = twoOwnerMarketplaceHealthInput();
  const farmPlan = input.form7206?.plans?.[1];
  if (!input.scheduleF || !farmPlan || !input.form7206?.plans || !input.form8962?.monthlyReconciliation) throw new Error("Missing synthetic sources");
  input.scheduleF.accountHolder = "primary";
  farmPlan.accountHolder = "primary";
  farmPlan.coveredPersons?.forEach(row => { row.personId = "primary"; });
  farmPlan.payments?.forEach(payment => payment.personAmounts?.forEach(person => { person.personId = "primary"; }));
  const spousePlan = structuredClone(farmPlan);
  Object.assign(spousePlan, { planId: "spouse-shareholder-plan", policyReference: "Actual spouse shareholder policy", accountHolder: "spouse", businessSourceId: "formW2:0", businessKind: "s_corporation", marketplacePolicySourceIds: ["form1095A:2"], premiumsIncludedInOwnerIncome: true, moreThanTwoPercentShareholder: true });
  spousePlan.coveredPersons?.forEach(person => { person.personId = "spouse"; });
  spousePlan.payments?.forEach(payment => { payment.sourceId = `shareholder-${payment.sourceId}`; payment.personAmounts?.forEach(person => { person.personId = "spouse"; person.payer = "business_paid_or_reimbursed"; }); });
  input.form7206.plans.push(spousePlan);
  input.form1095A.push({ ...structuredClone(input.form1095A[1]), policyNumber: "ACTUAL-SHAREHOLDER-POLICY" });
  input.form8962.monthlyReconciliation.forEach(month => { month.enrolleePremium = "1000"; month.slcsp = "1050"; });
  input.w2s = TaxYearInputSchema.parse({ ...input, w2s: [{ taxYear: 2025, employer: { name: "Actual spouse corporation", ein: "12-3456789" }, accountHolder: "spouse", wages: "20000", federalWithheld: "0", socialSecurityWages: "17000", socialSecurityTips: "0", socialSecurityWithheld: "1054", medicareWages: "17000", medicareWithheld: "246.5", box10DependentCareBenefits: "0" }] }).w2s;
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  // SE on combined50000 =7065/3533; Step1=70000-3533-12000=54467.
  //266%/.0464 =>2527, Step2=10073; net1927: owner shares1445.25/481.75.
  //The primary's30k/20k gross ratio yields867.15/578.10 before reporting.
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("10073");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1927");
  const owner = result.allLines.find(row => row.form === "Pub974 Owner Allocation" && row.line === "primary:deduction");
  expect(owner?.value.toDecimalPlaces(2).toFixed()).toBe("1445.25");
  const allocations = result.allLines.filter(row => row.form === "Pub974 QBI Allocation" && ["scheduleC", "scheduleF"].includes(row.line));
  expect(allocations.map(row => [row.line, row.value.toDecimalPlaces(2).toFixed(), row.inputs["Gross income denominator"].toString()])).toEqual([["scheduleC", "867.15", "50000"], ["scheduleF", "578.1", "50000"]]);
});
it("keeps the actual2026 full-return qualification gate closed", () => {
  expect(() => calculateFederalTax(twoOwnerMarketplaceHealthInput(2026))).toThrow(/2026.*incomplete|2026.*not.*ready|2026.*unavailable|2026.*not.*qualified/i);
});
