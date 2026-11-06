/** Spec: spec/federal/form-2441.yaml, part-iii-handoff/prior-credit/mfs. */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm2441, type Form2441Input } from "@/engine/forms/form-2441.js";
import type { DependentCareBenefits } from "@/models/inputs.js";

const benefits = (): DependentCareBenefits => ({
  sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true,
  employeeBenefits: [{ sourceId: "w2:0", owner: "primary", benefitsReported: "1000",
    alreadyIncludedInWages: "0", priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" }],
  selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "7500",
  qualifiedExpensesIncurred: "3900", primaryEarnedIncome: "49000",
  earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: 1,
  qualifiedExpensesPaidForCredit: "2900", creditExpenseCoordinationConfirmed: true,
});
const input = (): Form2441Input => ({
  taxYear: 2025, filingStatus: "single", eligibilityConfirmed: true,
  earnedIncomeFactsVerified: true, careExpenses: new Decimal("3900"), qualifyingIndividuals: 1,
  earnedIncome: new Decimal("50000"), agi: new Decimal("50000"), taxLiabilityLimit: new Decimal("5000"),
  priorYearExpenseCredit: new Decimal(0), dependentCareBenefits: benefits(),
});
const audit = (result: ReturnType<typeof calculateForm2441>, form: string, line: string) =>
  result.lines.find((entry) => entry.form === form && entry.line === line)?.value.toFixed();

describe("Form2441 PartIII verified credit handoff", () => {
  it("uses validated line31 and preserves gross expense evidence without a second subtraction", () => {
    const result = calculateForm2441(input());
    expect(result.qualifyingExpenses.toFixed()).toBe("2000");
    expect(result.credit.toFixed()).toBe("400");
    expect(result.benefits?.totalBenefitsApplied.toFixed()).toBe("1000");
    expect(result.benefits?.qualifyingCreditExpenses.toFixed()).toBe("2000");
    expect(audit(result, "Form 2441 Source Reconciliation", "gross_paid_expenses")).toBe("3900");
    expect(audit(result, "Form 2441", "4")).toBe("50000");
    expect(result.benefits?.lines.find((entry) => entry.line === "18")?.value.toFixed()).toBe("49000");
    // Orchestration merges early PartIII audit once; core supplies PartII only.
    expect(result.lines.filter((entry) => entry.form === "Form 2441" && entry.line === "31")).toHaveLength(0);
  });

  it("preserves the separate prior-year worksheet when benefits exhaust the current expense cap", () => {
    const source = benefits();
    source.employeeBenefits = [{ ...source.employeeBenefits?.[0], benefitsReported: "7500" }];
    source.qualifyingIndividuals = 2;
    source.qualifiedExpensesIncurred = "10000";
    source.qualifiedExpensesPaidForCredit = "2500";
    const result = calculateForm2441({ ...input(), taxYear: 2026, careExpenses: new Decimal("10000"),
      qualifyingIndividuals: 2, priorYearExpenseCredit: new Decimal("37"), taxLiabilityLimit: new Decimal("25"),
      dependentCareBenefits: source });
    expect(["3", "9a", "9b", "9c", "10", "11"].map((id) => audit(result, "Form 2441", id))).toEqual(["0", "0", "37", "37", "25", "25"]);
    expect(result.credit.toFixed()).toBe("25");
    const historical = calculateForm2441({ ...input(), priorYearExpenseCredit: undefined });
    expect(audit(historical, "Form 2441", "9b")).toBeUndefined();
    expect(historical.credit.toFixed()).toBe("400");
  });

  it("rejects contradictory legacy amounts person counts and gross paid expenses", () => {
    expect(calculateForm2441({ ...input(), excludedDependentCareBenefits: new Decimal("1000") }).credit.toFixed()).toBe("400");
    expect(() => calculateForm2441({ ...input(), excludedDependentCareBenefits: new Decimal("999") })).toThrow(/benefit.*reconcile|line 28/i);
    expect(() => calculateForm2441({ ...input(), qualifyingIndividuals: 2 })).toThrow(/qualifying.*count/i);
    expect(() => calculateForm2441({ ...input(), careExpenses: new Decimal("2800") })).toThrow(/net.*gross|paid.*expense/i);
    expect(() => calculateForm2441({ ...input(), dependentCareBenefits: { ...benefits(), sourceFactsConfirmed: false } })).toThrow(/sourceFactsConfirmed/);
    expect(() => calculateForm2441({ ...input(), filingStatus: undefined })).toThrow(/filing status/i);
  });

  it("applies the actual living-apart facts without treating all separate returns as eligible", () => {
    const source = { ...benefits(), spouseLivedApartLast6Months: true, paidOverHalfHomeCost: true,
      qualifyingPersonMainHomeOverHalfYear: true, spouseEarnedIncome: "30000" };
    const separate = { ...input(), filingStatus: "married_filing_separately" as const, dependentCareBenefits: source };
    expect(calculateForm2441(separate).credit.toFixed()).toBe("400");
    expect(calculateForm2441({ ...separate, dependentCareBenefits: { ...source, spouseLivedApartLast6Months: false } }).credit.toFixed()).toBe("0");
    expect(calculateForm2441({ ...separate, eligibilityConfirmed: false }).credit.toFixed()).toBe("0");
    expect(() => calculateForm2441({ ...separate, dependentCareBenefits: { ...source, paidOverHalfHomeCost: undefined } })).toThrow(/paidOverHalfHomeCost/);
    expect(calculateForm2441({ ...separate, dependentCareBenefits: undefined }).credit.toFixed()).toBe("0");
  });
});
