/**
 * Tests for Pennsylvania Use Tax Worksheet
 * Spec: spec/state/pa-use-tax.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePAUseTax,
  type PAUseTaxInput,
} from "@/engine/state/pa-use-tax.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides: Partial<PAUseTaxInput> = {}): PAUseTaxInput {
  return {
    taxYear: 2025,
    paTaxableIncome: d(0),
    locality: "remainder_of_pa",
    taxableItemPurchases: d(0),
    taxableServicePurchases: d(0),
    electEstimatedTable: false,
    salesTaxAlreadyPaid: d(0),
    ...overrides,
  };
}

describe("Pennsylvania Use Tax Worksheet", () => {
  it("PA Use Tax Worksheet Line 5 multiplies taxable purchases by the locality rate", () => {
    const remainderResult = calculatePAUseTax(makeInput({
      taxableItemPurchases: d(500),
      taxableServicePurchases: d(250),
    }));
    expect(remainderResult.totalTaxablePurchases.toNumber()).toBe(750);
    expect(remainderResult.taxRate.toString()).toBe("0.06");
    expect(remainderResult.actualPurchaseUseTax.toNumber()).toBe(45);

    const philadelphiaResult = calculatePAUseTax(makeInput({
      locality: "philadelphia",
      taxableItemPurchases: d(500),
      taxableServicePurchases: d(250),
    }));
    expect(philadelphiaResult.taxRate.toString()).toBe("0.08");
    expect(philadelphiaResult.actualPurchaseUseTax.toNumber()).toBe(60);
  });

  it("PA Use Tax Worksheet Line 6 follows the 2025 Table 1 brackets and caps by locality", () => {
    const lowIncome = calculatePAUseTax(makeInput({
      paTaxableIncome: d(15000),
      electEstimatedTable: true,
    }));
    expect(lowIncome.estimatedTableUseTax.toNumber()).toBe(6);

    const midIncome = calculatePAUseTax(makeInput({
      paTaxableIncome: d(100000),
      locality: "allegheny_county",
      electEstimatedTable: true,
    }));
    expect(midIncome.estimatedTableUseTax.toNumber()).toBe(37);

    const cappedHighIncome = calculatePAUseTax(makeInput({
      paTaxableIncome: d(300000),
      locality: "philadelphia",
      electEstimatedTable: true,
    }));
    expect(cappedHighIncome.estimatedTableUseTax.toNumber()).toBe(100);
  });

  it("PA Use Tax Worksheet Line 8 subtracts prior sales tax paid and floors at zero", () => {
    const result = calculatePAUseTax(makeInput({
      paTaxableIncome: d(40000),
      taxableItemPurchases: d(500),
      taxableServicePurchases: d(250),
      electEstimatedTable: true,
      salesTaxAlreadyPaid: d(10),
    }));

    expect(result.actualPurchaseUseTax.toNumber()).toBe(45);
    expect(result.estimatedTableUseTax.toNumber()).toBe(17);
    expect(result.totalUseTaxLiability.toNumber()).toBe(52);

    const floored = calculatePAUseTax(makeInput({
      locality: "philadelphia",
      taxableItemPurchases: d(100),
      salesTaxAlreadyPaid: d(20),
    }));
    expect(floored.totalUseTaxLiability.toNumber()).toBe(0);
  });

  it("PA Use Tax Worksheet Line 7 caps itemized prior sales tax offsets at the applicable PA rate", () => {
    const result = calculatePAUseTax(makeInput({
      paTaxableIncome: d(40000),
      locality: "philadelphia",
      taxableItemPurchases: d(1000),
      electEstimatedTable: true,
      salesTaxAlreadyPaidEntries: [
        {
          taxablePurchaseAmount: d(1000),
          salesTaxPaid: d(100),
        },
      ],
    }));

    expect(result.actualPurchaseUseTax.toNumber()).toBe(80);
    expect(result.estimatedTableUseTax.toNumber()).toBe(22);
    expect(result.salesTaxAlreadyPaid.toNumber()).toBe(80);
    expect(result.totalUseTaxLiability.toNumber()).toBe(22);
  });
});
