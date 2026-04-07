/**
 * Tests for MACRS depreciation computation utility.
 * Spec: IRS Publication 946, Tables A-1 through A-8.
 */

import { describe, expect, it } from "vitest";
import {
  computeAssetDepreciation,
  computeAggregateDepreciation,
  isMidQuarterRequired,
  computeListedPropertyDepreciation,
} from "@/utils/macrs.js";

describe("MACRS depreciation computation", () => {
  // -----------------------------------------------------------------------
  // GDS 200% Declining Balance, Half-Year Convention (Table A-1)
  // -----------------------------------------------------------------------

  describe("GDS 200% DB half-year convention (Table A-1)", () => {
    it("5-year asset year 1 - 20.00% of $10,000 = $2,000", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result).not.toBeNull();
      expect(result!.depreciation.toNumber()).toBe(2000);
      expect(result!.percentage.toNumber()).toBe(20);
      expect(result!.recoveryYear).toBe(1);
      expect(result!.method).toBe("200DB");
      expect(result!.convention).toBe("halfYear");
    });

    it("5-year asset year 2 - 32.00% of $10,000 = $3,200", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2024-03", recoveryPeriod: "5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(3200);
      expect(result!.recoveryYear).toBe(2);
    });

    it("5-year asset year 6 (final) - 5.76% of $10,000 = $576", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2020-06", recoveryPeriod: "5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(576);
      expect(result!.recoveryYear).toBe(6);
    });

    it("5-year asset year 7 - fully depreciated returns zero", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2018-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result!.fullyDepreciated).toBe(true);
      expect(result!.depreciation.toNumber()).toBe(0);
    });

    it("3-year asset year 1 - 33.33% of $5,000 = $1,667", () => {
      const result = computeAssetDepreciation(
        { costBasis: "5000", placedInServiceDate: "2025-07", recoveryPeriod: "3" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(1667);
      expect(result!.percentage.toNumber()).toBe(33.33);
    });

    it("3-year asset year 3 - 14.81% of $5,000 = $741", () => {
      const result = computeAssetDepreciation(
        { costBasis: "5000", placedInServiceDate: "2023-01", recoveryPeriod: "3" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(741);
      expect(result!.recoveryYear).toBe(3);
    });

    it("7-year asset year 1 - 14.29% of $25,000 = $3,573", () => {
      const result = computeAssetDepreciation(
        { costBasis: "25000", placedInServiceDate: "2025-04", recoveryPeriod: "7" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(3573);
    });

    it("7-year asset year 5 - 8.93% of $25,000 = $2,233", () => {
      const result = computeAssetDepreciation(
        { costBasis: "25000", placedInServiceDate: "2021-01", recoveryPeriod: "7" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(2233);
      expect(result!.recoveryYear).toBe(5);
    });

    it("10-year asset year 1 - 10.00% of $50,000 = $5,000", () => {
      const result = computeAssetDepreciation(
        { costBasis: "50000", placedInServiceDate: "2025-09", recoveryPeriod: "10" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(5000);
    });

    it("15-year asset year 1 - 5.00% of $100,000 = $5,000", () => {
      const result = computeAssetDepreciation(
        { costBasis: "100000", placedInServiceDate: "2025-03", recoveryPeriod: "15" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(5000);
    });

    it("20-year asset year 1 - 3.750% of $200,000 = $7,500", () => {
      const result = computeAssetDepreciation(
        { costBasis: "200000", placedInServiceDate: "2025-06", recoveryPeriod: "20" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(7500);
    });
  });

  // -----------------------------------------------------------------------
  // Residential Rental (27.5-year), Mid-Month Convention (Table A-6)
  // -----------------------------------------------------------------------

  describe("27.5-year residential rental mid-month (Table A-6)", () => {
    it("placed in January year 1 - 3.485% of $275,000 = $9,584", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "2025-01", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(9584);
      expect(result!.method).toBe("SL");
      expect(result!.convention).toBe("midMonth");
    });

    it("placed in June year 1 - 1.970% of $275,000 = $5,418", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "2025-06", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(5418);
    });

    it("placed in December year 1 - 0.152% of $275,000 = $418", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "2025-12", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(418);
    });

    it("placed in March 2020 year 6 - 3.636% of $275,000 = $9,999", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "2020-03", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(9999);
      expect(result!.recoveryYear).toBe(6);
    });

    it("placed in January year 29 (final) - 1.970%", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "1997-01", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(5418);
      expect(result!.recoveryYear).toBe(29);
    });

    it("placed in January year 30 - fully depreciated", () => {
      const result = computeAssetDepreciation(
        { costBasis: "275000", placedInServiceDate: "1996-01", recoveryPeriod: "27.5" },
        2025,
      );
      expect(result!.fullyDepreciated).toBe(true);
      expect(result!.depreciation.toNumber()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Nonresidential Real Property (39-year), Mid-Month Convention (Table A-7a)
  // -----------------------------------------------------------------------

  describe("39-year nonresidential real property mid-month (Table A-7a)", () => {
    it("placed in January year 1 - 2.461% of $500,000 = $12,305", () => {
      const result = computeAssetDepreciation(
        { costBasis: "500000", placedInServiceDate: "2025-01", recoveryPeriod: "39" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(12305);
      expect(result!.method).toBe("SL");
      expect(result!.convention).toBe("midMonth");
    });

    it("placed in July year 1 - 1.177% of $500,000 = $5,885", () => {
      const result = computeAssetDepreciation(
        { costBasis: "500000", placedInServiceDate: "2025-07", recoveryPeriod: "39" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(5885);
    });

    it("placed in July 2024 year 2 - 2.564% of $500,000 = $12,820", () => {
      const result = computeAssetDepreciation(
        { costBasis: "500000", placedInServiceDate: "2024-07", recoveryPeriod: "39" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(12820);
      expect(result!.recoveryYear).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // GDS 150% Declining Balance (Table A-5)
  // -----------------------------------------------------------------------

  describe("GDS 150% DB half-year convention (Table A-5)", () => {
    it("5-year farm asset year 1 - 15.00% of $20,000 = $3,000", () => {
      const result = computeAssetDepreciation(
        { costBasis: "20000", placedInServiceDate: "2025-05", recoveryPeriod: "5", method: "150DB" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(3000);
      expect(result!.method).toBe("150DB");
    });

    it("7-year farm asset year 3 - 15.03% of $20,000 = $3,006", () => {
      const result = computeAssetDepreciation(
        { costBasis: "20000", placedInServiceDate: "2023-01", recoveryPeriod: "7", method: "150DB" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(3006);
    });
  });

  // -----------------------------------------------------------------------
  // Straight-line, Half-Year Convention (ADS or elective SL)
  // -----------------------------------------------------------------------

  describe("GDS straight-line half-year convention (ADS)", () => {
    it("5-year SL asset year 1 - 10.00% of $10,000 = $1,000", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5", method: "SL", convention: "halfYear" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(1000);
      expect(result!.method).toBe("SL");
    });

    it("7-year SL asset year 4 - 14.28% of $10,000 = $1,428", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2022-01", recoveryPeriod: "7", method: "SL", convention: "halfYear" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(1428);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("zero cost basis returns null", () => {
      const result = computeAssetDepreciation(
        { costBasis: "0", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result).toBeNull();
    });

    it("negative cost basis returns null", () => {
      const result = computeAssetDepreciation(
        { costBasis: "-1000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result).toBeNull();
    });

    it("future placed-in-service date returns null", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2026-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result).toBeNull();
    });

    it("asset placed in service in current year with YYYY-MM-DD format works", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2025-03-15", recoveryPeriod: "5" },
        2025,
      );
      expect(result).not.toBeNull();
      expect(result!.depreciation.toNumber()).toBe(2000);
    });

    it("disposed 5-year asset in year 3 gets half the table percentage", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2023-06", recoveryPeriod: "5", disposedDuringYear: true },
        2025,
      );
      // Year 3 normal = 19.20% of $10,000 = $1,920; half = $960
      expect(result!.depreciation.toNumber()).toBe(960);
    });

    it("description is optional and defaults to empty string", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result!.description).toBe("");
    });

    it("description is preserved when provided", () => {
      const result = computeAssetDepreciation(
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5", description: "Office laptop" },
        2025,
      );
      expect(result!.description).toBe("Office laptop");
    });

    it("small cost basis rounds depreciation to nearest dollar", () => {
      // 5-year, year 1: 20.00% of $33 = $6.60 → rounds to $7
      const result = computeAssetDepreciation(
        { costBasis: "33", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
        2025,
      );
      expect(result!.depreciation.toNumber()).toBe(7);
    });
  });

  // -----------------------------------------------------------------------
  // Aggregation
  // -----------------------------------------------------------------------

  describe("aggregate depreciation", () => {
    it("separates current-year GDS, current-year ADS, and prior-year assets", () => {
      const agg = computeAggregateDepreciation([
        // Current year, 5-year GDS → Line 19
        { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
        // Current year, 39-year real property → Line 20
        { costBasis: "500000", placedInServiceDate: "2025-07", recoveryPeriod: "39" },
        // Prior year, 7-year GDS → Line 17
        { costBasis: "25000", placedInServiceDate: "2023-01", recoveryPeriod: "7" },
      ], 2025);

      expect(agg.currentYearGds.toNumber()).toBe(2000); // 20% of 10K
      expect(agg.currentYearAds.toNumber()).toBe(5885); // 1.177% of 500K
      expect(agg.priorYearAssets.toNumber()).toBe(4373); // 17.49% of 25K
      expect(agg.assetResults).toHaveLength(3);
    });

    it("sums multiple prior-year assets on Line 17", () => {
      const agg = computeAggregateDepreciation([
        { costBasis: "10000", placedInServiceDate: "2024-01", recoveryPeriod: "5" },
        { costBasis: "20000", placedInServiceDate: "2022-06", recoveryPeriod: "7" },
      ], 2025);

      // 5-yr year 2: 32% of 10K = 3200
      // 7-yr year 4: 12.49% of 20K = 2498
      expect(agg.priorYearAssets.toNumber()).toBe(3200 + 2498);
      expect(agg.currentYearGds.toNumber()).toBe(0);
      expect(agg.currentYearAds.toNumber()).toBe(0);
    });

    it("skips fully depreciated assets", () => {
      const agg = computeAggregateDepreciation([
        { costBasis: "10000", placedInServiceDate: "2015-01", recoveryPeriod: "5" },
        { costBasis: "5000", placedInServiceDate: "2025-01", recoveryPeriod: "3" },
      ], 2025);

      // First asset is year 11 of a 5-year (6-entry table) → fully depreciated
      // Second asset: 33.33% of 5000 = 1667
      expect(agg.currentYearGds.toNumber()).toBe(1667);
      expect(agg.priorYearAssets.toNumber()).toBe(0);
      expect(agg.assetResults).toHaveLength(1);
    });

    it("current-year SL personal property goes to Line 20 (ADS)", () => {
      const agg = computeAggregateDepreciation([
        { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5", method: "SL", convention: "halfYear" },
      ], 2025);

      // SL 5-yr year 1: 10% of 10K = 1000
      expect(agg.currentYearAds.toNumber()).toBe(1000);
      expect(agg.currentYearGds.toNumber()).toBe(0);
    });

    it("empty assets array returns all zeros", () => {
      const agg = computeAggregateDepreciation([], 2025);
      expect(agg.priorYearAssets.toNumber()).toBe(0);
      expect(agg.currentYearGds.toNumber()).toBe(0);
      expect(agg.currentYearAds.toNumber()).toBe(0);
      expect(agg.assetResults).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Mid-Quarter Convention (Tables A-2 through A-5)
  // -----------------------------------------------------------------------

  describe("mid-quarter convention", () => {
    describe("isMidQuarterRequired — 40% Q4 test per IRC §168(d)(3)", () => {
      it("single Q4 asset triggers mid-quarter (100% > 40%)", () => {
        expect(isMidQuarterRequired([
          { costBasis: "10000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
        ], 2025)).toBe(true);
      });

      it("single Q1 asset does not trigger mid-quarter (0% Q4)", () => {
        expect(isMidQuarterRequired([
          { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
        ], 2025)).toBe(false);
      });

      it("exactly 40% Q4 does NOT trigger (must be MORE than 40%)", () => {
        expect(isMidQuarterRequired([
          { costBasis: "6000", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
          { costBasis: "4000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
        ], 2025)).toBe(false);
      });

      it("41% Q4 triggers mid-quarter", () => {
        expect(isMidQuarterRequired([
          { costBasis: "5900", placedInServiceDate: "2025-01", recoveryPeriod: "5" },
          { costBasis: "4100", placedInServiceDate: "2025-11", recoveryPeriod: "5" },
        ], 2025)).toBe(true);
      });

      it("real property (27.5/39-year) is excluded from the test", () => {
        // $500K building in Q4 + $10K equipment in Q1
        // Without the exclusion, Q4 would be 500K/510K = 98%
        // With the exclusion, Q4 personal property = $0, so no trigger
        expect(isMidQuarterRequired([
          { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
          { costBasis: "500000", placedInServiceDate: "2025-11", recoveryPeriod: "39" },
        ], 2025)).toBe(false);
      });

      it("prior-year assets are excluded from the test", () => {
        expect(isMidQuarterRequired([
          { costBasis: "10000", placedInServiceDate: "2024-10", recoveryPeriod: "5" },
          { costBasis: "5000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
        ], 2025)).toBe(false);
      });

      it("assets with explicit convention override are excluded from the test", () => {
        expect(isMidQuarterRequired([
          { costBasis: "10000", placedInServiceDate: "2025-03", recoveryPeriod: "5" },
          { costBasis: "50000", placedInServiceDate: "2025-10", recoveryPeriod: "5", convention: "halfYear" },
        ], 2025)).toBe(false);
      });

      it("empty assets returns false", () => {
        expect(isMidQuarterRequired([], 2025)).toBe(false);
      });
    });

    describe("200% DB mid-quarter depreciation percentages", () => {
      it("Q1 5-year year 1 - 35.00% of $10,000 = $3,500", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2025-02", recoveryPeriod: "5", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(3500);
        expect(result!.percentage.toNumber()).toBe(35);
        expect(result!.convention).toBe("midQuarter");
      });

      it("Q2 5-year year 1 - 25.00% of $10,000 = $2,500", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2025-05", recoveryPeriod: "5", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(2500);
        expect(result!.percentage.toNumber()).toBe(25);
      });

      it("Q3 5-year year 1 - 15.00% of $10,000 = $1,500", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2025-08", recoveryPeriod: "5", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(1500);
      });

      it("Q4 5-year year 1 - 5.00% of $10,000 = $500", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2025-11", recoveryPeriod: "5", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(500);
      });

      it("Q4 3-year year 2 - 61.11% of $5,000 = $3,056", () => {
        const result = computeAssetDepreciation(
          { costBasis: "5000", placedInServiceDate: "2024-12", recoveryPeriod: "3", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(3056);
        expect(result!.recoveryYear).toBe(2);
      });

      it("Q1 7-year year 1 - 25.00% of $25,000 = $6,250", () => {
        const result = computeAssetDepreciation(
          { costBasis: "25000", placedInServiceDate: "2025-03", recoveryPeriod: "7", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(6250);
      });
    });

    describe("150% DB mid-quarter depreciation percentages", () => {
      it("Q1 5-year year 1 - 26.25% of $20,000 = $5,250", () => {
        const result = computeAssetDepreciation(
          { costBasis: "20000", placedInServiceDate: "2025-02", recoveryPeriod: "5", method: "150DB", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(5250);
        expect(result!.method).toBe("150DB");
      });

      it("Q4 7-year year 1 - 2.68% of $20,000 = $536", () => {
        const result = computeAssetDepreciation(
          { costBasis: "20000", placedInServiceDate: "2025-10", recoveryPeriod: "7", method: "150DB", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(536);
      });
    });

    describe("SL mid-quarter depreciation percentages", () => {
      it("Q1 5-year year 1 - 17.50% of $10,000 = $1,750", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2025-01", recoveryPeriod: "5", method: "SL", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(1750);
      });

      it("Q4 5-year year 6 (final) - 17.50% of $10,000 = $1,750", () => {
        const result = computeAssetDepreciation(
          { costBasis: "10000", placedInServiceDate: "2020-12", recoveryPeriod: "5", method: "SL", convention: "midQuarter" },
          2025,
        );
        expect(result!.depreciation.toNumber()).toBe(1750);
        expect(result!.recoveryYear).toBe(6);
      });
    });

    describe("aggregate auto-detects mid-quarter and applies to all current-year assets", () => {
      it("Q4-heavy portfolio triggers mid-quarter for Q1 and Q4 assets alike", () => {
        const agg = computeAggregateDepreciation([
          // Q1 asset: $3,000
          { costBasis: "3000", placedInServiceDate: "2025-02", recoveryPeriod: "5" },
          // Q4 asset: $7,000 — 70% > 40%, triggers mid-quarter
          { costBasis: "7000", placedInServiceDate: "2025-11", recoveryPeriod: "5" },
        ], 2025);

        expect(agg.midQuarterRequired).toBe(true);

        // Q1 asset uses mid-quarter Q1 table: 35.00% of $3,000 = $1,050
        // Q4 asset uses mid-quarter Q4 table: 5.00% of $7,000 = $350
        expect(agg.currentYearGds.toNumber()).toBe(1050 + 350);

        // Both assets should report midQuarter convention
        expect(agg.assetResults[0].convention).toBe("midQuarter");
        expect(agg.assetResults[1].convention).toBe("midQuarter");
      });

      it("Q1-heavy portfolio keeps half-year convention", () => {
        const agg = computeAggregateDepreciation([
          { costBasis: "8000", placedInServiceDate: "2025-02", recoveryPeriod: "5" },
          { costBasis: "2000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
        ], 2025);

        expect(agg.midQuarterRequired).toBe(false);

        // Half-year: 20% of $8,000 = $1,600; 20% of $2,000 = $400
        expect(agg.currentYearGds.toNumber()).toBe(1600 + 400);
        expect(agg.assetResults[0].convention).toBe("halfYear");
      });

      it("prior-year assets unaffected by mid-quarter trigger", () => {
        const agg = computeAggregateDepreciation([
          // Prior-year asset should still use half-year
          { costBasis: "10000", placedInServiceDate: "2024-03", recoveryPeriod: "5" },
          // Current-year Q4 triggers mid-quarter
          { costBasis: "5000", placedInServiceDate: "2025-10", recoveryPeriod: "5" },
        ], 2025);

        expect(agg.midQuarterRequired).toBe(true);

        // Prior-year asset: year 2 half-year, 32% of $10K = $3,200
        expect(agg.priorYearAssets.toNumber()).toBe(3200);
        // Current-year Q4: mid-quarter, 5% of $5K = $250
        expect(agg.currentYearGds.toNumber()).toBe(250);

        const priorResult = agg.assetResults.find(r => r.placedInServiceYear === 2024);
        expect(priorResult!.convention).toBe("halfYear");
      });

      it("real property uses mid-month regardless of mid-quarter trigger", () => {
        const agg = computeAggregateDepreciation([
          // Current-year real property
          { costBasis: "500000", placedInServiceDate: "2025-07", recoveryPeriod: "39" },
          // Current-year Q4 personal property — triggers mid-quarter
          { costBasis: "5000", placedInServiceDate: "2025-11", recoveryPeriod: "5" },
        ], 2025);

        expect(agg.midQuarterRequired).toBe(true);

        const realResult = agg.assetResults.find(r => r.recoveryPeriod === 39);
        expect(realResult!.convention).toBe("midMonth");
        // 1.177% of $500K = $5,885
        expect(realResult!.depreciation.toNumber()).toBe(5885);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Table completeness: verify all recovery periods sum to ~100%
  // -----------------------------------------------------------------------

  describe("MACRS table integrity", () => {
    it.each([3, 5, 7, 10, 15, 20])("%d-year 200DB half-year percentages sum to 100%%", (period) => {
      // Compute all years for a $1,000,000 asset and verify total = cost basis
      let total = 0;
      for (let year = 1; year <= period + 1; year++) {
        const result = computeAssetDepreciation(
          { costBasis: "1000000", placedInServiceDate: `${2025 - year + 1}-01`, recoveryPeriod: String(period) as "3" | "5" | "7" | "10" | "15" | "20" },
          2025,
        );
        if (result && !result.fullyDepreciated) {
          total += result.depreciation.toNumber();
        }
      }
      // The individual years sum to approximately the cost basis (within rounding)
      expect(total).toBeGreaterThan(999990);
      expect(total).toBeLessThanOrEqual(1000010);
    });

    const quarters = [1, 2, 3, 4] as const;
    const months: Record<number, string> = { 1: "02", 2: "05", 3: "08", 4: "11" };

    it.each(
      quarters.flatMap(q => [3, 5, 7, 10, 15, 20].map(p => ({ q, p }))),
    )("$p-year 200DB mid-quarter Q$q percentages sum to ~100%", ({ q, p }) => {
      let total = 0;
      for (let year = 1; year <= p + 2; year++) {
        const result = computeAssetDepreciation(
          {
            costBasis: "1000000",
            placedInServiceDate: `${2025 - year + 1}-${months[q]}`,
            recoveryPeriod: String(p) as "3" | "5" | "7" | "10" | "15" | "20",
            convention: "midQuarter",
          },
          2025,
        );
        if (result && !result.fullyDepreciated) {
          total += result.depreciation.toNumber();
        }
      }
      expect(total).toBeGreaterThan(999990);
      expect(total).toBeLessThanOrEqual(1000010);
    });
  });
});

// ---------------------------------------------------------------------------
// Listed property helpers (IRC §280F)
// ---------------------------------------------------------------------------

describe("computeListedPropertyDepreciation", () => {
  it("passenger auto with 100% business use — year-1 cap applies", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-03",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
    );
    expect(result).not.toBeNull();
    // Tentative: 20% × $80K = $16,000; cap $12,400
    expect(result!.depreciation.toNumber()).toBe(12400);
  });

  it("passenger auto — 60% business use reduces before cap comparison", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "80000",
        placedInServiceDate: "2025-03",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 60,
      },
      2025,
    );
    expect(result).not.toBeNull();
    // Tentative: 20% × $80K × 60% = $9,600; cap $12,400 → $9,600
    expect(result!.depreciation.toNumber()).toBe(9600);
  });

  it("≤50% business use forces ADS SL for passenger auto", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "50000",
        placedInServiceDate: "2025-06",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 45,
      },
      2025,
    );
    expect(result).not.toBeNull();
    // ADS SL 5-year half-year year 1: 10% × $50K = $5,000
    // × 45% = $2,250; cap $12,400 → $2,250
    expect(result!.depreciation.toNumber()).toBe(2250);
    expect(result!.method).toBe("SL");
    expect(result!.qualifiesForMacrs).toBe(false);
  });

  it("respects mid-quarter convention override for listed property", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "40000",
        placedInServiceDate: "2025-10",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: true,
        businessUsePercentage: 100,
      },
      2025,
      "midQuarter",
    );
    expect(result).not.toBeNull();
    // Q4 mid-quarter 200DB year 1: 5% × $40K = $2,000; cap $12,400 → $2,000
    expect(result!.depreciation.toNumber()).toBe(2000);
    expect(result!.convention).toBe("midQuarter");
  });

  it("non-auto listed property has no §280F cap", () => {
    const result = computeListedPropertyDepreciation(
      {
        costBasis: "100000",
        placedInServiceDate: "2025-01",
        recoveryPeriod: "5",
        isListedProperty: true,
        isPassengerAutomobile: false,
        businessUsePercentage: 100,
      },
      2025,
    );
    expect(result).not.toBeNull();
    // 200DB half-year year 1: 20% × $100K = $20,000; no cap
    expect(result!.depreciation.toNumber()).toBe(20000);
    expect(result!.section280FCap).toBeNull();
  });
});
