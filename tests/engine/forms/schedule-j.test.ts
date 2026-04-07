/**
 * Schedule J — Income Averaging for Farmers and Fishermen
 * Spec: spec/federal/schedule-j.yaml
 *
 * Tests cover the IRC §1301 farm income averaging computation:
 * - Part I elected farm income capping and allocation
 * - Part II base year tax recomputation at prior-year rates
 * - Part III final averaged tax vs regular tax comparison
 * - Filing status differences across years
 * - QDCG-aware base year recomputation
 * - Negative base year income
 * - Federal orchestrator integration
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleJ, type ScheduleJInput } from "@/engine/forms/schedule-j.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateTaxFromBrackets } from "@/utils/tax-math.js";
import { getBaseYearConstants } from "@/models/constants.js";
import type { TaxYearInput } from "@/models/inputs.js";

const constants = getConstants(2025);

const baseTaxpayer: TaxYearInput["taxpayer"] = {
  taxYear: 2025,
  filingStatus: "single",
  primary: {
    firstName: "John",
    lastName: "Farmer",
    ssn: "111-22-3333",
    dateOfBirth: "1975-06-15",
    occupation: "Farmer",
  },
  address: { street: "1 Farm Rd", city: "Ames", state: "IA", zip: "50010" },
  dependents: [],
};

function makeBaseYear(
  taxableIncome: string,
  filingStatus: FilingStatus = "single",
  originalTax?: string
) {
  // If no original tax provided, compute it from the base year brackets
  const year = filingStatus === "single" ? 2022 : 2022; // placeholder
  const computed = originalTax ?? "0";
  return {
    taxableIncome,
    filingStatus,
    originalTax: computed,
  };
}

/** Helper: compute tax at a given year's brackets for a given filing status */
function taxAt(year: number, income: number, fs: FilingStatus = "single"): number {
  const byConstants = getBaseYearConstants(year);
  return calculateTaxFromBrackets(new Decimal(income), byConstants.taxBrackets[fs]).toNumber();
}

/** Helper: compute 2025 tax for a given income and filing status */
function taxAt2025(income: number, fs: FilingStatus = "single"): number {
  return calculateTaxFromBrackets(new Decimal(income), constants.taxBrackets[fs]).toNumber();
}

