/**
 * Tests for Form 1099-C — Cancellation of Debt income and IRC §108 exclusions.
 * Spec: spec/federal/form-1099-c.yaml
 *
 * Covers: basic COD income aggregation, bankruptcy exclusion, insolvency
 * exclusion (full and partial), qualified principal residence exclusion,
 * qualified farm and real property business exclusions, multiple 1099-C forms,
 * edge cases, and Schedule 1 Line 8c integration.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm1099C } from "@/engine/forms/form-1099-c.js";
import type { Form1099C, CodExclusion } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";

const DEFAULT_CONSTANTS = {
  qualifiedPrincipalResidenceExclusion: {
    maxExclusion: new Decimal(750000),
    maxExclusionMFS: new Decimal(375000),
  },
};

function make1099C(overrides: Partial<Form1099C> = {}): Form1099C {
  return {
    creditor: overrides.creditor ?? "Test Creditor",
    amountDischarged: overrides.amountDischarged ?? "0",
    interestIncluded: overrides.interestIncluded,
    debtDescription: overrides.debtDescription,
    personallyLiable: overrides.personallyLiable ?? false,
    identifiableEventCode: overrides.identifiableEventCode,
    fmvOfProperty: overrides.fmvOfProperty,
  };
}

function calc(
  forms: Form1099C[],
  exclusion?: CodExclusion,
  filingStatus: FilingStatus = "single",
  constants = DEFAULT_CONSTANTS
) {
  return calculateForm1099C(forms, exclusion, filingStatus, constants);
}

describe("Form 1099-C Cancellation of Debt", () => {
  // ── Basic COD Income ──────────────────────────────────────────────

  describe("COD Income Aggregation", () => {
    it("Form 1099-C COD income - single 1099-C reports cancelled debt as income", () => {
      const result = calc([make1099C({ amountDischarged: "15000" })]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(15000));
      expect(result.taxableCodIncome).toEqual(new Decimal(15000));
    });

    it("Form 1099-C COD income - multiple 1099-C forms are summed", () => {
      const result = calc([
        make1099C({ creditor: "Bank A", amountDischarged: "8000" }),
        make1099C({ creditor: "Bank B", amountDischarged: "5500" }),
        make1099C({ creditor: "Credit Union", amountDischarged: "3200" }),
      ]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(16700));
      expect(result.taxableCodIncome).toEqual(new Decimal(16700));
    });

    it("Form 1099-C COD income - no 1099-C forms produces zero income", () => {
      const result = calc([]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("Form 1099-C COD income - zero amount discharged produces zero income", () => {
      const result = calc([make1099C({ amountDischarged: "0" })]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("Form 1099-C COD income - interest included in Box 2 is tracked separately", () => {
      const result = calc([
        make1099C({ amountDischarged: "12000", interestIncluded: "1500" }),
      ]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(12000));
      expect(result.totalInterestIncluded).toEqual(new Decimal(1500));
      // Interest included does NOT reduce the taxable COD amount
      expect(result.taxableCodIncome).toEqual(new Decimal(12000));
    });

    it("Form 1099-C COD income - interest from multiple forms is summed", () => {
      const result = calc([
        make1099C({ amountDischarged: "10000", interestIncluded: "800" }),
        make1099C({ amountDischarged: "5000", interestIncluded: "300" }),
      ]);
      expect(result.totalInterestIncluded).toEqual(new Decimal(1100));
    });
  });

  // ── Bankruptcy Exclusion ──────────────────────────────────────────

  describe("Bankruptcy Exclusion (IRC §108(a)(1)(A))", () => {
    it("Form 1099-C exclusions - bankruptcy excludes full COD amount", () => {
      const result = calc(
        [make1099C({ amountDischarged: "50000" })],
        { bankruptcy: true }
      );
      expect(result.bankruptcyExclusion).toEqual(new Decimal(50000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("bankruptcy excludes multiple 1099-C totals", () => {
      const result = calc(
        [
          make1099C({ amountDischarged: "25000" }),
          make1099C({ amountDischarged: "15000" }),
        ],
        { bankruptcy: true }
      );
      expect(result.bankruptcyExclusion).toEqual(new Decimal(40000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("bankruptcy has no dollar limit", () => {
      const result = calc(
        [make1099C({ amountDischarged: "2000000" })],
        { bankruptcy: true }
      );
      expect(result.bankruptcyExclusion).toEqual(new Decimal(2000000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("bankruptcy flag with no debt produces zero exclusion", () => {
      const result = calc([], { bankruptcy: true });
      expect(result.bankruptcyExclusion).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });
  });

  // ── Insolvency Exclusion ──────────────────────────────────────────

  describe("Insolvency Exclusion (IRC §108(a)(1)(B))", () => {
    it("Form 1099-C exclusions - insolvency excludes COD up to extent of insolvency", () => {
      const result = calc(
        [make1099C({ amountDischarged: "20000" })],
        {
          insolvency: {
            totalLiabilities: "100000",
            totalAssets: "70000",
          },
        }
      );
      // Insolvent by 30000, debt is 20000 → full exclusion
      expect(result.insolvencyExclusion).toEqual(new Decimal(20000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("partial insolvency excludes only to extent of insolvency", () => {
      const result = calc(
        [make1099C({ amountDischarged: "20000" })],
        {
          insolvency: {
            totalLiabilities: "80000",
            totalAssets: "70000",
          },
        }
      );
      // Insolvent by 10000, debt is 20000 → partial exclusion
      expect(result.insolvencyExclusion).toEqual(new Decimal(10000));
      expect(result.taxableCodIncome).toEqual(new Decimal(10000));
    });

    it("solvent taxpayer gets no insolvency exclusion", () => {
      const result = calc(
        [make1099C({ amountDischarged: "15000" })],
        {
          insolvency: {
            totalLiabilities: "50000",
            totalAssets: "80000",
          },
        }
      );
      // Assets > liabilities → solvent → no exclusion
      expect(result.insolvencyExclusion).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(15000));
    });

    it("insolvency with liabilities equal to assets gets no exclusion", () => {
      const result = calc(
        [make1099C({ amountDischarged: "10000" })],
        {
          insolvency: {
            totalLiabilities: "50000",
            totalAssets: "50000",
          },
        }
      );
      expect(result.insolvencyExclusion).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(10000));
    });

    it("insolvency exactly matching cancelled debt", () => {
      const result = calc(
        [make1099C({ amountDischarged: "25000" })],
        {
          insolvency: {
            totalLiabilities: "125000",
            totalAssets: "100000",
          },
        }
      );
      expect(result.insolvencyExclusion).toEqual(new Decimal(25000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("insolvency with multiple 1099-C forms", () => {
      const result = calc(
        [
          make1099C({ amountDischarged: "8000" }),
          make1099C({ amountDischarged: "12000" }),
        ],
        {
          insolvency: {
            totalLiabilities: "90000",
            totalAssets: "75000",
          },
        }
      );
      // Insolvent by 15000, total debt is 20000
      expect(result.insolvencyExclusion).toEqual(new Decimal(15000));
      expect(result.taxableCodIncome).toEqual(new Decimal(5000));
    });
  });

  // ── Qualified Principal Residence Exclusion ───────────────────────

  describe("Qualified Principal Residence Exclusion (IRC §108(a)(1)(E))", () => {
    it("Form 1099-C exclusions - qualified principal residence exclusion caps at $750,000", () => {
      const result = calc(
        [make1099C({ amountDischarged: "900000" })],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "900000",
          },
        }
      );
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(750000));
      expect(result.taxableCodIncome).toEqual(new Decimal(150000));
    });

    it("qualified principal residence exclusion under the cap", () => {
      const result = calc(
        [make1099C({ amountDischarged: "200000" })],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "200000",
          },
        }
      );
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(200000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("MFS filers have $375,000 cap", () => {
      const result = calc(
        [make1099C({ amountDischarged: "500000" })],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "500000",
          },
        },
        "married_filing_separately"
      );
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(375000));
      expect(result.taxableCodIncome).toEqual(new Decimal(125000));
    });

    it("MFJ filers get the full $750,000 cap", () => {
      const result = calc(
        [make1099C({ amountDischarged: "600000" })],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "600000",
          },
        },
        "married_filing_jointly"
      );
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(600000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("discharged amount less than total COD still limits exclusion", () => {
      const result = calc(
        [make1099C({ amountDischarged: "300000" })],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "200000",
          },
        }
      );
      // Only 200K of the 300K was qualified principal residence debt
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(200000));
      expect(result.taxableCodIncome).toEqual(new Decimal(100000));
    });
  });

  // ── Farm and Real Property Business Exclusions ────────────────────

  describe("Farm and Real Property Business Exclusions", () => {
    it("qualified farm exclusion reduces taxable COD", () => {
      const result = calc(
        [make1099C({ amountDischarged: "50000" })],
        { qualifiedFarmExclusion: "30000" }
      );
      expect(result.qualifiedFarmExclusion).toEqual(new Decimal(30000));
      expect(result.taxableCodIncome).toEqual(new Decimal(20000));
    });

    it("qualified real property business exclusion reduces taxable COD", () => {
      const result = calc(
        [make1099C({ amountDischarged: "80000" })],
        { qualifiedRealPropertyBusinessExclusion: "80000" }
      );
      expect(result.qualifiedRealPropertyBusinessExclusion).toEqual(new Decimal(80000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("farm exclusion capped at remaining COD amount", () => {
      const result = calc(
        [make1099C({ amountDischarged: "20000" })],
        { qualifiedFarmExclusion: "50000" }
      );
      expect(result.qualifiedFarmExclusion).toEqual(new Decimal(20000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });
  });

  // ── Multiple Exclusions Combined ──────────────────────────────────

  describe("Multiple Exclusions", () => {
    it("insolvency plus qualified principal residence exclusion", () => {
      const result = calc(
        [make1099C({ amountDischarged: "100000" })],
        {
          insolvency: {
            totalLiabilities: "200000",
            totalAssets: "170000",
          },
          qualifiedPrincipalResidence: {
            dischargedAmount: "80000",
          },
        }
      );
      // Insolvency = 30000, then QPR = min(70000 remaining, 80000) = 70000
      expect(result.insolvencyExclusion).toEqual(new Decimal(30000));
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(70000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("bankruptcy takes priority over insolvency", () => {
      const result = calc(
        [make1099C({ amountDischarged: "50000" })],
        {
          bankruptcy: true,
          insolvency: {
            totalLiabilities: "100000",
            totalAssets: "80000",
          },
        }
      );
      // Bankruptcy excludes everything; insolvency is not needed
      expect(result.bankruptcyExclusion).toEqual(new Decimal(50000));
      expect(result.insolvencyExclusion).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("total exclusions cannot exceed total cancelled debt", () => {
      const result = calc(
        [make1099C({ amountDischarged: "10000" })],
        {
          insolvency: {
            totalLiabilities: "200000",
            totalAssets: "100000",
          },
          qualifiedPrincipalResidence: {
            dischargedAmount: "50000",
          },
          qualifiedFarmExclusion: "50000",
        }
      );
      expect(result.totalExclusions).toEqual(new Decimal(10000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });
  });

  // ── Taxable COD Income Summary ────────────────────────────────────

  describe("Taxable COD Income", () => {
    it("Form 1099-C taxable COD income - net amount after exclusions flows to Schedule 1 Line 8c", () => {
      const result = calc(
        [make1099C({ amountDischarged: "25000" })],
        {
          insolvency: {
            totalLiabilities: "80000",
            totalAssets: "70000",
          },
        }
      );
      // Insolvent by 10000, so 15000 is taxable
      expect(result.taxableCodIncome).toEqual(new Decimal(15000));
    });

    it("no exclusion means full amount is taxable", () => {
      const result = calc([make1099C({ amountDischarged: "7500" })]);
      expect(result.totalExclusions).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(7500));
    });

    it("taxable COD income is never negative", () => {
      const result = calc(
        [make1099C({ amountDischarged: "5000" })],
        { bankruptcy: true }
      );
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
      expect(result.taxableCodIncome.isNegative()).toBe(false);
    });
  });

  // ── Realistic Scenarios ───────────────────────────────────────────

  describe("Realistic Scenarios", () => {
    it("credit card debt settlement - negotiated payoff", () => {
      // Owed $18,000, settled for $8,000 → $10,000 cancelled
      const result = calc([
        make1099C({
          creditor: "Chase Bank",
          amountDischarged: "10000",
          identifiableEventCode: "F",
          personallyLiable: true,
        }),
      ]);
      expect(result.taxableCodIncome).toEqual(new Decimal(10000));
    });

    it("mortgage modification with partial insolvency", () => {
      // Underwater homeowner gets principal reduction
      const result = calc(
        [
          make1099C({
            creditor: "Wells Fargo",
            amountDischarged: "45000",
            debtDescription: "Mortgage principal reduction",
          }),
        ],
        {
          insolvency: {
            totalLiabilities: "350000",
            totalAssets: "320000",
          },
        }
      );
      // Insolvent by 30000, 15000 still taxable
      expect(result.insolvencyExclusion).toEqual(new Decimal(30000));
      expect(result.taxableCodIncome).toEqual(new Decimal(15000));
    });

    it("qualified principal residence short sale", () => {
      const result = calc(
        [
          make1099C({
            creditor: "Bank of America",
            amountDischarged: "85000",
            identifiableEventCode: "D",
          }),
        ],
        {
          qualifiedPrincipalResidence: {
            dischargedAmount: "85000",
          },
        }
      );
      expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(85000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("multiple debt settlements in a year with partial insolvency", () => {
      const result = calc(
        [
          make1099C({ creditor: "Bank A", amountDischarged: "5000" }),
          make1099C({ creditor: "Bank B", amountDischarged: "8000" }),
          make1099C({ creditor: "Medical Group", amountDischarged: "3000" }),
        ],
        {
          insolvency: {
            totalLiabilities: "60000",
            totalAssets: "50000",
          },
        }
      );
      // Total debt: 16000, insolvent by 10000
      expect(result.totalCancelledDebt).toEqual(new Decimal(16000));
      expect(result.insolvencyExclusion).toEqual(new Decimal(10000));
      expect(result.taxableCodIncome).toEqual(new Decimal(6000));
    });

    it("bankruptcy filer with medical and credit card debt", () => {
      const result = calc(
        [
          make1099C({ creditor: "Hospital", amountDischarged: "42000" }),
          make1099C({ creditor: "Visa", amountDischarged: "18000" }),
          make1099C({ creditor: "Student Loan Svc", amountDischarged: "0" }),
        ],
        { bankruptcy: true }
      );
      expect(result.totalCancelledDebt).toEqual(new Decimal(60000));
      expect(result.bankruptcyExclusion).toEqual(new Decimal(60000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("farm debt forgiveness", () => {
      const result = calc(
        [
          make1099C({
            creditor: "Farm Credit Services",
            amountDischarged: "75000",
          }),
        ],
        { qualifiedFarmExclusion: "75000" }
      );
      expect(result.qualifiedFarmExclusion).toEqual(new Decimal(75000));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("exclusion provided with no 1099-C forms produces zero everywhere", () => {
      const result = calc(
        [],
        { bankruptcy: true, insolvency: { totalLiabilities: "100000", totalAssets: "50000" } }
      );
      expect(result.totalCancelledDebt).toEqual(new Decimal(0));
      expect(result.bankruptcyExclusion).toEqual(new Decimal(0));
      expect(result.insolvencyExclusion).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(0));
    });

    it("undefined exclusion means no exclusion applied", () => {
      const result = calc(
        [make1099C({ amountDischarged: "10000" })],
        undefined
      );
      expect(result.totalExclusions).toEqual(new Decimal(0));
      expect(result.taxableCodIncome).toEqual(new Decimal(10000));
    });

    it("very large cancelled debt amount", () => {
      const result = calc([make1099C({ amountDischarged: "5000000" })]);
      expect(result.totalCancelledDebt).toEqual(new Decimal(5000000));
      expect(result.taxableCodIncome).toEqual(new Decimal(5000000));
    });

    it("fractional amounts maintain precision", () => {
      const result = calc([make1099C({ amountDischarged: "1234.56" })]);
      expect(result.totalCancelledDebt).toEqual(new Decimal("1234.56"));
      expect(result.taxableCodIncome).toEqual(new Decimal("1234.56"));
    });

    it("insolvency with very small excess (boundary)", () => {
      const result = calc(
        [make1099C({ amountDischarged: "10000" })],
        {
          insolvency: {
            totalLiabilities: "50001",
            totalAssets: "50000",
          },
        }
      );
      // Insolvent by $1
      expect(result.insolvencyExclusion).toEqual(new Decimal(1));
      expect(result.taxableCodIncome).toEqual(new Decimal(9999));
    });

    it("audit trail records all lines", () => {
      const result = calc(
        [make1099C({ amountDischarged: "10000" })],
        {
          insolvency: {
            totalLiabilities: "60000",
            totalAssets: "55000",
          },
        }
      );
      const lineNames = result.lines.map((l) => l.line);
      expect(lineNames).toContain("total");
      expect(lineNames).toContain("982-1b");
      expect(lineNames).toContain("taxable");
    });

    it("all five filing statuses work for principal residence exclusion", () => {
      const statuses: FilingStatus[] = [
        "single",
        "married_filing_jointly",
        "head_of_household",
        "qualifying_surviving_spouse",
        "married_filing_separately",
      ];
      for (const fs of statuses) {
        const result = calc(
          [make1099C({ amountDischarged: "400000" })],
          { qualifiedPrincipalResidence: { dischargedAmount: "400000" } },
          fs
        );
        if (fs === "married_filing_separately") {
          expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(375000));
        } else {
          expect(result.qualifiedPrincipalResidenceExclusion).toEqual(new Decimal(400000));
        }
      }
    });
  });
});
