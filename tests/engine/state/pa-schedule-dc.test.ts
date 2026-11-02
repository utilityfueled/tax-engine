/**
 * Tests for Pennsylvania Schedule DC — Child and Dependent Care Enhancement Tax Credit
 * Spec: spec/state/pa-schedule-dc.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleDC, type ScheduleDCInput } from "@/engine/state/pa-schedule-dc.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: Partial<ScheduleDCInput> = {}): ScheduleDCInput {
  return {
    taxYear: 2025,
    qualifyingPersons: 1,
    paTaxableIncome: d(43000),
    federalCredit: d(1050),
    ...overrides,
  };
}

describe("Pennsylvania Schedule DC — Child and Dependent Care Enhancement Tax Credit", () => {
  it("PA Schedule DC Line 1 - records qualifying persons", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 2,
      federalCredit: d(2100),
    }));

    expect(result.qualifyingPersons).toBe(2);
    expect(result.lines.find((line) => line.line === "1")?.value.toNumber()).toBe(2);
  });

  it("PA Schedule DC Line 2 - applies the official chart cap to the federal child and dependent care credit", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 1,
      paTaxableIncome: d(43000),
      federalCredit: d(1050),
    }));

    expect(result.credit.toNumber()).toBe(1050);
    expect(result.lines.find((line) => line.line === "2")?.value.toNumber()).toBe(1050);
  });

  it("PA Schedule DC Line 2 - uses the lower one-dependent cap above the $43,000 threshold", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 1,
      paTaxableIncome: d(43001),
      federalCredit: d(1050),
    }));

    expect(result.credit.toNumber()).toBe(600);
  });

  it("PA Schedule DC Line 2 - supports two-or-more qualifying persons at the higher-income cap", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 2,
      paTaxableIncome: d(50000),
      federalCredit: d(2100),
    }));

    expect(result.credit.toNumber()).toBe(1200);
  });

  it("PA Schedule DC Line 2 - leaves a federal credit below the chart cap unchanged", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 2,
      paTaxableIncome: d(43000),
      federalCredit: d(900),
    }));

    expect(result.credit.toNumber()).toBe(900);
  });

  it("PA Schedule DC Line 2 - zero federal credit yields zero PA credit", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 1,
      federalCredit: d(0),
    }));

    expect(result.credit.toNumber()).toBe(0);
  });

  it("PA Schedule DC Line 2 - negative upstream credit is floored at zero", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 1,
      federalCredit: d(-50),
    }));

    expect(result.credit.toNumber()).toBe(0);
  });

  it("PA Schedule DC Line 2 - no qualifying persons yield no credit", () => {
    const result = calculateScheduleDC(makeInput({
      qualifyingPersons: 0,
      paTaxableIncome: d(10000),
      federalCredit: d(1050),
    }));

    expect(result.credit.toNumber()).toBe(0);
  });

  it("PA Schedule DC - throws for unsupported tax year", () => {
    expect(() => calculateScheduleDC(makeInput({ taxYear: 2023 })))
      .toThrow("PA Schedule DC constants not available for tax year 2023");
  });
});


// Spec: spec/state/pa-schedule-dc.yaml, 2026-conformity/2026-source-boundary.
function make2026Input(): ScheduleDCInput {
  return {
    taxYear: 2026, qualifyingPersons: 1, paTaxableIncome: d(25000), federalCredit: d(1350),
    source2022Conformity: {
      sourceTaxYear: 2026, sourceReference: "fictional-private-care-source-2026",
      sourceFactsConfirmed: true, residentIndividualEligibilityConfirmed: true,
      eligibilityUnder2022Section21Confirmed: true,
      currentYearExpensesOnlyConfirmed: true, actualEarnedIncomeOnlyConfirmed: true,
      expensesNotClaimedOnAnotherReturnConfirmed: true,
      federal: {
        taxYear: 2026, filingStatus: "single", eligibilityConfirmed: true,
        careExpenses: d(3000), qualifyingIndividuals: 1, earnedIncome: d(25000), agi: d(25000),
        excludedDependentCareBenefits: d(0), priorYearExpenseCredit: d(0),
        earnedIncomeFactsVerified: true, taxLiabilityLimit: d(3000),
      },
    },
  };
}

describe("PA Schedule DC 2026 actual conformity sources", () => {
  it("PA Schedule DC 2026 conformity - uses actual current sources and the frozen 2022 percentages", () => {
    const input = make2026Input();
    const result = calculateScheduleDC(input);
    expect(result.federalCredit.toString()).toBe("1350");
    expect(result.credit.toString()).toBe("900");
    expect(result.lines.find((line) => line.line === "2026_percentage")?.value.toString()).toBe("0.3");
    expect(JSON.stringify(result)).not.toContain("fictional-private-care-source-2026");
    input.paTaxableIncome = d(90000);
    expect(calculateScheduleDC(input).credit.toString()).toBe("900");
  });

  it.each([
    ["15000", "1500", "1050"], ["15001", "1470", "1020"],
    ["17000", "1470", "1020"], ["17001", "1440", "990"],
    ["43000", "1080", "630"], ["43001", "1050", "600"],
  ])("PA Schedule DC 2026 conformity - rate boundary AGI %s", (agi, federal, pa) => {
    const input = make2026Input();
    input.source2022Conformity!.federal.agi = d(agi);
    input.federalCredit = d(federal);
    expect(calculateScheduleDC(input).credit.toString()).toBe(pa);
  });

  it("PA Schedule DC 2026 conformity - separately caps two persons and the actual spouse income", () => {
    const input = make2026Input();
    input.qualifyingPersons = 2;
    Object.assign(input.source2022Conformity!.federal, {
      qualifyingIndividuals: 2, careExpenses: d(9000), filingStatus: "married_filing_jointly",
      spouseEarnedIncome: d(25000),
    });
    input.federalCredit = d(2700);
    expect(calculateScheduleDC(input).credit.toString()).toBe("1800");
    input.source2022Conformity!.federal.spouseEarnedIncome = d(1800);
    input.federalCredit = d(810);
    expect(calculateScheduleDC(input).credit.toString()).toBe("540");
  });

  it.each([["1501.66", "676", "450"], ["1501.67", "676", "451"], ["0", "0", "0"]])(
    "PA Schedule DC 2026 conformity - exact expense %s rounds PA once", (care, federal, pa) => {
      const input = make2026Input();
      input.source2022Conformity!.federal.careExpenses = d(care);
      input.federalCredit = d(federal);
      expect(calculateScheduleDC(input).credit.toString()).toBe(pa);
    },
  );

  it("PA Schedule DC 2026 conformity - rejects absent or contradictory actual sources", () => {
    const mutations: Array<(input: ScheduleDCInput) => void> = [
      (input) => { delete input.source2022Conformity; },
      (input) => { input.source2022Conformity!.sourceTaxYear = 2025; },
      (input) => { input.source2022Conformity!.sourceReference = " "; },
      (input) => { input.source2022Conformity!.sourceFactsConfirmed = false; },
      (input) => { input.source2022Conformity!.residentIndividualEligibilityConfirmed = false; },
      (input) => { input.source2022Conformity!.eligibilityUnder2022Section21Confirmed = false; },
      (input) => { input.source2022Conformity!.currentYearExpensesOnlyConfirmed = false; },
      (input) => { input.source2022Conformity!.actualEarnedIncomeOnlyConfirmed = false; },
      (input) => { input.source2022Conformity!.expensesNotClaimedOnAnotherReturnConfirmed = false; },
      (input) => { delete input.source2022Conformity!.federal.taxYear; },
      (input) => { input.source2022Conformity!.federal.taxYear = 2025; },
      (input) => { delete input.source2022Conformity!.federal.earnedIncomeFactsVerified; },
      (input) => { input.source2022Conformity!.federal.eligibilityConfirmed = false; },
      (input) => { delete input.source2022Conformity!.federal.excludedDependentCareBenefits; },
      (input) => { input.source2022Conformity!.federal.excludedDependentCareBenefits = d(1); },
      (input) => { delete input.source2022Conformity!.federal.priorYearExpenseCredit; },
      (input) => { input.source2022Conformity!.federal.priorYearExpenseCredit = d(1); },
      (input) => { delete input.source2022Conformity!.federal.taxLiabilityLimit; },
      (input) => { input.source2022Conformity!.federal.taxLiabilityLimit = d(100); },
      (input) => { input.source2022Conformity!.federal.filingStatus = "married_filing_separately"; },
      (input) => { input.source2022Conformity!.federal.agi = d("NaN"); },
      (input) => { input.federalCredit = d(1300); },
      (input) => { input.qualifyingPersons = 2; },
      (input) => { input.qualifyingPersons = 1.5; },
    ];
    for (const mutate of mutations) {
      const input = make2026Input(); mutate(input);
      expect(() => calculateScheduleDC(input)).toThrow(/2026 PA Schedule DC|2026 Form 2441|Form 2441/);
    }
  });
});


it("PA Schedule DC 2026 conformity - rejects invalid runtime filing status rather than treating it as single", () => {
  const input = make2026Input();
  input.source2022Conformity!.federal.filingStatus = "unknown" as NonNullable<typeof input.source2022Conformity>["federal"]["filingStatus"];
  expect(() => calculateScheduleDC(input)).toThrow(/2026 PA Schedule DC/);
});
