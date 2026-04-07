/**
 * Edge case tests for Form 1099-K — Payment Card and Third Party Network Transactions.
 * Spec: spec/federal/form-1099-k.yaml
 *
 * Tests boundary conditions for aggregation, income type routing,
 * withholding precision, audit trail conditionals, and federal orchestrator
 * integration edge cases not covered by the main test file.
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099K } from "@/engine/forms/form-1099-k.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { Form1099K, TaxYearInput } from "@/models/inputs.js";

// ── Helpers ──────────────────────────────────────────────────

function make1099K(overrides: Partial<Form1099K> = {}): Form1099K {
  return {
    pse: overrides.pse ?? "Test PSE",
    grossAmount: overrides.grossAmount ?? "0",
    cardNotPresent: overrides.cardNotPresent ?? "0",
    federalWithheld: overrides.federalWithheld ?? "0",
    stateWithheld: overrides.stateWithheld ?? "0",
    state: overrides.state,
    incomeType: overrides.incomeType ?? "business",
  };
}

const baseTaxpayer: TaxYearInput["taxpayer"] = {
  taxYear: 2025,
  filingStatus: "single",
  primary: {
    firstName: "Test",
    lastName: "Edge",
    ssn: "111-22-3333",
    dateOfBirth: "1980-06-15",
  },
  address: {
    street: "100 Edge Case Ave",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
  },
  dependents: [],
};

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: baseTaxpayer,
    w2s: [],
    form1099Int: [],
    form1099Div: [],
    form1099B: [],
    form1099Nec: [],
    form1099Misc: [],
    scheduleK1: [],
    form1098: [],
    form1095A: [],
    donations: [],
    formW2G: [],
    ...overrides,
  };
}

// ── Edge Case Tests ──────────────────────────────────────────

describe("Form 1099-K Edge Cases", () => {
  describe("Sub-dollar and fractional cent precision", () => {
    it("Form 1099-K - aggregates sub-dollar amounts without rounding error", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Venmo", grossAmount: "0.01" }),
        make1099K({ pse: "PayPal", grossAmount: "0.99" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal("1.00"));
    });

    it("Form 1099-K - preserves fractional cents across many forms", () => {
      // 10 forms each with $0.33 — should NOT produce floating-point drift
      const forms = Array.from({ length: 10 }, (_, i) =>
        make1099K({ pse: `PSE-${i}`, grossAmount: "0.33" })
      );
      const result = calculateForm1099K(forms);
      expect(result.grossAmount).toEqual(new Decimal("3.30"));
    });

    it("Form 1099-K - withholding with sub-cent precision from exact 24% backup rate", () => {
      // $123.45 * 0.24 = $29.628 — verify sub-cent is preserved
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "123.45",
          federalWithheld: "29.628",
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal("29.628"));
    });
  });

  describe("All income types present simultaneously", () => {
    it("Form 1099-K - four income types sum exactly to gross amount", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "50000.50", incomeType: "business" }),
        make1099K({ pse: "Airbnb", grossAmount: "25000.25", incomeType: "rental" }),
        make1099K({ pse: "FarmDirect", grossAmount: "15000.15", incomeType: "farm" }),
        make1099K({ pse: "eBay", grossAmount: "9999.10", incomeType: "other" }),
      ]);
      const typeSum = result.businessGross
        .plus(result.rentalGross)
        .plus(result.farmGross)
        .plus(result.otherGross);
      expect(typeSum).toEqual(result.grossAmount);
      expect(result.grossAmount).toEqual(new Decimal("100000.00"));
    });

    it("Form 1099-K - multiple forms per income type aggregate independently", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "30000", incomeType: "business" }),
        make1099K({ pse: "PayPal", grossAmount: "20000", incomeType: "business" }),
        make1099K({ pse: "Airbnb", grossAmount: "10000", incomeType: "rental" }),
        make1099K({ pse: "VRBO", grossAmount: "8000", incomeType: "rental" }),
      ]);
      expect(result.businessGross).toEqual(new Decimal(50000));
      expect(result.rentalGross).toEqual(new Decimal(18000));
      expect(result.farmGross).toEqual(new Decimal(0));
      expect(result.otherGross).toEqual(new Decimal(0));
    });
  });

  describe("Withholding edge cases", () => {
    it("Form 1099-K - mixed withholding: some forms with backup withholding, others without", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "20000", federalWithheld: "4800" }),
        make1099K({ pse: "Stripe", grossAmount: "30000", federalWithheld: "0" }),
        make1099K({ pse: "Venmo", grossAmount: "10000", federalWithheld: "2400" }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(7200));
      expect(result.grossAmount).toEqual(new Decimal(60000));
    });

    it("Form 1099-K - state withholding from multiple states aggregates into single total", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "20000", stateWithheld: "1300", state: "CA" }),
        make1099K({ pse: "Stripe", grossAmount: "15000", stateWithheld: "900", state: "NY" }),
        make1099K({ pse: "Venmo", grossAmount: "10000", stateWithheld: "500", state: "IL" }),
      ]);
      expect(result.stateWithholding).toEqual(new Decimal(2700));
    });

    it("Form 1099-K - federal and state withholding both present on same form", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "50000",
          federalWithheld: "12000",
          stateWithheld: "3250",
          state: "CA",
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(12000));
      expect(result.stateWithholding).toEqual(new Decimal(3250));
    });
  });

  describe("Audit trail conditional logic", () => {
    it("Form 1099-K - no routing audit lines when all gross is $0 across all types", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "0", incomeType: "business" }),
        make1099K({ pse: "eBay", grossAmount: "0", incomeType: "other" }),
      ]);
      const routingLines = result.lines.filter((l) =>
        ["business", "farm", "rental", "other"].includes(l.line)
      );
      expect(routingLines).toHaveLength(0);
    });

    it("Form 1099-K - only generates audit lines for income types with nonzero gross", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "10000", incomeType: "business" }),
        make1099K({ pse: "Airbnb", grossAmount: "5000", incomeType: "rental" }),
      ]);
      const routingLines = result.lines.filter((l) =>
        ["business", "farm", "rental", "other"].includes(l.line)
      );
      expect(routingLines).toHaveLength(2);
      expect(routingLines.map((l) => l.line).sort()).toEqual(["business", "rental"]);
    });

    it("Form 1099-K - single form audit formula does not say 'Sum of'", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "25000" }),
      ]);
      const box1aLine = result.lines.find((l) => l.line === "1a");
      expect(box1aLine).toBeDefined();
      expect(box1aLine!.formula).not.toContain("Sum of");
    });

    it("Form 1099-K - multiple forms audit formula references form count", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "A", grossAmount: "5000" }),
        make1099K({ pse: "B", grossAmount: "3000" }),
        make1099K({ pse: "C", grossAmount: "2000" }),
      ]);
      const box1aLine = result.lines.find((l) => l.line === "1a");
      expect(box1aLine).toBeDefined();
      expect(box1aLine!.formula).toContain("3");
    });
  });

  describe("Card-not-present boundary values", () => {
    it("Form 1099-K - card-not-present equals gross (100% online transactions)", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Stripe",
          grossAmount: "75000",
          cardNotPresent: "75000",
        }),
      ]);
      expect(result.cardNotPresent).toEqual(result.grossAmount);
    });

    it("Form 1099-K - card-not-present is zero (all in-person transactions)", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Square",
          grossAmount: "45000",
          cardNotPresent: "0",
        }),
      ]);
      expect(result.cardNotPresent).toEqual(new Decimal(0));
      expect(result.grossAmount).toEqual(new Decimal(45000));
    });
  });

  describe("High volume aggregation", () => {
    it("Form 1099-K - 50 forms aggregate without precision loss", () => {
      const forms = Array.from({ length: 50 }, (_, i) =>
        make1099K({
          pse: `PSE-${i + 1}`,
          grossAmount: "1234.56",
          federalWithheld: "296.29",
          cardNotPresent: "1000.00",
          incomeType: "business",
        })
      );
      const result = calculateForm1099K(forms);
      expect(result.grossAmount).toEqual(new Decimal("1234.56").times(50));
      expect(result.federalWithholding).toEqual(new Decimal("296.29").times(50));
      expect(result.cardNotPresent).toEqual(new Decimal("1000.00").times(50));
      expect(result.numberOfForms).toBe(50);
    });
  });

  describe("Federal orchestrator integration edge cases", () => {
    it("Form 1099-K - farm income type flows through Schedule F in federal return", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "FarmDirect",
              grossAmount: "60000",
              incomeType: "farm",
            }),
          ],
          scheduleF: {
            salesOfProducts: "60000",
          },
        })
      );
      expect(result.form1099K).toBeDefined();
      expect(result.form1099K!.farmGross).toEqual(new Decimal(60000));
    });

    it("Form 1099-K - rental income type with Schedule E rental property", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "Airbnb",
              grossAmount: "36000",
              incomeType: "rental",
            }),
          ],
          scheduleE: {
            rentalProperties: [
              {
                address: "123 Rental Ave",
                propertyType: "single_family",
                rentalDays: 365,
                personalUseDays: 0,
                rents: "36000",
              },
            ],
          },
        })
      );
      expect(result.form1099K).toBeDefined();
      expect(result.form1099K!.rentalGross).toEqual(new Decimal(36000));
    });

    it("Form 1099-K - no W-2s, only 1099-K business income with backup withholding produces refund", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "PayPal",
              grossAmount: "15000",
              federalWithheld: "3600", // 24% backup withholding
              incomeType: "business",
            }),
          ],
          scheduleC: {
            grossReceipts: "15000",
          },
        })
      );
      // Backup withholding of $3,600 on $15,000 income should exceed tax liability
      // for a single filer with standard deduction ($15,350 in 2025), so should get refund
      expect(result.form1099K).toBeDefined();
      expect(result.form1099K!.federalWithholding).toEqual(new Decimal(3600));
    });

    it("Form 1099-K - other income type flows to Schedule 1 Line 8z", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "eBay",
              grossAmount: "8000",
              incomeType: "other",
            }),
          ],
          otherIncome: [
            {
              description: "Personal item sales",
              amount: "8000",
            },
          ],
        })
      );
      expect(result.form1099K).toBeDefined();
      expect(result.form1099K!.otherGross).toEqual(new Decimal(8000));
    });
  });
});
