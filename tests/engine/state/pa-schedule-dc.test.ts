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
