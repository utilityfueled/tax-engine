// Spec: spec/federal/guided-education-distributions.yaml
import { describe, expect, it } from "vitest";
import { buildEducationDistributionInputs, educationDistributionFactErrors, type EducationDistributionData } from "@/lib/guided-education-distributions";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { startCompleteInterview, completeEducationClaimant, completeAocEligibility } from "./complete-facts";
import { inKindCreditFixture } from "../fixtures/education-in-kind-credit.js";

export function actualEducationDistribution(): EducationDistributionData {
  return {
    taxYear: "2025", sourceFactsConfirmed: true, allDistributionsReconciled: true,
    forms: [{ fields: { sourceId: "q1", accountId: "college-fund", beneficiaryId: "student1", recipientOwner: "primary", taxYear: "2025", payerName: "Actual synthetic plan", accountType: "529", grossDistribution: "4000", earnings: "800", basis: "3200", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: true, sourceFactsConfirmed: true }, transfer: { kind: "none" } }],
    beneficiaries: [{ id: "student1", name: "Synthetic Student", outsideK12QualifiedDistributions: "0" }],
    expenses: [{ id: "e1", beneficiaryId: "student1", category: "postsecondary_tuition", paidDate: "2025-08-15", amount: "4000", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true }],
    allocations: [{ expenseId: "e1", sourceId: "q1", amount: "4000", creditAmount: "0" }],
    loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
  };
}

describe("actual guided education distributions", () => {
  it("preserves unknown distribution sources and exact entered amounts", () => {
    expect(buildEducationDistributionInputs(undefined, 2025, "single")).toEqual({});
    expect(Object.keys(educationDistributionFactErrors({ taxYear: "2025" }, 2025, "single")).length).toBeGreaterThan(0);
    const data = actualEducationDistribution();
    const first = data.forms?.[0]; if (!first) throw new Error("Missing synthetic source");
    first.fields.grossDistribution = "9,007,199,254,740,993.03"; first.fields.earnings = "0.02"; first.fields.basis = "9007199254740993.01";
    const input = buildEducationDistributionInputs(data, 2025, "single");
    expect(input.form1099Q?.[0]?.grossDistribution).toBe("9007199254740993.03");
    first.fields.earnings = "";
    expect(Object.keys(educationDistributionFactErrors(data, 2025, "single")).length).toBeGreaterThan(0);
    expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow();
  });
  it("forwards actual education distributions and validates the linked source ledger", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    state.sectionData.credits = { ...emptyCreditsData, ...state.sectionData.credits, educationDistributions: actualEducationDistribution() };
    const result = buildTaxInputFromGuidedData(state);
    expect(result?.form1099Q?.[0]).toMatchObject({ sourceId: "q1", recipientOwner: "primary", grossDistribution: "4000" });
    expect(result?.qualifiedEducationExpenses?.sourceFacts?.allocations?.[0]).toMatchObject({ expenseId: "e1", sourceId: "q1", amount: "4000" });
    const data = actualEducationDistribution(); const allocation = data.allocations?.[0]; if (!allocation) throw new Error("Missing synthetic allocation");
    allocation.amount = "4001";
    expect(Object.keys(educationDistributionFactErrors(data, 2025, "single")).length).toBeGreaterThan(0);
    expect(Object.keys(educationDistributionFactErrors(actualEducationDistribution(), 2026, "single")).length).toBeGreaterThan(0);
  });
  it("rejects unlinked or excessive education credits during section validation", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    const distribution = actualEducationDistribution();
    const beneficiary = distribution.beneficiaries?.[0], expense = distribution.expenses?.[0], allocation = distribution.allocations?.[0];
    if (!beneficiary || !expense || !allocation) throw new Error("Missing actual synthetic sources");
    beneficiary.studentTaxId = "999887777"; expense.amount = "8000"; expense.educationCreditAmount = "4000"; allocation.creditAmount = "4000";
    state.sectionData.credits = { ...emptyCreditsData, education: { ...emptyCreditsData.education, ...completeEducationClaimant, aocStudents: [{ ...completeAocEligibility, name: "Actual Student", qualifiedExpenses: "4000", priorYearsClaimed: "0" }] }, educationDistributions: distribution };
    expect(validateSection(state, "credits").fieldErrors?.educationDistributions).toMatch(/actual education-credit student/);
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    beneficiary.studentTaxId = "111223333"; expense.educationCreditAmount = "4001"; expense.amount = "8001"; allocation.creditAmount = "4001";
    expect(validateSection(state, "credits").fieldErrors?.educationDistributions).toMatch(/exceeds actual linked/);
    expense.educationCreditAmount = "4000"; expense.amount = "8000"; allocation.creditAmount = "4000";
    expect(validateSection(state, "credits").status).toBe("complete");
    state.sectionData.credits.education = emptyCreditsData.education;
    expect(validateSection(state, "credits").fieldErrors?.educationDistributions).toMatch(/actual education-credit student/);
  });

  it("invalidates distribution confirmation when coordinated facts change", () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
    const credits = state.sectionData.credits ?? emptyCreditsData;
    state.sectionData.credits = { ...credits, educationDistributions: actualEducationDistribution() };
    const updated = updateSectionData(state, "credits", { ...state.sectionData.credits, education: { ...credits.education, llcExpenses: "1" } });
    expect(updated.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
    expect(updated.sectionData.credits?.educationDistributions?.forms?.[0]?.fields.grossDistribution).toBe("4000");
    expect(state.sectionData.credits.educationDistributions?.sourceFactsConfirmed).toBe(true);
    for (const section of ["personal-info", "adjustments"] as const) {
      const changed = updateSectionData(state, section, { ...state.sectionData[section], ...(section === "personal-info" ? { lastName: "Changed Source Name" } : { studentLoanInterest: "1" }) });
      expect(changed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBeNull();
      expect(changed.sectionData.credits?.educationDistributions?.allocations?.[0]?.amount).toBe("4000");
    }
    const confirmedOnly = updateSectionData(state, "adjustments", { ...state.sectionData.adjustments, sourceFactsConfirmed: true });
    expect(confirmedOnly.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
    const confirmed = updateSectionData(state, "credits", { ...state.sectionData.credits, educationDistributions: { ...actualEducationDistribution(), sourceFactsConfirmed: true } });
    expect(confirmed.sectionData.credits?.educationDistributions?.sourceFactsConfirmed).toBe(true);
  });
});

