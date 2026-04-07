/**
 * Tests for New Jersey NJ-1040 overpayment allocation and charitable contributions.
 * Spec: spec/state/nj-1040-overpayment-allocation.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040OverpaymentAllocation } from "@/engine/state/nj-1040-overpayment-allocation.js";

describe("NJ-1040 overpayment allocation", () => {
  it("NJ-1040 overpayment allocation line 67 computes amount owed before adjustments", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 500,
      totalPayments: 300,
    });
    expect(result.line67AmountOwed.toNumber()).toBe(200);
    expect(result.line68Overpayment.toNumber()).toBe(0);
    expect(result.balanceDue.toNumber()).toBe(200);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("NJ-1040 overpayment allocation line 68 computes overpayment before adjustments", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 300,
      totalPayments: 500,
    });
    expect(result.line67AmountOwed.toNumber()).toBe(0);
    expect(result.line68Overpayment.toNumber()).toBe(200);
    expect(result.balanceDue.toNumber()).toBe(0);
    expect(result.refund.toNumber()).toBe(200);
  });

  it("NJ-1040 overpayment allocation line 69 credits part of an overpayment to 2026 tax", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 300,
      totalPayments: 500,
      creditToNextYear: 75,
    });
    expect(result.creditToNextYear.toNumber()).toBe(75);
    expect(result.line78TotalAdjustments.toNumber()).toBe(75);
    expect(result.refund.toNumber()).toBe(125);
  });

  it("NJ-1040 overpayment allocation line 70 fixed charitable contributions reduce the refund", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 100,
      totalPayments: 250,
      endangeredWildlifeFundContribution: 10,
      childrensTrustFundContribution: 20,
      vietnamVeteransMemorialFundContribution: 5,
    });
    expect(result.totalCharitableContributions.toNumber()).toBe(35);
    expect(result.line78TotalAdjustments.toNumber()).toBe(35);
    expect(result.refund.toNumber()).toBe(115);
  });

  it("NJ-1040 overpayment allocation lines 75 through 77 accept valid designated contribution codes", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 50,
      totalPayments: 200,
      otherDesignatedContributions: [
        { code: "01", amount: 10 },
        { code: "20", amount: 15 },
        { code: "32", amount: 25 },
      ],
    });
    expect(result.otherDesignatedContributions).toHaveLength(3);
    expect(result.totalCharitableContributions.toNumber()).toBe(50);
    expect(result.refund.toNumber()).toBe(100);
  });

  it("NJ-1040 overpayment allocation line 78 sums carryforward and all charitable contributions", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 120,
      totalPayments: 220,
      creditToNextYear: 25,
      ussNewJerseyEducationalMuseumFundContribution: 10,
      otherDesignatedContributions: [{ code: "14", amount: 5 }],
    });
    expect(result.line78TotalAdjustments.toNumber()).toBe(40);
    expect(result.refund.toNumber()).toBe(60);
  });

  it("NJ-1040 overpayment allocation line 79 turns an overpayment into tax due when adjustments exceed the refund", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 500,
      totalPayments: 550,
      creditToNextYear: 20,
      endangeredWildlifeFundContribution: 40,
    });
    expect(result.line68Overpayment.toNumber()).toBe(50);
    expect(result.line78TotalAdjustments.toNumber()).toBe(60);
    expect(result.balanceDue.toNumber()).toBe(10);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("NJ-1040 overpayment allocation line 80 reduces the refund by the carryforward and contributions", () => {
    const result = calculateNJ1040OverpaymentAllocation({
      taxYear: 2025,
      totalTaxDue: 200,
      totalPayments: 300,
      creditToNextYear: 30,
      breastCancerResearchFundContribution: 15,
    });
    expect(result.line68Overpayment.toNumber()).toBe(100);
    expect(result.refund.toNumber()).toBe(55);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("NJ-1040 overpayment allocation rejects credit to next year above the overpayment", () => {
    expect(() =>
      calculateNJ1040OverpaymentAllocation({
        taxYear: 2025,
        totalTaxDue: 300,
        totalPayments: 350,
        creditToNextYear: 60,
      })
    ).toThrow(/line 69/i);
  });

  it("NJ-1040 overpayment allocation rejects more than three designated contributions", () => {
    expect(() =>
      calculateNJ1040OverpaymentAllocation({
        taxYear: 2025,
        totalTaxDue: 100,
        totalPayments: 200,
        otherDesignatedContributions: [
          { code: "01", amount: 10 },
          { code: "02", amount: 10 },
          { code: "03", amount: 10 },
          { code: "04", amount: 10 },
        ],
      })
    ).toThrow(/up to three/i);
  });

  it("NJ-1040 overpayment allocation rejects an unknown designated contribution code", () => {
    expect(() =>
      calculateNJ1040OverpaymentAllocation({
        taxYear: 2025,
        totalTaxDue: 100,
        totalPayments: 200,
        otherDesignatedContributions: [{ code: "99", amount: 10 }],
      })
    ).toThrow(/invalid charitable contribution code/i);
  });
});
