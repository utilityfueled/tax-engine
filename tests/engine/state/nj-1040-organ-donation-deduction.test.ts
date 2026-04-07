/**
 * Tests for New Jersey NJ-1040 line 36 Organ/Bone Marrow Donation Deduction.
 * Spec: spec/state/nj-1040-organ-donation-deduction.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040OrganDonationDeduction } from "@/engine/state/nj-1040-organ-donation-deduction.js";

describe("NJ-1040 organ donation deduction", () => {
  it("NJ-1040 organ donation deduction - eligible expenses floor at zero", () => {
    const result = calculateNJ1040OrganDonationDeduction({
      organDonationDeductionExpenses: -250,
    });

    expect(result.eligibleExpenses.toNumber()).toBe(0);
    expect(result.deduction.toNumber()).toBe(0);
  });

  it("NJ-1040 organ donation deduction - line 36 allows qualified expenses below the cap", () => {
    const result = calculateNJ1040OrganDonationDeduction({
      organDonationDeductionExpenses: 7200,
    });

    expect(result.eligibleExpenses.toNumber()).toBe(7200);
    expect(result.deduction.toNumber()).toBe(7200);
  });

  it("NJ-1040 organ donation deduction - line 36 caps the deduction at $10,000 per return", () => {
    const result = calculateNJ1040OrganDonationDeduction({
      organDonationDeductionExpenses: 12500,
    });

    expect(result.eligibleExpenses.toNumber()).toBe(12500);
    expect(result.deduction.toNumber()).toBe(10000);
  });
});
