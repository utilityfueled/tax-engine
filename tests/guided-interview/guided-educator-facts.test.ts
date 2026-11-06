// Spec: spec/federal/educator-expense-sources.yaml
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildSectionRoute, emptyAdjustmentData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildEducatorSources, emptyEducatorSource, type EducatorSourceData } from "@/lib/guided-educator-facts";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { AdjustmentsSchema, TaxYearInputSchema } from "@/models/inputs";
import { startCompleteInterview } from "./complete-facts";

export const actualEducator: EducatorSourceData = { ...emptyEducatorSource, accountHolder: "primary", taxYear: "2025", schoolYear: "2024-2025", sourceFactsConfirmed: true,
  schools: [{ name: "Actual school", role: "teacher", schoolEligible: true, hoursWorked: "900" }],
  expenses: [{ sourceId: "receipt-1", datePaid: "2025-03-01", description: "Classroom supplies", category: "classroom", amount: "300.03", ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false }],
  reimbursementsNotInWages: "0", excludedSavingsBondInterest: "0", nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0" };
function stateWith(sources?: EducatorSourceData[], legacy = "") {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: null });
  return { ...state, sectionData: { ...state.sectionData, adjustments: { ...emptyAdjustmentData, educatorExpenses: legacy, educatorExpenseSources: sources } } };
}

it("forwards actual educator facts and blocks an unexplained legacy aggregate", () => {
  for (const invalid of ["-1", "NaN", "Infinity"]) expect(() => buildEducatorSources(undefined, "single", 2025, invalid)).toThrow();
  expect(buildTaxInputFromGuidedData(stateWith(undefined, "300"))).toBeNull();
  expect(validateSection(stateWith(undefined, "300"), "adjustments").status).toBe("partial");
  const result = buildTaxInputFromGuidedData(stateWith([actualEducator]));
  expect(result?.adjustments?.educatorExpenseSources?.[0]).toMatchObject({ accountHolder: "primary", taxYear: 2025, expenses: [{ amount: "300.03", deductedElsewhere: false }], reimbursementsNotInWages: "0" });
  expect(result?.adjustments).not.toHaveProperty("primaryEducatorExpenses");
  expect(calculateEducatorExpensesDeduction(TaxYearInputSchema.parse(result).adjustments, "single", 2025).amount.toString()).toBe("300");
  expect(validateSection(stateWith([actualEducator]), "adjustments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(stateWith([actualEducator], "300.03"))).not.toBeNull();
  expect(buildTaxInputFromGuidedData(stateWith([actualEducator], "300"))).toBeNull();
});

it("opens the actual educator route and requires its source facts", () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["educator-expenses"], stateCode: null });
  expect(buildSectionRoute(state.segmentation).some(section => section.id === "adjustments")).toBe(true);
  expect(validateSection(state, "adjustments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  state.sectionData.adjustments = { ...emptyAdjustmentData, educatorExpenseSources: [actualEducator] };
  expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
});

it("preserves the actual school level and leaves missing 2026 classification unknown", () => {
  const source: EducatorSourceData = { ...actualEducator, taxYear: "2026", schoolYear: "2025-2026",
    expenses: actualEducator.expenses.map(expense => ({ ...expense, datePaid: "2026-03-01" })),
    schools: actualEducator.schools.map(school => ({ ...school, level: "k12" as const })) };
  expect(buildEducatorSources([source], "single", 2026)?.[0]?.schools?.[0]?.level).toBe("k12");
  expect(() => buildEducatorSources([{ ...source, schools: actualEducator.schools }], "single", 2026)).toThrow(/actual school level/i);
  const other = buildEducatorSources([{ ...source, schools: source.schools.map(school => ({ ...school, level: "other" as const })) }], "single", 2026);
  expect(other?.[0]?.schools?.[0]?.level).toBe("other");
  expect(calculateEducatorExpensesDeduction(AdjustmentsSchema.parse({ educatorExpenseSources: other }), "single", 2026).amount.toString()).toBe("0");
});

it("preserves zero false large amounts and incomplete saved source records", () => {
  const data = { ...actualEducator, expenses: [{ ...actualEducator.expenses[0]!, amount: "9007199254740993.01", qualifyingUse: false }] };
  expect(buildEducatorSources([data], "single", 2025)?.[0]?.expenses?.[0]?.amount).toBe("9007199254740993.01");
  const result = buildTaxInputFromGuidedData(stateWith([data]));
  expect(calculateEducatorExpensesDeduction(TaxYearInputSchema.parse(result).adjustments, "single", 2025).amount.toString()).toBe("0");
  expect(buildTaxInputFromGuidedData(stateWith([{ ...actualEducator, reimbursementsNotInWages: "" }]))).toBeNull();
  expect(buildTaxInputFromGuidedData(stateWith([{ ...actualEducator, schoolYear: "2023-2024" }]))).toBeNull();
  expect(buildTaxInputFromGuidedData(stateWith([{ ...actualEducator, accountHolder: "spouse" }]))).toBeNull();
  expect(buildTaxInputFromGuidedData(stateWith([{ ...actualEducator, expenses: undefined } as unknown as EducatorSourceData]))).toBeNull();
  const state = stateWith([actualEducator]);
  const changed = updateSectionData(state, "credits", { ...state.sectionData.credits, educationDistributions: { taxYear: "2025", forms: [] } });
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.educatorExpenseSources?.[0]?.expenses?.[0]?.amount).toBe("300.03");
});

