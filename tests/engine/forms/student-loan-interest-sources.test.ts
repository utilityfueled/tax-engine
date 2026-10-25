// Spec: spec/federal/student-loan-interest-sources.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { StudentLoanInterestFactsSchema, Form1098ESchema } from "@/models/inputs";
import { calculateStudentLoanInterestDeduction } from "@/engine/forms/student-loan-interest";

export function loanSource(patch: Record<string, unknown> = {}) {
  return { sourceId: "loan-1", borrowerId: "borrower-1", accountHolder: "primary", lender: "Actual lender", sourceKind: "lender_statement", loanOriginationDate: "2010-08-01",
    interestPaid: "1200.15", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
    legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true,
    enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self",
    expensesWithinReasonablePeriod: true, relatedLender: false, employerPlanLoan: false,
    employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0", qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [], ...patch };
}
function facts(loans: unknown[], patch: Record<string, unknown> = {}) {
  return StudentLoanInterestFactsSchema.parse({ sourceTaxYear: 2026, sourceFactsConfirmed: true, primaryClaimedAsDependent: false, spouseClaimedAsDependent: false, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", loans, ...patch });
}
function calculate(loans: unknown[], options: Record<string, unknown> = {}) {
  return calculateStudentLoanInterestDeduction({ facts: facts(loans), taxYear: 2026, filingStatus: "single", modifiedAgi: new Decimal(50000), forms: [], educationLoanInterest: [], ...options });
}

it("reconciles actual loan sources and separately supported unreported interest", () => {
  expect(calculate([loanSource()]).qualifiedInterest.toString()).toBe("1200.15");
  const sourceOnly = calculate([loanSource()], { modifiedAgi: undefined });
  expect(sourceOnly.calculationComplete).toBe(false);
  expect(sourceOnly.deduction).toBeUndefined();
  const form = Form1098ESchema.parse({ sourceId: "form-1", taxYear: 2026, borrowerId: "borrower-1", accountHolder: "primary", lender: "Actual lender", studentLoanInterestReceived: "87.89", box2ExcludesOriginationFeesOrCapitalizedInterest: true });
  const loan = loanSource({ sourceKind: "form1098e", form1098ESourceId: "form-1", loanOriginationDate: "2004-08-01", interestPaid: "87.89", additionalInterestPaid: "313.13", additionalInterestSourceReference: "Actual lender allocation of 10 fees and 303.13 capitalized interest", additionalInterestQualificationConfirmed: true });
  // Actual values from Pub970's paid-interest allocation example; neither checkbox
  // nor principal payments independently imply the additional interest.
  expect(calculate([loan], { forms: [form] }).qualifiedInterest.toString()).toBe("401.02");
  expect(() => calculate([loan], { forms: [{ ...form, studentLoanInterestReceived: "88" }] })).toThrow(/reconcil/i);
  expect(() => calculate([loan], { forms: [{ ...form, box2ExcludesOriginationFeesOrCapitalizedInterest: undefined }] })).toThrow(/Box.?2/i);
  expect(() => calculate([{ ...loan, additionalInterestSourceReference: "" }], { forms: [form] })).toThrow(/additional/i);
  expect(() => calculate([loan], { forms: [{ ...form, box2ExcludesOriginationFeesOrCapitalizedInterest: false }] })).toThrow(/additional|Box.?2/i);
  expect(() => calculate([loanSource()], { forms: [form] })).toThrow(/unlinked|reconcil/i);
});

it("keeps actual ineligibility unknown and zero distinct", () => {
  for (const patch of [{ legallyObligated: false }, { solelyQualifiedEducationExpenses: false }, { eligibleInstitutionAtOrigination: false }, { enrolledAtLeastHalfTime: false }, { pursuingCredential: false }, { studentRelationshipAtOrigination: "other" }, { expensesWithinReasonablePeriod: false }, { relatedLender: true }, { employerPlanLoan: true }]) expect(calculate([loanSource(patch)]).deduction?.toString()).toBe("0");
  expect(calculate([loanSource()], { filingStatus: "married_filing_separately" }).deduction?.toString()).toBe("0");
  expect(calculate([loanSource()], { facts: facts([loanSource()], { primaryClaimedAsDependent: true }) }).deduction?.toString()).toBe("0");
  for (const field of ["legallyObligated", "interestPaid", "employerAssistanceExcluded", "qtpTaxFreeEarningsUsedForInterest", "educationExpenseIds", "accountHolder", "paymentsInTaxYearConfirmed"]) expect(() => calculate([loanSource({ [field]: undefined })])).toThrow();
  expect(calculate([loanSource({ interestPaid: "0" })]).qualifiedInterest.toString()).toBe("0");
  expect(() => calculate([loanSource({ accountHolder: "spouse" })])).toThrow(/spouse|joint/i);
  expect(() => calculate([loanSource(), loanSource()])).toThrow(/duplicate/i);
  expect(() => calculate([loanSource()], { facts: facts([loanSource()], { sourceFactsConfirmed: false }) })).toThrow(/confirm/i);
});

it("links each education expense to its actual loan and subtracts earnings once", () => {
  const loan = loanSource({ interestPaid: "1000", qtpTaxFreeEarningsUsedForInterest: "200", educationExpenseIds: ["education-1"] });
  const allocation = { expenseId: "education-1", borrowerId: "borrower-1", owner: "primary" as const, interestPaid: new Decimal(800), taxFreeEarningsUsedForInterest: new Decimal(200), interestClaimedElsewhere: new Decimal(600) };
  const result = calculate([loan], { educationLoanInterest: [allocation] });
  expect(result.qualifiedInterest.toString()).toBe("800");
  expect(result.sources[0]?.reductions.toString()).toBe("200");
  expect(() => calculate([loan], { educationLoanInterest: [{ ...allocation, owner: "spouse" }] })).toThrow(/owner|borrower/i);
  expect(() => calculate([loan], { educationLoanInterest: [{ ...allocation, expenseId: "unknown" }] })).toThrow(/expense|linked/i);
  expect(() => calculate([loanSource({ interestPaid: "1000" })], { educationLoanInterest: [allocation] })).toThrow(/linked/i);
  expect(() => calculate([loan], { educationLoanInterest: [{ ...allocation, interestPaid: new Decimal(1100) }] })).toThrow(/interest/i);
  expect(() => calculate([loan], { educationLoanInterest: [{ ...allocation, taxFreeEarningsUsedForInterest: new Decimal(201), interestClaimedElsewhere: new Decimal(599) }] })).toThrow(/reconcil/i);
  expect(() => calculate([{ ...loan, legallyObligated: false }], { educationLoanInterest: [allocation] })).toThrow(/eligib|claim/i);
  expect(() => calculate([loanSource({ employerAssistanceExcluded: "900", otherTaxFreeAssistance: "400" })])).toThrow(/reductions/i);
});

it("uses exact source cents and the selected year phaseout on canonical MAGI", () => {
  const loan = loanSource({ interestPaid: "9007199254740993.01", employerAssistanceExcluded: "9007199254738493" });
  expect(calculate([loan]).qualifiedInterest.toString()).toBe("2500.01");
  expect(calculate([loan]).deduction?.toString()).toBe("2500");
  expect(calculate([loan], { modifiedAgi: new Decimal(92500) }).deduction?.toString()).toBe("1250");
  expect(calculate([loan], { filingStatus: "married_filing_jointly", modifiedAgi: new Decimal(175000) }).deduction?.toString()).toBe("2500");
  expect(calculate([loan], { filingStatus: "married_filing_jointly", taxYear: 2025, facts: facts([loan], { sourceTaxYear: 2025 }), modifiedAgi: new Decimal(175000) }).deduction?.toString()).toBe("2083");
});

it("validates supplied legacy interest before verifying actual sources", () => {
  const loan = loanSource();
  for (const value of ["-1", "NaN", "Infinity", "", "1e3"]) {
    expect(() => calculate([loan], { legacyAdditionalInterest: value })).toThrow(/actual nonnegative|legacy/i);
  }
  expect(calculate([loan], { legacyAdditionalInterest: "0" }).sourceFactsVerified).toBe(true);
  expect(calculate([loan], { legacyAdditionalInterest: "1200.15" }).additionalInterestTotal.toString()).toBe("1200.15");
  expect(() => calculate([loan], { legacyAdditionalInterest: "1200.14" })).toThrow(/reconcile legacy/i);
});

it("conserves split lender records and rejects contradictory actual source links", () => {
  const form = Form1098ESchema.parse({ sourceId: "statement-1", taxYear: 2026, borrowerId: "borrower-1", accountHolder: "primary", lender: "Actual lender", studentLoanInterestReceived: "1200.15", box2ExcludesOriginationFeesOrCapitalizedInterest: false });
  const first = loanSource({ sourceKind: "form1098e", form1098ESourceId: "statement-1", interestPaid: "600.05" });
  const second = loanSource({ sourceId: "loan-2", sourceKind: "form1098e", form1098ESourceId: "statement-1", interestPaid: "600.10" });
  expect(calculate([first, second], { forms: [form] }).qualifiedInterest.toString()).toBe("1200.15");
  expect(() => calculate([first, { ...second, interestPaid: "600.11" }], { forms: [form] })).toThrow(/reconcil/i);
  expect(() => calculate([first, second], { forms: [form, form] })).toThrow(/duplicate/i);
  expect(() => calculate([first, second], { forms: [{ ...form, taxYear: 2025 }] })).toThrow(/year/i);
  expect(() => calculate([first, second], { forms: [{ ...form, borrowerId: "another-borrower" }] })).toThrow(/borrower|reconcil/i);
  expect(() => calculate([loanSource({ form1098ESourceId: "statement-1" })])).toThrow(/source kind/i);
  for (const date of ["2026-02-30", "2027-01-01", ""]) expect(() => calculate([loanSource({ loanOriginationDate: date })])).toThrow(/date|year/i);
  expect(() => calculate([loanSource(), loanSource({ sourceId: "spouse-loan", accountHolder: "spouse" })], { filingStatus: "married_filing_jointly" })).toThrow(/contradictory/i);
  expect(() => calculate([loanSource()], { facts: facts([loanSource()], { sourceTaxYear: 2025 }) })).toThrow(/year/i);
  expect(() => calculate([loanSource()], { modifiedAgi: new Decimal(NaN) })).toThrow(/AGI/i);
  expect(calculate([], { facts: facts([]) }).deduction?.toString()).toBe("0");
});
