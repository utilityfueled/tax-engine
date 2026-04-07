/**
 * Tests for Schedule H — Household Employment Taxes
 * Spec: spec/federal/schedule-h.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleH } from "@/engine/forms/schedule-h.js";

const CONSTANTS_2025 = {
  cashWageThreshold: new Decimal(2800),
  socialSecurityRate: new Decimal("0.124"),
  medicareRate: new Decimal("0.029"),
  additionalMedicareRate: new Decimal("0.009"),
  additionalMedicareThreshold: new Decimal(200000),
  socialSecurityWageBase: new Decimal(176100),
  futaGrossRate: new Decimal("0.06"),
  futaMaxCredit: new Decimal("0.054"),
  futaNetRate: new Decimal("0.006"),
  futaWageBase: new Decimal(7000),
  futaQuarterlyThreshold: new Decimal(1000),
};

function makeEmployee(wages: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Employee",
    cashWages: wages,
    isSpouse: false,
    isChildUnder21: false,
    isParent: false,
    isUnder18NonPrincipal: false,
    ...overrides,
  };
}

describe("Schedule H — Household Employment Taxes", () => {
  // ── Basic single-employee calculation ─────────────────────────────

  it("Schedule H - single employee with $10,000 wages computes correct SS, Medicare, and FUTA", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 1: $10,000 (below SS wage base)
    expect(result.line1.toNumber()).toBe(10000);
    // Line 2: $10,000 × 12.4% = $1,240
    expect(result.line2.toNumber()).toBe(1240);
    // Line 3: $10,000 (no cap)
    expect(result.line3.toNumber()).toBe(10000);
    // Line 4: $10,000 × 2.9% = $290
    expect(result.line4.toNumber()).toBe(290);
    // Line 5: $0 (below $200K threshold)
    expect(result.line5.toNumber()).toBe(0);
    // Line 6: $0
    expect(result.line6.toNumber()).toBe(0);
    // Line 7: $0 (no withholding)
    expect(result.line7.toNumber()).toBe(0);
    // Line 8: $1,240 + $290 = $1,530
    expect(result.line8.toNumber()).toBe(1530);
    // FUTA: min($10,000, $7,000) × 0.6% = $42
    expect(result.futaTax.toNumber()).toBe(42);
    // Total: $1,530 + $42 = $1,572
    expect(result.totalTax.toNumber()).toBe(1572);
  });

  // ── Threshold enforcement ─────────────────────────────────────────

  it("Schedule H - employee below $2,800 threshold does not trigger Schedule H", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("2799")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - employee at exactly $2,800 threshold triggers Schedule H", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("2800")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(2800);
    expect(result.line2.toNumber()).toBe(347.20);
    expect(result.line3.toNumber()).toBe(2800);
    expect(result.line4.toNumber()).toBe(81.20);
    expect(result.totalTax.greaterThan(0)).toBe(true);
  });

  // ── Exempt employee categories ────────────────────────────────────

  it("Schedule H - spouse is exempt from household employment taxes", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("50000", { isSpouse: true })],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - child under 21 is exempt", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("15000", { isChildUnder21: true })],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - parent is exempt", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("20000", { isParent: true })],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - under 18 non-principal occupation is exempt", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("5000", { isUnder18NonPrincipal: true })],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  it("Schedule H - exempt employee alongside qualifying employee", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("50000", { isSpouse: true }),
        makeEmployee("10000", { name: "Housekeeper" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(10000);
    expect(result.line3.toNumber()).toBe(10000);
  });

  // ── Social Security wage base cap ─────────────────────────────────

  it("Schedule H - SS wages capped at $176,100 per employee", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("200000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 1: capped at $176,100
    expect(result.line1.toNumber()).toBe(176100);
    // Line 2: $176,100 × 12.4% = $21,836.40
    expect(result.line2.toNumber()).toBe(21836.40);
    // Line 3: $200,000 (no cap for Medicare)
    expect(result.line3.toNumber()).toBe(200000);
    // Line 4: $200,000 × 2.9% = $5,800
    expect(result.line4.toNumber()).toBe(5800);
  });

  // ── Additional Medicare Tax ───────────────────────────────────────

  it("Schedule H - Additional Medicare Tax applies on wages above $200,000", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("250000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 5: $250,000 - $200,000 = $50,000
    expect(result.line5.toNumber()).toBe(50000);
    // Line 6: $50,000 × 0.9% = $450
    expect(result.line6.toNumber()).toBe(450);
  });

  it("Schedule H - no Additional Medicare Tax when wages at or below $200,000", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("200000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.line5.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
  });

  // ── Multiple employees ────────────────────────────────────────────

  it("Schedule H - multiple employees aggregate correctly with per-employee caps", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("180000", { name: "Nanny" }),
        makeEmployee("15000", { name: "Gardener" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 1: min(180000, 176100) + min(15000, 176100) = 176100 + 15000 = 191100
    expect(result.line1.toNumber()).toBe(191100);
    // Line 3: 180000 + 15000 = 195000 (no cap)
    expect(result.line3.toNumber()).toBe(195000);
    // FUTA: min(180000, 7000) + min(15000, 7000) = 7000 + 7000 = 14000 × 0.6% = $84
    expect(result.futaTax.toNumber()).toBe(84);
    expect(result.qualifyingEmployeeCount).toBe(2);
  });

  it("Schedule H - one employee above threshold and one below", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("5000", { name: "Nanny" }),
        makeEmployee("2000", { name: "Sitter" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Only the nanny qualifies ($5,000 >= $2,800)
    expect(result.qualifyingEmployeeCount).toBe(1);
    expect(result.line1.toNumber()).toBe(5000);
    expect(result.line3.toNumber()).toBe(5000);
  });

  // ── Federal income tax withholding ────────────────────────────────

  it("Schedule H - federal income tax withheld included in Line 8 total", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000", { federalIncomeTaxWithheld: "1500" })],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.line7.toNumber()).toBe(1500);
    // Line 8 = SS + Medicare + Additional Medicare + withholding
    expect(result.line8.toNumber()).toBe(1240 + 290 + 0 + 1500);
  });

  it("Schedule H - withholding from exempt employee is not included", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("10000", { isSpouse: true, federalIncomeTaxWithheld: "2000" }),
        makeEmployee("5000", { federalIncomeTaxWithheld: "500" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Only the non-spouse employee's withholding counts
    expect(result.line7.toNumber()).toBe(500);
  });

  // ── FUTA calculations ─────────────────────────────────────────────

  it("Schedule H - FUTA Section A uses net 0.6% rate", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA wages = min($10,000, $7,000) = $7,000
    // FUTA tax = $7,000 × 0.6% = $42
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H - FUTA Section B uses gross rate minus allowable credit", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "350",
      constants: CONSTANTS_2025,
    });

    // FUTA wages = $7,000
    // Gross FUTA = $7,000 × 6.0% = $420
    // Max credit = $7,000 × 5.4% = $378
    // State contributions = $350 (less than max credit)
    // Allowable credit = min($350, $378) = $350
    // Net FUTA = $420 - $350 = $70
    expect(result.futaTax.toNumber()).toBe(70);
  });

  it("Schedule H - FUTA Section B with state contributions exceeding max credit", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "500",
      constants: CONSTANTS_2025,
    });

    // Max credit = $7,000 × 5.4% = $378
    // Allowable credit = min($500, $378) = $378
    // Net FUTA = $420 - $378 = $42
    expect(result.futaTax.toNumber()).toBe(42);
  });

  it("Schedule H - FUTA Section B with credit reduction state", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "378",
      futaCreditReduction: "84", // e.g., CA credit reduction of 1.2% on $7,000
      constants: CONSTANTS_2025,
    });

    // Gross FUTA = $420
    // Max credit = $378
    // State contributions = $378
    // Allowable credit = min($378, $378) - $84 = $294
    // Net FUTA = $420 - $294 = $126
    expect(result.futaTax.toNumber()).toBe(126);
  });

  it("Schedule H - FUTA does not apply when futaApplies is false", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: false,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.futaTax.toNumber()).toBe(0);
    // Total should be just Part I
    expect(result.totalTax.toNumber()).toBe(result.line8.toNumber());
  });

  it("Schedule H - FUTA wages capped at $7,000 per employee", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("50000", { name: "Employee A" }),
        makeEmployee("3000", { name: "Employee B" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // FUTA wages = min(50000, 7000) + min(3000, 7000) = 7000 + 3000 = 10000
    // FUTA tax = 10000 × 0.6% = $60
    expect(result.futaTax.toNumber()).toBe(60);
  });

  // ── Total tax flows to Schedule 2 Line 9 ──────────────────────────

  it("Schedule H total flows to Schedule 2 Line 9", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("20000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // SS: $20,000 × 12.4% = $2,480
    // Medicare: $20,000 × 2.9% = $580
    // FUTA: $7,000 × 0.6% = $42
    // Total: $2,480 + $580 + $42 = $3,102
    expect(result.line2.toNumber()).toBe(2480);
    expect(result.line4.toNumber()).toBe(580);
    expect(result.futaTax.toNumber()).toBe(42);
    expect(result.totalTax.toNumber()).toBe(3102);
  });

  // ── Audit trail ───────────────────────────────────────────────────

  it("Schedule H - produces audit trail lines", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.form === "Schedule H" && l.line === "26")).toBe(true);
    expect(result.lines.some((l) => l.form === "Schedule H" && l.line === "2")).toBe(true);
  });

  it("Schedule H - audit trail includes exempt employee records", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("50000", { isSpouse: true, name: "Spouse" }),
        makeEmployee("10000", { name: "Nanny" }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.lines.some((l) => l.line === "exempt")).toBe(true);
  });

  // ── Edge: employee at exact SS wage base ──────────────────────────

  it("Schedule H - employee wages exactly at SS wage base", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("176100")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 1 = Line 3 only differ because Line 1 is capped
    expect(result.line1.toNumber()).toBe(176100);
    expect(result.line3.toNumber()).toBe(176100);
    expect(result.line2.toNumber()).toBe(21836.40);
  });

  // ── Edge: zero employees ──────────────────────────────────────────

  it("Schedule H - all employees exempt results in zero tax", () => {
    const result = calculateScheduleH({
      employees: [
        makeEmployee("30000", { isSpouse: true }),
        makeEmployee("10000", { isChildUnder21: true }),
      ],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    expect(result.qualifyingEmployeeCount).toBe(0);
    expect(result.totalTax.toNumber()).toBe(0);
  });

  // ── Edge: very high wages ─────────────────────────────────────────

  it("Schedule H - high-wage employee with Additional Medicare and SS cap", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("300000")],
      futaApplies: true,
      futaSectionA: true,
      constants: CONSTANTS_2025,
    });

    // Line 1: $176,100 (SS capped)
    expect(result.line1.toNumber()).toBe(176100);
    // Line 2: $176,100 × 12.4% = $21,836.40
    expect(result.line2.toNumber()).toBe(21836.40);
    // Line 3: $300,000 (Medicare no cap)
    expect(result.line3.toNumber()).toBe(300000);
    // Line 4: $300,000 × 2.9% = $8,700
    expect(result.line4.toNumber()).toBe(8700);
    // Line 5: $300,000 - $200,000 = $100,000
    expect(result.line5.toNumber()).toBe(100000);
    // Line 6: $100,000 × 0.9% = $900
    expect(result.line6.toNumber()).toBe(900);
    // FUTA: $7,000 × 0.6% = $42
    expect(result.futaTax.toNumber()).toBe(42);
    // Total: $21,836.40 + $8,700 + $900 + $42 = $31,478.40
    expect(result.totalTax.toNumber()).toBe(31478.40);
  });

  // ── Edge: FUTA Section B with no state contributions ──────────────

  it("Schedule H - FUTA Section B with no state contributions uses gross rate", () => {
    const result = calculateScheduleH({
      employees: [makeEmployee("10000")],
      futaApplies: true,
      futaSectionA: false,
      stateUnemploymentContributions: "0",
      constants: CONSTANTS_2025,
    });

    // Gross FUTA = $7,000 × 6.0% = $420
    // No state contributions = no credit
    // Net FUTA = $420
    expect(result.futaTax.toNumber()).toBe(420);
  });
});