it("collects actual early childhood qualification and keeps the effective year distinct", () => {
  const source: EducatorSourceData = { ...actualEducator, taxYear: "2026", schoolYear: "2025-2026",
    schools: [{ ...actualEducator.schools[0]!, level: "early_childhood", earlyChildhoodNonresidentChildrenUnder6: "3", operatedAtPublicExpense: false, receivesFeePaymentOrGrant: true }],
    expenses: [{ ...actualEducator.expenses[0]!, datePaid: "2026-03-01", amount: "1000.03" }] };
  const calculate = (data: EducatorSourceData, year = 2026) => calculateEducatorExpensesDeduction(AdjustmentsSchema.parse({ educatorExpenseSources: buildEducatorSources([data], "single", year) }), "single", year);
  const result = calculate(source);
  expect(result.amount.toString()).toBe("350"); expect(result.itemizedDeduction?.toString()).toBe("650.03");
  expect(buildEducatorSources([source], "single", 2026)?.[0]?.schools?.[0]).toMatchObject({ level: "early_childhood", earlyChildhoodNonresidentChildrenUnder6: 3, operatedAtPublicExpense: false, receivesFeePaymentOrGrant: true });
  for (const count of ["0", "2"]) expect(calculate({ ...source, schools: [{ ...source.schools[0]!, earlyChildhoodNonresidentChildrenUnder6: count }] }).amount.toString()).toBe("0");
  expect(calculate({ ...source, schools: [{ ...source.schools[0]!, receivesFeePaymentOrGrant: false }] }).amount.toString()).toBe("0");
  for (const count of ["", "-1", "2.5", "9007199254740993"]) expect(() => calculate({ ...source, schools: [{ ...source.schools[0]!, earlyChildhoodNonresidentChildrenUnder6: count }] })).toThrow();
  expect(() => calculate({ ...source, schools: [{ ...source.schools[0]!, operatedAtPublicExpense: null }] })).toThrow(/funding facts/i);
  const prior = { ...source, taxYear: "2025", schoolYear: "2024-2025", expenses: [{ ...source.expenses[0]!, datePaid: "2025-03-01" }] };
  expect(calculate(prior, 2025).amount.toString()).toBe("0");
});

it("requires actual broader use and receipt funding before completing itemized educator facts", () => {
  const source: EducatorSourceData = { ...actualEducator, taxYear: "2026", schoolYear: "2025-2026",
    schools: [{ ...actualEducator.schools[0]!, level: "k12", role: "coach" }],
    expenses: [{ ...actualEducator.expenses[0]!, datePaid: "2026-03-01", amount: "1000.03", qualifyingUse: false, instructionalActivity: true, itemizedReimbursements: "100.01", itemizedTaxFreeFunding: "200.02" }] };
  const calculate = (data: EducatorSourceData) => calculateEducatorExpensesDeduction(AdjustmentsSchema.parse({ educatorExpenseSources: buildEducatorSources([data], "single", 2026) }), "single", 2026);
  expect(calculate(source).amount.toString()).toBe("0"); expect(calculate(source).itemizedDeduction?.toString()).toBe("700");
  expect(() => calculate({ ...source, expenses: [{ ...source.expenses[0]!, instructionalActivity: null }] })).toThrow(/itemized.*facts|instructional/i);
  for (const value of ["", "-1", "NaN"]) expect(() => calculate({ ...source, expenses: [{ ...source.expenses[0]!, itemizedTaxFreeFunding: value }] })).toThrow();
  expect(() => calculate({ ...source, expenses: [{ ...source.expenses[0]!, itemizedTaxFreeFunding: "1000.03" }] })).toThrow(/funding exceeds/i);
  const zero = { ...source, expenses: [{ ...source.expenses[0]!, amount: "9007199254740993.01", itemizedReimbursements: "0", itemizedTaxFreeFunding: "0" }] };
  expect(calculate(zero).itemizedDeduction?.toString()).toBe("9007199254740993.01");
  expect(calculate({ ...source, expenses: [{ ...source.expenses[0]!, instructionalActivity: false }] }).itemizedDeduction?.toString()).toBe("0");
  const administrator = { ...source, schools: [{ ...source.schools[0]!, role: "interscholastic_sports_administrator" as const }] };
  expect(calculate(administrator).amount.toString()).toBe("0"); expect(calculate(administrator).itemizedDeduction?.toString()).toBe("700");
});
