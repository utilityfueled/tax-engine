/**
 * Tests for Ohio Lump Sum Distribution Credit Worksheet.
 * Spec: spec/state/oh-lump-sum-distribution-credit.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateOhioLumpSumDistributionCredit } from "@/engine/state/oh-lump-sum-distribution-credit.js";

describe("Ohio Lump Sum Distribution Credit", () => {
  it("OH Lump Sum Distribution Credit Line 1 - age 65 uses the 20.0 multiple", () => {
    const result = calculateOhioLumpSumDistributionCredit({
      taxYear: 2025,
      recipientAges: [65],
    });

    expect(result.recipients[0]!.multiple.toNumber()).toBe(20);
  });

  it("OH Lump Sum Distribution Credit Line 2 - age 70 gets an $800 credit", () => {
    const result = calculateOhioLumpSumDistributionCredit({
      taxYear: 2025,
      recipientAges: [70],
    });

    expect(result.recipients[0]!.credit.toNumber()).toBe(800);
  });

  it("OH Lump Sum Distribution Credit Line 3 - qualifying spouses add together", () => {
    const result = calculateOhioLumpSumDistributionCredit({
      taxYear: 2025,
      recipientAges: [65, 70],
    });

    expect(result.recipients).toHaveLength(2);
    expect(result.line3_totalCredit.toNumber()).toBe(1800);
  });

  it("OH Lump Sum Distribution Credit - age 64 gets no credit", () => {
    const result = calculateOhioLumpSumDistributionCredit({
      taxYear: 2025,
      recipientAges: [64],
    });

    expect(result.recipients[0]!.multiple.toNumber()).toBe(0);
    expect(result.recipients[0]!.credit.toNumber()).toBe(0);
    expect(result.line3_totalCredit.toNumber()).toBe(0);
  });

  it("OH Lump Sum Distribution Credit - age above 105 throws", () => {
    expect(() =>
      calculateOhioLumpSumDistributionCredit({
        taxYear: 2025,
        recipientAges: [106],
      })
    ).toThrow(/age 106/i);
  });

  it("OH Lump Sum Distribution Credit - more than two recipients throws", () => {
    expect(() =>
      calculateOhioLumpSumDistributionCredit({
        taxYear: 2025,
        recipientAges: [65, 70, 75],
      })
    ).toThrow(/at most two recipients/i);
  });
});