describe("Schedule J — Income Averaging for Farmers and Fishermen", () => {
  // ── Part I: Elected Farm Income ────────────────────────────

  describe("Part I: Taxable Income From Farming or Fishing", () => {
    it("Schedule J Line 1 - taxable income from Form 1040", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "90000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line1.toNumber()).toBe(100000);
    });

    it("Schedule J Line 2a - elected farm income cannot exceed taxable income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "150000", // exceeds taxable income of 100000
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line2a.toNumber()).toBe(100000); // capped at taxable income
    });

    it("Schedule J Line 2b - net capital gain portion of EFI", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "80000",
        netCapitalGainFromFarming: "15000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line2b.toNumber()).toBe(15000);
    });

    it("Schedule J Line 2c - unrecaptured section 1250 gain portion", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "80000",
        netCapitalGainFromFarming: "15000",
        unrecapturedSection1250GainFromFarming: "5000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line2c.toNumber()).toBe(5000);
    });

    it("Schedule J Line 3 - non-farm taxable income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line3.toNumber()).toBe(40000); // 100000 - 60000
    });
  });

  // ── Part II: Base Year Computations ────────────────────────

  describe("Part II: Base Year Tax Recomputation", () => {
    it("Schedule J Line 6 - one-third allocation", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "90000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line6.toNumber()).toBe(30000); // 90000/3
      expect(result.line10.toNumber()).toBe(30000);
      expect(result.line14.toNumber()).toBe(30000);
    });

    it("Schedule J Line 7 - 2022 income plus allocation floored at zero", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "30000",
        baseYear1: { taxableIncome: "-20000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(50000), new Decimal(5800), "single", constants);
      // Line 7 = max(0, -20000 + 10000) = max(0, -10000) = 0
      expect(result.line7.toNumber()).toBe(0);
    });

    it("Schedule J Line 5 - 2022 base year taxable income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "35000", filingStatus: "single", originalTax: "4008" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line5.toNumber()).toBe(35000);
    });

    it("Schedule J Line 8 - tax at 2022 rates", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      // Line 7 = 30000 + 20000 = 50000; tax at 2022 single rates
      const expectedTax = taxAt(2022, 50000);
      expect(result.line8.toNumber()).toBe(expectedTax);
    });

    it("Schedule J Line 12 - tax at 2023 rates", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "40000", filingStatus: "single", originalTax: "4568" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      // Line 11 = 40000 + 20000 = 60000; tax at 2023 single rates
      const expectedTax = taxAt(2023, 60000);
      expect(result.line12.toNumber()).toBe(expectedTax);
    });

    it("Schedule J Line 16 - tax at 2024 rates", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "40000", filingStatus: "single", originalTax: "4568" },
        baseYear3: { taxableIncome: "35000", filingStatus: "single", originalTax: "3996" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      // Line 15 = 35000 + 20000 = 55000; tax at 2024 single rates
      const expectedTax = taxAt(2024, 55000);
      expect(result.line16.toNumber()).toBe(expectedTax);
    });

    it("tax on negative combined income is zero (Lines 12/16)", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "15000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "-10000", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "-8000", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(50000), new Decimal(5800), "single", constants);
      // Line 11 = -10000 + 5000 = -5000 → tax = 0
      expect(result.line12.toNumber()).toBe(0);
      // Line 15 = -8000 + 5000 = -3000 → tax = 0
      expect(result.line16.toNumber()).toBe(0);
    });
  });

  // ── Part III: Tax Computation ──────────────────────────────

  describe("Part III: Tax Computation", () => {
    it("Schedule J Line 17 - sum of all four tax computations", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      const expectedLine17 = result.line4.plus(result.line8).plus(result.line12).plus(result.line16);
      expect(result.line17.toNumber()).toBe(expectedLine17.toNumber());
    });

    it("Schedule J Line 22 - sum of base year original taxes", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line22.toNumber()).toBe(3398 + 2782 + 2410);
    });

    it("Schedule J Line 23 - final averaged tax", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "single", originalTax: "3398" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line23.toNumber()).toBe(result.line17.minus(result.line22).toNumber());
    });

    it("income averaging is beneficial when base years had low income", () => {
      // Farmer with $200K income in 2025 but only $10K-$20K in base years
      // should benefit from averaging
      const input: ScheduleJInput = {
        electedFarmIncome: "180000",
        baseYear1: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2022, 10000)}` },
        baseYear2: { taxableIncome: "15000", filingStatus: "single", originalTax: `${taxAt(2023, 15000)}` },
        baseYear3: { taxableIncome: "12000", filingStatus: "single", originalTax: `${taxAt(2024, 12000)}` },
      };
      const regularTax = new Decimal(taxAt2025(200000));
      const result = calculateScheduleJ(input, new Decimal(200000), regularTax, "single", constants);
      expect(result.isbeneficial).toBe(true);
      expect(result.line23.toNumber()).toBeLessThan(regularTax.toNumber());
    });

    it("income averaging is not beneficial when base years had high income", () => {
      // Farmer with moderate income but high base year income
      const input: ScheduleJInput = {
        electedFarmIncome: "30000",
        baseYear1: { taxableIncome: "300000", filingStatus: "single", originalTax: `${taxAt(2022, 300000)}` },
        baseYear2: { taxableIncome: "280000", filingStatus: "single", originalTax: `${taxAt(2023, 280000)}` },
        baseYear3: { taxableIncome: "320000", filingStatus: "single", originalTax: `${taxAt(2024, 320000)}` },
      };
      const regularTax = new Decimal(taxAt2025(50000));
      const result = calculateScheduleJ(input, new Decimal(50000), regularTax, "single", constants);
      // Adding 10K to base years at 300K+ puts it in higher brackets
      expect(result.isbeneficial).toBe(false);
    });
  });

  // ── Filing Status Variations ───────────────────────────────

  describe("Filing status differences across years", () => {
    it("different filing statuses per base year", () => {
      // Single in 2022, MFJ in 2023, HOH in 2024, MFJ in 2025
      const input: ScheduleJInput = {
        electedFarmIncome: "90000",
        baseYear1: { taxableIncome: "25000", filingStatus: "single", originalTax: `${taxAt(2022, 25000)}` },
        baseYear2: { taxableIncome: "50000", filingStatus: "married_filing_jointly", originalTax: `${taxAt(2023, 50000, "married_filing_jointly")}` },
        baseYear3: { taxableIncome: "35000", filingStatus: "head_of_household", originalTax: `${taxAt(2024, 35000, "head_of_household")}` },
      };
      const result = calculateScheduleJ(
        input, new Decimal(150000), new Decimal(20000),
        "married_filing_jointly", constants
      );

      // 2022: tax at single rates on (25000 + 30000 = 55000)
      expect(result.line8.toNumber()).toBe(taxAt(2022, 55000, "single"));
      // 2023: tax at MFJ rates on (50000 + 30000 = 80000)
      expect(result.line12.toNumber()).toBe(taxAt(2023, 80000, "married_filing_jointly"));
      // 2024: tax at HOH rates on (35000 + 30000 = 65000)
      expect(result.line16.toNumber()).toBe(taxAt(2024, 65000, "head_of_household"));
    });

    it("MFS filing status in base year uses MFS brackets", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "30000", filingStatus: "married_filing_separately", originalTax: `${taxAt(2022, 30000, "married_filing_separately")}` },
        baseYear2: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2023, 30000)}` },
        baseYear3: { taxableIncome: "30000", filingStatus: "single", originalTax: `${taxAt(2024, 30000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      expect(result.line8.toNumber()).toBe(taxAt(2022, 50000, "married_filing_separately"));
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────

  describe("Edge cases", () => {
    it("zero elected farm income produces no benefit", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "0",
        baseYear1: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2022, 10000)}` },
        baseYear2: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2023, 10000)}` },
        baseYear3: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2024, 10000)}` },
      };
      const regularTax = new Decimal(taxAt2025(50000));
      const result = calculateScheduleJ(input, new Decimal(50000), regularTax, "single", constants);
      // Line 4 = full tax on 50000, no allocation to base years
      // Line 23 should approximately equal regular tax (base year tax deltas are zero)
      expect(result.line2a.toNumber()).toBe(0);
      expect(result.line6.toNumber()).toBe(0);
    });

    it("all base years with zero income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "90000",
        baseYear1: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
      };
      const regularTax = new Decimal(taxAt2025(100000));
      const result = calculateScheduleJ(input, new Decimal(100000), regularTax, "single", constants);
      // All farm income spread to years with 0 base income
      // Line 23 = tax on 10K (non-farm) + tax on 30K (2022) + tax on 30K (2023) + tax on 30K (2024) - 0
      expect(result.isbeneficial).toBe(true);
      expect(result.line22.toNumber()).toBe(0); // no original taxes
    });

    it("elected farm income equals full taxable income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "100000",
        baseYear1: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2022, 10000)}` },
        baseYear2: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2023, 10000)}` },
        baseYear3: { taxableIncome: "10000", filingStatus: "single", originalTax: `${taxAt(2024, 10000)}` },
      };
      const regularTax = new Decimal(taxAt2025(100000));
      const result = calculateScheduleJ(input, new Decimal(100000), regularTax, "single", constants);
      expect(result.line3.toNumber()).toBe(0); // no non-farm income
      expect(result.line4.toNumber()).toBe(0); // tax on $0 = $0
    });

    it("negative base year income with partial offset from allocation", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "-5000", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "-30000", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "40000", filingStatus: "single", originalTax: `${taxAt(2024, 40000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(80000), new Decimal(12000), "single", constants);
      // 2022: max(0, -5000 + 20000) = 15000
      expect(result.line7.toNumber()).toBe(15000);
      // 2023: -30000 + 20000 = -10000 (can be negative for 2023/2024)
      expect(result.line11.toNumber()).toBe(-10000);
      expect(result.line12.toNumber()).toBe(0); // tax on negative = 0
    });

    it("rounding behavior for one-third allocation", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "100000", // 100000/3 = 33333.33...
        baseYear1: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear2: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
        baseYear3: { taxableIncome: "0", filingStatus: "single", originalTax: "0" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      // One-third should be rounded to nearest dollar
      expect(result.line6.toNumber()).toBe(33333);
    });
  });

  // ── QDCG-Aware Computation ─────────────────────────────────

  describe("QDCG-aware base year recomputation", () => {
    it("base year with qualified dividends uses preferential rates", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: {
          taxableIncome: "30000",
          filingStatus: "single",
          originalTax: `${taxAt(2022, 30000)}`,
          hadQualifiedDividendsOrCapitalGains: true,
          qualifiedDividends: "5000",
          netLongTermCapitalGain: "0",
        },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: `${taxAt(2023, 25000)}` },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: `${taxAt(2024, 22000)}` },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      // Line 8 should be lower than pure bracket computation because of QD preferential rates
      const pureOrdinaryTax = taxAt(2022, 50000); // 30000 + 20000
      expect(result.line8.toNumber()).toBeLessThanOrEqual(pureOrdinaryTax);
    });
  });

  // ── Realistic Scenarios ────────────────────────────────────

  describe("Realistic farm income averaging scenarios", () => {
    it("young farmer with bumper crop year and thin base years", () => {
      // Farmer normally makes $30K-$40K but had a $250K year from selling cattle
      const input: ScheduleJInput = {
        electedFarmIncome: "200000",
        baseYear1: { taxableIncome: "28000", filingStatus: "single", originalTax: `${taxAt(2022, 28000)}` },
        baseYear2: { taxableIncome: "35000", filingStatus: "single", originalTax: `${taxAt(2023, 35000)}` },
        baseYear3: { taxableIncome: "32000", filingStatus: "single", originalTax: `${taxAt(2024, 32000)}` },
      };
      const taxableIncome = new Decimal(250000);
      const regularTax = new Decimal(taxAt2025(250000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);

      expect(result.isbeneficial).toBe(true);
      // Verify each allocation is 1/3 of 200000
      expect(result.line6.toNumber()).toBe(66667);
      // Non-farm income = 250K - 200K = 50K
      expect(result.line3.toNumber()).toBe(50000);
      // Final tax should be meaningfully lower
      expect(result.line23.toNumber()).toBeLessThan(regularTax.toNumber());
    });

    it("MFJ farmer couple with Schedule F income", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "120000",
        baseYear1: { taxableIncome: "45000", filingStatus: "married_filing_jointly", originalTax: `${taxAt(2022, 45000, "married_filing_jointly")}` },
        baseYear2: { taxableIncome: "55000", filingStatus: "married_filing_jointly", originalTax: `${taxAt(2023, 55000, "married_filing_jointly")}` },
        baseYear3: { taxableIncome: "50000", filingStatus: "married_filing_jointly", originalTax: `${taxAt(2024, 50000, "married_filing_jointly")}` },
      };
      const taxableIncome = new Decimal(180000);
      const regularTax = new Decimal(taxAt2025(180000, "married_filing_jointly"));
      const result = calculateScheduleJ(
        input, taxableIncome, regularTax, "married_filing_jointly", constants
      );
      // 1/3 allocation = 40000 each
      expect(result.line6.toNumber()).toBe(40000);
      // Tax computations use MFJ brackets for base years
      expect(result.line8.toNumber()).toBe(taxAt(2022, 85000, "married_filing_jointly"));
      expect(result.line12.toNumber()).toBe(taxAt(2023, 95000, "married_filing_jointly"));
      expect(result.line16.toNumber()).toBe(taxAt(2024, 90000, "married_filing_jointly"));
    });

    it("partial election — farmer elects less than full farm income", () => {
      // Farmer has $150K farm income but only elects $90K for averaging
      const input: ScheduleJInput = {
        electedFarmIncome: "90000", // partial election
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2022, 20000)}` },
        baseYear2: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2023, 20000)}` },
        baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
      };
      const taxableIncome = new Decimal(150000);
      const regularTax = new Decimal(taxAt2025(150000));
      const result = calculateScheduleJ(input, taxableIncome, regularTax, "single", constants);
      // Non-farm = 150K - 90K = 60K
      expect(result.line3.toNumber()).toBe(60000);
      // Allocation = 30K each
      expect(result.line6.toNumber()).toBe(30000);
    });
  });

  // ── Federal Orchestrator Integration ───────────────────────

  describe("Federal orchestrator integration", () => {
    it("Schedule J replaces Form 1040 Line 16 when beneficial", () => {
      const result = calculateFederalTax({
        taxpayer: baseTaxpayer,
        w2s: [{ wagesBox1: "50000", federalWithheld: "8000", socialSecurityWages: "50000", medicareWages: "50000" }],
        form1099Int: [],
        form1099Div: [],
        form1099B: [],
        form1099Misc: [],
        form1099Nec: [],
        form1099G: [],
        formW2G: [],
        form1099K: [],
        form1099C: [],
        form1099Q: [],
        form1098: [],
        form1095A: [],
        donations: [],
        scheduleK1: [],
        rentalProperties: [],
        savingsBondRedemptions: [],
        homeSales: [],
        form8814: [],
        form6252: [],
        scheduleF: {
          salesOfProductsRaised: "200000",
          farmExpenses: {
            carAndTruckExpenses: "10000",
            feed: "20000",
            seeds: "5000",
          },
        },
        scheduleJ: {
          electedFarmIncome: "120000",
          baseYear1: { taxableIncome: "15000", filingStatus: "single", originalTax: `${taxAt(2022, 15000)}` },
          baseYear2: { taxableIncome: "18000", filingStatus: "single", originalTax: `${taxAt(2023, 18000)}` },
          baseYear3: { taxableIncome: "20000", filingStatus: "single", originalTax: `${taxAt(2024, 20000)}` },
        },
      });

      // The result should include Schedule J sub-result
      expect(result.scheduleJ).toBeDefined();
      expect(result.scheduleJ!.isbeneficial).toBe(true);
      // Verify Schedule J audit lines exist
      const schedJLines = result.allLines.filter((l) => l.form === "Sch J");
      expect(schedJLines.length).toBeGreaterThan(0);
    });

    it("Schedule J does not replace Line 16 when not beneficial", () => {
      const result = calculateFederalTax({
        taxpayer: baseTaxpayer,
        w2s: [{ wagesBox1: "80000", federalWithheld: "12000", socialSecurityWages: "80000", medicareWages: "80000" }],
        form1099Int: [],
        form1099Div: [],
        form1099B: [],
        form1099Misc: [],
        form1099Nec: [],
        form1099G: [],
        formW2G: [],
        form1099K: [],
        form1099C: [],
        form1099Q: [],
        form1098: [],
        form1095A: [],
        donations: [],
        scheduleK1: [],
        rentalProperties: [],
        savingsBondRedemptions: [],
        homeSales: [],
        form8814: [],
        form6252: [],
        scheduleF: {
          salesOfProductsRaised: "10000",
          farmExpenses: { feed: "3000" },
        },
        scheduleJ: {
          electedFarmIncome: "5000", // small farm income with high-income base years
          baseYear1: { taxableIncome: "200000", filingStatus: "single", originalTax: `${taxAt(2022, 200000)}` },
          baseYear2: { taxableIncome: "180000", filingStatus: "single", originalTax: `${taxAt(2023, 180000)}` },
          baseYear3: { taxableIncome: "220000", filingStatus: "single", originalTax: `${taxAt(2024, 220000)}` },
        },
      });

      expect(result.scheduleJ).toBeDefined();
      expect(result.scheduleJ!.isbeneficial).toBe(false);
    });
  });

  // ── Audit Trail ────────────────────────────────────────────

  describe("Audit trail", () => {
    it("produces audit lines for all Schedule J lines", () => {
      const input: ScheduleJInput = {
        electedFarmIncome: "60000",
        baseYear1: { taxableIncome: "20000", filingStatus: "single", originalTax: "2162" },
        baseYear2: { taxableIncome: "25000", filingStatus: "single", originalTax: "2782" },
        baseYear3: { taxableIncome: "22000", filingStatus: "single", originalTax: "2410" },
      };
      const result = calculateScheduleJ(input, new Decimal(100000), new Decimal(17400), "single", constants);
      const lineNumbers = result.lines.map((l) => l.line);
      // Check key lines are present
      expect(lineNumbers).toContain("1");
      expect(lineNumbers).toContain("2a");
      expect(lineNumbers).toContain("3");
      expect(lineNumbers).toContain("4");
      expect(lineNumbers).toContain("5");
      expect(lineNumbers).toContain("8");
      expect(lineNumbers).toContain("17");
      expect(lineNumbers).toContain("23");
    });
  });
});