it("collects actual returned contribution years and signed source amounts", () => {
  const data = actualEducationDistribution();
  data.forms = [{ fields: { sourceId: "correction", accountId: "esa", beneficiaryId: "student1", recipientOwner: "primary", taxYear: "2026", accountType: "coverdell_esa", grossDistribution: "980", earnings: "0", basis: "980", isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, distributionCode: "3", distributionDate: "2026-05-31", sourceFactsConfirmed: true, returnedContributionId: "deposit", returnedContributionTaxYear: "2025", returnedContributionDate: "2025-11-01", returnedContributionOriginalAmount: "1,000", returnedContributionPrincipal: "1000", returnedContributionNetIncome: "-20", returnedContributionIncomePreviouslyReported: "0", returnedContributionNetIncomeConfirmed: true, returnedContributionBasisReconciled: true }, transfer: { kind: "none" } }];
  data.expenses = []; data.allocations = [];
  const result = buildEducationDistributionInputs(data, 2025, "single");
  expect(result.form1099Q?.[0]).toMatchObject({ taxYear: 2026, returnedContributionTaxYear: 2025, returnedContributionOriginalAmount: "1000", returnedContributionNetIncome: "-20" });
  data.forms[0].fields.returnedContributionNetIncomeConfirmed = undefined;
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/actual|net-income/i);
});

it("collects linked in-kind benefits without inventing source evidence", () => {
  const data = actualEducationDistribution();
  const statement = data.forms?.[0];
  if (!statement) throw new Error("Missing actual synthetic statement");
  statement.fields.distributionMedium = "in_kind_prepaid_tuition";
  statement.fields.recipientNotBeneficiary = false;
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/in-kind.*benefit/i);
  data.inKindBenefits = [{ id: "provided1", sourceId: "q1", expenseId: "e1", amount: "4,000.00", providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "actual-plan-tuition-application" }];
  const input = buildEducationDistributionInputs(data, 2025, "single");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]).toEqual({
    id: "provided1", sourceId: "q1", expenseId: "e1", amount: "4000", providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "actual-plan-tuition-application",
  });
  data.inKindBenefits[0].qualificationConfirmed = null;
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/actual.*qualification/i);
});

