// Spec: spec/federal/guided-student-loan.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { buildStudentLoanInputs, emptyStudentLoanFacts, emptyStudentLoanSource, type StudentLoanData } from "@/lib/guided-student-loan-facts";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData, emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { emptyEducatorSource } from "@/lib/guided-educator-facts";
import { startCompleteInterview } from "./complete-facts";

function sourceFacts(): StudentLoanData {
  return { ...emptyStudentLoanFacts, sourceTaxYear: "2025", sourceFactsConfirmed: true, primaryClaimedAsDependent: false, spouseClaimedAsDependent: false, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans: [{ ...emptyStudentLoanSource,
    sourceId: "loan-1", borrowerId: "borrower-1", accountHolder: "primary", lender: "Actual lender", sourceKind: "lender_statement", loanOriginationDate: "2010-08-01",
    interestPaid: "1200.15", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true, legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
    enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self", expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
    employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0", qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [] }] };
}

it("preserves actual loan facts and reconciles the saved gross amount", () => {
  const data = sourceFacts();
  const result = buildStudentLoanInputs(data, "single", 2025, [], "1,200.15");
  expect(result.studentLoanInterestFacts?.loans?.[0]).toMatchObject({ accountHolder: "primary", interestPaid: "1200.15", relatedLender: false, employerAssistanceExcluded: "0" });
  expect(result.form1098E).toEqual([]);
  expect(result).not.toHaveProperty("deduction");
  expect(() => buildStudentLoanInputs(data, "single", 2025, [], "1200")).toThrow(/reconcile/i);
  expect(() => buildStudentLoanInputs(undefined, "single", 2025, [], "1200")).toThrow(/actual|source/i);
  expect(buildStudentLoanInputs(undefined, "single", 2025, [], "0")).toEqual({});
  const huge = sourceFacts(); huge.loans![0]!.interestPaid = "9,007,199,254,740,993.01";
  expect(buildStudentLoanInputs(huge, "single", 2025).studentLoanInterestFacts?.loans?.[0]?.interestPaid).toBe("9007199254740993.01");
  for (const patch of [{ legallyObligated: null }, { interestPaid: "" }, { employerAssistanceExcluded: "" }, { accountHolder: "" }, { sourceKind: "" }]) {
    expect(() => buildStudentLoanInputs({ ...data, loans: [{ ...data.loans![0]!, ...patch }] } as StudentLoanData, "single", 2025)).toThrow();
  }
  expect(() => buildStudentLoanInputs({ ...data, sourceTaxYear: "2026" }, "single", 2025)).toThrow(/year/i);
  expect(() => buildStudentLoanInputs({ ...data, sourceFactsConfirmed: null }, "single", 2025)).toThrow(/confirm/i);
  expect(buildStudentLoanInputs({ ...data, loans: [{ ...data.loans![0]!, interestPaid: "0", legallyObligated: false }] }, "single", 2025).studentLoanInterestFacts?.loans?.[0]?.legallyObligated).toBe(false);
});

it("reconciles original lender statements and linked education interest", () => {
  const data = sourceFacts(); const loan = data.loans![0]!;
  data.loans = [{ ...loan, sourceKind: "form1098e", form1098ESourceId: "form-1", form1098ETaxYear: "2025", form1098EBox1: "1200.15", box2ExcludesOriginationFeesOrCapitalizedInterest: false, interestPaid: "600.05" },
    { ...loan, sourceId: "loan-2", sourceKind: "form1098e", form1098ESourceId: "form-1", form1098ETaxYear: "2025", form1098EBox1: "1200.15", box2ExcludesOriginationFeesOrCapitalizedInterest: false, interestPaid: "600.10" }];
  expect(buildStudentLoanInputs(data, "single", 2025).form1098E).toHaveLength(1);
  expect(() => buildStudentLoanInputs({ ...data, loans: [{ ...data.loans[0]!, form1098EBox1: "1200.16" }, data.loans[1]!] }, "single", 2025)).toThrow(/statement|reconcile/i);
  expect(() => buildStudentLoanInputs({ ...data, loans: [{ ...data.loans[0]!, box2ExcludesOriginationFeesOrCapitalizedInterest: null }, data.loans[1]!] }, "single", 2025)).toThrow(/Box.?2|statement/i);
  const linked = { ...sourceFacts(), loans: [{ ...loan, educationExpenseIds: ["paid-interest"], qtpTaxFreeEarningsUsedForInterest: "200" }] };
  const vector = [{ expenseId: "paid-interest", borrowerId: "borrower-1", owner: "primary" as const, interestPaid: new Decimal(1000), taxFreeEarningsUsedForInterest: new Decimal(200), interestClaimedElsewhere: new Decimal(800) }];
  expect(buildStudentLoanInputs(linked, "single", 2025, vector).studentLoanInterestFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe("200");
  expect(() => buildStudentLoanInputs(linked, "single", 2025)).toThrow(/linked|source/i);
  expect(() => buildStudentLoanInputs(linked, "single", 2025, [{ ...vector[0]!, owner: "spouse" }])).toThrow(/owner|borrower/i);
});

it("requires actual loan sources in the guided return and forwards them once", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["student-loans"], stateCode: null });
  expect(validateSection(state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanInterest: "1200.15" };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments.studentLoanFacts = sourceFacts();
  const result = buildTaxInputFromGuidedData(state);
  expect(result?.studentLoanInterestFacts?.loans?.[0]?.interestPaid).toBe("1200.15");
  expect(result?.adjustments?.studentLoanInterest ?? "0").toBe("0");
  expect(validateSection(state, "adjustments").status).toBe("complete");
  state.sectionData.adjustments.studentLoanFacts!.loans![0]!.interestPaid = "";
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  expect(validateSection(state, "adjustments").status).toBe("partial");
});

it("invalidates substantive source changes without cycling confirmations", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["student-loans"], stateCode: null });
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: sourceFacts(), educatorExpenseSources: [{ ...emptyEducatorSource, sourceFactsConfirmed: true }] };
  state.sectionData.credits = { ...emptyCreditsData, educationDistributions: { sourceFactsConfirmed: false, taxYear: "2025", forms: [] } };
  const confirmation = updateSectionData(state, "credits", { ...state.sectionData.credits, educationDistributions: { ...state.sectionData.credits.educationDistributions, sourceFactsConfirmed: true } });
  expect(confirmation.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBe(true);
  expect(confirmation.sectionData.adjustments?.educatorExpenseSources?.[0]?.sourceFactsConfirmed).toBe(true);
  const substantive = updateSectionData(confirmation, "credits", { ...confirmation.sectionData.credits, educationDistributions: { ...confirmation.sectionData.credits?.educationDistributions, allDistributionsReconciled: false } });
  expect(substantive.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
  expect(substantive.sectionData.adjustments?.educatorExpenseSources?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(substantive.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
  const educationReconfirmed = updateSectionData(substantive, "credits", { ...substantive.sectionData.credits, educationDistributions: { ...substantive.sectionData.credits?.educationDistributions, sourceFactsConfirmed: true } });
  expect(educationReconfirmed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
  expect(educationReconfirmed.sectionData.adjustments?.studentLoanFacts?.sourceFactsConfirmed).toBeNull();
  const reconfirmed = updateSectionData(educationReconfirmed, "adjustments", { ...educationReconfirmed.sectionData.adjustments, studentLoanFacts: { ...educationReconfirmed.sectionData.adjustments?.studentLoanFacts, sourceFactsConfirmed: true } });
  expect(reconfirmed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
});

it("checks actual household dependency and calculated education links before completion", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["student-loans"], stateCode: null });
  const facts = sourceFacts(); facts.loans![0]!.educationExpenseIds = ["loan-payment"]; facts.loans![0]!.qtpTaxFreeEarningsUsedForInterest = "200";
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: facts };
  state.sectionData.credits = { ...emptyCreditsData, educationDistributions: {
    taxYear: "2025", sourceFactsConfirmed: true, allDistributionsReconciled: true,
    forms: [{ fields: { sourceId: "q1", accountId: "actual-account", beneficiaryId: "student1", recipientOwner: "primary", taxYear: "2025", payerName: "Synthetic plan", accountType: "529", grossDistribution: "5000", earnings: "1000", basis: "4000", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: true, sourceFactsConfirmed: true }, transfer: { kind: "none" } }],
    beneficiaries: [{ id: "student1", name: "Synthetic student", outsideK12QualifiedDistributions: "0" }],
    expenses: [{ id: "loan-payment", beneficiaryId: "student1", category: "student_loan", paidDate: "2025-08-01", amount: "5000", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true, borrowerId: "borrower-1", beneficiaryOrSibling: true, studentLoanInterestAmount: "1000", studentLoanInterestDeducted: "800" }],
    allocations: [{ expenseId: "loan-payment", sourceId: "q1", amount: "5000", creditAmount: "0", loanInterestAmount: "1000" }],
    loanBorrowers: [{ id: "borrower-1", owner: "primary", priorQualifiedDistributions: "0", otherCurrentQualifiedDistributions: "0" }], coverdellAccounts: [], penaltyExceptions: [],
  } };
  expect(validateSection(state, "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.studentLoanInterestFacts?.loans?.[0]?.qtpTaxFreeEarningsUsedForInterest).toBe("200");
  state.sectionData.credits.educationDistributions!.sourceFactsConfirmed = false;
  expect(validateSection(state, "adjustments").status).toBe("partial"); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.credits.educationDistributions!.sourceFactsConfirmed = true;
  state.sectionData.credits.education.claimedAsDependent = true;
  expect(validateSection(state, "adjustments").status).toBe("partial"); expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.credits.education.claimedAsDependent = false;
  expect(validateSection(state, "adjustments").status).toBe("complete");
});

it("calculates the actual guided loan deduction through canonical federal income", async () => {
  const { calculateFederalTax } = await import("@/engine/federal");
  const { TaxYearInputSchema } = await import("@/models/inputs");
  const { completeW2Entry } = await import("./complete-facts");
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: ["student-loans"], stateCode: null });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", federalWithheld: "5000", socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725" }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, studentLoanFacts: sourceFacts() };
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.totalIncome.toString()).toBe("50000");
  expect(result.adjustmentsToIncome.toString()).toBe("1200");
  expect(result.agi.toString()).toBe("48800");
});
