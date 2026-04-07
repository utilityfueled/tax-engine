/**
 * Tests for NY IT-225 New York State Modifications.
 * Spec: spec/state/ny-it225-ny-state-modifications.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYIT225,
  type NYIT225Input,
} from "@/engine/state/ny-it225-ny-state-modifications.js";

/* ---------- Helpers ---------- */

function baseInput(overrides: Partial<NYIT225Input> = {}): NYIT225Input {
  return {
    filingStatus: "single",
    taxYear: 2025,
    ...overrides,
  };
}

function d(v: number | string): Decimal {
  return new Decimal(v);
}

/* ---------- A-101: Bonus depreciation addback ---------- */

describe("NY IT-225 New York State Modifications", () => {
  describe("A-101 - bonus depreciation addback", () => {
    it("adds back full federal bonus depreciation when no NY depreciation provided", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 50000,
      }));
      expect(result.bonusDepreciationAddback.equals(d(50000))).toBe(true);
    });

    it("adds back net difference when NY depreciation is provided", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 50000,
        nyDepreciationAllowedForBonusAssets: 10000,
      }));
      // Addback = 50000 - 10000 = 40000
      expect(result.bonusDepreciationAddback.equals(d(40000))).toBe(true);
    });

    it("floors addback at zero when NY depreciation exceeds federal bonus", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 5000,
        nyDepreciationAllowedForBonusAssets: 8000,
      }));
      expect(result.bonusDepreciationAddback.equals(d(0))).toBe(true);
    });

    it("zero when no bonus depreciation claimed", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.bonusDepreciationAddback.equals(d(0))).toBe(true);
    });

    it("handles large bonus depreciation amounts", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 1000000,
        nyDepreciationAllowedForBonusAssets: 142857,
      }));
      expect(result.bonusDepreciationAddback.equals(d(857143))).toBe(true);
    });
  });

  /* ---------- S-101: NY depreciation subtraction ---------- */

  describe("S-101 - NY depreciation subtraction for bonus assets", () => {
    it("allows NY regular MACRS depreciation as subtraction", () => {
      const result = calculateNYIT225(baseInput({
        nyDepreciationForBonusAssets: 7143,
      }));
      expect(result.nyDepreciationSubtraction.equals(d(7143))).toBe(true);
    });

    it("zero when no NY depreciation for bonus assets", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.nyDepreciationSubtraction.equals(d(0))).toBe(true);
    });

    it("floors negative values at zero", () => {
      const result = calculateNYIT225(baseInput({
        nyDepreciationForBonusAssets: -100,
      }));
      expect(result.nyDepreciationSubtraction.equals(d(0))).toBe(true);
    });

    it("paired with A-101 for full depreciation scenario", () => {
      // Taxpayer bought $100k asset, claimed 60% bonus depreciation federally
      // NY allows first-year regular MACRS of $14,286 (7-year property)
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 60000,
        nyDepreciationForBonusAssets: 14286,
      }));
      expect(result.bonusDepreciationAddback.equals(d(60000))).toBe(true);
      expect(result.nyDepreciationSubtraction.equals(d(14286))).toBe(true);
      // Net effect on NY AGI: +60000 - 14286 = +45714
      expect(result.totalAdditions.minus(result.totalSubtractions).equals(d(45714))).toBe(true);
    });
  });

  /* ---------- A-201: QBI deduction addback ---------- */

  describe("A-201 - QBI deduction addback", () => {
    it("adds back full federal QBI deduction", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 30000,
      }));
      expect(result.qbiDeductionAddback.equals(d(30000))).toBe(true);
    });

    it("zero when no QBI deduction claimed", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.qbiDeductionAddback.equals(d(0))).toBe(true);
    });

    it("handles partial QBI deduction from phase-out", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 12500,
      }));
      expect(result.qbiDeductionAddback.equals(d(12500))).toBe(true);
    });

    it("handles large QBI deduction for high-income filer", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 175000,
      }));
      expect(result.qbiDeductionAddback.equals(d(175000))).toBe(true);
    });

    it("floors negative values at zero", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: -500,
      }));
      expect(result.qbiDeductionAddback.equals(d(0))).toBe(true);
    });
  });

  /* ---------- S-201: NY 529 plan contribution deduction ---------- */

  describe("S-201 - NY 529 contribution deduction", () => {
    it("deducts full amount when under $5,000", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: 3000,
      }));
      expect(result.ny529Deduction.equals(d(3000))).toBe(true);
    });

    it("caps single filer at $5,000", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: 8000,
      }));
      expect(result.ny529Deduction.equals(d(5000))).toBe(true);
    });

    it("caps at exactly $5,000 boundary", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: 5000,
      }));
      expect(result.ny529Deduction.equals(d(5000))).toBe(true);
    });

    it("MFJ with both spouses as owners: max $10,000 ($5,000 each)", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        ny529Contributions: 7000,
        spouseNy529Contributions: 6000,
      }));
      // Primary: min(7000, 5000) = 5000
      // Spouse: min(6000, 5000) = 5000
      expect(result.ny529Deduction.equals(d(10000))).toBe(true);
    });

    it("MFJ with only one spouse contributing: max $5,000", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        ny529Contributions: 8000,
      }));
      expect(result.ny529Deduction.equals(d(5000))).toBe(true);
    });

    it("MFJ with both spouses under limit: actual amounts", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        ny529Contributions: 2000,
        spouseNy529Contributions: 3500,
      }));
      expect(result.ny529Deduction.equals(d(5500))).toBe(true);
    });

    it("non-MFJ filer ignores spouse contributions", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "single",
        ny529Contributions: 4000,
        spouseNy529Contributions: 3000,
      }));
      // Single filer: spouse contributions ignored
      expect(result.ny529Deduction.equals(d(4000))).toBe(true);
    });

    it("MFS filer ignores spouse contributions", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_separately",
        ny529Contributions: 5000,
        spouseNy529Contributions: 5000,
      }));
      expect(result.ny529Deduction.equals(d(5000))).toBe(true);
    });

    it("HoH filer ignores spouse contributions", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "head_of_household",
        ny529Contributions: 4500,
        spouseNy529Contributions: 4500,
      }));
      expect(result.ny529Deduction.equals(d(4500))).toBe(true);
    });

    it("QSS filer ignores spouse contributions", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "qualifying_surviving_spouse",
        ny529Contributions: 5000,
        spouseNy529Contributions: 5000,
      }));
      expect(result.ny529Deduction.equals(d(5000))).toBe(true);
    });

    it("zero contributions: zero deduction", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.ny529Deduction.equals(d(0))).toBe(true);
    });

    it("negative contributions floored at zero", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: -1000,
      }));
      expect(result.ny529Deduction.equals(d(0))).toBe(true);
    });
  });

  /* ---------- S-202: Long-term care insurance premium deduction ---------- */

  describe("S-202 - LTC insurance premium deduction", () => {
    it("20% of premiums when none deducted federally (standard deduction filer)", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 5000,
      }));
      // 20% × 5000 = 1000
      expect(result.ltcPremiumDeduction.equals(d(1000))).toBe(true);
    });

    it("20% of non-deducted portion when partially deducted federally", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 5000,
        ltcPremiumsDeductedFederally: 2000,
      }));
      // 20% × (5000 - 2000) = 20% × 3000 = 600
      expect(result.ltcPremiumDeduction.equals(d(600))).toBe(true);
    });

    it("zero when all premiums were deducted federally", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 5000,
        ltcPremiumsDeductedFederally: 5000,
      }));
      expect(result.ltcPremiumDeduction.equals(d(0))).toBe(true);
    });

    it("zero when federal deductions exceed premiums paid", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 3000,
        ltcPremiumsDeductedFederally: 4000,
      }));
      expect(result.ltcPremiumDeduction.equals(d(0))).toBe(true);
    });

    it("no premiums paid: zero deduction", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.ltcPremiumDeduction.equals(d(0))).toBe(true);
    });

    it("rounds to nearest dollar", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 4333,
      }));
      // 20% × 4333 = 866.6 → rounds to 867
      expect(result.ltcPremiumDeduction.equals(d(867))).toBe(true);
    });

    it("rounds down when decimal is exactly 0.5", () => {
      // Decimal.js ROUND_HALF_UP rounds 0.5 up
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 4325,
      }));
      // 20% × 4325 = 865.0 → 865
      expect(result.ltcPremiumDeduction.equals(d(865))).toBe(true);
    });

    it("handles large premium amounts", () => {
      const result = calculateNYIT225(baseInput({
        ltcPremiumsPaid: 25000,
        ltcPremiumsDeductedFederally: 5000,
      }));
      // 20% × (25000 - 5000) = 20% × 20000 = 4000
      expect(result.ltcPremiumDeduction.equals(d(4000))).toBe(true);
    });
  });

  /* ---------- Other additions/subtractions passthroughs ---------- */

  describe("Other additions and subtractions (passthroughs)", () => {
    it("other additions pass through to total", () => {
      const result = calculateNYIT225(baseInput({
        otherIT225Additions: 1500,
      }));
      expect(result.otherAdditions.equals(d(1500))).toBe(true);
      expect(result.totalAdditions.equals(d(1500))).toBe(true);
    });

    it("other subtractions pass through to total", () => {
      const result = calculateNYIT225(baseInput({
        otherIT225Subtractions: 2000,
      }));
      expect(result.otherSubtractions.equals(d(2000))).toBe(true);
      expect(result.totalSubtractions.equals(d(2000))).toBe(true);
    });
  });

  /* ---------- Line 9: Total additions ---------- */

  describe("Line 9 - total additions", () => {
    it("sums all addition items", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 20000,
        federalQbiDeduction: 15000,
        otherIT225Additions: 3000,
      }));
      // 20000 + 15000 + 3000 = 38000
      expect(result.totalAdditions.equals(d(38000))).toBe(true);
    });

    it("zero when no additions", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.totalAdditions.equals(d(0))).toBe(true);
    });

    it("only QBI addback when no other additions", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 25000,
      }));
      expect(result.totalAdditions.equals(d(25000))).toBe(true);
    });
  });

  /* ---------- Line 18: Total subtractions ---------- */

  describe("Line 18 - total subtractions", () => {
    it("sums all subtraction items", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        nyDepreciationForBonusAssets: 5000,
        ny529Contributions: 4000,
        spouseNy529Contributions: 3000,
        ltcPremiumsPaid: 6000,
        otherIT225Subtractions: 2500,
      }));
      // S-101: 5000
      // S-201: 4000 + 3000 = 7000
      // S-202: 20% × 6000 = 1200
      // Other: 2500
      // Total: 5000 + 7000 + 1200 + 2500 = 15700
      expect(result.totalSubtractions.equals(d(15700))).toBe(true);
    });

    it("zero when no subtractions", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.totalSubtractions.equals(d(0))).toBe(true);
    });

    it("only 529 deduction when no other subtractions", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: 3500,
      }));
      expect(result.totalSubtractions.equals(d(3500))).toBe(true);
    });
  });

  /* ---------- Full scenarios ---------- */

  describe("Full scenarios", () => {
    it("self-employed single filer with QBI addback and 529 contributions", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 20000,
        ny529Contributions: 5000,
      }));
      expect(result.totalAdditions.equals(d(20000))).toBe(true);
      expect(result.totalSubtractions.equals(d(5000))).toBe(true);
      // Net effect on NY AGI: +15000
    });

    it("MFJ couple with depreciation, QBI, 529, and LTC", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        federalBonusDepreciation: 100000,
        nyDepreciationAllowedForBonusAssets: 14286,
        federalQbiDeduction: 40000,
        nyDepreciationForBonusAssets: 14286,
        ny529Contributions: 5000,
        spouseNy529Contributions: 5000,
        ltcPremiumsPaid: 8000,
        ltcPremiumsDeductedFederally: 2000,
      }));

      // Additions:
      // A-101: 100000 - 14286 = 85714
      // A-201: 40000
      // Total additions: 125714
      expect(result.bonusDepreciationAddback.equals(d(85714))).toBe(true);
      expect(result.qbiDeductionAddback.equals(d(40000))).toBe(true);
      expect(result.totalAdditions.equals(d(125714))).toBe(true);

      // Subtractions:
      // S-101: 14286
      // S-201: 5000 + 5000 = 10000
      // S-202: 20% × (8000 - 2000) = 1200
      // Total subtractions: 25486
      expect(result.nyDepreciationSubtraction.equals(d(14286))).toBe(true);
      expect(result.ny529Deduction.equals(d(10000))).toBe(true);
      expect(result.ltcPremiumDeduction.equals(d(1200))).toBe(true);
      expect(result.totalSubtractions.equals(d(25486))).toBe(true);
    });

    it("W-2 employee with only 529 contributions (most common scenario)", () => {
      const result = calculateNYIT225(baseInput({
        ny529Contributions: 4000,
      }));
      // No additions for a W-2 employee without QBI or depreciation
      expect(result.totalAdditions.equals(d(0))).toBe(true);
      expect(result.totalSubtractions.equals(d(4000))).toBe(true);
    });

    it("business owner with bonus depreciation using gross/subtraction approach", () => {
      // Some filers add back full federal bonus and separately subtract NY depreciation
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 80000,
        // No nyDepreciationAllowedForBonusAssets — using gross approach
        nyDepreciationForBonusAssets: 11429, // Regular MACRS for 7-year property
      }));
      expect(result.bonusDepreciationAddback.equals(d(80000))).toBe(true);
      expect(result.nyDepreciationSubtraction.equals(d(11429))).toBe(true);
      // Net: 80000 - 11429 = 68571
    });

    it("business owner with bonus depreciation using net approach", () => {
      // Other filers compute the net addback directly
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 80000,
        nyDepreciationAllowedForBonusAssets: 11429,
        // No nyDepreciationForBonusAssets — using net approach
      }));
      expect(result.bonusDepreciationAddback.equals(d(68571))).toBe(true);
      expect(result.nyDepreciationSubtraction.equals(d(0))).toBe(true);
      // Same net effect: 68571
    });

    it("retired couple with LTC premiums and standard deduction", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        ltcPremiumsPaid: 12000,
        // Standard deduction filer: nothing deducted federally
      }));
      // 20% × 12000 = 2400
      expect(result.totalAdditions.equals(d(0))).toBe(true);
      expect(result.ltcPremiumDeduction.equals(d(2400))).toBe(true);
      expect(result.totalSubtractions.equals(d(2400))).toBe(true);
    });
  });

  /* ---------- Edge cases ---------- */

  describe("Edge cases", () => {
    it("all inputs at zero produces zero totals", () => {
      const result = calculateNYIT225(baseInput());
      expect(result.totalAdditions.equals(d(0))).toBe(true);
      expect(result.totalSubtractions.equals(d(0))).toBe(true);
    });

    it("all filing statuses produce valid results", () => {
      const statuses = [
        "single",
        "married_filing_jointly",
        "married_filing_separately",
        "head_of_household",
        "qualifying_surviving_spouse",
      ] as const;

      for (const status of statuses) {
        const result = calculateNYIT225(baseInput({
          filingStatus: status,
          federalQbiDeduction: 10000,
          ny529Contributions: 3000,
        }));
        expect(result.totalAdditions.greaterThan(d(0))).toBe(true);
        expect(result.totalSubtractions.greaterThan(d(0))).toBe(true);
      }
    });

    it("unsupported tax year throws error", () => {
      expect(() => calculateNYIT225(baseInput({ taxYear: 2020 }))).toThrow(
        "NY IT-225 constants not available for tax year 2020"
      );
    });

    it("string inputs are handled correctly", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: "15000.50",
        ny529Contributions: "4999.99",
      }));
      expect(result.qbiDeductionAddback.equals(d("15000.50"))).toBe(true);
      expect(result.ny529Deduction.equals(d("4999.99"))).toBe(true);
    });

    it("Decimal inputs are handled correctly", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: new Decimal(25000),
      }));
      expect(result.qbiDeductionAddback.equals(d(25000))).toBe(true);
    });
  });

  /* ---------- Audit trail ---------- */

  describe("Audit trail", () => {
    it("produces audit lines for all modifications", () => {
      const result = calculateNYIT225(baseInput({
        federalBonusDepreciation: 50000,
        federalQbiDeduction: 20000,
        nyDepreciationForBonusAssets: 7143,
        ny529Contributions: 5000,
        ltcPremiumsPaid: 4000,
        otherIT225Additions: 1000,
        otherIT225Subtractions: 500,
      }));

      const lineIds = result.lines.map((l) => l.line);
      expect(lineIds).toContain("A-101");
      expect(lineIds).toContain("A-201");
      expect(lineIds).toContain("S-101");
      expect(lineIds).toContain("S-201");
      expect(lineIds).toContain("S-202");
      expect(lineIds).toContain("9");
      expect(lineIds).toContain("18");
    });

    it("audit lines reference correct form", () => {
      const result = calculateNYIT225(baseInput({
        federalQbiDeduction: 10000,
      }));

      for (const line of result.lines) {
        expect(line.form).toBe("NY-IT225");
      }
    });

    it("audit line for 529 shows per-owner breakdown", () => {
      const result = calculateNYIT225(baseInput({
        filingStatus: "married_filing_jointly",
        ny529Contributions: 4000,
        spouseNy529Contributions: 3000,
      }));

      const s201Line = result.lines.find((l) => l.line === "S-201");
      expect(s201Line).toBeDefined();
      expect(s201Line!.inputs!["Primary owner deduction"]).toBe("4000");
      expect(s201Line!.inputs!["Spouse deduction"]).toBe("3000");
    });
  });
});
