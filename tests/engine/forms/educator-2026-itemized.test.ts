// Spec: spec/federal/educator-2026-itemized.yaml.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateEducatorExpensesDeduction } from "@/engine/forms/educator-expenses.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const expense = (change: Record<string, unknown> = {}) => ({
  sourceId: "receipt1", datePaid: "2026-03-01", description: "Actual instructional supplies", category: "classroom", amount: "1000",
  ordinaryAndNecessary: true, qualifyingUse: true, healthOrPhysicalEducation: false, athleticSupplies: false, deductedElsewhere: false,
  ...change,
});
const source = (change: Record<string, unknown> = {}) => ({
  accountHolder: "primary", taxYear: 2026, schoolYear: "2025-2026", sourceFactsConfirmed: true,
  schools: [{ name: "Synthetic school", role: "teacher", level: "k12", schoolEligible: true, hoursWorked: "900" }],
  expenses: [expense()], reimbursementsNotInWages: "0", excludedSavingsBondInterest: "0",
  nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0", ...change,
});
function input(sources: unknown[], year = 2026) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year }, adjustments: { educatorExpenseSources: sources } });
}
function worksheet(sources: unknown[], year = 2026) {
  return calculateEducatorExpensesDeduction(input(sources, year).adjustments, "single", year);
}

describe("Actual2026 educator expansion", () => {
  it("uses actual early-childhood facility facts only for the enacted year", () => {
    const school = { name: "Synthetic childcare school", role: "teacher", level: "early_childhood", schoolEligible: true, hoursWorked: "900",
      earlyChildhoodNonresidentChildrenUnder6: 3, operatedAtPublicExpense: false, receivesFeePaymentOrGrant: true };
    expect(worksheet([source({ schools: [school] })]).amount.toString()).toBe("350");
    const historical = source({ taxYear: 2025, schoolYear: "2024-2025", schools: [school], expenses: [expense({ datePaid: "2025-03-01" })] });
    expect(worksheet([historical], 2025).amount.toString()).toBe("0");
    expect(worksheet([source({ schools: [{ ...school, earlyChildhoodNonresidentChildrenUnder6: 2 }] })]).amount.toString()).toBe("0");
    expect(worksheet([source({ schools: [{ ...school, receivesFeePaymentOrGrant: false }] })]).amount.toString()).toBe("0");
    expect(() => worksheet([source({ schools: [{ ...school, earlyChildhoodNonresidentChildrenUnder6: undefined }] })])).toThrow(/early.childhood|children/i);
    expect(() => worksheet([source({ schools: [{ name: "Unknown level", role: "teacher", schoolEligible: true, hoursWorked: "900" }] })])).toThrow(/level/i);
  });
  it("keeps coach and broader instructional expenses out of the above-line deduction", () => {
    const coach = worksheet([source({ schools: [{ name: "School", role: "coach", level: "k12", schoolEligible: true, hoursWorked: "900" }] })]);
    expect(coach.amount.toString()).toBe("0");
    expect(coach.itemizedDeduction?.toString()).toBe("1000");
    const broader = worksheet([source({ expenses: [expense({ qualifyingUse: false, instructionalActivity: true,
      healthOrPhysicalEducation: true, athleticSupplies: false, itemizedReimbursements: "0", itemizedTaxFreeFunding: "0" })] })]);
    expect(broader.amount.toString()).toBe("0");
    expect(broader.itemizedDeduction?.toString()).toBe("1000");
    expect(worksheet([source({ expenses: [expense({ healthOrPhysicalEducation: true, athleticSupplies: false })] })]).itemizedDeduction?.toString()).toBe("1000");
    const unknown = worksheet([source({ expenses: [expense({ qualifyingUse: false })] })]);
    expect(unknown.itemizedCalculationComplete).toBe(false);
    expect(unknown.itemizedDeduction).toBeUndefined();
  });
  it("reconciles actual funded costs and subtracts the above-line amount only once", () => {
    const actual = worksheet([source({ reimbursementsNotInWages: "100", expenses: [expense({ itemizedReimbursements: "100", itemizedTaxFreeFunding: "0" })] })]);
    expect(actual.amount.toString()).toBe("350");
    expect(actual.itemizedDeduction?.toString()).toBe("550");
    expect(worksheet([source({ expenses: [expense({ deductedElsewhere: true })] })]).itemizedDeduction?.toString()).toBe("0");
    const incomplete = worksheet([source({ reimbursementsNotInWages: "100" })]);
    expect(incomplete.itemizedCalculationComplete).toBe(false);
    expect(() => worksheet([source({ expenses: [expense({ itemizedReimbursements: "900", itemizedTaxFreeFunding: "101" })] })])).toThrow(/exceed|fund/i);
  });
  it("routes actual educator excess through the year-specific itemized candidate", () => {
    const actual = calculateFederalTax(input([source({ expenses: [expense({ amount: "20000" })] })]));
    expect(actual.schedule1?.educatorExpenses.toString()).toBe("350");
    expect(actual.scheduleA?.educatorExpenseDeduction.toString()).toBe("19650");
    expect(actual.agi.toString()).toBe("84650");
    expect(actual.taxableIncome.toString()).toBe("65000");
    const historical = calculateFederalTax(input([source({ taxYear: 2025, schoolYear: "2024-2025", expenses: [expense({ datePaid: "2025-03-01", amount: "20000" })] })], 2025));
    expect(historical.schedule1?.educatorExpenses.toString()).toBe("300");
    expect(historical.scheduleA?.educatorExpenseDeduction.toString()).toBe("0");
  });
  it("rejects contradictory funding of the same above-line and itemized receipt", () => {
    expect(() => worksheet([source({ reimbursementsNotInWages: "100", expenses: [expense({ itemizedReimbursements: "0", itemizedTaxFreeFunding: "0" })] })])).toThrow(/reconcile|reimbursement/i);
    expect(() => worksheet([source({ expenses: [expense({ itemizedReimbursements: "100", itemizedTaxFreeFunding: "0" })] })])).toThrow(/reconcile|reimbursement/i);
    expect(() => worksheet([source({ expenses: [expense({ itemizedReimbursements: "0", itemizedTaxFreeFunding: "1000" })] })])).toThrow(/reconcile|tax.free/i);
    const fullyFunded = worksheet([source({ nontaxableQualifiedTuitionProgramAmount: "1000", expenses: [expense({ itemizedReimbursements: "0", itemizedTaxFreeFunding: "1000" })] })]);
    expect(fullyFunded.amount.toString()).toBe("0");
    expect(fullyFunded.itemizedDeduction?.toString()).toBe("0");
    const broadOnlyFunding = worksheet([source({ expenses: [expense(), expense({ sourceId: "outdoor", qualifyingUse: false, instructionalActivity: true, itemizedReimbursements: "400", itemizedTaxFreeFunding: "100" })] })]);
    expect(broadOnlyFunding.amount.toString()).toBe("350");
    expect(broadOnlyFunding.itemizedDeduction?.toString()).toBe("1150");
  });
});
