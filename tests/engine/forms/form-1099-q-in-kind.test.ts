// Spec: spec/federal/form-1099-q-in-kind.yaml. Actual synthetic source records.
import { describe, expect, it } from "vitest";
import { Form1099QSchema, QualifiedEducationExpenseSummarySchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";

const source = (changes: Record<string, unknown> = {}) => Form1099QSchema.parse({
  sourceId: "prepaid", accountId: "prepaid-account", beneficiaryId: "student", recipientOwner: "primary",
  taxYear: 2026, accountType: "529", grossDistribution: "4000", earnings: "800", basis: "3200",
  distributionMedium: "in_kind_prepaid_tuition", isTrusteeToTrustee: false, isQtpToRoth: false,
  recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" }, ...changes,
});
const expense = (changes: Record<string, unknown> = {}) => ({
  id: "tuition", beneficiaryId: "student", category: "postsecondary_tuition", paidDate: "2026-08-15",
  amount: "10000", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0",
  otherTaxBenefitAmount: "0", qualificationConfirmed: true, ...changes,
});
const benefit = (changes: Record<string, unknown> = {}) => ({
  id: "benefit1", sourceId: "prepaid", expenseId: "tuition", amount: "4000", providedDate: "2026-08-15",
  qualificationConfirmed: true, sourceReference: "actual-prepaid-account-application", ...changes,
});
const summary = (changes: Record<string, unknown> = {}) => QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
  taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
  beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "0" }], expenses: [expense()],
  allocations: [{ sourceId: "prepaid", expenseId: "tuition", amount: "4000", creditAmount: "0" }],
  inKindBenefits: [benefit()], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [], ...changes,
} });

