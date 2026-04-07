/**
 * Edge case tests for Form 4562 — Depreciation and Amortization.
 * Spec: spec/federal/form-4562.yaml
 *
 * Covers Section 179 boundary conditions, amortization edge cases,
 * and interaction between depreciation components.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4562 } from "@/engine/forms/form-4562.js";
import type { Form4562Input } from "@/models/inputs.js";

describe("Form 4562 Edge Cases", () => {
  // ── Section 179 Boundary Conditions ───────────────────────────────

  describe("Section 179 phase-out boundaries", () => {
    it("Form 4562 Line 5 - cost exactly at full phaseout ($6,500,000) yields $0 section 179 limit", () => {
      // $4,000,000 threshold + $2,500,000 limit = $6,500,000 full phaseout
      const result = calculateForm4562({
        section179TotalCost: "6500000",
        section179ElectedCost: "100000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "500000",
      });

      expect(result.line4.toNumber()).toBe(2500000);
      expect(result.line5.toNumber()).toBe(0);
      expect(result.line9.toNumber()).toBe(0);
      expect(result.line12.toNumber()).toBe(0);
    });

    it("Form 4562 Line 5 - cost $1 above full phaseout ($6,500,001) still yields $0", () => {
      const result = calculateForm4562({
        section179TotalCost: "6500001",
        section179ElectedCost: "100000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "500000",
      });

      // Line 4 = 6500001 - 4000000 = 2500001, but line 5 floors at 0
      expect(result.line4.toNumber()).toBe(2500001);
      expect(result.line5.toNumber()).toBe(0);
    });

    it("Form 4562 Line 9 - elected cost less than dollar limitation uses elected cost", () => {
      const result = calculateForm4562({
        section179TotalCost: "4000000", // At threshold, full $2.5M available
        section179ElectedCost: "500000", // Only elect $500K
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "2500000",
      });

      expect(result.line5.toNumber()).toBe(2500000);
      expect(result.line9.toNumber()).toBe(500000); // min(2500000, 500000)
      expect(result.line12.toNumber()).toBe(500000);
    });

    it("Form 4562 Line 9 - elected cost exactly equals dollar limitation", () => {
      const result = calculateForm4562({
        section179TotalCost: "4000000",
        section179ElectedCost: "2500000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "2500000",
      });

      expect(result.line9.toNumber()).toBe(2500000);
      expect(result.line12.toNumber()).toBe(2500000);
      expect(result.line13.toNumber()).toBe(0);
    });
  });

  describe("Section 179 business income limitation", () => {
    it("Form 4562 Line 12 - business income less than tentative deduction limits actual deduction", () => {
      const result = calculateForm4562({
        section179TotalCost: "4000000",
        section179ElectedCost: "2500000",
        section179CarryoverFromPriorYear: "50000",
        section179BusinessIncomeLimit: "1000000",
      });

      // Line 9 = min(2500000, 2500000) = 2500000
      // Line 11 = min(2500000, 1000000) = 1000000
      // Line 12 = min(2500000 + 50000, 1000000) = 1000000
      expect(result.line12.toNumber()).toBe(1000000);
      // Carryover = 2500000 + 50000 - 1000000 = 1550000
      expect(result.line13.toNumber()).toBe(1550000);
    });

    it("Form 4562 Line 12 - business income exactly equals tentative plus carryover", () => {
      const result = calculateForm4562({
        section179TotalCost: "4000000",
        section179ElectedCost: "200000",
        section179CarryoverFromPriorYear: "50000",
        section179BusinessIncomeLimit: "250000",
      });

      // Line 9 = min(2500000, 200000) = 200000
      // Line 12 = min(200000 + 50000, 250000) = 250000
      expect(result.line12.toNumber()).toBe(250000);
      expect(result.line13.toNumber()).toBe(0);
    });

    it("Form 4562 Line 12 - business income $1 less than needed creates $1 carryover", () => {
      const result = calculateForm4562({
        section179TotalCost: "4000000",
        section179ElectedCost: "200000",
        section179CarryoverFromPriorYear: "50000",
        section179BusinessIncomeLimit: "249999",
      });

      // Line 11 = min(2500000, 249999) = 249999
      // Line 12 = min(250000, 249999) = 249999
      expect(result.line12.toNumber()).toBe(249999);
      expect(result.line13.toNumber()).toBe(1);
    });
  });

  describe("Section 179 zero and minimal inputs", () => {
    it("Form 4562 - all zero inputs yield zero across all lines", () => {
      const result = calculateForm4562({});

      expect(result.line1.toNumber()).toBe(2500000); // Default limit
      expect(result.line2.toNumber()).toBe(0);
      expect(result.line3.toNumber()).toBe(4000000); // Default threshold
      expect(result.line4.toNumber()).toBe(0);
      expect(result.line5.toNumber()).toBe(2500000);
      expect(result.line8.toNumber()).toBe(0);
      expect(result.line9.toNumber()).toBe(0);
      expect(result.line10.toNumber()).toBe(0);
      expect(result.line12.toNumber()).toBe(0);
      expect(result.line22.toNumber()).toBe(0);
      expect(result.line44.toNumber()).toBe(0);
    });

    it("Form 4562 Line 1 - custom maximum deduction override replaces default $2.5M", () => {
      const result = calculateForm4562({
        section179MaximumDeduction: "1250000", // MFS or special allocation
        section179TotalCost: "3000000",
        section179ElectedCost: "1250000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "2000000",
      });

      expect(result.line1.toNumber()).toBe(1250000);
      expect(result.line5.toNumber()).toBe(1250000);
      expect(result.line12.toNumber()).toBe(1250000);
    });

    it("Form 4562 Line 3 - custom threshold override replaces default $4M", () => {
      const result = calculateForm4562({
        section179ThresholdCost: "3000000", // Custom threshold
        section179TotalCost: "3500000",
        section179ElectedCost: "2000000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "2000000",
      });

      expect(result.line3.toNumber()).toBe(3000000);
      expect(result.line4.toNumber()).toBe(500000); // 3500000 - 3000000
      expect(result.line5.toNumber()).toBe(2000000); // 2500000 - 500000
    });

    it("Form 4562 - only prior-year carryover with no current activity", () => {
      const result = calculateForm4562({
        section179TotalCost: "0",
        section179ElectedCost: "0",
        section179CarryoverFromPriorYear: "200000",
        section179BusinessIncomeLimit: "150000",
      });

      // Line 9 = 0, Line 12 = min(0 + 200000, 150000) = 150000
      expect(result.line9.toNumber()).toBe(0);
      expect(result.line12.toNumber()).toBe(150000);
      expect(result.line13.toNumber()).toBe(50000);
    });
  });

  // ── Amortization Edge Cases ──────────────────────────────────────

  describe("Amortization boundary conditions", () => {
    it("Form 4562 Part VI - §197 asset in its last month produces deduction for only 1 month", () => {
      // §197 = 180 months, placed January 2011 → ends December 2025
      // In 2025: months 169-180, that's full 12 months
      // But let's test one that started in July 2010 → ends June 2025
      // In 2025: only Jan-June = 6 months
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Customer list",
          amortizableAmount: "180000",
          dateAmortizationBegins: "2010-07",
          codeSection: "197",
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      expect(result.amortizationResults[0].monthsThisYear).toBe(6);
      // $180,000 / 180 months × 6 months = $6,000
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(6000));
      expect(result.amortizationResults[0].isComplete).toBe(true);
      expect(result.line43.toNumber()).toBe(6000); // Prior-year start
    });

    it("Form 4562 Part VI - §174 domestic R&E first year: exactly 6 months regardless of actual date", () => {
      // §174 domestic forces mid-year convention (July 1)
      // Even if expense was incurred in January, start = July
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "R&D expenditure",
          amortizableAmount: "600000",
          dateAmortizationBegins: "2025-01",
          codeSection: "174domestic",
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      // Mid-year: starts July 2025, so 6 months in 2025
      expect(result.amortizationResults[0].monthsThisYear).toBe(6);
      expect(result.amortizationResults[0].startMonth).toBe(7); // Forced to July
      // $600,000 / 60 months × 6 months = $60,000
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(60000));
      expect(result.line42.toNumber()).toBe(60000); // Current-year start
    });

    it("Form 4562 Part VI - §174 domestic year 6 (final): exactly 6 months remaining", () => {
      // Started 2020-07 (mid-year convention), 60 months → ends 2025-06
      // In 2025: Jan-June = 6 months
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Prior R&D costs",
          amortizableAmount: "300000",
          dateAmortizationBegins: "2020-03", // Will be forced to July 2020
          codeSection: "174domestic",
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      expect(result.amortizationResults[0].monthsThisYear).toBe(6);
      // $300,000 / 60 months × 6 months = $30,000
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(30000));
      expect(result.amortizationResults[0].isComplete).toBe(true);
    });

    it("Form 4562 Part VI - §174 foreign uses 180 months with mid-year convention", () => {
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Foreign R&D",
          amortizableAmount: "900000",
          dateAmortizationBegins: "2025-03",
          codeSection: "174foreign",
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      expect(result.amortizationResults[0].periodMonths).toBe(180);
      expect(result.amortizationResults[0].startMonth).toBe(7); // Mid-year
      expect(result.amortizationResults[0].monthsThisYear).toBe(6);
      // $900,000 / 180 months × 6 months = $30,000
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(30000));
    });

    it("Form 4562 Part VI - asset completely amortized before current year returns null (no result)", () => {
      // §169: 60 months, started 2019-01 → ended 2023-12
      // In 2025: no overlap
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Pollution control",
          amortizableAmount: "100000",
          dateAmortizationBegins: "2019-01",
          codeSection: "169",
        }],
      });

      expect(result.amortizationResults).toHaveLength(0);
      expect(result.line42.toNumber()).toBe(0);
      expect(result.line43.toNumber()).toBe(0);
    });

    it("Form 4562 Part VI - asset not yet started (future year) returns no result", () => {
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Future intangible",
          amortizableAmount: "50000",
          dateAmortizationBegins: "2026-01",
          codeSection: "197",
        }],
      });

      expect(result.amortizationResults).toHaveLength(0);
    });

    it("Form 4562 Part VI - zero amortizable amount produces no result", () => {
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Zero asset",
          amortizableAmount: "0",
          dateAmortizationBegins: "2025-01",
          codeSection: "197",
        }],
      });

      expect(result.amortizationResults).toHaveLength(0);
    });

    it("Form 4562 Part VI - negative amortizable amount produces no result", () => {
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Negative asset",
          amortizableAmount: "-5000",
          dateAmortizationBegins: "2025-01",
          codeSection: "197",
        }],
      });

      expect(result.amortizationResults).toHaveLength(0);
    });

    it("Form 4562 Part VI - §195 startup costs amortize over 180 months", () => {
      // $45,000 startup costs (after $5,000 immediate deduction)
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Startup costs",
          amortizableAmount: "45000",
          dateAmortizationBegins: "2025-04",
          codeSection: "195",
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      expect(result.amortizationResults[0].periodMonths).toBe(180);
      // April through December = 9 months
      expect(result.amortizationResults[0].monthsThisYear).toBe(9);
      // $45,000 / 180 × 9 = $2,250
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(2250));
    });

    it("Form 4562 Part VI - custom period override replaces code section default", () => {
      const result = calculateForm4562({
        taxYear: 2025,
        amortizableAssets: [{
          description: "Bond premium",
          amortizableAmount: "12000",
          dateAmortizationBegins: "2025-01",
          codeSection: "171",
          amortizationPeriodMonths: 36, // 3-year bond term
        }],
      });

      expect(result.amortizationResults).toHaveLength(1);
      expect(result.amortizationResults[0].periodMonths).toBe(36);
      // $12,000 / 36 × 12 = $4,000
      expect(result.amortizationResults[0].deduction).toEqual(new Decimal(4000));
    });
  });

  // ── Line 22 Total Depreciation ───────────────────────────────────

  describe("Line 22 component interactions", () => {
    it("Form 4562 Line 22 - all depreciation components contribute to total", () => {
      const result = calculateForm4562({
        section179ExpenseDeduction: "100000",
        specialDepreciationAllowance: "50000",
        section168f1Depreciation: "10000",
        otherDepreciation: "5000",
        macrsPre2025AssetsDepreciation: "30000",
        macrsCurrentYearGdsDepreciation: "20000",
        macrsCurrentYearAdsDepreciation: "15000",
        listedPropertyDepreciation: "8000",
      });

      // 100000 + 50000 + 10000 + 5000 + 30000 + 20000 + 15000 + 8000 = 238000
      expect(result.line22.toNumber()).toBe(238000);
    });

    it("Form 4562 Line 22 - amortization (Line 44) remains separate from depreciation total", () => {
      const result = calculateForm4562({
        section179ExpenseDeduction: "50000",
        currentYearAmortization: "10000",
        priorYearAmortization: "5000",
      });

      expect(result.line22.toNumber()).toBe(50000); // Only section 179
      expect(result.line44.toNumber()).toBe(15000); // Separate
    });

    it("Form 4562 Line 22 - zero section 179 with positive depreciation components", () => {
      const result = calculateForm4562({
        section179TotalCost: "6500000", // Fully phased out
        section179ElectedCost: "100000",
        section179CarryoverFromPriorYear: "0",
        section179BusinessIncomeLimit: "500000",
        macrsPre2025AssetsDepreciation: "45000",
        macrsCurrentYearGdsDepreciation: "12000",
      });

      expect(result.line12.toNumber()).toBe(0);
      expect(result.line22.toNumber()).toBe(57000); // Only MACRS
    });
  });

  // ── §280F Recapture Boundary Conditions ──────────────────────────

  describe("§280F recapture edge cases", () => {
    it("Form 4562 §280F recapture - equal cumulative MACRS and ADS yields zero recapture", () => {
      const result = calculateForm4562({
        assets: [{
          description: "Business vehicle",
          costBasis: "50000",
          placedInServiceDate: "2023-03-15",
          recoveryPeriod: 5,
          method: "200DB" as const,
          convention: "HY" as const,
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 40,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "10000",
          cumulativePriorAdsDeductions: "10000", // Equal
        }],
      });

      expect(result.section280FRecaptureIncome.toNumber()).toBe(0);
    });

    it("Form 4562 §280F recapture - ADS exceeds MACRS yields zero (floored)", () => {
      const result = calculateForm4562({
        assets: [{
          description: "Business vehicle",
          costBasis: "50000",
          placedInServiceDate: "2023-03-15",
          recoveryPeriod: 5,
          method: "200DB" as const,
          convention: "HY" as const,
          isListedProperty: true,
          isPassengerAutomobile: true,
          businessUsePercentage: 30,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "8000",
          cumulativePriorAdsDeductions: "12000",
        }],
      });

      expect(result.section280FRecaptureIncome.toNumber()).toBe(0);
    });

    it("Form 4562 §280F recapture - $1 excess produces $1 recapture", () => {
      const result = calculateForm4562({
        assets: [{
          description: "Business laptop",
          costBasis: "3000",
          placedInServiceDate: "2023-06-01",
          recoveryPeriod: 5,
          method: "200DB" as const,
          convention: "HY" as const,
          isListedProperty: true,
          businessUsePercentage: 45,
          section280FRecaptureTriggered: true,
          cumulativePriorMacrsDeductions: "1001",
          cumulativePriorAdsDeductions: "1000",
        }],
      });

      expect(result.section280FRecaptureIncome.toNumber()).toBe(1);
    });
  });
});
