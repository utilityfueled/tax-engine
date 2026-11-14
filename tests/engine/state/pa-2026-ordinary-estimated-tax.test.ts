// Spec: spec/state/pa-2026-ordinary-estimated-tax.yaml.
import { describe, expect, it } from "vitest";
import { estimatePennsylvania2026OrdinaryTax } from "@/engine/state/pa-2026-ordinary-estimated-tax.js";

type Input = Parameters<typeof estimatePennsylvania2026OrdinaryTax>[0];

const source = {
  taxYear: 2026,
  originalIndividualCalendarYearNonFarmerConfirmed: true,
  allPositivePATaxableIncomeClassesConfirmed: true,
  noPAWithholdingOrEstimatedCreditsConfirmed: true,
  noPriorOverpaymentCarryoverOrEstimatedPaymentsConfirmed: true,
  prior2025ReturnStatus: "not_filed",
  determinedOn: "2026-03-31",
  estimatedPATaxableIncome: "16000",
} satisfies Input;

describe("Pennsylvania 2026 original pre-April estimated tax", () => {
  it("derives exact current-year lines and both timing options without filing amounts", () => {
    const result = estimatePennsylvania2026OrdinaryTax(source);
    expect(result.lines.map(({ line, value }) => [line, value.toFixed()])).toEqual([
      ["1", "16000"], ["2", "491.2"], ["3", "0"], ["4", "0"], ["5", "0"],
      ["6", "0"], ["7", "0"], ["8", "491.2"], ["9", "442.08"],
      ["15", "442.08"], ["16", "0"], ["17", "442.08"],
    ]);
    expect(result.estimatedTax.toFixed()).toBe("442.08");
    expect(result.firstDeclarationDueBy).toBe("2026-04-15");
    expect(result.fullPaymentWithFirstDeclaration.toFixed()).toBe("442.08");
    expect(result.installments.map(({ dueBy, amount }) => [dueBy, amount.toFixed()])).toEqual([
      ["2026-04-15", "110.52"], ["2026-06-15", "110.52"],
      ["2026-09-15", "110.52"], ["2027-01-15", "110.52"],
    ]);
    expect(result.installments.reduce((sum, payment) => sum.plus(payment.amount), result.estimatedTax.times(0))
      .equals(result.estimatedTax)).toBe(true);
    expect(result.kind).toBe("pa-2026-ordinary-estimated-tax-planning-only");
  });

  it("preserves the unresolved threshold and fractional-cent planning boundaries", () => {
    for (const estimatedPATaxableIncome of ["0", "13999.99", "14000", "14000.01", "15562.79", "15562.80", "15580.89"]) {
      expect(() => estimatePennsylvania2026OrdinaryTax({ ...source, estimatedPATaxableIncome })).toThrow(/threshold/i);
    }
    const near = estimatePennsylvania2026OrdinaryTax({ ...source, estimatedPATaxableIncome: "15580.90" });
    expect(near.estimatedTax.toFixed()).toBe("430.500267");
    expect(near.installments[0]?.amount.toFixed()).toBe("107.62506675");
    const cent = estimatePennsylvania2026OrdinaryTax({ ...source, estimatedPATaxableIncome: "16000.01" });
    expect(cent.estimatedTax.toFixed()).toBe("442.0802763");
    expect(cent.installments[0]?.amount.toFixed()).toBe("110.520069075");
  });

  it("admits only valid first-band determination dates", () => {
    for (const determinedOn of ["2026-01-01", "2026-02-28", "2026-03-30", "2026-03-31"]) {
      expect(estimatePennsylvania2026OrdinaryTax({ ...source, determinedOn }).firstDeclarationDueBy).toBe("2026-04-15");
    }
    for (const determinedOn of [
      "2025-12-31", "2026-02-29", "2026-03-32", "2026-04-01", "2026-04-02", "2026-05-31",
      "2026-06-01", "2026-06-02", "2026-08-31", "2026-09-01", "2026-09-02", "2027-01-01",
      "2026-03-31T00:00:00Z", "2026-03-31\n", "",
    ]) {
      expect(() => estimatePennsylvania2026OrdinaryTax({ ...source, determinedOn })).toThrow(/determination date/i);
    }
  });

  it("rejects missing confirmations, unsupported prior returns and malformed source amounts", () => {
    expect(estimatePennsylvania2026OrdinaryTax({ ...source, prior2025ReturnStatus: "part_year_pa_resident" })
      .estimatedTax.toFixed()).toBe("442.08");
    const controls = [
      { taxYear: 2025 }, { taxYear: 2027 }, { taxYear: "2026" },
      { prior2025ReturnStatus: "full_year_pa_resident" }, { prior2025ReturnStatus: "nonresident" },
      { prior2025ReturnStatus: "unknown" }, { prior2025ReturnStatus: null },
      { estimatedPATaxableIncome: "16,000" }, { estimatedPATaxableIncome: "-16000" },
      { estimatedPATaxableIncome: "16000.001" }, { estimatedPATaxableIncome: "16000\n" },
      { estimatedPATaxableIncome: "1000000000000" }, { estimatedPATaxableIncome: 16000 },
      { estimatedPATaxableIncome: null }, { estimatedPATaxableIncome: "" },
      { withholding: "1" },
    ];
    for (const change of controls) {
      expect(() => estimatePennsylvania2026OrdinaryTax({ ...source, ...change } as Input)).toThrow();
    }
    for (const confirmation of [
      "originalIndividualCalendarYearNonFarmerConfirmed", "allPositivePATaxableIncomeClassesConfirmed",
      "noPAWithholdingOrEstimatedCreditsConfirmed", "noPriorOverpaymentCarryoverOrEstimatedPaymentsConfirmed",
    ] as const) {
      for (const value of [false, null, "true", undefined]) {
        expect(() => estimatePennsylvania2026OrdinaryTax({ ...source, [confirmation]: value })).toThrow();
      }
    }
  });
});
