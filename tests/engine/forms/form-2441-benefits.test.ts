/** Spec: spec/federal/form-2441-benefits.yaml. Expected amounts derive from printed lines and IRS examples. */
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateForm2441Benefits, type Form2441BenefitsInput } from "@/engine/forms/form-2441-benefits.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

type Facts = NonNullable<Form2441BenefitsInput["facts"]>;
const employee = (overrides: Partial<NonNullable<Facts["employeeBenefits"]>[number]> = {}) => ({
  sourceId: "w2:0", owner: "primary" as const, benefitsReported: "5000", alreadyIncludedInWages: "0",
  priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0", ...overrides,
});
const business = (overrides: Partial<NonNullable<Facts["selfEmployedBenefits"]>[number]> = {}) => ({
  sourceId: "scheduleC", owner: "primary" as const, schedule: "schedule-c" as const,
  benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted: "0", ...overrides,
});
const facts = (overrides: Partial<Facts> = {}): Facts => ({
  sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true,
  employeeBenefits: [employee()], selfEmployedBenefits: [], deductionAllocations: [],
  planExclusionLimit: "7500", qualifiedExpensesIncurred: "10000",
  primaryEarnedIncome: "50000", earnedIncomeWorksheetConfirmed: true,
  qualifyingIndividuals: 1, qualifiedExpensesPaidForCredit: "0", creditExpenseCoordinationConfirmed: true,
  ...overrides,
});
const calculate = (source: Facts, taxYear = 2025, filingStatus: Form2441BenefitsInput["filingStatus"] = "single") =>
  calculateForm2441Benefits({ taxYear, filingStatus, facts: source });
const line = (result: ReturnType<typeof calculate>, id: string) =>
  result.lines.find((entry) => entry.form === "Form 2441" && entry.line === id)?.value.toFixed();

