/** Spec: spec/federal/form-1099-q-source.yaml. Synthetic source facts, no filing qualification. */
import { describe, expect, it } from "vitest";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema, EducationExpensesSchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing explicit synthetic source fixture");
  return value;
}
const form = (overrides: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "q1", accountId: "account1", beneficiaryId: "student1", recipientOwner: "primary",
  taxYear: 2026, payerName: "Synthetic education plan", accountType: "529", grossDistribution: "10000",
  earnings: "2000", basis: "8000", isTrusteeToTrustee: false, isQtpToRoth: false,
  recipientNotBeneficiary: true, sourceFactsConfirmed: true, transfer: { kind: "none" },
  ...overrides,
});
const expense = (overrides: Record<string, unknown> = {}) => ({
  id: "e1", beneficiaryId: "student1", category: "postsecondary_tuition", paidDate: "2026-08-15",
  amount: "10000", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0",
  otherTaxBenefitAmount: "0", qualificationConfirmed: true, ...overrides,
});
const facts = (overrides: Record<string, unknown> = {}) => ({
  taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
  beneficiaries: [{ id: "student1", name: "Synthetic Student", studentTaxId: "111223333", outsideK12QualifiedDistributions: "0" }],
  expenses: [expense()], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "10000", creditAmount: "0" }],
  loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [], ...overrides,
});
const summary = (overrides: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: facts(overrides) });