describe("actual in-kind QTP benefit sources", () => {
  it("preserves actual in-kind source records and rejects missing benefit evidence", () => {
    expect(summary().sourceFacts).toMatchObject({ inKindBenefits: [benefit()] });
    expect(summary({ inKindBenefits: undefined }).sourceFacts?.inKindBenefits).toBeUndefined();
    for (const inKindBenefits of [undefined, []]) expect(() => calculateForm1099Q([source()], summary({ inKindBenefits }), { taxYear: 2026 })).toThrow(/in-kind.*benefit|benefit.*Box1/i);
    expect(() => calculateForm1099Q([source()], summary({ inKindBenefits: [benefit({ qualificationConfirmed: undefined })] }), { taxYear: 2026 })).toThrow(/actual|qualification/i);
  });
  it("excludes actual qualified benefits before cash uses the remaining expense", () => {
    // Actual tuition10,000:4,000 benefit +6,000 remaining cash QEE.
    // Cash8,000 with earnings1,600 excludes1,200 earnings; taxable400.
    const forms = [source(), source({ sourceId: "cash", accountId: "cash-account", distributionMedium: "cash", grossDistribution: "8000", earnings: "1600", basis: "6400", recipientNotBeneficiary: true })];
    const result = calculateForm1099Q(forms, summary({ allocations: [
      { sourceId: "prepaid", expenseId: "tuition", amount: "4000", creditAmount: "0" },
      { sourceId: "cash", expenseId: "tuition", amount: "6000", creditAmount: "0" },
    ] }), { taxYear: 2026 });
    expect(result.taxableEarnings.toFixed()).toBe("400");
    expect(result.taxFreeEarnings.toFixed()).toBe("2000");
    expect(result.perDistribution[0]?.taxableEarnings.toFixed()).toBe("0");
    expect(result.lines.find(line => line.line === "prepaid:in-kind-provided")?.value.toFixed()).toBe("4000");
    expect(result.lines.find(line => line.line === "tuition:after-in-kind")?.value.toFixed()).toBe("6000");
    const exact = calculateForm1099Q([source({ grossDistribution: "4000.01", basis: "3200.01" })], summary({
      inKindBenefits: [benefit({ amount: "4000.01" })], allocations: [{ sourceId: "prepaid", expenseId: "tuition", amount: "4000.01", creditAmount: "0" }],
    }), { taxYear: 2026 });
    expect(exact.lines.find(line => line.line === "prepaid:in-kind-provided")?.value.toFixed()).toBe("4000.01");
    expect(exact.taxableEarnings.toFixed()).toBe("0");
  });
  it("rejects mismatched benefit identity dates amounts and recipient facts", () => {
    for (const changes of [
      { sourceId: "missing" }, { expenseId: "missing" }, { amount: "3999.99" }, { amount: "-1" },
      { providedDate: "2025-08-15" }, { providedDate: "2026-02-30" }, { sourceReference: "" },
    ]) expect(() => calculateForm1099Q([source()], summary({ inKindBenefits: [benefit(changes)] }), { taxYear: 2026 })).toThrow(/benefit|in-kind|source|date|amount/i);
    expect(() => calculateForm1099Q([source()], summary({ inKindBenefits: [benefit(), benefit()] }), { taxYear: 2026 })).toThrow(/duplicate/i);
    for (const changes of [
      { distributionMedium: "cash" }, { recipientNotBeneficiary: true }, { isTrusteeToTrustee: true },
      { transfer: { kind: "qtp" } }, { accountType: "coverdell_esa" },
    ]) expect(() => calculateForm1099Q([source(changes)], summary(), { taxYear: 2026 })).toThrow(/in-kind|benefit/i);
    expect(() => calculateForm1099Q([source()], summary({ beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "0" }, { id: "other", outsideK12QualifiedDistributions: "0" }], expenses: [expense({ beneficiaryId: "other" })], allocations: [] }), { taxYear: 2026 })).toThrow(/beneficiary/i);
  });
  it("conserves multiple provided benefits and actual Coverdell expenses", () => {
    const esa = source({ sourceId: "esa", accountId: "esa-account", accountType: "coverdell_esa", distributionMedium: undefined, grossDistribution: "6000", earnings: "1200", basis: "4800", distributionDate: "2026-08-15" });
    const facts = {
      inKindBenefits: [benefit({ amount: "1500.25" }), benefit({ id: "benefit2", amount: "2499.75", sourceReference: "second-actual-plan-payment" })],
      allocations: [
        { sourceId: "prepaid", expenseId: "tuition", amount: "4000", creditAmount: "0" },
        { sourceId: "esa", expenseId: "tuition", amount: "6000", creditAmount: "0" },
      ],
      coverdellAccounts: [{ accountId: "esa-account", priorYearBasis: "4800", currentYearContributions: "0", yearEndValue: "0", outstandingRollovers: "0", rolloverBasisReceived: "0" }],
    };
    const result = calculateForm1099Q([source(), esa], summary(facts), { taxYear: 2026 });
    expect(result.perDistribution.map(row => row.educationExpenseExcludedEarnings.toFixed())).toEqual(["800", "1200"]);
    expect(result.taxableEarnings.toFixed()).toBe("0");
    expect(result.lines.find(line => line.line === "tuition:after-in-kind")?.value.toFixed()).toBe("6000");
    expect(() => calculateForm1099Q([source(), esa], summary({ ...facts, allocations: facts.allocations.map(row => row.sourceId === "esa" ? { ...row, amount: "6000.01" } : row) }), { taxYear: 2026 })).toThrow(/available expense/i);
    const zero = source({ grossDistribution: "0", earnings: "0", basis: "0" });
    expect(calculateForm1099Q([zero], summary({ expenses: [], inKindBenefits: [], allocations: [] }), { taxYear: 2026 }).taxableEarnings.toFixed()).toBe("0");
    expect(() => calculateForm1099Q([zero], summary({ expenses: [], inKindBenefits: undefined, allocations: [] }), { taxYear: 2026 })).toThrow(/actual in-kind benefit source/i);
  });
  it("rejects omitted or partial benefit allocations instead of reallocating expenses", () => {
    const cash = source({ sourceId: "cash", accountId: "cash", distributionMedium: "cash", grossDistribution: "10000", earnings: "2000", basis: "8000" });
    expect(() => calculateForm1099Q([source(), cash], summary({ allocations: [{ sourceId: "cash", expenseId: "tuition", amount: "10000", creditAmount: "0" }] }), { taxYear: 2026 })).toThrow(/in-kind.*allocation|benefit.*allocation/i);
    for (const changes of [{ amount: "3999.99" }, { amount: "4000.01" }, { creditAmount: "1" }]) {
      expect(() => calculateForm1099Q([source()], summary({ expenses: [expense({ educationCreditAmount: "1" })], allocations: [{ sourceId: "prepaid", expenseId: "tuition", amount: "4000", creditAmount: "0", ...changes }] }), { taxYear: 2026 })).toThrow(/in-kind.*allocation|benefit.*allocation/i);
    }
  });
  it("preserves known ineligible benefits and blocks unsupported partial exclusions", () => {
    const knownFalse = summary({ expenses: [expense({ qualificationConfirmed: false })], inKindBenefits: [benefit({ qualificationConfirmed: false })] });
    expect(calculateForm1099Q([source()], knownFalse, { taxYear: 2026 }).taxableEarnings.toFixed()).toBe("800");
    expect(() => calculateForm1099Q([source()], summary({ inKindBenefits: [benefit({ qualificationConfirmed: false })] }), { taxYear: 2026 })).toThrow(/qualification|eligibility/i);
    const limited = summary({ expenses: [expense({ category: "postsecondary_room_board", halfTimeStudent: true, roomBoardAllowance: "3000", schoolOwnedHousingCharge: "0" })] });
    const capped = calculateForm1099Q([source()], limited, { taxYear: 2026 });
    expect(capped.adjustedQEE.toFixed()).toBe("3000");
    expect(capped.taxableEarnings.toFixed()).toBe("200");
    expect(capped.netPenalty.toFixed()).toBe("20");
    const otherPartial = summary({ expenses: [expense({ category: "k12_tuition" })], beneficiaries: [{ id: "student", outsideK12QualifiedDistributions: "19000" }] });
    expect(() => calculateForm1099Q([source()], otherPartial, { taxYear: 2026 })).toThrow(/partial.*in-kind|in-kind.*partial/i);
  });
});