// Spec: spec/federal/form-1099-q-in-kind-credit.yaml.
it("preserves a source-bound in-kind tuition credit split", () => {
  const data = actualEducationDistribution(), statement = data.forms?.[0];
  const expense = data.expenses?.[0], allocation = data.allocations?.[0];
  if (!statement || !expense || !allocation) throw new Error("Missing actual source");
  statement.fields.distributionMedium = "in_kind_prepaid_tuition";
  statement.fields.recipientNotBeneficiary = false;
  expense.educationCreditAmount = "1000"; allocation.amount = "3000"; allocation.creditAmount = "1000";
  data.inKindBenefits = [{ id: "actual-benefit", sourceId: "q1", expenseId: "e1", amount: "4000",
    providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "Actual tuition benefit record" }];
  const creditInput = inKindCreditFixture(2025);
  if (!data.beneficiaries?.[0]) throw new Error("Missing beneficiary source");
  data.beneficiaries[0].studentTaxId = creditInput.taxpayer.primary.ssn;
  const before = JSON.stringify(data), input = buildEducationDistributionInputs(data, 2025, "single", creditInput.educationExpenses);
  expect(input.form1099Q?.[0]?.grossDistribution).toBe("4000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.allocations?.[0]).toMatchObject({ amount: "3000", creditAmount: "1000" });
  expect(input.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]?.amount).toBe("4000");
  expect(JSON.stringify(data)).toBe(before);
  data.inKindBenefits = undefined;
  expect(() => buildEducationDistributionInputs(data, 2025, "single", creditInput.educationExpenses)).toThrow(/actual.*in-kind|benefit/);
});

// Spec: spec/federal/form-1099-q-in-kind-room-board.yaml.
it("preserves actual school facts for a limited in-kind benefit", () => {
  const data = actualEducationDistribution(), statement = data.forms?.[0], expense = data.expenses?.[0];
  if (!statement || !expense) throw new Error("Missing source");
  statement.fields.distributionMedium = "in_kind_prepaid_tuition";
  statement.fields.recipientNotBeneficiary = false;
  expense.category = "postsecondary_room_board"; expense.halfTimeStudent = true;
  expense.roomBoardAllowance = "3000"; expense.schoolOwnedHousingCharge = "0";
  data.inKindBenefits = [{ id: "actual-benefit", sourceId: "q1", expenseId: "e1", amount: "4000",
    providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "Actual room-and-board benefit" }];
  const before = JSON.stringify(data), input = buildEducationDistributionInputs(data, 2025, "single");
  expect(input.form1099Q?.[0]?.grossDistribution).toBe("4000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]).toMatchObject({ halfTimeStudent: true, roomBoardAllowance: "3000", schoolOwnedHousingCharge: "0" });
  expect(input.qualifiedEducationExpenses?.sourceFacts?.allocations?.[0]?.amount).toBe("4000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]?.amount).toBe("4000");
  expect(JSON.stringify(data)).toBe(before);
  expense.schoolOwnedHousingCharge = "";
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/actual|housing|room|board/);
  expense.schoolOwnedHousingCharge = "0"; expense.halfTimeStudent = null;
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/actual|half-time/);
});

// Spec: spec/federal/form-1099-q-in-kind-assistance.yaml.
it("preserves actual assistance against a single prepaid tuition source", () => {
  const data = actualEducationDistribution(), statement = data.forms?.[0], expense = data.expenses?.[0], allocation = data.allocations?.[0];
  if (!statement || !expense || !allocation) throw new Error("Missing source");
  statement.fields.distributionMedium = "in_kind_prepaid_tuition"; statement.fields.recipientNotBeneficiary = false;
  expense.taxFreeAssistance = "1000"; allocation.amount = "3000";
  data.inKindBenefits = [{ id: "actual-benefit", sourceId: "q1", expenseId: "e1", amount: "4000",
    providedDate: "2025-08-15", qualificationConfirmed: true, sourceReference: "Actual prepaid tuition benefit" }];
  const before = JSON.stringify(data), input = buildEducationDistributionInputs(data, 2025, "single");
  expect(input.form1099Q?.[0]?.grossDistribution).toBe("4000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0]?.taxFreeAssistance).toBe("1000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.allocations?.[0]?.amount).toBe("3000");
  expect(input.qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]?.amount).toBe("4000");
  expect(JSON.stringify(data)).toBe(before);
  expense.taxFreeAssistance = "";
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/actual|assistance/);
  expense.taxFreeAssistance = "1000"; data.sourceFactsConfirmed = false;
  expect(() => buildEducationDistributionInputs(data, 2025, "single")).toThrow(/confirm|source/);
});
