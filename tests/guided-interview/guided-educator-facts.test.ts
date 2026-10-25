// Spec: spec/federal/educator-expense-sources.yaml
import { expect, it } from "vitest";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildSectionRoute, emptyAdjustmentData, updateSectionData, validateSection } from "@/lib/guided-interview-flow";
import { buildEducatorSources, emptyEducatorSource, type EducatorSourceData } from "@/lib/guided-educator-facts";
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses";
import { TaxYearInputSchema } from "@/models/inputs";
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
