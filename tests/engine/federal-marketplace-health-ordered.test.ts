// Spec: spec/federal/marketplace-health-ordered.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { d } from "@/utils/decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";
function actual(year = 2025, profit = "50000", premium = "500", advance = "300") {
  const input = marketplaceHealthInput();
  const { scheduleC, form7206, form8962 } = input;
  const persons = form7206?.persons, payments = form7206?.plans?.[0]?.payments;
  if (!scheduleC || !form7206 || !form8962 || !persons?.length || !payments) throw new Error("Missing actual health source fixture");
  input.taxpayer.taxYear = year;
  scheduleC.grossReceipts = profit;
  form7206.sourceTaxYear = year;
  persons[0].attainedAgeAtYearEnd = year - 1990;
  for (const policy of input.form1095A) {
    policy.taxYear = year;
    for (const month of policy.monthlyPremiums) { month.enrolleePremium = premium; month.slcsp = premium; month.advancePremiumTaxCredit = advance; }
  }
  form8962.monthlyReconciliation = input.form1095A[0].monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false }));
  for (const payment of payments) {
    if (!payment.datePaid || !payment.personAmounts) throw new Error("Missing actual premium source fixture");
    payment.coverageTaxYear = year; payment.datePaid = payment.datePaid.replace("2026-",`${year}-`);
    payment.grossPremium = premium; payment.advancePremiumTaxCredit = advance;
    payment.ownerOrBusinessPaid = d(premium).minus(advance).toFixed();
    for (const person of payment.personAmounts) { person.amountPaid = payment.ownerOrBusinessPaid; person.advancePremiumTaxCredit = advance; }
  }
  return input;
}
function withLoan(input: ReturnType<typeof actual>, interest = "1500") {
  return TaxYearInputSchema.parse({ ...input, studentLoanInterestFacts: {
    sourceTaxYear: input.taxpayer.taxYear, sourceFactsConfirmed: true, primaryClaimedAsDependent: false,
    puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans: [{
      sourceId: "loan1", borrowerId: "borrower1", accountHolder: "primary", lender: "Synthetic lender", sourceKind: "lender_statement",
      loanOriginationDate: "2010-08-01", interestPaid: interest, additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
      legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
      enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self",
      expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
      employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0",
      qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [],
    }],
  } });
}
it("uses the prior Step3 health amount for the actual student loan worksheet", () => {
  const result = calculateFederalTax(withLoan(actual()));
  // Initial Step3 health2344; loanMAGI44123 gives1500. Y reduces original44067
  // to42567; Ycap975/max3375. Step2 41592*5.04%=2096; final42871*5.36%=2298.
  expect(result.schedule1?.studentLoanInterest.toFixed()).toBe("1500");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("2096");
  expect(result.agi.toFixed()).toBe("42871");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3702");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "2")?.value.toFixed()).toBe("1500");
  expect(result.allLines.filter(row => row.form === "Sched 1" && row.line === "21")).toHaveLength(1);
  expect(result.allLines.find(row => row.form === "Student Loan MAGI Worksheet" && row.line === "magi")?.value.toFixed()).toBe("44123");
  const noAdvances = calculateFederalTax(withLoan(actual(2025,"50000","500","0")));
  // No X/Y is needed: after1500loan, Step2income38967 at258%*.0432=1683.
  expect(noAdvances.schedule1?.seHealthInsurance.toFixed()).toBe("1683");
  expect(noAdvances.agi.toFixed()).toBe("43284");
  expect(noAdvances.form8962?.netPTC.toFixed()).toBe("3628");
  expect(noAdvances.allLines.some(row => /^Pub974 Worksheet [XYZ]/.test(row.form))).toBe(false);
});
it("retains the covered IRA worksheet while computing the following loan and final credit", () => {
  const input = withLoan(actual(2025,"94000","1000","500"));
  input.iraDeductionWorksheet = { primaryContributions: "7000", primaryIsActiveParticipant: true,
    primaryCompensation: "87359", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  const result = calculateFederalTax(input);
  //87359 before health. Initial health6406 -> IRA MAGI80953;
  //7000*(89000-80953)/10000 rounded up to next10 =5640.
  //Next health5926 -> loanMAGI75793, loan1500; final health5799, AGI74420.
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("80953");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("5640");
  expect(result.schedule1?.studentLoanInterest.toFixed()).toBe("1500");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("5799");
  expect(result.agi.toFixed()).toBe("74420");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("5674");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("326");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Z 1" && row.line === "2")?.value.toFixed()).toBe("1500");
});
it("retains the bond exclusion before calculating student loan interest", () => {
  const input = withLoan(actual());
  input.taxpayer.primary.dateOfBirth = "1980-01-01";
  const person = input.form7206?.persons?.[0];
  if (!person) throw new Error("Missing actual person");
  person.attainedAgeAtYearEnd = 46;
  const sourced = TaxYearInputSchema.parse({ ...input,
    form1099Int: [{ payer: "Actual Treasury custodian", interestIncome: "0", usSavingsBondInterest: "4000", taxExemptInterest: "0", privateActivityBondInterest: "0" }],
    savingsBondRedemptions: [{ sourceId: "bond1", bondType: "paper_ee", proceeds: "10000", faceValue: "12000",
      issueDate: "2005-01-01", redemptionDate: "2025-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner: "taxpayer", ownershipConfirmed: true,
      priorYearInterestReported: "0" }],
    form8815: { sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0",
      americanSamoaIncomeExclusion: "0", puertoRicoIncomeExclusion: "0", royaltyInterestAdjustment: "0",
      educationExpenses: [{ sourceId: "college1", relationship: "taxpayer", beneficiaryName: "Jane Doe", beneficiaryTaxId: input.taxpayer.primary.ssn,
        institutionName: "Actual college", institutionAddress: "1 College Way", amountPaid: "10000", expenseType: "tuition_and_required_fees", paidTaxYear: 2025,
        qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] },
  });
  const result = calculateFederalTax(sourced);
  expect(result.form8815?.excludableSavingsBondInterest.toFixed()).toBe("4000");
  expect(result.form8815?.modifiedAGI.toFixed()).toBe("47588");
  expect(result.scheduleB?.taxableInterest.toFixed()).toBe("0");
  expect(result.schedule1?.studentLoanInterest.toFixed()).toBe("1500");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Y" && row.line === "2")?.value.toFixed()).toBe("4000");
  expect(result.allLines.find(row => row.form === "Pub974 Worksheet Z 1" && row.line === "2")?.value.toFixed()).toBe("1500");
});
it("uses auxiliary400 only before the final actual2026 eligibility calculation", () => {
  const high = withLoan(actual(2026,"90000","1000","500"));
  const result = calculateFederalTax(high);
  // Final actual income remains above62600; the auxiliary computation cannot qualify it.
  expect(result.form8962?.modifiedAGI.gt(62600)).toBe(true);
  expect(result.form8962?.fplPercentageForTable.toFixed()).toBe("401");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("6000");
  expect(result.form8962?.orderedDeductionInterim).not.toBe(true);
  expect(result.allLines.find(row => row.form === "Pub974 Ordered Deductions" && row.line === "studentLoan")?.inputs["Auxiliary Step2 percentage"].toString()).toBe("400");
  const lower = withLoan(actual(2026,"82000","1000","500"));
  lower.iraDeductionWorksheet = { primaryContributions: "7500", primaryIsActiveParticipant: true,
    primaryCompensation: "76207", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  const eligible = calculateFederalTax(lower);
  // Initial actual64207 is above400%; auxiliary400 permits the prescribed first
  // Step3 health6395. IRA7500 then loan1500 produce final health5499/AGI61708.
  expect(eligible.allLines.find(row => row.form === "Pub974 Ordered Deductions" && row.line === "ira")?.inputs["Auxiliary Step2 percentage"].toString()).toBe("400");
  expect(eligible.iraDeductionWorksheet?.magi.toFixed()).toBe("69812");
  expect(eligible.schedule1?.seHealthInsurance.toFixed()).toBe("5499");
  expect(eligible.agi.toFixed()).toBe("61708");
  expect(eligible.form8962?.modifiedAGI.lte(62600)).toBe(true);
  expect(eligible.form8962?.ptcAllowed.gt(0)).toBe(true);
  expect(eligible.form8962?.orderedDeductionInterim).not.toBe(true);
});

it("refigures earlier claims when final Step2 is ineligible for PTC", () => {
  const input = actual(2026,"110000","1000","500");
  input.iraDeductionWorksheet = { primaryContributions: "7500", primaryIsActiveParticipant: true,
    primaryCompensation: "102228", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  const result = calculateFederalTax(input);
  // Initial auxiliary health8987 gives IRA MAGI93241/deduction0. FinalStep2
  // ineligibility requires ordinary health12000 and a fresh MAGI90228:
  //7500*(91000-90228)/10000=579, rounded UP to next10=580.
  expect(result.marketplaceHealthInsurance?.method).toBe("ordinary-no-ptc-2026");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("12000");
  expect(result.iraDeductionWorksheet?.magi.toFixed()).toBe("90228");
  expect(result.iraDeductionWorksheet?.totalDeduction.toFixed()).toBe("580");
  expect(result.agi.toFixed()).toBe("89648");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("6000");
});

it("uses a separate method when ordinary no-credit refiguring regains actual eligibility", () => {
  const input = actual(2026,"106000","1000","500");
  if (!input.form8962) throw new Error("Missing actual household source");
  input.form8962.taxFamilySize = 2;
  input.taxpayer.dependents = [{ firstName: "Actual", lastName: "Dependent", ssn: "999-88-7777",
    relationship: "child", dateOfBirth: "2000-05-15", monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false }];
  input.iraDeductionWorksheet = { primaryContributions: "7500", primaryIsActiveParticipant: true,
    primaryCompensation: "98511", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true };
  // Net98511; interim health8616 permits IRA830. FinalStep2 income85681 is
  // above the two-person84600 cliff. Ordinary health12000 instead permits
  // IRA3370 and income83141, which regains actual eligibility. A no-credit
  // method cannot publish this result, even before the premium double-benefit check.
  const result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-alternative-reentry-2026");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("8281");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("0");
});
