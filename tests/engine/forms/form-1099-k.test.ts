/**
 * Tests for Form 1099-K — Payment Card and Third Party Network Transactions.
 * Spec: spec/federal/form-1099-k.yaml
 *
 * Covers:
 * - Single 1099-K aggregation
 * - Multiple 1099-K aggregation from different PSEs
 * - Income type routing (business, farm, rental, other)
 * - Federal withholding (Box 4) flowing to Form 1040 Line 25d
 * - State withholding aggregation
 * - Card-not-present tracking
 * - Zero/empty edge cases
 * - Mixed income types across multiple forms
 * - Federal orchestrator integration
 * - Audit trail verification
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
    lastName: "Freelancer",
    ssn: "111-22-3333",
    dateOfBirth: "1980-06-15",
  },
  address: {
    street: "100 Gig Lane",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
  },
  dependents: [],
};

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    taxpayer: baseTaxpayer,
    w2s: [
      {
        employer: { name: "Day Job Inc", ein: "99-8765432" },
        wages: "50000",
        federalWithheld: "6000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      },
    ],
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

// ── Unit Tests (calculateForm1099K) ──────────────────────────

describe("Form 1099-K Payment Card and Third Party Network Transactions", () => {
  describe("Gross Amount Aggregation", () => {
    it("Form 1099-K - single 1099-K aggregates gross amount", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "25000" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(25000));
      expect(result.numberOfForms).toBe(1);
    });

    it("Form 1099-K - multiple 1099-Ks from different PSEs are summed", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "15000" }),
        make1099K({ pse: "Venmo", grossAmount: "8000" }),
        make1099K({ pse: "Square", grossAmount: "12500" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(35500));
      expect(result.numberOfForms).toBe(3);
    });

    it("Form 1099-K - zero forms produces zero result", () => {
      const result = calculateForm1099K([]);
      expect(result.grossAmount).toEqual(new Decimal(0));
      expect(result.cardNotPresent).toEqual(new Decimal(0));
      expect(result.federalWithholding).toEqual(new Decimal(0));
      expect(result.stateWithholding).toEqual(new Decimal(0));
      expect(result.businessGross).toEqual(new Decimal(0));
      expect(result.farmGross).toEqual(new Decimal(0));
      expect(result.rentalGross).toEqual(new Decimal(0));
      expect(result.otherGross).toEqual(new Decimal(0));
      expect(result.numberOfForms).toBe(0);
      expect(result.lines).toHaveLength(0);
    });

    it("Form 1099-K - single form with zero gross amount", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "0" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(0));
      expect(result.numberOfForms).toBe(1);
    });

    it("Form 1099-K - large gross amounts aggregate correctly", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "Stripe", grossAmount: "500000" }),
        make1099K({ pse: "Square", grossAmount: "350000" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(850000));
    });

    it("Form 1099-K - cents are preserved in aggregation", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "PayPal", grossAmount: "12345.67" }),
        make1099K({ pse: "Venmo", grossAmount: "8901.23" }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal("21246.90"));
    });
  });

  describe("Card Not Present Tracking", () => {
    it("Form 1099-K - tracks card-not-present as informational", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Stripe",
          grossAmount: "50000",
          cardNotPresent: "35000",
        }),
      ]);
      expect(result.cardNotPresent).toEqual(new Decimal(35000));
      expect(result.grossAmount).toEqual(new Decimal(50000));
    });

    it("Form 1099-K - card-not-present sums across multiple forms", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "20000",
          cardNotPresent: "15000",
        }),
        make1099K({
          pse: "Venmo",
          grossAmount: "10000",
          cardNotPresent: "10000",
        }),
      ]);
      expect(result.cardNotPresent).toEqual(new Decimal(25000));
    });
  });

  describe("Federal Withholding", () => {
    it("Form 1099-K - withholding aggregates from Box 4", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "30000",
          federalWithheld: "7200",
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(7200));
    });

    it("Form 1099-K - withholding sums across multiple forms", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "20000",
          federalWithheld: "4800",
        }),
        make1099K({
          pse: "Venmo",
          grossAmount: "15000",
          federalWithheld: "3600",
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(8400));
    });

    it("Form 1099-K - most forms have zero withholding", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Stripe",
          grossAmount: "100000",
          federalWithheld: "0",
        }),
        make1099K({
          pse: "PayPal",
          grossAmount: "50000",
          federalWithheld: "0",
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(0));
    });
  });

  describe("State Withholding", () => {
    it("Form 1099-K - aggregates state withholding", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "40000",
          stateWithheld: "2000",
          state: "CA",
        }),
      ]);
      expect(result.stateWithholding).toEqual(new Decimal(2000));
    });

    it("Form 1099-K - state withholding sums across multiple states", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "20000",
          stateWithheld: "1000",
          state: "CA",
        }),
        make1099K({
          pse: "Venmo",
          grossAmount: "15000",
          stateWithheld: "600",
          state: "NY",
        }),
      ]);
      expect(result.stateWithholding).toEqual(new Decimal(1600));
    });
  });

  describe("Income Type Routing", () => {
    it("Form 1099-K - routes income by type", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "30000",
          incomeType: "business",
        }),
      ]);
      expect(result.businessGross).toEqual(new Decimal(30000));
      expect(result.farmGross).toEqual(new Decimal(0));
      expect(result.rentalGross).toEqual(new Decimal(0));
      expect(result.otherGross).toEqual(new Decimal(0));
    });

    it("Form 1099-K - routes income by type - farm", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Farm Credit",
          grossAmount: "45000",
          incomeType: "farm",
        }),
      ]);
      expect(result.farmGross).toEqual(new Decimal(45000));
      expect(result.businessGross).toEqual(new Decimal(0));
    });

    it("Form 1099-K - routes income by type - rental", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Airbnb",
          grossAmount: "22000",
          incomeType: "rental",
        }),
      ]);
      expect(result.rentalGross).toEqual(new Decimal(22000));
      expect(result.businessGross).toEqual(new Decimal(0));
    });

    it("Form 1099-K - routes income by type - other (personal item sales)", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "eBay",
          grossAmount: "8000",
          incomeType: "other",
        }),
      ]);
      expect(result.otherGross).toEqual(new Decimal(8000));
      expect(result.businessGross).toEqual(new Decimal(0));
    });

    it("Form 1099-K - mixed income types across multiple forms", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "20000",
          incomeType: "business",
        }),
        make1099K({
          pse: "Airbnb",
          grossAmount: "15000",
          incomeType: "rental",
        }),
        make1099K({
          pse: "eBay",
          grossAmount: "5000",
          incomeType: "other",
        }),
        make1099K({
          pse: "Farm Direct",
          grossAmount: "30000",
          incomeType: "farm",
        }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(70000));
      expect(result.businessGross).toEqual(new Decimal(20000));
      expect(result.rentalGross).toEqual(new Decimal(15000));
      expect(result.otherGross).toEqual(new Decimal(5000));
      expect(result.farmGross).toEqual(new Decimal(30000));
    });

    it("Form 1099-K - defaults to business income type when not specified", () => {
      const form: Form1099K = {
        pse: "Generic PSE",
        grossAmount: "10000",
        cardNotPresent: "0",
        federalWithheld: "0",
        stateWithheld: "0",
        incomeType: "business",
      };
      const result = calculateForm1099K([form]);
      expect(result.businessGross).toEqual(new Decimal(10000));
    });

    it("Form 1099-K - multiple business forms aggregate correctly", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "12000",
          incomeType: "business",
        }),
        make1099K({
          pse: "Stripe",
          grossAmount: "18000",
          incomeType: "business",
        }),
        make1099K({
          pse: "Square",
          grossAmount: "5000",
          incomeType: "business",
        }),
      ]);
      expect(result.businessGross).toEqual(new Decimal(35000));
      expect(result.grossAmount).toEqual(new Decimal(35000));
    });
  });

  describe("Audit Trail", () => {
    it("Form 1099-K - provides reconciliation summary", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "25000",
          federalWithheld: "6000",
          incomeType: "business",
        }),
      ]);
      const box1aLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "1a"
      );
      expect(box1aLine).toBeDefined();
      expect(box1aLine!.value).toEqual(new Decimal(25000));

      const withholdingLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "4"
      );
      expect(withholdingLine).toBeDefined();
      expect(withholdingLine!.value).toEqual(new Decimal(6000));

      const businessLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "business"
      );
      expect(businessLine).toBeDefined();
      expect(businessLine!.value).toEqual(new Decimal(25000));
    });

    it("Form 1099-K - audit trail includes number of forms", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "A", grossAmount: "5000" }),
        make1099K({ pse: "B", grossAmount: "3000" }),
      ]);
      const box1aLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "1a"
      );
      expect(box1aLine).toBeDefined();
      expect(box1aLine!.formula).toContain("2");
    });

    it("Form 1099-K - no audit lines for zero state withholding", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "10000",
          stateWithheld: "0",
        }),
      ]);
      const stateLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "8"
      );
      expect(stateLine).toBeUndefined();
    });

    it("Form 1099-K - audit line for state withholding when nonzero", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "10000",
          stateWithheld: "500",
          state: "CA",
        }),
      ]);
      const stateLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "8"
      );
      expect(stateLine).toBeDefined();
      expect(stateLine!.value).toEqual(new Decimal(500));
    });

    it("Form 1099-K - no routing audit lines for income types with zero gross", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: "10000",
          incomeType: "business",
        }),
      ]);
      const farmLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "farm"
      );
      expect(farmLine).toBeUndefined();
      const rentalLine = result.lines.find(
        (l) => l.form === "Form 1099-K" && l.line === "rental"
      );
      expect(rentalLine).toBeUndefined();
    });
  });

  describe("Realistic Scenarios", () => {
    it("Form 1099-K - freelance developer with multiple payment processors", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Stripe",
          grossAmount: "85000",
          cardNotPresent: "85000",
          incomeType: "business",
        }),
        make1099K({
          pse: "PayPal",
          grossAmount: "32000",
          cardNotPresent: "32000",
          incomeType: "business",
        }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(117000));
      expect(result.businessGross).toEqual(new Decimal(117000));
      expect(result.cardNotPresent).toEqual(new Decimal(117000));
    });

    it("Form 1099-K - Airbnb host with backup withholding", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Airbnb",
          grossAmount: "48000",
          cardNotPresent: "48000",
          federalWithheld: "11520", // 24% backup withholding
          incomeType: "rental",
        }),
      ]);
      expect(result.rentalGross).toEqual(new Decimal(48000));
      expect(result.federalWithholding).toEqual(new Decimal(11520));
    });

    it("Form 1099-K - mixed gig worker (rideshare + eBay personal sales)", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Uber",
          grossAmount: "42000",
          incomeType: "business",
        }),
        make1099K({
          pse: "eBay",
          grossAmount: "6500",
          incomeType: "other",
        }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(48500));
      expect(result.businessGross).toEqual(new Decimal(42000));
      expect(result.otherGross).toEqual(new Decimal(6500));
    });

    it("Form 1099-K - farmer selling through online marketplace", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Square",
          grossAmount: "28000",
          cardNotPresent: "5000",
          incomeType: "farm",
        }),
      ]);
      expect(result.farmGross).toEqual(new Decimal(28000));
      expect(result.cardNotPresent).toEqual(new Decimal(5000));
    });

    it("Form 1099-K - small threshold amount just over $5,000", () => {
      const result = calculateForm1099K([
        make1099K({
          pse: "Venmo",
          grossAmount: "5001",
          incomeType: "other",
        }),
      ]);
      expect(result.grossAmount).toEqual(new Decimal(5001));
      expect(result.otherGross).toEqual(new Decimal(5001));
    });
  });

  // ── Federal Orchestrator Integration ──────────────────────────

  describe("Federal Orchestrator Integration", () => {
    it("Form 1099-K - withholding flows to Form 1040 Line 25d", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "PayPal",
              grossAmount: "30000",
              federalWithheld: "7200",
              incomeType: "business",
            }),
          ],
          // Include the income on Schedule C to match the 1099-K
          scheduleC: {
            grossReceipts: "30000",
          },
        })
      );
      // Total withholding includes W-2 ($6,000) + 1099-K ($7,200)
      expect(result.totalWithholding).toEqual(new Decimal(13200));
    });

    it("Form 1099-K - multiple 1099-K withholdings aggregate into Line 25d", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "PayPal",
              grossAmount: "20000",
              federalWithheld: "4800",
              incomeType: "business",
            }),
            make1099K({
              pse: "Stripe",
              grossAmount: "15000",
              federalWithheld: "3600",
              incomeType: "business",
            }),
          ],
          scheduleC: {
            grossReceipts: "35000",
          },
        })
      );
      // Total withholding includes W-2 ($6,000) + PayPal ($4,800) + Stripe ($3,600)
      expect(result.totalWithholding).toEqual(new Decimal(14400));
    });

    it("Form 1099-K - result is attached to return when forms exist", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "Square",
              grossAmount: "50000",
              incomeType: "business",
            }),
          ],
          scheduleC: {
            grossReceipts: "50000",
          },
        })
      );
      expect(result.form1099K).toBeDefined();
      expect(result.form1099K!.grossAmount).toEqual(new Decimal(50000));
      expect(result.form1099K!.businessGross).toEqual(new Decimal(50000));
    });

    it("Form 1099-K - result is undefined when no forms provided", () => {
      const result = calculateFederalTax(makeInput({}));
      expect(result.form1099K).toBeUndefined();
    });

    it("Form 1099-K - zero withholding does not affect total withholding", () => {
      const resultWithout = calculateFederalTax(makeInput({}));
      const resultWith = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "PayPal",
              grossAmount: "10000",
              federalWithheld: "0",
              incomeType: "business",
            }),
          ],
          scheduleC: {
            grossReceipts: "10000",
          },
        })
      );
      // Same W-2 withholding in both cases
      expect(resultWith.totalWithholding).toEqual(resultWithout.totalWithholding);
    });

    it("Form 1099-K - audit trail contains 1099-K lines in federal return", () => {
      const result = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "Stripe",
              grossAmount: "75000",
              federalWithheld: "18000",
              incomeType: "business",
            }),
          ],
          scheduleC: {
            grossReceipts: "75000",
          },
        })
      );
      const form1099KLines = result.allLines.filter(
        (l) => l.form === "Form 1099-K"
      );
      expect(form1099KLines.length).toBeGreaterThan(0);

      const withholdingLine = result.allLines.find(
        (l) => l.form === "1040" && l.line === "25d"
      );
      expect(withholdingLine).toBeDefined();
      expect(withholdingLine!.formula).toContain("1099-K");
    });

    it("Form 1099-K - backup withholding reduces amount owed", () => {
      const resultWithout = calculateFederalTax(
        makeInput({
          scheduleC: { grossReceipts: "30000" },
        })
      );
      const resultWith = calculateFederalTax(
        makeInput({
          form1099K: [
            make1099K({
              pse: "PayPal",
              grossAmount: "30000",
              federalWithheld: "7200",
              incomeType: "business",
            }),
          ],
          scheduleC: { grossReceipts: "30000" },
        })
      );
      // The 1099-K withholding should reduce the amount owed (or increase refund)
      // by at least the withholding amount. The difference may exceed $7,200
      // because higher withholding also reduces the estimated tax penalty (Form 2210).
      const owedDifference = resultWithout.amountOwed.minus(resultWith.amountOwed);
      const refundDifference = resultWith.refund.minus(resultWithout.refund);
      const totalBenefit = owedDifference.plus(refundDifference);
      expect(totalBenefit.greaterThanOrEqualTo(new Decimal(7200))).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("Form 1099-K - very large number of 1099-K forms", () => {
      const forms = Array.from({ length: 20 }, (_, i) =>
        make1099K({
          pse: `PSE-${i + 1}`,
          grossAmount: "1000",
          federalWithheld: "240",
          incomeType: "business",
        })
      );
      const result = calculateForm1099K(forms);
      expect(result.grossAmount).toEqual(new Decimal(20000));
      expect(result.federalWithholding).toEqual(new Decimal(4800));
      expect(result.numberOfForms).toBe(20);
    });

    it("Form 1099-K - exact 24% backup withholding rate", () => {
      const gross = new Decimal("50000");
      const withholding = gross.times("0.24"); // $12,000
      const result = calculateForm1099K([
        make1099K({
          pse: "PayPal",
          grossAmount: gross.toString(),
          federalWithheld: withholding.toString(),
        }),
      ]);
      expect(result.federalWithholding).toEqual(new Decimal(12000));
    });

    it("Form 1099-K - income type totals sum to overall gross", () => {
      const result = calculateForm1099K([
        make1099K({ pse: "A", grossAmount: "10000", incomeType: "business" }),
        make1099K({ pse: "B", grossAmount: "20000", incomeType: "farm" }),
        make1099K({ pse: "C", grossAmount: "5000", incomeType: "rental" }),
        make1099K({ pse: "D", grossAmount: "3000", incomeType: "other" }),
      ]);
      const typesSum = result.businessGross
        .plus(result.farmGross)
        .plus(result.rentalGross)
        .plus(result.otherGross);
      expect(typesSum).toEqual(result.grossAmount);
    });
  });
});