describe("Form 2441 Part III actual benefits", () => {
  it("matches the IRS 4950 reimbursed and 50 forfeited example", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ forfeited: "50" })], qualifiedExpensesIncurred: "4950" }));
    expect(line(result, "12")).toBe("5000");
    expect(line(result, "14")).toBe("50");
    expect(line(result, "15")).toBe("4950");
    expect(result.excludedBenefits.toFixed()).toBe("4950");
    expect(result.taxableBenefits.toFixed()).toBe("0");
    expect(result.qualifyingCreditExpenses.toFixed()).toBe("0");
  });

  it("matches the IRS 2000 benefits and 900 incurred expenses example", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "2000" })], qualifiedExpensesIncurred: "900" }));
    for (const id of ["16", "17", "20", "25"]) expect(line(result, id)).toBe("900");
    expect(line(result, "26")).toBe("1100");
    expect(result.taxableBenefits.toFixed()).toBe("1100");
  });

  it("subtracts benefits already included in W2 wages exactly once", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "6000", alreadyIncludedInWages: "1000" })] }));
    expect(line(result, "12")).toBe("5000");
    expect(result.alreadyIncludedInWages.toFixed()).toBe("1000");
    expect(result.excludedBenefits.toFixed()).toBe("5000");
    expect(result.taxableBenefits.toFixed()).toBe("0");
    expect(result.employeeSources[0]).toMatchObject({ sourceId: "w2:0", owner: "primary" });
    expect(result.employeeSources[0]?.currentBenefitsNotInWages.toFixed()).toBe("5000");
  });

  it("keeps grace-period use separate from forfeiture and next-year carryforward", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "4900", priorYearCarryoverUsed: "200", forfeited: "100", carriedForward: "100" })] }));
    expect(["12", "13", "14", "15", "25", "26"].map((id) => line(result, id))).toEqual(["4900", "200", "200", "4900", "4900", "0"]);
    expect(result.employeeSources[0]?.carriedForward.toFixed()).toBe("100");
  });

  it("applies the year-specific statutory cap without assuming the employer increased its plan", () => {
    const source = facts({ employeeBenefits: [employee({ benefitsReported: "8000" })] });
    expect(calculate(source, 2025).excludedBenefits.toFixed()).toBe("5000");
    expect(calculate(source, 2025).taxableBenefits.toFixed()).toBe("3000");
    expect(calculate(source, 2026).excludedBenefits.toFixed()).toBe("7500");
    expect(calculate(source, 2026).taxableBenefits.toFixed()).toBe("500");
    expect(calculate({ ...source, planExclusionLimit: "4000" }, 2026).excludedBenefits.toFixed()).toBe("4000");
    expect(() => calculate(source, 2024)).toThrow(/tax year/i);
  });

  it("uses actual separate-return and surviving-spouse facts for the earned-income limit", () => {
    const separate = facts({ spouseEarnedIncome: "10000", spouseLivedApartLast6Months: false,
      paidOverHalfHomeCost: false, qualifyingPersonMainHomeOverHalfYear: true });
    expect(calculate(separate, 2025, "married_filing_separately").excludedBenefits.toFixed()).toBe("2500");
    expect(calculate(separate, 2026, "married_filing_separately").excludedBenefits.toFixed()).toBe("3750");
    expect(calculate({ ...separate, spouseEarnedIncome: "1200" }, 2026, "married_filing_separately").excludedBenefits.toFixed()).toBe("1200");
    const unmarried = { ...separate, spouseEarnedIncome: undefined, spouseLivedApartLast6Months: true, paidOverHalfHomeCost: true };
    expect(calculate(unmarried, 2026, "married_filing_separately").excludedBenefits.toFixed()).toBe("5000");
    expect(calculate(unmarried, 2026, "married_filing_separately").treatedAsUnmarried).toBe(true);
    expect(() => calculate({ ...unmarried, paidOverHalfHomeCost: undefined }, 2026, "married_filing_separately")).toThrow(/paidOverHalfHomeCost/);
    const joint = facts({ spouseDiedDuringYear: true, useDeceasedSpouseEarnedIncome: false });
    expect(calculate(joint, 2025, "married_filing_jointly").excludedBenefits.toFixed()).toBe("5000");
    expect(calculate({ ...joint, useDeceasedSpouseEarnedIncome: true, spouseEarnedIncome: "1000" }, 2025, "married_filing_jointly").excludedBenefits.toFixed()).toBe("1000");
    expect(() => calculate({ ...joint, useDeceasedSpouseEarnedIncome: undefined }, 2025, "married_filing_jointly")).toThrow(/useDeceasedSpouseEarnedIncome/);
  });

  it("retains signed separate earned incomes and applies a zero exclusion for a loss", () => {
    const primary = calculate(facts({ primaryEarnedIncome: "-1000" }));
    expect(line(primary, "18")).toBe("-1000");
    expect(line(primary, "20")).toBe("0");
    expect(primary.taxableBenefits.toFixed()).toBe("5000");
    const joint = calculate(facts({ spouseDiedDuringYear: false, spouseEarnedIncome: "-500", primaryEarnedIncome: "50000" }), 2026, "married_filing_jointly");
    expect(line(joint, "18")).toBe("50000");
    expect(line(joint, "19")).toBe("-500");
    expect(joint.excludedBenefits.toFixed()).toBe("0");
    expect(() => calculate(facts({ spouseDiedDuringYear: false }), 2026, "married_filing_jointly")).toThrow(/spouseEarnedIncome/);
  });

  it("separates business deductions employee exclusions and additional taxable wages", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "4000" })], selfEmployedBenefits: [business()],
      deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "2000" }] }));
    expect(["12", "22", "23", "24", "25", "26", "28"].map((id) => line(result, id))).toEqual(["6000", "2000", "4000", "2000", "3000", "1000", "5000"]);
    expect(result.deductibleBenefits.toFixed()).toBe("2000");
    expect(result.taxableBenefits.toFixed()).toBe("1000");
    expect(result.deductionAllocations[0]).toMatchObject({ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c" });
    expect(result.lines.filter((entry) => entry.form === "Form 2441").map((entry) => entry.line)).toEqual(Array.from({ length: 20 }, (_, index) => String(index + 12)));
  });

  it("requires exact owner and activity allocations for deductible business benefits", () => {
    const source = facts({ employeeBenefits: [], planExclusionLimit: "3000",
      selfEmployedBenefits: [business({ benefitsReceived: "2500" }), business({ sourceId: "scheduleF", schedule: "schedule-f", benefitsReceived: "2500" })],
      deductionAllocations: [
        { sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "1000" },
        { sourceId: "scheduleF", owner: "primary", schedule: "schedule-f", amount: "2000" },
      ] });
    const result = calculate(source);
    expect(result.deductibleBenefits.toFixed()).toBe("3000");
    expect(result.taxableBenefits.toFixed()).toBe("0");
    expect(result.unallowedBusinessBenefits.toFixed()).toBe("2000");
    expect(() => calculate({ ...source, deductionAllocations: [] })).toThrow(/allocations.*line 24/i);
    expect(() => calculate({ ...source, deductionAllocations: [{ sourceId: "scheduleC", owner: "spouse", schedule: "schedule-c", amount: "3000" }] })).toThrow(/owner|source/i);
    expect(() => calculate({ ...source, deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-f", amount: "3000" }] })).toThrow(/schedule|source/i);
    expect(() => calculate({ ...source, deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "3000" }] })).toThrow(/exceeds.*source/i);
    expect(() => calculate({ ...source, deductionAllocations: [source.deductionAllocations?.[0], source.deductionAllocations?.[0]] as Facts["deductionAllocations"] })).toThrow(/duplicate/i);
    expect(() => calculate({ ...source, deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "1000.50" }] })).toThrow(/whole-dollar/i);
    expect(() => calculate({ ...source, deductionAllocations: [{ sourceId: "missing-business", owner: "primary", schedule: "schedule-c", amount: "3000" }] })).toThrow(/match.*source/i);
    const joint = calculate(facts({ spouseDiedDuringYear: false, spouseEarnedIncome: "12000", qualifyingIndividuals: 2,
      selfEmployedBenefits: [business({ sourceId: "partnership", owner: "spouse", schedule: "schedule-e", benefitsReceived: "1950", priorYearCarryoverUsed: "50" })],
      deductionAllocations: [{ sourceId: "partnership", owner: "spouse", schedule: "schedule-e", amount: "2000" }],
    }), 2026, "married_filing_jointly");
    expect(["12", "13", "22", "24", "25", "26"].map((id) => line(joint, id))).toEqual(["6950", "50", "2000", "2000", "5000", "0"]);
    expect(joint.deductionAllocations[0]).toMatchObject({ sourceId: "partnership", owner: "spouse", schedule: "schedule-e" });
  });

  it("coordinates the credit expense cap without subtracting benefits twice", () => {
    // Pub503 George example: 1000 excluded and 2900 paid eligible expenses;
    // single-person3000cap becomes2000, so line31 is2000, not1900.
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "1000" })],
      qualifiedExpensesIncurred: "3900", qualifiedExpensesPaidForCredit: "2900" }));
    expect(["27", "28", "29", "30", "31"].map((id) => line(result, id))).toEqual(["3000", "1000", "2000", "2900", "2000"]);
    expect(result.qualifyingCreditExpenses.toFixed()).toBe("2000");
    expect(() => calculate(facts({ qualifiedExpensesIncurred: "6000", qualifiedExpensesPaidForCredit: "2000" }))).toThrow(/expense.*coordination|double/i);
  });

  it("the 7500 exclusion exhausts the 6000 current-year credit expense cap", () => {
    const result = calculate(facts({ employeeBenefits: [employee({ benefitsReported: "7500" })], qualifyingIndividuals: 2,
      qualifiedExpensesIncurred: "10000", qualifiedExpensesPaidForCredit: "2500" }), 2026);
    expect(line(result, "29")).toBe("-1500");
    expect(result.qualifyingCreditExpenses.toFixed()).toBe("0");
  });

  it("supports benefits-only returns with known ineligibility and no qualifying persons", () => {
    const result = calculate(facts({ exclusionEligibilityConfirmed: false, qualifyingIndividuals: 0,
      qualifiedExpensesIncurred: "0", qualifiedExpensesPaidForCredit: "0" }), 2026);
    expect(result.excludedBenefits.toFixed()).toBe("0");
    expect(result.taxableBenefits.toFixed()).toBe("5000");
    expect(result.qualifyingCreditExpenses.toFixed()).toBe("0");
    expect(result.requiresForm2441).toBe(true);
  });

  it("preserves missing facts in the schema and requires actual zero source arrays", () => {
    const parsed = TaxYearInputSchema.parse({ ...simpleW2Fixture, dependentCareBenefits: {} });
    expect(parsed.dependentCareBenefits).toEqual({});
    const benefitProvider = { name: "Employer Care", address: "Actual source address", identifierType: "employer_furnished" as const,
      householdEmployee: false, amountPaid: "0" };
    expect(TaxYearInputSchema.parse({ ...simpleW2Fixture, dependentCareBenefits: {
      providers: [benefitProvider], usesDeemedIncome: false,
    } }).dependentCareBenefits).toEqual({ providers: [benefitProvider], usesDeemedIncome: false });
    for (const key of ["sourceFactsConfirmed", "exclusionEligibilityConfirmed", "employeeBenefits", "selfEmployedBenefits",
      "deductionAllocations", "planExclusionLimit", "qualifiedExpensesIncurred", "primaryEarnedIncome", "earnedIncomeWorksheetConfirmed",
      "qualifyingIndividuals", "qualifiedExpensesPaidForCredit", "creditExpenseCoordinationConfirmed"] as const) {
      expect(() => calculate(facts({ [key]: undefined }))).toThrow(new RegExp(key));
    }
    expect(() => calculate(facts({ sourceFactsConfirmed: false }))).toThrow(/sourceFactsConfirmed/);
    const knownZero = facts({ employeeBenefits: [], selfEmployedBenefits: [], qualifiedExpensesIncurred: "0",
      primaryEarnedIncome: "0", planExclusionLimit: "0", qualifyingIndividuals: 0 });
    expect(calculate(knownZero).taxableBenefits.toFixed()).toBe("0");
    expect(calculate(knownZero).requiresForm2441).toBe(false);
    expect(TaxYearInputSchema.parse({ ...simpleW2Fixture, dependentCareBenefits: knownZero }).dependentCareBenefits).toEqual(knownZero);
  });

  it("rejects duplicate source IDs unknown owners and contradictory source amounts", () => {
    expect(() => calculate(facts({ employeeBenefits: [employee(), employee()] }))).toThrow(/duplicate/i);
    expect(() => calculate(facts({ employeeBenefits: [employee({ owner: undefined })] }))).toThrow(/owner/);
    expect(() => calculate(facts({ employeeBenefits: [employee({ owner: "spouse" })] }))).toThrow(/joint return|owner/i);
    expect(() => calculate(facts({ selfEmployedBenefits: [business({ sourceId: "w2:0" })] }))).toThrow(/duplicate/i);
    expect(() => calculate(facts({ employeeBenefits: [employee({ alreadyIncludedInWages: "5001" })] }))).toThrow(/alreadyIncludedInWages|wages/i);
    expect(() => calculate(facts({ employeeBenefits: [employee({ forfeited: "3000", carriedForward: "2001" })] }))).toThrow(/forfeit|carry|line12/i);
    expect(() => calculate(facts({ employeeBenefits: [employee({ priorYearCarryoverUsed: undefined })] }))).toThrow(/priorYearCarryoverUsed/);
    expect(() => calculate(facts({ employeeBenefits: [employee({ sourceId: " " })] }))).toThrow(/sourceId/);
    expect(() => calculate(facts({ selfEmployedBenefits: [business({ schedule: undefined })] }))).toThrow(/schedule/);
    expect(() => calculate(facts({ primaryEarnedIncome: "not-an-amount" }))).toThrow(/finite/);
    expect(() => calculate(facts({ qualifiedExpensesIncurred: "NaN" }))).toThrow(/finite|qualifiedExpensesIncurred/);
    expect(() => calculate(facts({ planExclusionLimit: "-1" }))).toThrow(/nonnegative|planExclusionLimit/);
    expect(() => calculate(facts({ qualifyingIndividuals: -1 }))).toThrow(/qualifyingIndividuals/);
  });

  it("adds source cents before whole-dollar form rounding and preserves actual source values", () => {
    const source = facts({ employeeBenefits: [employee({ benefitsReported: "1000.24" }), employee({ sourceId: "w2:1", benefitsReported: "1000.25" })] });
    const below = calculate(source);
    expect(line(below, "12")).toBe("2000");
    expect(below.employeeSources[0]?.currentBenefitsNotInWages.toFixed()).toBe("1000.24");
    const half = calculate({ ...source, employeeBenefits: [employee({ benefitsReported: "1000.25" }), employee({ sourceId: "w2:1", benefitsReported: "1000.25" })] });
    expect(line(half, "12")).toBe("2001");
    expect(source.employeeBenefits?.[0]?.benefitsReported).toBe("1000.24");
  });

  it("rejects source rounding that would manufacture employee benefits", () => {
    // Pure business sources cannot create employee wages or an employee exclusion.
    // Separate physical lines round 2500.25 + 0.25 to 2500 + 0, but line22
    // groups those same sources as 2500.50, which rounds to 2501.
    for (const [current, carryover, allocation] of [["2500.25", "0.25", "2500"], ["2500.60", "0.60", "2501"]]) {
      const source = facts({ employeeBenefits: [],
        selfEmployedBenefits: [business({ benefitsReceived: current, priorYearCarryoverUsed: carryover })],
        deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: allocation }] });
      expect(() => calculate(source)).toThrow(/source.*rounding/i);
      expect(source.selfEmployedBenefits?.[0]?.benefitsReceived).toBe(current);
    }
  });

  it("preserves actual reported W2 benefits and already deducted activity amounts", () => {
    const parsed = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], box10DependentCareBenefits: "1000.25" }] });
    expect(parsed.w2s[0]?.box10DependentCareBenefits).toBe("1000.25");
    expect(TaxYearInputSchema.parse(simpleW2Fixture).w2s[0]?.box10DependentCareBenefits).toBeUndefined();
    const source = facts({ employeeBenefits: [], selfEmployedBenefits: [business({ alreadyDeducted: "2500" })],
      deductionAllocations: [{ sourceId: "scheduleC", owner: "primary", schedule: "schedule-c", amount: "2000" }] });
    const result = calculate(source);
    expect(result.deductibleBenefits.toFixed()).toBe("2000");
    expect(result.businessSources[0]?.alreadyDeducted.toFixed()).toBe("2500");
    // The orchestrator must add back the over-deducted500, not deduct another2000.
    expect(result.deductionAllocations[0]?.amount.minus(result.businessSources[0]?.alreadyDeducted ?? "NaN").toFixed()).toBe("-500");
    expect(() => calculate({ ...source, selfEmployedBenefits: [business({ alreadyDeducted: undefined })] })).toThrow(/alreadyDeducted/);
  });
});
