/**
 * Tests for Ohio IT BUS — Schedule of Business Income.
 * Spec: spec/state/oh-it-bus.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateOhioITBus,
  type ITBusK1Entry,
  type OhioITBusInput,
} from "@/engine/state/oh-it-bus.js";

const d = (value: string | number) => new Decimal(value);

function makeInput(overrides: Partial<OhioITBusInput> = {}): OhioITBusInput {
  return { ...overrides };
}

describe("Ohio IT BUS — Schedule of Business Income", () => {
  // -------------------------------------------------------------------------
  // Line 1 — Schedule C net profit
  // -------------------------------------------------------------------------

  it("IT BUS Line 1 - Schedule C net profit flows through", () => {
    const result = calculateOhioITBus(makeInput({ scheduleCNetProfit: 80000 }));
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(80000);
  });

  it("IT BUS Line 1 - Schedule C loss is negative", () => {
    const result = calculateOhioITBus(makeInput({ scheduleCNetProfit: -15000 }));
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(-15000);
  });

  it("IT BUS Line 1 - defaults to zero when omitted", () => {
    const result = calculateOhioITBus(makeInput());
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(0);
  });

  it("IT BUS Line 1 - Decimal input works", () => {
    const result = calculateOhioITBus(makeInput({ scheduleCNetProfit: d("45123.67") }));
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(45123.67);
  });

  // -------------------------------------------------------------------------
  // Line 2 — Schedule F net farm profit
  // -------------------------------------------------------------------------

  it("IT BUS Line 2 - Schedule F net farm profit flows through", () => {
    const result = calculateOhioITBus(makeInput({ scheduleFNetFarmProfit: 60000 }));
    expect(result.line2_scheduleFNetFarmProfit.toNumber()).toBe(60000);
  });

  it("IT BUS Line 2 - Schedule F loss is negative", () => {
    const result = calculateOhioITBus(makeInput({ scheduleFNetFarmProfit: -25000 }));
    expect(result.line2_scheduleFNetFarmProfit.toNumber()).toBe(-25000);
  });

  it("IT BUS Line 2 - defaults to zero when omitted", () => {
    const result = calculateOhioITBus(makeInput());
    expect(result.line2_scheduleFNetFarmProfit.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 3 — K-1 guaranteed payments
  // -------------------------------------------------------------------------

  it("IT BUS Line 3 - K-1 guaranteed payments from single entity", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "ABC LLC", guaranteedPayments: 50000 },
      ],
    }));
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(50000);
  });

  it("IT BUS Line 3 - K-1 guaranteed payments aggregated across entities", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "ABC LLC", guaranteedPayments: 30000 },
        { entityName: "XYZ LP", guaranteedPayments: 20000 },
      ],
    }));
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(50000);
  });

  it("IT BUS Line 3 - guaranteed payments from passive entity still qualify", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Passive LP", guaranteedPayments: 25000, isPassiveActivity: true },
      ],
    }));
    // Guaranteed payments always qualify even from passive entities
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(25000);
  });

  it("IT BUS Line 3 - zero guaranteed payments contribute nothing", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "S-Corp", guaranteedPayments: 0, ordinaryIncome: 100000 },
      ],
    }));
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(0);
  });

  it("IT BUS Line 3 - undefined guaranteed payments treated as zero", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "S-Corp", ordinaryIncome: 100000 },
      ],
    }));
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(0);
  });

  it("IT BUS Line 3 - no K-1 entries defaults to zero", () => {
    const result = calculateOhioITBus(makeInput());
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 4 — K-1 active ordinary income
  // -------------------------------------------------------------------------

  it("IT BUS Line 4 - active K-1 ordinary income qualifies", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Active LLC", ordinaryIncome: 120000, isPassiveActivity: false },
      ],
    }));
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(120000);
  });

  it("IT BUS Line 4 - passive K-1 ordinary income excluded", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Passive LP", ordinaryIncome: 80000, isPassiveActivity: true },
      ],
    }));
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(0);
  });

  it("IT BUS Line 4 - mixed active and passive K-1s", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Active LLC", ordinaryIncome: 100000, isPassiveActivity: false },
        { entityName: "Passive LP", ordinaryIncome: 50000, isPassiveActivity: true },
        { entityName: "Active S-Corp", ordinaryIncome: 75000, isPassiveActivity: false },
      ],
    }));
    // Only active entities: 100000 + 75000 = 175000
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(175000);
  });

  it("IT BUS Line 4 - active K-1 loss reduces business income", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Startup LLC", ordinaryIncome: -30000, isPassiveActivity: false },
      ],
    }));
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(-30000);
  });

  it("IT BUS Line 4 - default isPassiveActivity is false (active)", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "LLC", ordinaryIncome: 60000 },
      ],
    }));
    // Default is active
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(60000);
  });

  it("IT BUS Line 4 - S-corporation and partnership treated same", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Partnership", ordinaryIncome: 40000, isPassiveActivity: false },
        { entityName: "S-Corp", ordinaryIncome: 60000, isPassiveActivity: false },
      ],
    }));
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(100000);
  });

  // -------------------------------------------------------------------------
  // Line 5 — Other qualifying business income
  // -------------------------------------------------------------------------

  it("IT BUS Line 5 - other qualifying business income flows through", () => {
    const result = calculateOhioITBus(makeInput({ otherBusinessIncome: 15000 }));
    expect(result.line5_otherBusinessIncome.toNumber()).toBe(15000);
  });

  it("IT BUS Line 5 - defaults to zero when omitted", () => {
    const result = calculateOhioITBus(makeInput());
    expect(result.line5_otherBusinessIncome.toNumber()).toBe(0);
  });

  it("IT BUS Line 5 - negative other business income", () => {
    const result = calculateOhioITBus(makeInput({ otherBusinessIncome: -5000 }));
    expect(result.line5_otherBusinessIncome.toNumber()).toBe(-5000);
  });

  // -------------------------------------------------------------------------
  // Line 6 — Total qualifying business income
  // -------------------------------------------------------------------------

  it("IT BUS Line 6 - total qualifying business income is sum of lines 1-5", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 80000,
      scheduleFNetFarmProfit: 20000,
      k1Entries: [
        { entityName: "LLC", guaranteedPayments: 10000, ordinaryIncome: 50000 },
      ],
      otherBusinessIncome: 5000,
    }));
    // 80000 + 20000 + 10000 + 50000 + 5000 = 165000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(165000);
  });

  it("IT BUS Line 6 - all sources contribute", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 50000,
      scheduleFNetFarmProfit: 30000,
      k1Entries: [
        { entityName: "Active", guaranteedPayments: 15000, ordinaryIncome: 25000 },
        { entityName: "Passive", guaranteedPayments: 5000, ordinaryIncome: 40000, isPassiveActivity: true },
      ],
      otherBusinessIncome: 10000,
    }));
    // Sch C: 50000
    // Sch F: 30000
    // K-1 GP: 15000 + 5000 = 20000
    // K-1 active ordinary: 25000 + 0 (passive excluded) = 25000
    // Other: 10000
    // Total: 50000 + 30000 + 20000 + 25000 + 10000 = 135000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(135000);
  });

  it("IT BUS Line 6 - losses reduce total", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: -20000,
      scheduleFNetFarmProfit: 50000,
      k1Entries: [
        { entityName: "LLC", ordinaryIncome: -10000 },
      ],
    }));
    // -20000 + 50000 + 0 (GP) + -10000 + 0 = 20000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(20000);
  });

  it("IT BUS Line 6 - can be negative when losses exceed income", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: -100000,
      scheduleFNetFarmProfit: 30000,
    }));
    // -100000 + 30000 = -70000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(-70000);
  });

  it("IT BUS Line 6 - all zeros when no business income", () => {
    const result = calculateOhioITBus(makeInput());
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // K-1 details
  // -------------------------------------------------------------------------

  it("IT BUS - k1Details tracks per-entity breakdown", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Active LLC", guaranteedPayments: 10000, ordinaryIncome: 50000, isPassiveActivity: false },
        { entityName: "Passive LP", guaranteedPayments: 5000, ordinaryIncome: 30000, isPassiveActivity: true },
      ],
    }));
    expect(result.k1Details).toHaveLength(2);

    const active = result.k1Details[0]!;
    expect(active.entityName).toBe("Active LLC");
    expect(active.guaranteedPayments.toNumber()).toBe(10000);
    expect(active.activeOrdinaryIncome.toNumber()).toBe(50000);
    expect(active.isPassive).toBe(false);

    const passive = result.k1Details[1]!;
    expect(passive.entityName).toBe("Passive LP");
    expect(passive.guaranteedPayments.toNumber()).toBe(5000);
    expect(passive.activeOrdinaryIncome.toNumber()).toBe(0); // passive excluded
    expect(passive.isPassive).toBe(true);
  });

  it("IT BUS - empty k1Entries produces empty details", () => {
    const result = calculateOhioITBus(makeInput({ k1Entries: [] }));
    expect(result.k1Details).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it("IT BUS - produces audit trail lines", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 50000,
      k1Entries: [{ entityName: "LLC", ordinaryIncome: 20000 }],
    }));
    expect(result.lines.length).toBeGreaterThan(0);
    const forms = result.lines.map((l) => l.form);
    expect(forms.every((f) => f === "OH-IT-BUS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // End-to-end scenarios
  // -------------------------------------------------------------------------

  it("IT BUS - sole proprietor with Schedule C only", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 95000,
    }));
    expect(result.line1_scheduleCNetProfit.toNumber()).toBe(95000);
    expect(result.line2_scheduleFNetFarmProfit.toNumber()).toBe(0);
    expect(result.line3_k1GuaranteedPayments.toNumber()).toBe(0);
    expect(result.line4_k1ActiveOrdinaryIncome.toNumber()).toBe(0);
    expect(result.line5_otherBusinessIncome.toNumber()).toBe(0);
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(95000);
  });

  it("IT BUS - farmer with Schedule F only", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleFNetFarmProfit: 120000,
    }));
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(120000);
  });

  it("IT BUS - partner with GP and active ordinary income", () => {
    const result = calculateOhioITBus(makeInput({
      k1Entries: [
        { entityName: "Law Firm LLP", guaranteedPayments: 180000, ordinaryIncome: 70000 },
      ],
    }));
    // GP: 180000, active ordinary: 70000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(250000);
  });

  it("IT BUS - diversified business owner: C, F, K-1 active, K-1 passive", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 40000,
      scheduleFNetFarmProfit: 25000,
      k1Entries: [
        { entityName: "Consulting LLC", guaranteedPayments: 60000, ordinaryIncome: 80000, isPassiveActivity: false },
        { entityName: "RE Fund LP", guaranteedPayments: 0, ordinaryIncome: 45000, isPassiveActivity: true },
      ],
      otherBusinessIncome: 10000,
    }));
    // Sch C: 40000
    // Sch F: 25000
    // K-1 GP: 60000 + 0 = 60000
    // K-1 active ordinary: 80000 + 0 (passive) = 80000
    // Other: 10000
    // Total: 40000 + 25000 + 60000 + 80000 + 10000 = 215000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(215000);
  });

  it("IT BUS - business with net loss across all sources", () => {
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: -50000,
      scheduleFNetFarmProfit: -20000,
      k1Entries: [
        { entityName: "Startup", ordinaryIncome: -30000 },
      ],
    }));
    // -50000 + -20000 + 0 + -30000 = -100000
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(-100000);
  });

  it("IT BUS - high income exceeding deduction cap (verifies total, not cap)", () => {
    // IT BUS just computes total; the cap is applied in Schedule of Adjustments
    const result = calculateOhioITBus(makeInput({
      scheduleCNetProfit: 200000,
      k1Entries: [
        { entityName: "Consulting", guaranteedPayments: 150000, ordinaryIncome: 100000 },
      ],
    }));
    // 200000 + 150000 + 100000 = 450000
    // (IT BUS does NOT apply the $250K cap — that's Schedule of Adjustments line 15)
    expect(result.line6_totalQualifyingBusinessIncome.toNumber()).toBe(450000);
  });
});
