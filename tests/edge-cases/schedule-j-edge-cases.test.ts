/**
 * Schedule J — Income Averaging for Farmers and Fishermen — Edge Cases
 * Spec: spec/federal/schedule-j.yaml
 *
 * Tests boundary conditions for:
 * - EFI rounding (non-divisible by 3)
 * - All-negative base years
 * - Base year 1 (2022) floor at zero vs years 2/3 allowing negative
 * - Large income spike crossing multiple brackets
 * - QSS filing status using MFJ brackets
 * - EFI exactly equal to taxable income (zero non-farm income)
 * - Base year at bracket boundary with allocation pushing into next bracket
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleJ, type ScheduleJInput } from "@/engine/forms/schedule-j.js";
import { getConstants, type FilingStatus, getBaseYearConstants } from "@/models/constants.js";
import { calculateTaxFromBrackets } from "@/utils/tax-math.js";

const constants = getConstants(2025);

function taxAt(year: number, income: number, fs: FilingStatus = "single"): number {
  const byConstants = getBaseYearConstants(year);
  return calculateTaxFromBrackets(new Decimal(income), byConstants.taxBrackets[fs]).toNumber();
}

function taxAt2025(income: number, fs: FilingStatus = "single"): number {
  return calculateTaxFromBrackets(new Decimal(income), constants.taxBrackets[fs]).toNumber();
}

describe("Schedule J Edge Cases", () => {
  // ── Rounding edge cases ──────────────────────────────────

  describe("One-third allocation rounding", () => {
    it("Schedule J Line 6 - EFI of $1 allocates $0 per year (rounds down)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "1",
        baseYear1: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2022, 50000)}` },
        baseYear2: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2023, 50000)}` },
        baseYear3: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2024, 50000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);
      // $1 / 3 = $0.33 → rounds to $0
      expect(result.line6.toNumber()).toBe(0);
    });

    it("Schedule J Line 6 - EFI of $2 allocates $1 per year (rounds from 0.67)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "2",
        baseYear1: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2022, 50000)}` },
        baseYear2: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2023, 50000)}` },
        baseYear3: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2024, 50000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);
      // $2 / 3 = $0.67 → rounds to $1
      expect(result.line6.toNumber()).toBe(1);
    });

    it("Schedule J Line 6 - EFI of $10 allocates $3 per year (rounds from 3.33)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "10",
        baseYear1: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2022, 50000)}` },
        baseYear2: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2023, 50000)}` },
        baseYear3: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2024, 50000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);
      // $10 / 3 = $3.33 → rounds to $3
      expect(result.line6.toNumber()).toBe(3);
    });
  });

  // ── All negative base years ────────────────────────────────

  describe("All negative base year incomes", () => {
    it("Schedule J - all three base years negative with EFI partially offsetting", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "-25000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "-15000", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "-10000", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      // 2022 (base year 1): max(0, -25000 + 20000) = max(0, -5000) = 0 (floored)
      expect(result.line7.toNumber()).toBe(0);
      expect(result.line8.toNumber()).toBe(0);

      // 2023 (base year 2): -15000 + 20000 = 5000 (NOT floored — only year 1 floors)
      expect(result.line11.toNumber()).toBe(5000);
      expect(result.line12.toNumber()).toBe(taxAt(2023, 5000));

      // 2024 (base year 3): -10000 + 20000 = 10000
      expect(result.line15.toNumber()).toBe(10000);
      expect(result.line16.toNumber()).toBe(taxAt(2024, 10000));
    });

    it("Schedule J - all base years deeply negative, allocation doesn't offset fully", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "30000",
        baseYear1: { taxableIncome: "-50000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "-40000", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "-60000", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(50000), new Decimal(5800), "single", constants);

      // 2022: max(0, -50000 + 10000) = 0 (floored)
      expect(result.line7.toNumber()).toBe(0);
      expect(result.line8.toNumber()).toBe(0);

      // 2023: -40000 + 10000 = -30000 (negative, no floor)
      expect(result.line11.toNumber()).toBe(-30000);
      expect(result.line12.toNumber()).toBe(0); // tax on negative is $0

      // 2024: -60000 + 10000 = -50000 (negative, no floor)
      expect(result.line15.toNumber()).toBe(-50000);
      expect(result.line16.toNumber()).toBe(0);

      // Line 22 = sum of original taxes = 0
      expect(result.line22.toNumber()).toBe(0);
    });
  });

  // ── Base year 1 zero-floor asymmetry ──────────────────────

  describe("Base year 1 floor at zero vs years 2/3 allowing negative", () => {
    it("Schedule J - identical negative base year income produces different results for year 1 vs 2/3", () => {
      // Demonstrates the asymmetry: year 1 (2022) is floored at zero, years 2/3 are not
      const input: ScheduleJInput = {
        electedFarmIncome: "15000",
        baseYear1: { taxableIncome: "-8000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "-8000", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "-8000", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(30000), new Decimal(3000), "single", constants);

      // Year 1 (2022): max(0, -8000 + 5000) = max(0, -3000) = 0
      expect(result.line7.toNumber()).toBe(0);
      // Year 2 (2023): -8000 + 5000 = -3000 (negative allowed)
      expect(result.line11.toNumber()).toBe(-3000);
      // Year 3 (2024): -8000 + 5000 = -3000 (negative allowed)
      expect(result.line15.toNumber()).toBe(-3000);

      // All three produce $0 tax, but lines 11 and 15 are negative while line 7 is zero
      expect(result.line8.toNumber()).toBe(0);
      expect(result.line12.toNumber()).toBe(0);
      expect(result.line16.toNumber()).toBe(0);
    });
  });

  // ── Large income spike ─────────────────────────────────────

  describe("Large income spike crossing multiple brackets", () => {
    it("Schedule J - $500K bumper crop year with minimal base years produces large benefit", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "450000",
        baseYear1: { taxableIncome: "5000", filingStatus: "single", originalTax: `${taxAt(2022, 5000)}` },
        baseYear2: { taxableIncome: "8000", filingStatus: "single", originalTax: `${taxAt(2023, 8000)}` },
        baseYear3: { taxableIncome: "6000", filingStatus: "single", originalTax: `${taxAt(2024, 6000)}` },
      };
      const taxableIncome = new Decimal(500000);
      const regularTax = new Decimal(taxAt2025(500000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      // Non-farm income = 500K - 450K = 50K
      expect(result.line3.toNumber()).toBe(50000);

      // Allocation = 450000 / 3 = 150000 each
      expect(result.line6.toNumber()).toBe(150000);

      // This should be very beneficial since $500K puts you in 35% bracket normally,
      // but spreading $150K across low-income years uses much lower marginal rates
      expect(result.isbeneficial).toBe(true);
      expect(result.line23.toNumber()).toBeLessThan(regularTax.toNumber());
    });
  });

  // ── QSS filing status ──────────────────────────────────────

  describe("QSS filing status uses MFJ brackets", () => {
    it("Schedule J - QSS in current year uses MFJ brackets for Line 4", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "qualifying_surviving_spouse", originalTax: `${taxAt(2022, 30000, "qualifying_surviving_spouse")}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "qualifying_surviving_spouse", originalTax: `${taxAt(2023, 30000, "qualifying_surviving_spouse")}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "qualifying_surviving_spouse", originalTax: `${taxAt(2024, 30000, "qualifying_surviving_spouse")}` },
      };
      const taxableIncome = new Decimal(100000);
      const regularTax = new Decimal(taxAt2025(100000, "qualifying_surviving_spouse"));
      const result = calculateScheduleJ(
        input, taxableIncome, regularTax, "qualifying_surviving_spouse", constants
      );

      // Non-farm income = 40000, tax should use QSS (=MFJ) brackets
      expect(result.line4.toNumber()).toBe(taxAt2025(40000, "qualifying_surviving_spouse"));

      // Base year taxes should use QSS brackets
      expect(result.line8.toNumber()).toBe(taxAt(2022, 50000, "qualifying_surviving_spouse"));
    });
  });

  // ── Bracket boundary with allocation ───────────────────────

  describe("Base year at bracket boundary pushed into next bracket by allocation", () => {
    it("Schedule J - 2024 base year income at 22% bracket boundary, allocation pushes into 24%", () => {
      // 2024 single: 22% bracket ends at $100,525
      // Base year income of $90,525 + $10,000 allocation = $100,525 (top of 22%)
      // vs $90,525 + $10,001 = $100,526 (starts 24%)
      const input: ScheduleJInput = {
        electedFarmIncome: "30000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "90525", filingStatus: "single", originalTax: `${taxAt(2024, 90525)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(120000), new Decimal(20000), "single", constants);

      // Line 15 = 90525 + 10000 = 100525
      expect(result.line15.toNumber()).toBe(100525);
      // Tax at 2024 rates for $100,525
      expect(result.line16.toNumber()).toBe(taxAt(2024, 100525));
    });
  });

  // ── Maximum EFI equals full taxable income ─────────────────

  describe("EFI exactly equal to taxable income", () => {
    it("Schedule J - when EFI equals taxable income, non-farm income is zero", () => {
      const taxableIncome = new Decimal(75000);
      const input: ScheduleJInput = {
        electedFarmIncome: "75000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const regularTax = new Decimal(taxAt2025(75000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      expect(result.line2a.toNumber()).toBe(75000);
      expect(result.line3.toNumber()).toBe(0); // non-farm = 0
      expect(result.line4.toNumber()).toBe(0); // tax on $0 = $0
    });
  });

  // ── QDCG-aware non-farm portion ────────────────────────────

  describe("QDCG-aware computation on non-farm portion", () => {
    it("Schedule J - non-farm portion with qualified dividends gets preferential rate on Line 4", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2022, 30000)}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const taxableIncome = new Decimal(100000);
      const regularTax = new Decimal(17400); // approximate

      // With QDCG options for the non-farm portion
      const result = calculateScheduleJ(
        input, taxableIncome, regularTax, "single", constants,
        {
          qualifiedDividends: new Decimal(10000),
          netLongTermCapitalGain: new Decimal(5000),
        }
      );

      // Non-farm income = 40000, with QDCG should produce lower tax than ordinary
      const ordinaryTax = taxAt2025(40000);
      expect(result.line4.toNumber()).toBeLessThanOrEqual(ordinaryTax);
    });
  });

  // ── EFI with net capital gain allocated to base years ──────

  describe("EFI with capital gain allocated to base years", () => {
    it("Schedule J - EFI capital gain allocates 1/3 to each base year's LTCG", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "90000",
        netCapitalGainFromFarming: "30000", // $10K allocated to each year
        baseYear1: {
          taxableIncome: "40000",
          filingStatus: "single",
          originalTax: `${taxAt(2022, 40000)}`,
          hadQualifiedDividendsOrCapitalGains: true,
          qualifiedDividends: "0",
          netLongTermCapitalGain: "5000",
        },
        baseYear2: { taxableIncome: "40000", filingStatus: "single", originalTax: `${taxAt(2023, 40000)}` },
        baseYear3: { taxableIncome: "40000", filingStatus: "single", originalTax: `${taxAt(2024, 40000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(120000), new Decimal(20000), "single", constants);

      // Line 2b should be 30000
      expect(result.line2b.toNumber()).toBe(30000);

      // Base year 1 should use QDCG-aware rates (had capital gains + EFI has CG)
      // Tax should be <= ordinary bracket tax due to preferential CG rates
      const ordinaryTax = taxAt(2022, 70000); // 40000 + 30000
      expect(result.line8.toNumber()).toBeLessThanOrEqual(ordinaryTax);
    });

    it("Schedule J Line 2b - capital gain capped at EFI", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "50000",
        netCapitalGainFromFarming: "80000", // more than EFI
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);

      // Line 2b should be capped at EFI (50000)
      expect(result.line2b.toNumber()).toBe(50000);
    });

    it("Schedule J Line 2c - section 1250 gain capped at Line 2b", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "80000",
        netCapitalGainFromFarming: "20000",
        unrecapturedSection1250GainFromFarming: "30000", // more than Line 2b
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);

      // Line 2c capped at Line 2b
      expect(result.line2c.toNumber()).toBe(20000);
    });
  });

  // ── EFI exceeds taxable income (cap behavior) ─────────────

  describe("EFI capped at taxable income", () => {
    it("Schedule J Line 2a - EFI larger than taxable income is capped at taxable income", () => {
      const taxableIncome = new Decimal(40000);
      const input: ScheduleJInput = {
        electedFarmIncome: "100000", // much larger than taxable income
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const regularTax = new Decimal(taxAt2025(40000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      // Line 2a capped at taxable income
      expect(result.line2a.toNumber()).toBe(40000);
      // Non-farm income = 0 since all income is farm
      expect(result.line3.toNumber()).toBe(0);
      expect(result.line4.toNumber()).toBe(0);
      // One-third = 40000 / 3 = 13333
      expect(result.line6.toNumber()).toBe(13333);
    });

    it("Schedule J Line 2a - EFI exactly equals taxable income, no capping needed", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "50000",
        baseYear1: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2022, 10000)}` },
        baseYear2: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2023, 10000)}` },
        baseYear3: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2024, 10000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(50000), new Decimal(taxAt2025(50000)), "single", constants);

      expect(result.line2a.toNumber()).toBe(50000);
      expect(result.line3.toNumber()).toBe(0);
    });
  });

  // ── Zero EFI ──────────────────────────────────────────────

  describe("Zero elected farm income", () => {
    it("Schedule J - zero EFI produces zero allocation and line 23 equals zero", () => {
      const taxableIncome = new Decimal(80000);
      const regularTax = new Decimal(taxAt2025(80000));
      const input: ScheduleJInput = {
        electedFarmIncome: "0",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2022, 30000)}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      expect(result.line2a.toNumber()).toBe(0);
      expect(result.line6.toNumber()).toBe(0);
      // Non-farm = full taxable income
      expect(result.line3.toNumber()).toBe(80000);
      // Each base year combined = original + 0, so recomputed tax = original tax
      expect(result.line8.toNumber()).toBe(taxAt(2022, 30000));
      expect(result.line12.toNumber()).toBe(taxAt(2023, 30000));
      expect(result.line16.toNumber()).toBe(taxAt(2024, 30000));
      // Line 17 - Line 22 = (line4 + sum of recomputed) - sum of original
      // Since each recomputed = original, the difference is just line4
      // line23 = line4 (tax on non-farm at 2025 rates) = regular tax
      expect(result.line23.toNumber()).toBe(taxAt2025(80000));
      expect(result.isbeneficial).toBe(false);
    });
  });

  // ── Non-beneficial averaging ──────────────────────────────

  describe("Non-beneficial averaging (high base year income)", () => {
    it("Schedule J - high base year income makes averaging NOT beneficial", () => {
      // When base years already have high income, adding farm income pushes
      // into higher brackets where the marginal tax increase is large.
      // Meanwhile, the non-farm portion is small and taxed at low rates.
      // But since line23 = line17 - line22, and the allocation adds to
      // existing high-bracket income, the "extra tax" per year is substantial.
      const taxableIncome = new Decimal(50000);
      const regularTax = new Decimal(taxAt2025(50000));
      const input: ScheduleJInput = {
        electedFarmIncome: "40000",
        baseYear1: { taxableIncome: "400000", filingStatus: "single", originalTax: `${taxAt(2022, 400000)}` },
        baseYear2: { taxableIncome: "400000", filingStatus: "single", originalTax: `${taxAt(2023, 400000)}` },
        baseYear3: { taxableIncome: "400000", filingStatus: "single", originalTax: `${taxAt(2024, 400000)}` },
      };
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      // Non-farm = 10000, taxed at low 2025 rates
      expect(result.line3.toNumber()).toBe(10000);
      // Each base year: 400000 + 13333 ≈ 413333, in the 35% bracket
      // Extra tax per year ≈ 13333 * 0.35 = 4667
      // Line 23 = line4(~1000) + 3*(taxAt(413333) - 0) - 3*taxAt(400000)
      // This should NOT be beneficial because 35% marginal rate > effective rate on $50K
      expect(result.isbeneficial).toBe(false);
      expect(result.line23.greaterThanOrEqualTo(regularTax)).toBe(true);
    });
  });

  // ── Mixed filing statuses across base years ───────────────

  describe("Mixed filing statuses across base years", () => {
    it("Schedule J - different filing status each base year applies correct brackets", () => {
      // Taxpayer was single in 2022, MFJ in 2023, HoH in 2024, single in 2025
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "40000", filingStatus: "single", originalTax: `${taxAt(2022, 40000)}` },
        baseYear2: { taxableIncome: "40000", filingStatus: "married_filing_jointly", originalTax: `${taxAt(2023, 40000, "married_filing_jointly")}` },
        baseYear3: { taxableIncome: "40000", filingStatus: "head_of_household", originalTax: `${taxAt(2024, 40000, "head_of_household")}` },
      };
      const taxableIncome = new Decimal(100000);
      const regularTax = new Decimal(taxAt2025(100000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      // 60000/3 = 20000 allocation each
      expect(result.line6.toNumber()).toBe(20000);

      // Year 2022 (single): 40000 + 20000 = 60000
      expect(result.line7.toNumber()).toBe(60000);
      expect(result.line8.toNumber()).toBe(taxAt(2022, 60000, "single"));

      // Year 2023 (MFJ): 40000 + 20000 = 60000
      expect(result.line11.toNumber()).toBe(60000);
      expect(result.line12.toNumber()).toBe(taxAt(2023, 60000, "married_filing_jointly"));

      // Year 2024 (HoH): 40000 + 20000 = 60000
      expect(result.line15.toNumber()).toBe(60000);
      expect(result.line16.toNumber()).toBe(taxAt(2024, 60000, "head_of_household"));

      // MFJ brackets are wider, so tax at $60K MFJ < tax at $60K single
      expect(result.line12.toNumber()).toBeLessThan(result.line8.toNumber());
    });
  });

  // ── HoH filing status ────────────────────────────────────

  describe("Head of household filing status in current year", () => {
    it("Schedule J - HoH uses wider brackets for Line 4 non-farm tax", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "50000",
        baseYear1: { taxableIncome: "30000", filingStatus: "head_of_household", originalTax: `${taxAt(2022, 30000, "head_of_household")}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "head_of_household", originalTax: `${taxAt(2023, 30000, "head_of_household")}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "head_of_household", originalTax: `${taxAt(2024, 30000, "head_of_household")}` },
      };
      const taxableIncome = new Decimal(80000);
      const regularTax = new Decimal(taxAt2025(80000, "head_of_household"));

      const resultHoH = calculateScheduleJ(
        input, taxableIncome, regularTax, "head_of_household", constants
      );

      // Compare with single filing status for same income
      const inputSingle: ScheduleJInput = {
        electedFarmIncome: "50000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2022, 30000)}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const resultSingle = calculateScheduleJ(
        inputSingle, taxableIncome, new Decimal(taxAt2025(80000)), "single", constants
      );

      // HoH Line 4 should be lower than single Line 4 (wider brackets)
      expect(resultHoH.line4.toNumber()).toBeLessThan(resultSingle.line4.toNumber());
    });
  });

  // ── EFI exactly $3 (divides evenly) ──────────────────────

  describe("EFI divisible by 3", () => {
    it("Schedule J Line 6 - EFI of $3 allocates exactly $1 per year", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "3",
        baseYear1: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2022, 50000)}` },
        baseYear2: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2023, 50000)}` },
        baseYear3: { taxableIncome: "50000", filingStatus: "single", originalTax: `${taxAt(2024, 50000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      expect(result.line6.toNumber()).toBe(1);
      // Each base year: 50000 + 1 = 50001
      expect(result.line7.toNumber()).toBe(50001);
      expect(result.line11.toNumber()).toBe(50001);
      expect(result.line15.toNumber()).toBe(50001);
    });

    it("Schedule J Line 6 - EFI of $300,000 allocates $100,000 per year exactly", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "300000",
        baseYear1: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(300000), new Decimal(taxAt2025(300000)), "single", constants);

      expect(result.line6.toNumber()).toBe(100000);
      expect(result.line7.toNumber()).toBe(100000);
      expect(result.line11.toNumber()).toBe(100000);
      expect(result.line15.toNumber()).toBe(100000);
      // All base year original taxes = 0, so line 22 = 0
      expect(result.line22.toNumber()).toBe(0);
    });
  });

  // ── Base year 1 floor at exactly zero ─────────────────────

  describe("Base year 1 zero-floor boundary", () => {
    it("Schedule J - 2022 combined income of exactly $0 is at the floor boundary", () => {
      // Base year income = -20000, allocation = 20000, combined = 0 (exactly at floor)
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "-20000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      // Combined: -20000 + 20000 = 0 (exactly at floor)
      expect(result.line7.toNumber()).toBe(0);
      expect(result.line8.toNumber()).toBe(0);
    });

    it("Schedule J - 2022 combined at -$1 is floored to $0", () => {
      // Base year income = -20001, allocation = 20000, combined = -1 → floored to 0
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "-20001", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      // Combined: -20001 + 20000 = -1 → floored to 0
      expect(result.line7.toNumber()).toBe(0);
      expect(result.line8.toNumber()).toBe(0);
    });

    it("Schedule J - 2022 combined at $1 is just above the floor", () => {
      // Base year income = -19999, allocation = 20000, combined = 1
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "-19999", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      // Combined: -19999 + 20000 = 1
      expect(result.line7.toNumber()).toBe(1);
      // Tax on $1 at 2022 single rates = 10% = $0 (rounds to $0)
      expect(result.line8.toNumber()).toBe(0);
    });
  });

  // ── Line 23 break-even ────────────────────────────────────

  describe("Break-even and net capital gain hierarchy", () => {
    it("Schedule J - net capital gain from farming capped at EFI (Line 2b <= 2a)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "30000",
        netCapitalGainFromFarming: "50000", // exceeds EFI
        unrecapturedSection1250GainFromFarming: "10000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      expect(result.line2a.toNumber()).toBe(30000);
      // Line 2b capped at EFI (30000)
      expect(result.line2b.toNumber()).toBe(30000);
      // Line 2c capped at Line 2b
      expect(result.line2c.toNumber()).toBe(10000);
    });

    it("Schedule J - section 1250 gain exceeding net capital gain is capped at Line 2b", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "50000",
        netCapitalGainFromFarming: "20000",
        unrecapturedSection1250GainFromFarming: "25000", // exceeds Line 2b
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);

      // Line 2b = 20000 (within EFI)
      expect(result.line2b.toNumber()).toBe(20000);
      // Line 2c capped at Line 2b
      expect(result.line2c.toNumber()).toBe(20000);
    });
  });

  // ── MFS filing status ─────────────────────────────────────

  describe("MFS filing status in Schedule J", () => {
    it("Schedule J - MFS uses married_filing_separately brackets (narrower than single)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "40000", filingStatus: "married_filing_separately", originalTax: `${taxAt(2022, 40000, "married_filing_separately")}` },
        baseYear2: { taxableIncome: "40000", filingStatus: "married_filing_separately", originalTax: `${taxAt(2023, 40000, "married_filing_separately")}` },
        baseYear3: { taxableIncome: "40000", filingStatus: "married_filing_separately", originalTax: `${taxAt(2024, 40000, "married_filing_separately")}` },
      };
      const taxableIncome = new Decimal(100000);
      const regularTax = new Decimal(taxAt2025(100000, "married_filing_separately"));
      const result = calculateScheduleJ(
        input, taxableIncome, regularTax, "married_filing_separately", constants
      );

      // MFS Line 4 on $40K non-farm
      expect(result.line4.toNumber()).toBe(taxAt2025(40000, "married_filing_separately"));
      // Each base year: 40000 + 20000 = 60000 at MFS rates
      expect(result.line8.toNumber()).toBe(taxAt(2022, 60000, "married_filing_separately"));
    });
  });
});