describe("Form1099Q actual education distribution sources", () => {
  it("Form1099Q source contract preserves missing facts and refuses default promotion", () => {
    const sparse = Form1099QSchema.parse({ grossDistribution: "100" });
    expect(sparse.sourceFactsComplete).toBe(false);
    expect(sparse.earnings).toBeUndefined();
    expect(sparse.basis).toBeUndefined();
    expect(Form1099QSchema.parse(sparse).sourceFactsComplete).toBe(false);
    expect(() => calculateForm1099Q([sparse], summary(), { taxYear: 2026 })).toThrow(/actual|source/i);
    expect(() => calculateForm1099Q([form({ basis: "7999" })], summary(), { taxYear: 2026 })).toThrow(/Box1.*Box2.*Box3/);
    expect(() => calculateForm1099Q([form({ taxYear: 2025 })], summary(), { taxYear: 2026 })).toThrow(/year/i);
    expect(() => calculateForm1099Q([form(), form()], summary(), { taxYear: 2026 })).toThrow(/duplicate/i);
  });

  it("Form1099Q source allocations prevent cross-beneficiary and duplicate expense use", () => {
    expect(() => calculateForm1099Q([form()], summary({ expenses: [expense({ beneficiaryId: "student2" })] }), { taxYear: 2026 })).toThrow(/beneficiary/);
    expect(() => calculateForm1099Q([form()], summary({ allocations: [
      { expenseId: "e1", sourceId: "q1", amount: "7000", creditAmount: "0" },
      { expenseId: "e1", sourceId: "q1", amount: "4000", creditAmount: "0" },
    ] }), { taxYear: 2026 })).toThrow(/duplicate|exceed/);
    expect(() => calculateForm1099Q([form()], summary({ expenses: [expense({ taxFreeAssistance: "11000" })] }), { taxYear: 2026 })).toThrow(/reductions/);
    expect(calculateForm1099Q([form()], summary({ expenses: [expense({ qualificationConfirmed: false })] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("2000");
  });

  it("Form1099Q applies the2026 K12 cap across accounts without mixing earnings", () => {
    const inputs = [form({ grossDistribution: "10000", earnings: "1000", basis: "9000" }),
      form({ sourceId: "q2", accountId: "account2", grossDistribution: "20000", earnings: "8000", basis: "12000" })];
    const data = summary({ expenses: [expense({ category: "k12_tuition", amount: "20000" })], allocations: [
      { expenseId: "e1", sourceId: "q1", amount: "5000", creditAmount: "0" },
      { expenseId: "e1", sourceId: "q2", amount: "15000", creditAmount: "0" },
    ] });
    const result = calculateForm1099Q(inputs, data, { taxYear: 2026 });
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.taxableEarnings.toString()).toBe("2500"); //500 +2000, not a pooled3000
    expect(result.adjustedQEE.toString()).toBe("20000");
    const outside = summary({ ...data.sourceFacts, beneficiaries: [{ id: "student1", outsideK12QualifiedDistributions: "10000" }] });
    expect(calculateForm1099Q(inputs, outside, { taxYear: 2026 }).adjustedQEE.toString()).toBe("10000");
    const prior = summary({ ...data.sourceFacts, taxYear: 2025, expenses: [expense({ category: "k12_tuition", amount: "20000", paidDate: "2025-08-15" })] });
    expect(calculateForm1099Q(inputs.map(item => ({ ...item, taxYear: 2025 })), prior, { taxYear: 2025 }).adjustedQEE.toString()).toBe("10000");
  });

  it("Form1099Q applies expanded expenses only to eligible distributions after enactment", () => {
    const data = summary({ taxYear: 2025, expenses: [expense({ category: "k12_tutoring", paidDate: "2025-08-15", tutorUnrelated: true, tutoringOutsideHome: true, tutorQualified: true })] });
    const before = calculateForm1099Q([form({ taxYear: 2025, distributionDate: "2025-07-04" })], data, { taxYear: 2025 });
    expect(before.taxableEarnings.toString()).toBe("2000");
    const after = calculateForm1099Q([form({ taxYear: 2025, distributionDate: "2025-07-05" })], data, { taxYear: 2025 });
    expect(after.taxableEarnings.toString()).toBe("0");
    expect(() => calculateForm1099Q([form({ taxYear: 2025 })], data, { taxYear: 2025 })).toThrow(/date|July/i);
    const unknownTutor = summary({ expenses: [expense({ category: "k12_tutoring" })] });
    expect(() => calculateForm1099Q([form()], unknownTutor, { taxYear: 2026 })).toThrow(/tutor/i);
    const credential = summary({ expenses: [expense({ category: "credential_testing", credentialRecognized: true, requiredForCredential: true })] });
    expect(calculateForm1099Q([form()], credential, { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
  });

  it("Form1099Q applies student-loan lifetime limits to the actual borrower", () => {
    const data = summary({ expenses: [expense({ category: "student_loan", borrowerId: "borrower1", beneficiaryOrSibling: true, studentLoanInterestAmount: "1000", studentLoanInterestDeducted: "0" })],
      allocations: [{ expenseId: "e1", sourceId: "q1", amount: "10000", creditAmount: "0", loanInterestAmount: "1000" }],
      loanBorrowers: [{ id: "borrower1", owner: "primary", priorQualifiedDistributions: "7000", otherCurrentQualifiedDistributions: "1000" }] });
    const result = calculateForm1099Q([form()], data, { taxYear: 2026 });
    expect(result.adjustedQEE.toString()).toBe("2000");
    expect(result.taxableEarnings.toString()).toBe("1600");
    expect(() => calculateForm1099Q([form()], summary({ ...data.sourceFacts, loanBorrowers: [] }), { taxYear: 2026 })).toThrow(/borrower/);
  });

  it("Form1099Q preserves basis-funded loan interest and identifies excluded earnings", () => {
    const data = summary({ expenses: [expense({ category: "student_loan", borrowerId: "borrower1", beneficiaryOrSibling: true, studentLoanInterestAmount: "1000", studentLoanInterestDeducted: "800" })],
      allocations: [{ expenseId: "e1", sourceId: "q1", amount: "10000", creditAmount: "0", loanInterestAmount: "1000" }],
      loanBorrowers: [{ id: "borrower1", owner: "primary", priorQualifiedDistributions: "0", otherCurrentQualifiedDistributions: "0" }] });
    const result = calculateForm1099Q([form()], data, { taxYear: 2026 });
    expect(result.taxableEarnings.toString()).toBe("0");
    expect(result.loanInterestAdjustments[0]?.taxFreeEarningsUsedForInterest.toString()).toBe("200");
    expect(result.loanInterestAdjustments[0]?.interestClaimedElsewhere.toString()).toBe("800");
    expect(() => calculateForm1099Q([form()], summary({ ...data.sourceFacts, expenses: [expense({ category: "student_loan", borrowerId: "borrower1", beneficiaryOrSibling: true, studentLoanInterestAmount: "1000", studentLoanInterestDeducted: "1000" })] }), { taxYear: 2026 })).toThrow(/loan interest.*tax-free|tax-free.*loan interest/);
  });

  it("Form1099Q reproduces Pub970 credit coordination and preserves other recipients", () => {
    const inputs = [form({ grossDistribution: "5300", earnings: "950", basis: "4350" }), form({ sourceId: "q2", accountId: "account2", recipientOwner: "other", recipientId: "external-student1", recipientNotBeneficiary: false, grossDistribution: "1000", earnings: "200", basis: "800" })];
    const data = summary({ expenses: [expense({ amount: "8300", taxFreeAssistance: "3100", educationCreditAmount: "4000" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "1200", creditAmount: "4000" }] });
    const result = calculateForm1099Q(inputs, data, { taxYear: 2026 });
    expect(result.taxableEarnings.toString()).toBe("735");
    expect(result.perDistribution.find(item => item.sourceId === "q2")?.taxableEarnings.toString()).toBe("200");
    expect(result.perRecipient.find(item => item.owner === "other")?.taxableEarnings.toString()).toBe("200");
    expect(result.penaltyExceptionAmount.toString()).toBe("717");
    expect(result.netPenalty.toString()).toBe("2");
  });

  it("Form1099Q calculates missing Coverdell earnings from actual account history", () => {
    //Pub970 chapter6 example:850 distribution,1500 prior basis,950 year-end value,700 AQEE.
    const data = summary({ expenses: [expense({ amount: "700" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "700", creditAmount: "0" }],
      coverdellAccounts: [{ accountId: "account1", priorYearBasis: "1500", currentYearContributions: "0", yearEndValue: "950", outstandingRollovers: "0", rolloverBasisReceived: "0" }] });
    const result = calculateForm1099Q([form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, grossDistribution: "850", earnings: undefined, basis: undefined })], data, { taxYear: 2026 });
    expect(result.totalBasis.toString()).toBe("708");
    expect(result.totalEarnings.toString()).toBe("142");
    expect(result.taxableEarnings.toString()).toBe("25");
    expect(result.coverdellAccounts[0]?.endingBasis.toString()).toBe("792");
  });

  it("Form1099Q validates transfer eligibility instead of trusting Box4", () => {
    expect(() => calculateForm1099Q([form({ isTrusteeToTrustee: true, transfer: undefined })], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/transfer/);
    const transfer = { kind: "qtp", amount: "10000", receivedDate: "2026-06-30", sameBeneficiary: true, eligibleFamilyMember: false, priorRolloverWithin12Months: false };
    const valid = form({ isTrusteeToTrustee: true, distributionDate: "2026-05-01", transfer });
    expect(calculateForm1099Q([valid], summary({ allocations: [] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
    const late = form({ isTrusteeToTrustee: true, distributionDate: "2026-05-01", transfer: { ...transfer, receivedDate: "2026-07-01" } });
    expect(calculateForm1099Q([late], summary({ allocations: [] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("2000");
  });

  it("Form1099Q prorates scholarship exceptions and includes credit-only exceptions", () => {
    const data = summary({ allocations: [], penaltyExceptions: [{ id: "scholarship1", sourceId: "q1", kind: "scholarship", qualifyingAmount: "2000", distributionAmount: "2000", eligibilityConfirmed: true }] });
    const result = calculateForm1099Q([form()], data, { taxYear: 2026 });
    expect(result.penaltyExceptionAmount.toString()).toBe("400");
    expect(result.netPenalty.toString()).toBe("160");
    expect(() => calculateForm1099Q([form()], summary({ ...data.sourceFacts, penaltyExceptions: [required(required(required(data.sourceFacts).penaltyExceptions)[0]), required(required(required(data.sourceFacts).penaltyExceptions)[0])] }), { taxYear: 2026 })).toThrow(/duplicate/);
  });

  it("Form1099Q binds source credit allocations to actual student expenses", () => {
    const data = summary({ expenses: [expense({ educationCreditAmount: "4000" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "6000", creditAmount: "4000" }] });
    expect(() => calculateForm1099Q([form()], data, { taxYear: 2026, educationExpenses: { aocStudents: [], llcExpenses: "0" } })).toThrow(/credit.*student|student.*credit/i);
    const result = calculateForm1099Q([form()], data, { taxYear: 2026 });
    expect(result.creditAllocations[0]).toMatchObject({ beneficiaryId: "student1", amount: expect.anything() });
    expect(result.creditAllocations[0]?.amount.toString()).toBe("4000");
  });

  it("Form1099Q applies actual ABLE and Roth capacities for the correct year", () => {
    const able = form({ isTrusteeToTrustee: true, distributionDate: "2026-05-01", transfer: {
      kind: "able", amount: "10000", receivedDate: "2026-06-30", sameBeneficiary: true,
      eligibleFamilyMember: false, destinationAccountEligible: true, destinationAccountId: "able1",
      ableAnnualContributionLimit: "20000", otherAbleContributions: "15000",
    } });
    const result = calculateForm1099Q([able], summary({ allocations: [] }), { taxYear: 2026 });
    expect(result.trusteeToTrusteeTransfers.toString()).toBe("5000");
    expect(result.taxableEarnings.toString()).toBe("1000");
    const roth = form({ isQtpToRoth: true, recipientNotBeneficiary: false, distributionDate: "2026-05-01", transfer: {
      kind: "roth", amount: "10000", receivedDate: "2026-05-01", sameBeneficiary: true,
      eligibleFamilyMember: false, accountOpenedDate: "2011-05-01", contributionsAndEarningsBeforeFiveYears: "9000",
      beneficiaryAgeAtYearEnd: 50, beneficiaryTaxableCompensation: "20000", otherIraContributions: "0", previousRothRollovers: "0",
    } });
    expect(calculateForm1099Q([roth], summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("8600");
    expect(calculateForm1099Q([{ ...roth, transfer: { ...required(roth.transfer), previousRothRollovers: "34000" } }], summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("1000");
    expect(calculateForm1099Q([{ ...roth, transfer: { ...required(roth.transfer), accountOpenedDate: "2011-05-02" } }], summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("0");
  });

  it("Form1099Q preserves Coverdell credential and tutoring eligibility", () => {
    const source = form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, grossDistribution: "850", earnings: undefined, basis: undefined });
    const base = { coverdellAccounts: [{ accountId: "account1", priorYearBasis: "1500", currentYearContributions: "0", yearEndValue: "950", outstandingRollovers: "0", rolloverBasisReceived: "0" }] };
    const credential = summary({ ...base, expenses: [expense({ category: "credential_testing", credentialRecognized: true, requiredForCredential: true })] });
    expect(calculateForm1099Q([source], credential, { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
    const tutoring = summary({ ...base, expenses: [expense({ category: "k12_tutoring" })] });
    expect(calculateForm1099Q([source], tutoring, { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
  });

  it("Form1099Q validates source boundaries and rounds IRS report amounts", () => {
    const result = calculateForm1099Q([form({ grossDistribution: "100.10", earnings: "20.10", basis: "80" })], summary({ allocations: [] }), { taxYear: 2026 });
    expect(result.grossDistribution.toString()).toBe("100.1");
    expect(result.taxableEarnings.toString()).toBe("20");
    expect(result.netPenalty.toString()).toBe("2");
    for (const invalid of [{ earnings: "NaN" }, { grossDistribution: "-1", earnings: "0", basis: "-1" }]) {
      expect(() => calculateForm1099Q([form(invalid)], summary(), { taxYear: 2026 })).toThrow();
    }
    expect(() => calculateForm1099Q([form()], summary({ expenses: [expense({ paidDate: "2026-02-30" })] }), { taxYear: 2026 })).toThrow(/date/);
    expect(() => calculateForm1099Q([form()], summary(), { taxYear: 2027 })).toThrow(/year/);
    expect(() => calculateForm1099Q([form()], summary({ sourceFactsConfirmed: false }), { taxYear: 2026 })).toThrow(/source/);
    const room = summary({ expenses: [expense({ category: "postsecondary_room_board", halfTimeStudent: true, roomBoardAllowance: "4000", schoolOwnedHousingCharge: "5000" })] });
    expect(calculateForm1099Q([form()], room, { taxYear: 2026 }).taxableEarnings.toString()).toBe("1000");
    expect(calculateForm1099Q([form()], summary({ ...room.sourceFacts, expenses: [expense({ category: "postsecondary_room_board", halfTimeStudent: false, roomBoardAllowance: "4000", schoolOwnedHousingCharge: "5000" })] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("2000");
  });
  it("Form1099Q reconciles transfer histories and never reuses source capacity", () => {
    const roth = { kind: "roth", amount: "4000", receivedDate: "2026-05-01", sameBeneficiary: true,
      eligibleFamilyMember: false, accountOpenedDate: "2010-05-01", contributionsAndEarningsBeforeFiveYears: "5000",
      beneficiaryAgeAtYearEnd: 30, beneficiaryTaxableCompensation: "20000", otherIraContributions: "0", previousRothRollovers: "0" };
    const first = form({ isQtpToRoth: true, recipientNotBeneficiary: false, distributionDate: "2026-05-01", transfer: roth });
    const second = form({ sourceId: "q2", isQtpToRoth: true, recipientNotBeneficiary: false, distributionDate: "2026-06-01", transfer: { ...roth, receivedDate: "2026-06-01" } });
    expect(calculateForm1099Q([first, second], summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("5000");
    expect(() => calculateForm1099Q([first, { ...second, transfer: { ...required(second.transfer), otherIraContributions: "1000" } }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/inconsistent.*capacity|capacity.*inconsistent/);
    expect(() => calculateForm1099Q([{ ...first, isTrusteeToTrustee: true }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/Box4/);
    const rollover = { kind: "qtp", amount: "10000", receivedDate: "2026-05-01", sameBeneficiary: true, eligibleFamilyMember: false, priorRolloverWithin12Months: false };
    const repeated = [form({ distributionDate: "2026-05-01", transfer: rollover }), form({ sourceId: "q2", accountId: "account2", distributionDate: "2026-06-01", transfer: { ...rollover, receivedDate: "2026-06-01" } })];
    expect(calculateForm1099Q(repeated, summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("10000");
  });

  it("Form1099Q preserves Coverdell account totals across multiple statements", () => {
    const inputs = [form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, grossDistribution: "5", earnings: undefined, basis: undefined }),
      form({ sourceId: "q2", accountType: "coverdell_esa", recipientNotBeneficiary: false, grossDistribution: "5", earnings: undefined, basis: undefined })];
    const data = summary({ expenses: [expense({ amount: "5" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "5", creditAmount: "0" }],
      coverdellAccounts: [{ accountId: "account1", priorYearBasis: "0", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0" }] });
    const result = calculateForm1099Q(inputs, data, { taxYear: 2026 });
    expect(result.taxFreeEarnings.toString()).toBe("5");
    expect(result.taxableEarnings.toString()).toBe("5");
    for (const line of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]) {
      expect(result.lines.some(item => item.form === "Pub970 WS6-3" && item.line === `account1:${line}`)).toBe(true);
    }
  });

  it("Form1099Q rejects conflicting legacy aliases and malformed statement dates", () => {
    expect(() => calculateForm1099Q([form()], { ...summary(), totalQualifiedExpenses: "1" }, { taxYear: 2026 })).toThrow(/legacy.*reconcil|aggregate.*reconcil/);
    expect(() => calculateForm1099Q([form({ distributionDate: "2026-02-30" })], summary(), { taxYear: 2026 })).toThrow(/date/);
    expect(() => calculateForm1099Q([form({ distributionDate: "2025-12-31" })], summary(), { taxYear: 2026 })).toThrow(/year/);
  });
  it("Form1099Q carries actual Coverdell rollover basis without inventing zero", () => {
    const source = form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, distributionDate: "2026-05-01", grossDistribution: "1000", earnings: undefined, basis: undefined,
      transfer: { kind: "coverdell", amount: "500", receivedDate: "2026-05-02", sameBeneficiary: true, eligibleFamilyMember: false,
        priorRolloverWithin12Months: false, destinationBeneficiaryAge: 20, destinationSpecialNeeds: false, coverdellTransferredBasis: "400" } });
    const data = summary({ allocations: [], coverdellAccounts: [{ accountId: "account1", priorYearBasis: "800", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0" }] });
    const result = calculateForm1099Q([source], data, { taxYear: 2026 });
    expect(result.totalBasis.toString()).toBe("800");
    expect(result.totalEarnings.toString()).toBe("200");
    expect(result.taxableEarnings.toString()).toBe("100");
    expect(result.perDistribution[0]?.transferExcludedEarnings.toString()).toBe("100");
    expect(result.perDistribution[0]?.educationExpenseExcludedEarnings.toString()).toBe("0");
    expect(result.coverdellAccounts[0]?.endingBasis.toString()).toBe("0");
    expect(() => calculateForm1099Q([{ ...source, transfer: { ...required(source.transfer), coverdellTransferredBasis: undefined } }], data, { taxYear: 2026 })).toThrow(/basis/);
    expect(() => calculateForm1099Q([source], summary({ ...data.sourceFacts, coverdellAccounts: [{ ...required(required(required(data.sourceFacts).coverdellAccounts)[0]), rolloverBasisReceived: undefined }] }), { taxYear: 2026 })).toThrow(/basis/);
  });

  it("Form1099Q treats a Coverdell QTP contribution as an actual linked expense", () => {
    const source = form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, isTrusteeToTrustee: true, distributionDate: "2026-05-01", grossDistribution: "1000", earnings: undefined, basis: undefined,
      transfer: { kind: "qtp", amount: "1000", receivedDate: "2026-05-01", sameBeneficiary: true, eligibleFamilyMember: false, destinationAccountId: "new-qtp" } });
    const data = summary({ expenses: [expense({ category: "qtp_contribution", amount: "1000", paidDate: "2026-05-01", destinationAccountId: "new-qtp" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "1000", creditAmount: "0" }],
      coverdellAccounts: [{ accountId: "account1", priorYearBasis: "800", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0" }] });
    const result = calculateForm1099Q([source], data, { taxYear: 2026 });
    expect(result.trusteeToTrusteeTransfers.toString()).toBe("0");
    expect(result.taxableEarnings.toString()).toBe("0");
    expect(result.perDistribution[0]?.educationExpenseExcludedEarnings.toString()).toBe("200");
    expect(() => calculateForm1099Q([source], summary({ ...data.sourceFacts, expenses: [expense({ category: "qtp_contribution", amount: "1000", paidDate: "2026-05-01", destinationAccountId: "wrong" })] }), { taxYear: 2026 })).toThrow(/contribution.*source|source.*contribution/);
  });
  it("Form1099Q enforces known source conditions and preserves explicit ineligibility", () => {
    for (const changes of [{ sourceFactsConfirmed: false }, { sourceFactsComplete: false }, { recipientOwner: "other" }, { recipientNotBeneficiary: undefined }, { transfer: { kind: "none" }, isTrusteeToTrustee: true }]) {
      expect(() => calculateForm1099Q([form(changes)], summary(), { taxYear: 2026 })).toThrow();
    }
    for (const changes of [{ beneficiaries: undefined }, { expenses: undefined }, { allocations: undefined }, { loanBorrowers: undefined }, { coverdellAccounts: undefined }, { penaltyExceptions: undefined }, { taxYear: 2025 }, { allDistributionsReconciled: false }]) {
      expect(() => calculateForm1099Q([form()], summary(changes), { taxYear: 2026 })).toThrow();
    }
    for (const changes of [{ category: "k12_tutoring", tutorUnrelated: false, tutoringOutsideHome: true, tutorQualified: true }, { category: "k12_disability_therapy", studentHasDisability: false, providerLicensedOrAccredited: true }, { category: "credential_enrollment", credentialRecognized: false, requiredForCredential: true }, { category: "coverdell_k12_other" }]) {
      expect(calculateForm1099Q([form()], summary({ expenses: [expense(changes)] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("2000");
    }
    expect(() => calculateForm1099Q([form({ earnings: "-100", basis: "10100" })], summary(), { taxYear: 2026 })).toThrow(/final/);
    expect(calculateForm1099Q([form({ earnings: "-100", basis: "10100", finalDistribution: true })], summary(), { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
    expect(() => calculateForm1099Q([form({ distributionCode: "6" })], summary(), { taxYear: 2026 })).toThrow(/reconciliation/);
  });

  it("Form1099Q applies actual death disability and refunded-expense sources", () => {
    const source = form({ distributionDate: "2026-05-01" });
    const death = { id: "death1", sourceId: "q1", kind: "death", distributionAmount: "10000", qualifyingAmount: "10000", eligibilityConfirmed: true, eventDate: "2026-04-30", paidToBeneficiaryOrEstate: true };
    expect(calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [death] }), { taxYear: 2026 }).netPenalty.toString()).toBe("0");
    expect(calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [{ ...death, paidToBeneficiaryOrEstate: false }] }), { taxYear: 2026 }).netPenalty.toString()).toBe("200");
    expect(calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [{ ...death, eventDate: "2026-05-02" }] }), { taxYear: 2026 }).netPenalty.toString()).toBe("200");
    expect(calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [{ ...death, kind: "disability" }] }), { taxYear: 2026 }).netPenalty.toString()).toBe("0");
    expect(() => calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [{ ...death, qualifyingAmount: "9999" }] }), { taxYear: 2026 })).toThrow(/qualifying/);
    expect(() => calculateForm1099Q([source], summary({ allocations: [], penaltyExceptions: [{ ...death, sourceId: "missing" }] }), { taxYear: 2026 })).toThrow(/missing/);
    const refunded = form({ distributionDate: "2026-03-01", transfer: { kind: "refund_recontribution", amount: "10000", receivedDate: "2026-06-30", sameBeneficiary: true, eligibleFamilyMember: false, refundSourceId: "refund1", refundDate: "2026-05-01", refundedExpenseAmount: "3000" } });
    expect(calculateForm1099Q([refunded], summary({ allocations: [] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("1400");
    expect(calculateForm1099Q([{ ...refunded, transfer: { ...required(refunded.transfer), receivedDate: "2026-07-01" } }], summary({ allocations: [] }), { taxYear: 2026 }).taxableEarnings.toString()).toBe("2000");
  });

  it("Form1099Q reconciles actual education-credit students and exclusive exceptions", () => {
    const source = form();
    const data = summary({ expenses: [expense({ educationCreditAmount: "4000" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "6000", creditAmount: "4000" }] });
    const education = EducationExpensesSchema.parse({ aocStudents: [{ name: "Synthetic Student", studentTaxId: "111-22-3333", qualifiedExpenses: "4000", isFirstFourYears: true, isHalfTime: true, hasDrugFelonyConviction: false }], llcExpenses: "0" });
    expect(calculateForm1099Q([source], data, { taxYear: 2026, educationExpenses: education }).creditAllocations[0]?.amount.toString()).toBe("4000");
    expect(() => calculateForm1099Q([source], data, { taxYear: 2026, educationExpenses: { ...education, aocStudents: [{ ...required(education.aocStudents[0]), qualifiedExpenses: "3999" }] } })).toThrow(/exceeds/);
    const duplicate = { ...education, aocStudents: [required(education.aocStudents[0]), required(education.aocStudents[0])] };
    expect(() => calculateForm1099Q([source], data, { taxYear: 2026, educationExpenses: duplicate })).toThrow(/one actual/);
    const overlap = summary({ ...data.sourceFacts, penaltyExceptions: [{ id: "scholarship1", sourceId: "q1", kind: "scholarship", qualifyingAmount: "1000", distributionAmount: "1000", eligibilityConfirmed: true }] });
    expect(() => calculateForm1099Q([source], overlap, { taxYear: 2026 })).toThrow(/distinct/);
  });
  it("Form1099Q preserves refund capacity and validates actual transfer identities", () => {
    const transfer = { kind: "refund_recontribution", amount: "2000", receivedDate: "2026-06-01", sameBeneficiary: true, eligibleFamilyMember: false,
      refundSourceId: "refund1", refundDate: "2026-05-01", refundedExpenseAmount: "3000" };
    const first = form({ distributionDate: "2026-03-01", transfer });
    const second = form({ sourceId: "q2", accountId: "account2", distributionDate: "2026-04-01", transfer });
    expect(calculateForm1099Q([first, second], summary({ allocations: [] }), { taxYear: 2026 }).trusteeToTrusteeTransfers.toString()).toBe("3000");
    expect(() => calculateForm1099Q([{ ...first, transfer: { ...required(first.transfer), refundSourceId: undefined } }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/refund.*source/);
    const roth = form({ isQtpToRoth: true, recipientNotBeneficiary: true, distributionDate: "2026-05-01", transfer: { kind: "roth", amount: "1000", receivedDate: "2026-05-01", sameBeneficiary: true, eligibleFamilyMember: false } });
    expect(() => calculateForm1099Q([roth], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/Roth.*beneficiary/);
    const able = form({ distributionDate: "2026-05-01", transfer: { kind: "able", amount: "1000", receivedDate: "2026-05-02", sameBeneficiary: true, eligibleFamilyMember: false, destinationAccountEligible: true, otherAbleContributions: "0" } });
    expect(() => calculateForm1099Q([able], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/destination.*identity/);
    expect(() => calculateForm1099Q([{ ...able, transfer: { ...required(able.transfer), destinationAccountId: "able1", ableAnnualContributionLimit: "19000" } }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/statutory limit/);
    expect(() => calculateForm1099Q([{ ...able, transfer: { ...required(able.transfer), amount: "10001" } }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/exceeds gross/);
    expect(() => calculateForm1099Q([{ ...able, transfer: { ...required(able.transfer), receivedDate: "2026-04-30" } }], summary({ allocations: [] }), { taxYear: 2026 })).toThrow(/date order/);
  });
  it("Form1099Q reconciles zero accounts stated basis and LLC allocations", () => {
    const esa = form({ accountType: "coverdell_esa", recipientNotBeneficiary: false, grossDistribution: "0", earnings: undefined, basis: undefined });
    const history = { accountId: "account1", priorYearBasis: "0", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0" };
    const data = summary({ expenses: [], allocations: [], coverdellAccounts: [history] });
    expect(calculateForm1099Q([esa], data, { taxYear: 2026 }).taxableEarnings.toString()).toBe("0");
    expect(() => calculateForm1099Q([esa], summary({ expenses: [], allocations: [] }), { taxYear: 2026 })).toThrow(/history/);
    expect(() => calculateForm1099Q([{ ...esa, grossDistribution: "1000", earnings: "100", basis: "900" }], data, { taxYear: 2026 })).toThrow(/worksheet/);
    expect(() => calculateForm1099Q([{ ...esa, earnings: "0" }], data, { taxYear: 2026 })).toThrow(/jointly/);
    const llc = EducationExpensesSchema.parse({ aocStudents: [], llcExpenses: "6000", llcStudents: [{ name: "Synthetic Student", studentTaxId: "111223333", qualifiedExpenses: "6000" }] });
    const creditData = summary({ expenses: [expense({ educationCreditAmount: "6000" })], allocations: [{ expenseId: "e1", sourceId: "q1", amount: "4000", creditAmount: "6000" }] });
    expect(calculateForm1099Q([form()], creditData, { taxYear: 2026, educationExpenses: llc }).creditAllocations[0]?.amount.toString()).toBe("6000");
    const bothStudents = { ...llc, llcExpenses: "12000", llcStudents: [...required(llc.llcStudents), { name: "Second Student", studentTaxId: "222334444", qualifiedExpenses: "6000" }] };
    const bothData = summary({ beneficiaries: [{ id: "student1", studentTaxId: "111223333", outsideK12QualifiedDistributions: "0" }, { id: "student2", studentTaxId: "222334444", outsideK12QualifiedDistributions: "0" }],
      expenses: [expense({ educationCreditAmount: "6000" }), expense({ id: "e2", beneficiaryId: "student2", educationCreditAmount: "6000" })], allocations: [] });
    expect(() => calculateForm1099Q([form()], bothData, { taxYear: 2026, educationExpenses: bothStudents })).toThrow(/return.*10000/);
  });
});
