/**
 * Tests for New York IT-119 STAR Credit Advance Payment Reconciliation.
 * Spec: spec/state/ny-it119-star-credit-advance-payment-reconciliation.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT119,
  type NYIT119Input,
} from "@/engine/state/ny-it119-star-credit-advance-payment-reconciliation.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function it119Input2025(overrides: Partial<NYIT119Input> = {}): NYIT119Input {
  return {
    taxYear: 2025,
    receivedUnderpaymentNotice: true,
    properties: [
      {
        underpaymentAmount: 125,
      },
    ],
    ...overrides,
  };
}

describe("NY IT-119 STAR credit advance payment reconciliation", () => {
  it("Line 1d and line 3 - one property underpayment carries to the total reconciliation credit", () => {
    const result = calculateNYIT119(
      it119Input2025({
        properties: [{ underpaymentAmount: 125 }],
      })
    );

    expect(result.firstPropertyUnderpayment.equals(d(125))).toBe(true);
    expect(result.secondPropertyUnderpayment.equals(d(0))).toBe(true);
    expect(result.totalReconciliationCredit.equals(d(125))).toBe(true);
  });

  it("Line 2d and line 3 - two property underpayments are both included in the reconciliation total", () => {
    const result = calculateNYIT119(
      it119Input2025({
        properties: [
          { underpaymentAmount: 125 },
          { underpaymentAmount: 35 },
        ],
      })
    );

    expect(result.firstPropertyUnderpayment.equals(d(125))).toBe(true);
    expect(result.secondPropertyUnderpayment.equals(d(35))).toBe(true);
    expect(result.totalReconciliationCredit.equals(d(160))).toBe(true);
  });

  it("IT-119 rejects reconciliation without an underpayment notice", () => {
    expect(() =>
      calculateNYIT119(
        it119Input2025({
          receivedUnderpaymentNotice: false,
        })
      )
    ).toThrow("NY IT-119 may only be claimed when the taxpayer received an underpayment notice");
  });

  it("IT-119 rejects more than two reconciled properties", () => {
    expect(() =>
      calculateNYIT119(
        it119Input2025({
          properties: [
            { underpaymentAmount: 50 },
            { underpaymentAmount: 25 },
            { underpaymentAmount: 10 },
          ],
        })
      )
    ).toThrow("NY IT-119 supports at most two reconciled properties");
  });
});
