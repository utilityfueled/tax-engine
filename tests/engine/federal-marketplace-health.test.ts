// Spec: spec/federal/marketplace-health-deduction.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";
import { TaxYearInputSchema } from "@/models/inputs.js";

it("runs the actual2026 Simplified method and transfers the final deduction once", () => {
  const input = marketplaceHealthInput();
  const result = calculateFederalTax(input);
  //50000 profit gives7065 SE tax/3533 adjustment. Step1 MAGI40467;
  //258% of15650 gives.0868,3513 contribution and4887 preliminary PTC.
  //Step3:6000-4887=1113. Final45354,289%,.0963,4368,4032 PTC.
  expect(result.scheduleSE.totalSETax.toFixed()).toBe("7065");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1113");
  expect(result.agi.toFixed()).toBe("45354");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("4032");
  expect(result.form8962?.netPTC.toFixed()).toBe("432");
  expect(result.form7206?.deduction?.toFixed()).toBe("0"); // Nonspecified only.
  expect(result.allLines.filter(line => line.form === "Form 8962" && line.line === "24").map(line => line.value.toFixed())).toEqual(["4032"]);
  expect(result.allLines.find(line => line.form === "QBI Source Deductions" && line.line === "scheduleC")?.inputs?.["SE health insurance"]?.toString()).toBe("1113");
  const attribution = result.allLines.find(line => line.form === "Pub974 QBI Allocation" && line.line === "scheduleC");
  expect(attribution?.value.toFixed()).toBe("1113");
  expect(attribution?.inputs).not.toHaveProperty("Gross income numerator");
  expect(attribution?.inputs).not.toHaveProperty("Gross income denominator");
  expect(input.form8962?.selfEmployedHealthInsuranceCoordinationRequired).toBe(true);
  expect(input.form7206?.plans?.[0]?.payments?.[0]?.ownerOrBusinessPaid).toBe("200");
});
it("reconciles final MAGI and preserves actual coverage contradictions", () => {
  const input = marketplaceHealthInput();
  if (!input.form8962) throw new Error("Missing actual test facts");
  input.form8962.taxpayerModifiedAGI = "45354";
  expect(calculateFederalTax(input).agi.toFixed()).toBe("45354");
  input.form8962.taxpayerModifiedAGI = "40467";
  expect(() => calculateFederalTax(input)).toThrow(/reconcile.*MAGI|MAGI.*reconcile/i);
  input.form8962.taxpayerModifiedAGI = undefined;
  input.form8962.selfEmployedHealthInsuranceCoordinationRequired = false;
  expect(() => calculateFederalTax(input)).toThrow(/coordination|coverage/i);
});
it("keeps ineligible months and separate ordered worksheets explicit", () => {
  const input = marketplaceHealthInput();
  const months = input.form7206?.plans?.[0]?.months;
  if (!months || !input.scheduleC) throw new Error("Missing actual test facts");
  for (const month of months) {
    month.employerSubsidizedPlanEligible = true;
    month.employerOfferPtcException = "unaffordable";
    month.employerCoverageEnrolled = false;
    month.employerOfferSourceReference = "Actual2026 employer affordability worksheet";
  }
  const result = calculateFederalTax(input);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("0");
  const special = marketplaceHealthInput(); special.savingsBondRedemptions = [{ proceeds: "1000", interest: "100", qualifiedExpenses: "1000" }];
  expect(() => calculateFederalTax(special)).toThrow(/Form 8815.*actual registered owner source/i);
  const prior = marketplaceHealthInput(); prior.taxpayer.taxYear = 2025;
  expect(() => calculateFederalTax(prior)).toThrow(/year/i); // A2026 source cannot become2025 by changing only the return.
});
it("rejects a no-credit plan declaration that would double benefit actual Marketplace premiums", () => {
  const input = marketplaceHealthInput();
  const plan = input.form7206?.plans?.[0];
  if (!plan || !input.form8962) throw new Error("Missing source");
  plan.premiumTaxCreditInvolved = false;
  input.form8962.selfEmployedHealthInsuranceCoordinationRequired = false;
  for (const payment of plan.payments ?? []) {
    payment.ownerOrBusinessPaid = "500"; payment.advancePremiumTaxCredit = "0";
    for (const person of payment.personAmounts ?? []) { person.amountPaid = "500"; person.advancePremiumTaxCredit = "0"; }
  }
  expect(() => calculateFederalTax(input)).toThrow(/Marketplace.*coordination|contradict.*credit/i);
});
it("retains zero advances and full repayment above the2026 income cliff", () => {
  const zero = marketplaceHealthInput();
  for (const policy of zero.form1095A) for (const month of policy.monthlyPremiums) month.advancePremiumTaxCredit = "0";
  for (const month of zero.form8962?.monthlyReconciliation ?? []) month.advancePremiumTaxCredit = "0";
  for (const payment of zero.form7206?.plans?.[0]?.payments ?? []) {
    payment.advancePremiumTaxCredit = "0"; payment.ownerOrBusinessPaid = "500";
    for (const person of payment.personAmounts ?? []) { person.advancePremiumTaxCredit = "0"; person.amountPaid = "500"; }
  }
  const zeroResult = calculateFederalTax(zero);
  expect(zeroResult.schedule1?.seHealthInsurance.toFixed()).toBe("1113");
  expect(zeroResult.form8962?.netPTC.toFixed()).toBe("4032");
  const high = marketplaceHealthInput(); if (!high.scheduleC) throw new Error("Missing source");
  high.scheduleC.grossReceipts = "100000";
  const highResult = calculateFederalTax(high);
  expect(highResult.schedule1?.seHealthInsurance.toFixed()).toBe("6000");
  expect(highResult.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(highResult.form8962?.excessAPTCRepayment.toFixed()).toBe("3600");
  expect(highResult.form7206?.deduction?.toFixed()).toBe("6000");
  expect(highResult.form7206?.businesses[0]?.medicalPremiums.toFixed()).toBe("6000");
});
it("coordinates differing business limits and attributes QBI using actual gross income", () => {
  const base = marketplaceHealthInput();
  const plan = base.form7206?.plans?.[0];
  if (!plan || !base.form7206) throw new Error("Missing source");
  const input = TaxYearInputSchema.parse({ ...base,
    scheduleC: { accountHolder: "primary", businessName: "Actual proprietor", grossReceipts: "10000", qbiMateriallyParticipated: true, expenses: { supplies: "9500" } },
    scheduleF: { accountHolder: "primary", principalCropOrActivity: "Actual farm", qbiMateriallyParticipated: true, salesOfProductsRaised: "90000", expenses: { supplies: "40500" } },
    form1095A: [0,1].map(index => ({ ...base.form1095A[0], policyNumber: `ACTUAL-POLICY-${index}`, monthlyPremiums: base.form1095A[0].monthlyPremiums.filter(row => index === 0 ? row.month <= 6 : row.month > 6) })),
    form7206: { ...base.form7206, plans: [0,1].map(index => ({ ...plan, planId: `actual-${index}`, businessSourceId: index === 0 ? "scheduleC" : "scheduleF",
      marketplacePolicySourceIds: [`form1095A:${index}`], months: plan.months?.filter(row => index === 0 ? (row.month ?? 0) <= 6 : (row.month ?? 0) > 6),
      payments: plan.payments?.filter(row => index === 0 ? (row.coverageMonth ?? 0) <= 6 : (row.coverageMonth ?? 0) > 6),
    })) },
    qbiDeductionAllocations: { sourceFactsConfirmed: true, rows: [
      { sourceId: "scheduleC", accountHolder: "primary", deductibleSelfEmploymentTax: "353.3", selfEmployedHealthInsurance: "112", selfEmployedRetirementPlans: "0" },
      { sourceId: "scheduleF", accountHolder: "primary", deductibleSelfEmploymentTax: "3179.7", selfEmployedHealthInsurance: "1004", selfEmployedRetirementPlans: "0" },
    ] },
  });
  const result = calculateFederalTax(input);
  //50000 combined profit:SE7065,half3533. Partial policy sources require monthly
  //293 contribution,407 PTC per month;6000-4884=1116. Gross10k/90k allocates112/1004.
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("4884");
  expect(result.marketplaceHealthInsurance?.maximumDeduction.toFixed()).toBe("6000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("1116");
  expect(result.agi.toFixed()).toBe("45351");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("4032");
  const shares = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC","scheduleF"].includes(row.line));
  expect(shares.map(row => row.inputs["SE health insurance"].toString())).toEqual(["112","1004"]);
  const cap = result.marketplaceHealthInsurance?.businesses.find(row => row.businessSourceId === "scheduleC")?.remainingEarnedIncome;
  expect(cap?.toFixed()).toBe("464.67");
});
it("preserves source cents while reconciling full-credit printed dollars", () => {
  const input = marketplaceHealthInput();
  if (!input.scheduleC) throw new Error("Missing source");
  input.scheduleC.grossReceipts = "25000";
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.enrolleePremium = "499.99";
  for (const month of input.form8962?.monthlyReconciliation ?? []) month.enrolleePremium = "499.99";
  for (const payment of input.form7206?.plans?.[0]?.payments ?? []) {
    payment.grossPremium = "499.99"; payment.ownerOrBusinessPaid = "199.99";
    for (const person of payment.personAmounts ?? []) person.amountPaid = "199.99";
  }
  const result = calculateFederalTax(input);
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("6000");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("0");
  expect(result.form7206?.grossSourcePremiums.toFixed()).toBe("5999.88");
  expect(input.form1095A[0]?.monthlyPremiums[0]?.enrolleePremium).toBe("499.99");
});
