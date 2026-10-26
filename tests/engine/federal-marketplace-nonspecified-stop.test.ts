// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceNonspecifiedStopInput } from "../fixtures/marketplace-nonspecified-stop.js";

it("stops before W when every actual specified business has exhausted its own income", () => {
  const input = marketplaceNonspecifiedStopInput(), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7647");
  expect(result.agi.toFixed()).toBe("40586");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("4068");
  expect(result.form8962?.netPTC.toFixed()).toBe("468");
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-nonspecified-stop-2025");
  expect(result.marketplaceHealthInsurance?.specifiedDeduction.toFixed()).toBe("0");
  expect(result.marketplaceHealthInsurance?.nonspecifiedDeduction.toFixed()).toBe("7646.6");
  expect(result.marketplaceHealthInsurance?.historicalLimit).toBeUndefined();
  expect(result.allLines.some(row => /^Pub974 Worksheet [WXYZ]|^Pub974 Ordered Deductions/.test(row.form))).toBe(false);
  expect(result.allLines.filter(row => row.form === "QBI Source Deductions").map(row => [row.line, row.inputs["SE health insurance"]?.toString()])).toEqual([["scheduleC", "4647"], ["scheduleF", "3000"]]);
  const reversed = structuredClone(input);
  reversed.form7206?.plans?.reverse();
  const repeated = calculateFederalTax(reversed);
  expect(repeated.schedule1?.seHealthInsurance.toFixed()).toBe(result.schedule1?.seHealthInsurance.toFixed());
  expect(repeated.form8962?.ptcAllowed.toFixed()).toBe(result.form8962?.ptcAllowed.toFixed());
  expect(JSON.stringify(input)).toBe(before);
});

it("keeps the actual spouse deduction and income limit separate at the stop", () => {
  const input = marketplaceNonspecifiedStopInput(true), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7646");
  expect(result.agi.toFixed()).toBe("40587");
  expect(result.form7206?.businesses.map(row => [row.businessSourceId, row.accountHolder, row.deduction?.toFixed()])).toEqual([["scheduleC", "primary", "4646"], ["scheduleF", "spouse", "3000"]]);
  expect(result.allLines.filter(row => row.form === "QBI Source Deductions").map(row => [row.line, row.inputs["SE health insurance"]?.toString()])).toEqual([["scheduleC", "4646"], ["scheduleF", "3000"]]);
  expect(result.marketplaceHealthInsurance?.specifiedDeduction.toFixed()).toBe("0");
  expect(JSON.stringify(input)).toBe(before);
});

it("does not turn one cent of remaining capacity into a stopping election", () => {
  const input = marketplaceNonspecifiedStopInput();
  const plan = input.form7206?.plans?.find(row => row.planId === "proprietor-nonspecified");
  if (!plan?.payments?.length) throw new Error("Missing actual source");
  for (const [index, payment] of plan.payments.entries()) {
    const amount = index === 11 ? "387.28" : "387.21"; // Actual total4646.59; income4646.60.
    payment.grossPremium = amount;
    payment.ownerOrBusinessPaid = amount;
    for (const person of payment.personAmounts ?? []) person.amountPaid = amount;
  }
  expect(() => calculateFederalTax(input)).toThrow(/negative WorksheetW15.*stop-worksheet/);
  const last = plan.payments[11];
  last.grossPremium = "387.29"; last.ownerOrBusinessPaid = "387.29";
  for (const person of last.personAmounts ?? []) person.amountPaid = "387.29";
  expect(calculateFederalTax(input).schedule1?.seHealthInsurance.toFixed()).toBe("7647");
  plan.establishedUnderBusiness = undefined;
  expect(() => calculateFederalTax(input)).toThrow(/actual|complete|confirm|business/i);
});

it("refigures the actual loan without retaining special ordered worksheets after the stop", () => {
  const original = marketplaceNonspecifiedStopInput();
  const input = TaxYearInputSchema.parse({ ...original, studentLoanInterestFacts: {
    sourceTaxYear: 2025, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
    puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans: [{
      sourceId: "stop-loan", borrowerId: "primary", accountHolder: "primary", lender: "Actual lender", sourceKind: "lender_statement",
      loanOriginationDate: "2010-08-01", interestPaid: "1500", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
      legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self",
      expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0",
      qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [],
    }],
  } });
  const result = calculateFederalTax(input);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7647");
  expect(result.schedule1?.studentLoanInterest.toFixed()).toBe("1500");
  expect(result.agi.toFixed()).toBe("39086");
  expect(result.allLines.find(row => row.form === "Student Loan MAGI Worksheet" && row.line === "magi")?.value.toFixed()).toBe("40586");
  expect(result.allLines.some(row => /^Pub974 Worksheet [WXYZ]|^Pub974 Ordered Deductions/.test(row.form))).toBe(false);
  expect(result.form8962?.orderedDeductionInterim).not.toBe(true);
});
