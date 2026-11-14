// Spec: spec/federal/form-1040.yaml, line 26 and related extension source facts.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

import { calculateFederalTax, TaxYearInputSchema, type TaxYearInput } from "../../src/index.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const estimate = { date: "2026-01-15", amount: "125.37", type: "federal" } as const;
const extension = { date: "2026-04-15", amount: "53.24", type: "federal" } as const;
const adjustments = (estimatedTaxPayments: unknown[] = [], extensionPayments: unknown[] = []) => ({ estimatedTaxPayments, extensionPayments });
const raw = (taxYear: 2025 | 2026, adjustmentFacts: object) => ({
  ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
  w2s: simpleW2Fixture.w2s.map(w2 => ({ ...w2, taxYear })), adjustments: adjustmentFacts,
});
const run = (year: 2025 | 2026, facts = adjustments()) => calculateFederalTax(TaxYearInputSchema.parse(raw(year, facts)));

describe("Actual federal payment dates and selected return application", () => {
  it("holds undocumented estimates and extension payments even with no installment penalty", () => {
    expect(run(2025).estimatedTaxPenalty.isZero()).toBe(true);
    expect(run(2026).estimatedTaxPenalty.isZero()).toBe(true);
    for (const taxYear of [2025, 2026] as const) {
      for (const date of [undefined, "", "2026-02-30", "2026-13-01", "2026-01-15\n", "2010-01-01"]) {
        const row = { ...estimate, date };
        expect(() => run(taxYear, adjustments([row]))).toThrow(/date|application/i);
        expect(() => run(taxYear, adjustments([], [row]))).toThrow(/date|application/i);
      }
    }
    const parsed = TaxYearInputSchema.parse(raw(2025, adjustments([estimate])));
    const typed = parsed.adjustments?.estimatedTaxPayments[0];
    if (!typed) throw new Error("Missing synthetic payment");
    // Direct TypeScript callers can bypass parsing, as can data decoding paths.
    Object.assign(typed, { date: undefined });
    expect(() => calculateFederalTax(parsed)).toThrow(/date/i);
    expect(() => run(2025, adjustments([{ ...estimate, amount: undefined }]))).toThrow();
    expect(() => run(2025, adjustments([{ ...estimate, amount: "-0.01" }]))).toThrow(/amount/i);
    expect(() => run(2025, adjustments([], [{ ...extension, amount: "-0.01" }]))).toThrow(/amount/i);
  });

  it("keeps the actual paid date distinct from the historical tax year application", () => {
    const legacyLate = { ...estimate, date: "2026-11-18" };
    expect(run(2025, adjustments([legacyLate])).estimatedTaxPayments.toFixed()).toBe("125.37");
    const affirmativeApplication = { taxYear: 2025, confirmed: true } as const;
    const historicalPayment = { ...estimate, date: "2028-02-29", application: affirmativeApplication };
    expect(() => run(2025, adjustments([{ ...historicalPayment, date: "0000-01-01" }]))).toThrow(/date/i);
    const parsed = TaxYearInputSchema.parse(raw(2025, adjustments([historicalPayment])));
    expect(parsed.adjustments?.estimatedTaxPayments[0]).toEqual(historicalPayment);
    expect(calculateFederalTax(parsed).estimatedTaxPayments.toFixed()).toBe("125.37");
    expect(() => run(2025, adjustments([{ ...historicalPayment, application: undefined }]))).toThrow(/application/i);
    for (const row of [
      { ...estimate, application: { ...affirmativeApplication, taxYear: 2026 } },
      { ...estimate, application: { ...affirmativeApplication, confirmed: false } },
      { ...estimate, application: { taxYear: 2025 } },
    ]) expect(() => run(2025, adjustments([row]))).toThrow(/application|confirmed/i);

    const mismatched = TaxYearInputSchema.parse(raw(2025, adjustments([estimate])));
    const row = mismatched.adjustments?.estimatedTaxPayments[0];
    if (!row) throw new Error("Missing synthetic payment");
    const invalidApplication = { taxYear: 2025.5, confirmed: true };
    Object.assign(row, { application: invalidApplication });
    expect(() => calculateFederalTax(mismatched as TaxYearInput)).toThrow(/application/i);
  });

  it("preserves following-year estimates and extensions and a confirmed zero", () => {
    for (const taxYear of [2025, 2026] as const) {
      const current = run(taxYear, adjustments(
        [{ ...estimate, date: `${taxYear + 1}-01-15` }], [{ ...extension, date: `${taxYear + 1}-04-15` }],
      ));
      expect(current.estimatedTaxPayments.toFixed()).toBe("125.37");
      expect(current.allLines.find(line => line.form === "Sched 3" && line.line === "10")?.value.toFixed()).toBe("53.24");
      expect(current.estimatedTaxPenalty.isZero()).toBe(true);
    }
    expect(run(2025, adjustments([{ ...estimate, amount: "0.00" }])).estimatedTaxPayments.isZero()).toBe(true);
    expect(() => run(2025, adjustments([{ ...estimate, amount: "0.00", date: "" }]))).toThrow(/date/i);
  });
});
