/** Spec: spec/federal/form-1099-q-disqualification.yaml. January1 deemed-distribution source cases. */
import { expect, it } from "vitest";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { EducationExpensesSchema } from "@/models/inputs.js";
import { disqualifiedEducationSource as source, disqualifiedEducationSummary as summary } from "../../fixtures/education-disqualification-source.js";
const calculate = (changes: Record<string, unknown> = {}) => calculateForm1099Q([source(changes)], summary(), { taxYear: 2026 });

it("rejects missing or conflicting disqualification boundaries", () => {
  for (const [changes, error] of [
    [{ prohibitedTransactionQualifiedEducationExpenses: undefined }, /actual.*qualified education expenses/i],
    [{ prohibitedTransactionQualifiedEducationExpenses: "1" }, /actual zero qualified education expenses/i],
    [{ prohibitedTransactionNoPostDisqualificationActivityConfirmed: undefined }, /subsequent income.*gain.*loss/i],
    [{ prohibitedTransactionNoPostDisqualificationActivityConfirmed: false }, /subsequent income.*gain.*loss/i],
    [{ prohibitedTransactionPostDisqualificationSourceReference: undefined }, /subsequent.*source reference/i],
    [{ prohibitedTransactionPostDisqualificationSourceReference: " " }, /subsequent.*source reference/i],
    [{ prohibitedTransactionJanuary1Value: "999" }, /Box1.*January1/i],
    [{ earnings: "301", basis: "699" }, /reported.*basis.*earnings/i],
  ] as const) expect(() => calculate(changes)).toThrow(error);
  expect(() => calculateForm1099Q([source(), source({ sourceId: "second-statement" })], summary(), { taxYear: 2026 })).toThrow(/terminated account.*other statement/i);
});

it("calculates the source-bounded whole-account deemed distribution", () => {
  const result = calculate();
  expect(result.sourceFactsVerified).toBe(true);
  expect(result.totalBasis.toFixed()).toBe("700");
  expect(result.totalEarnings.toFixed()).toBe("300");
  expect(result.taxableEarnings.toFixed()).toBe("300");
  expect(result.netPenalty.toFixed()).toBe("30");
  expect(result.taxFreeEarnings.isZero()).toBe(true);
  expect(result.coverdellAccounts).toEqual([]);
  expect(result.perDistribution[0]).toMatchObject({ treatment: "account_disqualification", incomeTaxYear: 2026 });
  const audit = result.lines.find(line => line.form === "Coverdell disqualification" && line.line === "terminated-esa:deemed-distribution");
  expect(audit?.value.toFixed()).toBe("1000");
  expect(audit?.inputs).toMatchObject({ "Deemed distribution date": "2026-01-01" });
  expect(result.lines.some(line => line.form === "Pub970 WS6-3")).toBe(false);
});

it("retains actual recipient ownership and exact taxable rounding", () => {
  for (const [gross, earnings, taxable] of [["1000.49", "300.49", "300"], ["1000.50", "300.50", "301"]]) {
    const result = calculate({ grossDistribution: gross, earnings, prohibitedTransactionJanuary1Value: gross, recipientOwner: "other", recipientId: "actual-beneficiary" });
    expect(result.grossDistribution.eq(gross)).toBe(true);
    expect(result.totalEarnings.eq(earnings)).toBe(true);
    expect(result.perRecipient[0]).toMatchObject({ owner: "other", recipientId: "actual-beneficiary" });
    expect(result.perRecipient[0]?.taxableEarnings.toFixed()).toBe(taxable);
    expect(result.perRecipient[0]?.additionalTax.toFixed()).toBe("30");
    expect(result.taxableEarnings.isZero()).toBe(true);
    expect(result.netPenalty.isZero()).toBe(true);
  }
});

it("keeps unresolved disqualification and pledged-account methods blocked", () => {
  expect(() => calculate({ prohibitedTransactionKind: "pledged_portion", prohibitedTransactionPledgedAmount: "1000" })).toThrow(/pledged portion.*unresolved/i);
  expect(() => calculate({ prohibitedTransactionBasis: "1001" })).toThrow(/basis.*exceeds.*value/i);
  const expense = { id: "tuition", beneficiaryId: "student", category: "postsecondary_tuition", paidDate: "2026-08-01", amount: "100", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true };
  expect(() => calculateForm1099Q([source()], summary({ expenses: [expense] }), { taxYear: 2026 })).toThrow(/disqualification.*education.*unresolved/i);
  expect(() => calculateForm1099Q([source()], summary({ expenses: [{ ...expense, category: "qtp_contribution", destinationAccountId: "qtp-account" }] }), { taxYear: 2026 })).toThrow(/disqualification.*education.*unresolved/i);
  expect(() => calculateForm1099Q([source()], summary({ beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "100" }] }), { taxYear: 2026 })).toThrow(/disqualification.*education.*unresolved/i);
  expect(() => calculateForm1099Q([source()], summary({ allocations: [{ expenseId: "missing", sourceId: "terminated-esa", amount: "1", creditAmount: "0" }] }), { taxYear: 2026 })).toThrow(/disqualification.*education.*unresolved/i);
  expect(() => calculateForm1099Q([source()], summary({ penaltyExceptions: [{ id: "exception", sourceId: "terminated-esa", kind: "disability", distributionAmount: "1000", qualifyingAmount: "1000", eligibilityConfirmed: true }] }), { taxYear: 2026 })).toThrow(/disqualification.*additional-tax exception.*unresolved/i);
});

it("rejects unresolved credit-student identities without blocking known other beneficiaries", () => {
  const facts = summary({ beneficiaries: [{ id: "student", studentTaxId: "123-45-6789", outsideK12QualifiedDistributions: "0" }] });
  for (const kind of ["aocStudents", "llcStudents"] as const) {
    const education = EducationExpensesSchema.parse({ [kind]: [{ name: "Actual credit student", qualifiedExpenses: "100" }] });
    for (const studentTaxId of [undefined, "invalid", "123456789"]) {
      const options = { taxYear: 2026, educationExpenses: { ...education, [kind]: education[kind]?.map(student => ({ ...student, studentTaxId })) } };
      expect(() => calculateForm1099Q([source()], facts, options)).toThrow(/disqualification.*education-credit.*conflict/i);
    }
    const options = { taxYear: 2026, educationExpenses: { ...education, [kind]: education[kind]?.map(student => ({ ...student, studentTaxId: "222334444" })) } };
    expect(calculateForm1099Q([source()], facts, options).taxableEarnings.toFixed()).toBe("300");
  }
  expect(() => calculateForm1099Q([source()], facts, { taxYear: 2026, educationExpenses: EducationExpensesSchema.parse({ llcExpenses: "100" }) })).toThrow(/disqualification.*education-credit.*conflict/i);
});
