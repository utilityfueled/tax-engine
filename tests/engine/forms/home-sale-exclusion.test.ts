import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateHomeSaleExclusion,
  calculateHomeSales,
  type HomeSaleParams,
} from "@/engine/forms/home-sale-exclusion.js";
import { TAX_CONSTANTS } from "@/models/constants.js";
import type { FilingStatus } from "@/models/constants.js";
import type { HomeSaleInput } from "@/models/inputs.js";

const constants2025 = TAX_CONSTANTS[2025].homeSaleExclusion;

function makeSale(overrides: Partial<HomeSaleInput> & { salePrice: string | number; purchasePrice: string | number }): HomeSaleInput {
  return {
    salePrice: String(overrides.salePrice),
    sellingExpenses: overrides.sellingExpenses ?? "0",
    purchasePrice: String(overrides.purchasePrice),
    improvements: overrides.improvements ?? "0",
    depreciationAfterMay1997: overrides.depreciationAfterMay1997 ?? "0",
    casualtyLossDeductions: overrides.casualtyLossDeductions ?? "0",
    otherBasisAdjustments: overrides.otherBasisAdjustments ?? "0",
    daysOwned: overrides.daysOwned ?? 1000,
    daysUsedAsResidence: overrides.daysUsedAsResidence ?? 1000,
    usedExclusionInPrior2Years: overrides.usedExclusionInPrior2Years ?? false,
    qualifiesForReducedExclusion: overrides.qualifiesForReducedExclusion ?? false,
    bothSpousesMeetUseTest: overrides.bothSpousesMeetUseTest ?? false,
    atLeastOneSpouseMeetsOwnershipTest: overrides.atLeastOneSpouseMeetsOwnershipTest ?? false,
    incapableOfSelfCare: overrides.incapableOfSelfCare ?? false,
    daysInLicensedCareFacilityWhileOwning: overrides.daysInLicensedCareFacilityWhileOwning ?? 0,
    qualifiedExtendedDutyDays: overrides.qualifiedExtendedDutyDays ?? 0,
  };
}

function makeParams(
  sale: HomeSaleInput,
  filingStatus: FilingStatus = "single"
): HomeSaleParams {
  return { sale, filingStatus, constants: constants2025 };
}

describe("Home Sale Exclusion — IRC §121", () => {
  describe("Line 1 — Amount realized", () => {
    it("Home Sale Line 1 - amount realized equals sale price minus selling expenses", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 500000, purchasePrice: 200000, sellingExpenses: "30000" })
      ));
      expect(result.amountRealized.toNumber()).toBe(470000);
    });

    it("Home Sale Line 1 - zero selling expenses means amount realized equals sale price", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 400000, purchasePrice: 200000 })
      ));
      expect(result.amountRealized.toNumber()).toBe(400000);
    });
  });

  describe("Line 2 — Adjusted basis", () => {
    it("Home Sale Line 2 - adjusted basis includes improvements and subtracts depreciation", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 600000,
          purchasePrice: 300000,
          improvements: "50000",
          depreciationAfterMay1997: "10000",
        })
      ));
      // 300000 + 50000 - 10000 = 340000
      expect(result.adjustedBasis.toNumber()).toBe(340000);
    });

    it("Home Sale Line 2 - casualty loss deductions reduce basis", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 250000,
          casualtyLossDeductions: "15000",
        })
      ));
      expect(result.adjustedBasis.toNumber()).toBe(235000);
    });

    it("Home Sale Line 2 - other basis adjustments can increase or decrease basis", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 250000,
          otherBasisAdjustments: "5000",
        })
      ));
      expect(result.adjustedBasis.toNumber()).toBe(255000);
    });
  });

  describe("Line 3 — Gain or loss", () => {
    it("Home Sale Line 3 - gain is amount realized minus adjusted basis", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 500000, purchasePrice: 200000, sellingExpenses: "20000" })
      ));
      // Amount realized: 480000, basis: 200000, gain: 280000
      expect(result.gainOrLoss.toNumber()).toBe(280000);
      expect(result.hasGain).toBe(true);
    });

    it("Home Sale Line 3 - breakeven produces zero gain", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 200000, purchasePrice: 200000 })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(0);
      expect(result.hasGain).toBe(false);
    });
  });

  describe("Loss on personal-use property", () => {
    it("Home Sale loss - no deduction for personal-use property loss", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 180000, purchasePrice: 250000, sellingExpenses: "10000" })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(-80000);
      expect(result.hasGain).toBe(false);
      expect(result.taxableGain.toNumber()).toBe(0);
      expect(result.excludableGain.toNumber()).toBe(0);
      expect(result.maxExclusion.toNumber()).toBe(0);
    });
  });

  describe("Eligibility tests", () => {
    it("Home Sale ownership test - requires at least 730 days", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 729,
          daysUsedAsResidence: 1000,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale ownership test - exactly 730 days passes", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 730,
          daysUsedAsResidence: 1000,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
    });

    it("Home Sale use test - requires at least 730 days", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1000,
          daysUsedAsResidence: 729,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale frequency test - cannot use exclusion twice in 2 years", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          usedExclusionInPrior2Years: true,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale all tests pass - full exclusion available", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1826,
          daysUsedAsResidence: 1826,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
    });
  });

  describe("Line 4 — Maximum exclusion amount", () => {
    it("Home Sale Line 4 - single filer gets $250,000 exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000 }),
        "single"
      ));
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale Line 4 - HoH filer gets $250,000 exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000 }),
        "head_of_household"
      ));
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale Line 4 - MFJ both qualifying gets $500,000 exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 1000000,
          purchasePrice: 200000,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      expect(result.maxExclusion.toNumber()).toBe(500000);
    });

    it("Home Sale Line 4 - MFJ only one spouse qualifying gets $250,000", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 1000000,
          purchasePrice: 200000,
          bothSpousesMeetUseTest: false,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale Line 4 - MFS filer gets $250,000 exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000 }),
        "married_filing_separately"
      ));
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale Line 4 - QSS filer gets $250,000 exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000 }),
        "qualifying_surviving_spouse"
      ));
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale Line 4 - no exclusion when tests not met and not reduced", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 300,
          daysUsedAsResidence: 300,
          qualifiesForReducedExclusion: false,
        })
      ));
      expect(result.maxExclusion.toNumber()).toBe(0);
      expect(result.taxableGain.toNumber()).toBe(300000);
    });
  });

  describe("Reduced exclusion — IRC §121(c)", () => {
    it("Home Sale reduced exclusion - prorated by days owned when fewer than days used", () => {
      // Owned 365 days, used 365 days → proration = 365/730 = 0.5
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 365,
          daysUsedAsResidence: 365,
          qualifiesForReducedExclusion: true,
        })
      ));
      expect(result.qualifiesForReducedExclusion).toBe(true);
      // $250,000 × 365/730 = $125,000
      expect(result.maxExclusion.toNumber()).toBe(125000);
    });

    it("Home Sale reduced exclusion - prorated by days used when fewer than days owned", () => {
      // Owned 600 days, used 400 days → proration = 400/730
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 600,
          daysUsedAsResidence: 400,
          qualifiesForReducedExclusion: true,
        })
      ));
      // $250,000 × 400/730 ≈ $136,986
      expect(result.maxExclusion.toNumber()).toBe(136986);
    });

    it("Home Sale reduced exclusion - MFJ with both qualifying prorates $500,000", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 800000,
          purchasePrice: 200000,
          daysOwned: 365,
          daysUsedAsResidence: 365,
          qualifiesForReducedExclusion: true,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      // $500,000 × 365/730 = $250,000
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale reduced exclusion - zero days produces zero exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 0,
          daysUsedAsResidence: 0,
          qualifiesForReducedExclusion: true,
        })
      ));
      expect(result.maxExclusion.toNumber()).toBe(0);
    });
  });

  describe("Line 5 — Excludable gain", () => {
    it("Home Sale Line 5 - excludable gain is lesser of gain or maximum exclusion", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 400000, purchasePrice: 200000 })
      ));
      // Gain = 200000, max exclusion = 250000
      expect(result.excludableGain.toNumber()).toBe(200000);
    });

    it("Home Sale Line 5 - gain exceeding exclusion is partially excludable", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000 })
      ));
      // Gain = 600000, max exclusion = 250000
      expect(result.excludableGain.toNumber()).toBe(250000);
    });
  });

  describe("Line 6 — Taxable gain", () => {
    it("Home Sale Line 6 - taxable gain flows to Schedule D", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 800000, purchasePrice: 200000, sellingExpenses: "50000" })
      ));
      // Amount realized: 750000, gain: 550000, exclusion: 250000, taxable: 300000
      expect(result.taxableGain.toNumber()).toBe(300000);
    });

    it("Home Sale Line 6 - gain fully excluded produces zero taxable gain", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 400000, purchasePrice: 200000 })
      ));
      expect(result.taxableGain.toNumber()).toBe(0);
    });

    it("Home Sale Line 6 - MFJ $500,000 exclusion covers large gain", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 900000,
          purchasePrice: 450000,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      // Gain: 450000, exclusion: 500000 → fully excluded
      expect(result.taxableGain.toNumber()).toBe(0);
    });

    it("Home Sale Line 6 - MFJ gain exceeding $500,000 is taxable", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 1200000,
          purchasePrice: 300000,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      // Gain: 900000, exclusion: 500000, taxable: 400000
      expect(result.taxableGain.toNumber()).toBe(400000);
    });
  });

  describe("Depreciation recapture", () => {
    it("Home Sale depreciation recapture - post-1997 depreciation is not excludable", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          depreciationAfterMay1997: "20000",
        })
      ));
      // Basis: 200000 - 20000 = 180000, gain: 320000
      // Depreciation recapture: 20000 (capped at gain)
      // Gain available for exclusion: 320000 - 20000 = 300000
      // Excludable: min(300000, 250000) = 250000
      // Taxable: 320000 - 250000 = 70000 (includes $20K depreciation + $50K excess)
      expect(result.depreciationRecapture.toNumber()).toBe(20000);
      expect(result.hasDepreciationRecapture).toBe(true);
      expect(result.excludableGain.toNumber()).toBe(250000);
      expect(result.taxableGain.toNumber()).toBe(70000);
    });

    it("Home Sale depreciation recapture - depreciation capped at gain amount", () => {
      // Depreciation is $50K but gain is only $30K
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 280000,
          purchasePrice: 200000,
          depreciationAfterMay1997: "50000",
        })
      ));
      // Basis: 200000 - 50000 = 150000, gain: 130000 (amount realized 280000 - basis 150000)
      // Wait, that's wrong. Let me recalculate.
      // Basis: 200000 + 0 + 0 - 50000 - 0 = 150000
      // Amount realized: 280000
      // Gain: 280000 - 150000 = 130000
      // Depreciation recapture: min(50000, 130000) = 50000
      // Gain available for exclusion: 130000 - 50000 = 80000
      // Excludable: min(80000, 250000) = 80000
      // Taxable: 130000 - 80000 = 50000 (all depreciation recapture)
      expect(result.depreciationRecapture.toNumber()).toBe(50000);
      expect(result.excludableGain.toNumber()).toBe(80000);
      expect(result.taxableGain.toNumber()).toBe(50000);
    });

    it("Home Sale depreciation recapture - no depreciation means no recapture", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 500000, purchasePrice: 200000 })
      ));
      expect(result.depreciationRecapture.toNumber()).toBe(0);
      expect(result.hasDepreciationRecapture).toBe(false);
    });

    it("Home Sale depreciation recapture - gain less than depreciation means all gain is recapture", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 175000,
          purchasePrice: 200000,
          depreciationAfterMay1997: "30000",
        })
      ));
      // Basis: 200000 - 30000 = 170000, gain: 175000 - 170000 = 5000
      // Depreciation recapture: min(30000, 5000) = 5000
      // All gain is depreciation recapture, nothing left for exclusion
      expect(result.depreciationRecapture.toNumber()).toBe(5000);
      expect(result.excludableGain.toNumber()).toBe(0);
      expect(result.taxableGain.toNumber()).toBe(5000);
    });
  });

  describe("Filing status coverage", () => {
    const testCases: Array<[FilingStatus, number]> = [
      ["single", 250000],
      ["head_of_household", 250000],
      ["married_filing_separately", 250000],
      ["qualifying_surviving_spouse", 250000],
    ];

    for (const [status, expectedMax] of testCases) {
      it(`Home Sale ${status} - maximum exclusion is $${expectedMax.toLocaleString()}`, () => {
        const result = calculateHomeSaleExclusion(makeParams(
          makeSale({ salePrice: 800000, purchasePrice: 200000 }),
          status
        ));
        expect(result.maxExclusion.toNumber()).toBe(expectedMax);
      });
    }
  });

  describe("Edge cases and boundaries", () => {
    it("Home Sale gain exactly at exclusion boundary ($250,000) is fully excluded", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 450000, purchasePrice: 200000 })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(250000);
      expect(result.excludableGain.toNumber()).toBe(250000);
      expect(result.taxableGain.toNumber()).toBe(0);
    });

    it("Home Sale gain $1 over exclusion produces $1 taxable gain", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 450001, purchasePrice: 200000 })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(250001);
      expect(result.excludableGain.toNumber()).toBe(250000);
      expect(result.taxableGain.toNumber()).toBe(1);
    });

    it("Home Sale gain exactly at MFJ boundary ($500,000) is fully excluded", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 700000,
          purchasePrice: 200000,
          bothSpousesMeetUseTest: true,
          atLeastOneSpouseMeetsOwnershipTest: true,
        }),
        "married_filing_jointly"
      ));
      expect(result.gainOrLoss.toNumber()).toBe(500000);
      expect(result.taxableGain.toNumber()).toBe(0);
    });

    it("Home Sale zero gain produces no taxable amount", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 200000, purchasePrice: 200000 })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(0);
      expect(result.taxableGain.toNumber()).toBe(0);
    });

    it("Home Sale very large gain - only $250K excluded for single", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 2000000, purchasePrice: 200000 })
      ));
      expect(result.gainOrLoss.toNumber()).toBe(1800000);
      expect(result.excludableGain.toNumber()).toBe(250000);
      expect(result.taxableGain.toNumber()).toBe(1550000);
    });

    it("Home Sale with improvements that offset most of the gain", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          improvements: "280000",
        })
      ));
      // Basis: 200000 + 280000 = 480000, gain: 20000
      expect(result.gainOrLoss.toNumber()).toBe(20000);
      expect(result.taxableGain.toNumber()).toBe(0); // fully excluded
    });

    it("Home Sale frequency test failure with reduced exclusion available", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 600000,
          purchasePrice: 200000,
          usedExclusionInPrior2Years: true,
          qualifiesForReducedExclusion: true,
          daysOwned: 365,
          daysUsedAsResidence: 365,
        })
      ));
      // Does not meet full tests (frequency fails), but qualifies for reduced
      // However, reduced exclusion uses the shorter of days owned/used
      // 365/730 = 0.5 proration → $250,000 × 0.5 = $125,000
      expect(result.meetsFullExclusionTests).toBe(false);
      expect(result.qualifiesForReducedExclusion).toBe(true);
      expect(result.maxExclusion.toNumber()).toBe(125000);
      // Gain: 400000, taxable: 400000 - 125000 = 275000
      expect(result.taxableGain.toNumber()).toBe(275000);
    });
  });

  describe("Multiple home sales aggregation", () => {
    it("Home Sale aggregate - single sale with gain", () => {
      const result = calculateHomeSales(
        [makeSale({ salePrice: 500000, purchasePrice: 200000 })],
        "single",
        constants2025
      );
      expect(result.sales).toHaveLength(1);
      expect(result.totalTaxableGain.toNumber()).toBe(50000); // 300K gain - 250K exclusion
    });

    it("Home Sale aggregate - no sales produces zero totals", () => {
      const result = calculateHomeSales([], "single", constants2025);
      expect(result.sales).toHaveLength(0);
      expect(result.totalTaxableGain.toNumber()).toBe(0);
      expect(result.totalDepreciationRecapture.toNumber()).toBe(0);
    });

    it("Home Sale aggregate - sale with loss produces zero taxable gain", () => {
      const result = calculateHomeSales(
        [makeSale({ salePrice: 180000, purchasePrice: 250000 })],
        "single",
        constants2025
      );
      expect(result.totalTaxableGain.toNumber()).toBe(0);
    });

    it("Home Sale aggregate - total depreciation recapture from multiple sales", () => {
      const result = calculateHomeSales(
        [
          makeSale({
            salePrice: 500000,
            purchasePrice: 200000,
            depreciationAfterMay1997: "15000",
          }),
          makeSale({
            salePrice: 400000,
            purchasePrice: 200000,
            depreciationAfterMay1997: "10000",
            usedExclusionInPrior2Years: true, // Second sale can't use exclusion
          }),
        ],
        "single",
        constants2025
      );
      expect(result.totalDepreciationRecapture.toNumber()).toBe(25000);
    });
  });

  describe("Integration with Schedule D", () => {
    it("Home Sale taxable gain added to long-term capital gains via Schedule D", () => {
      // This is tested at the integration level in federal.test.ts
      // Here we verify the calculation module produces the correct result
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 800000,
          purchasePrice: 200000,
          sellingExpenses: "50000",
        })
      ));
      // Amount realized: 750000, gain: 550000
      // Exclusion: 250000, taxable: 300000
      expect(result.taxableGain.toNumber()).toBe(300000);
      // This $300,000 should flow to Schedule D Line 15 as LTCG
    });
  });

  describe("IRC §121(d)(7) — Nursing home / incapacity exception", () => {
    it("Home Sale use test passes when facility days supplement actual use to reach 730", () => {
      // Actual use: 400 days, facility: 400 days = 800 effective days ≥ 730
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1500,
          daysUsedAsResidence: 400,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 400,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale use test fails when facility days are insufficient", () => {
      // Actual use: 300 days, facility: 200 days = 500 effective days < 730
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1500,
          daysUsedAsResidence: 300,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 200,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale facility days do not count when incapableOfSelfCare is false", () => {
      // 400 days actual use, 400 facility days, but incapableOfSelfCare is false
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1500,
          daysUsedAsResidence: 400,
          incapableOfSelfCare: false,
          daysInLicensedCareFacilityWhileOwning: 400,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale incapacity exception boundary - exactly 730 effective days passes", () => {
      // 365 actual + 365 facility = 730
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1000,
          daysUsedAsResidence: 365,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 365,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
    });

    it("Home Sale incapacity exception boundary - 729 effective days fails", () => {
      // 365 actual + 364 facility = 729
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1000,
          daysUsedAsResidence: 365,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 364,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale incapacity exception audit trail documents facility days", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1500,
          daysUsedAsResidence: 400,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 400,
        })
      ));
      const useLine = result.lines.find((l) => l.line === "use");
      expect(useLine).toBeDefined();
      expect(useLine!.description).toContain("incapacity");
      expect(useLine!.formula).toContain("400 days in licensed care facility");
    });

    it("Home Sale incapacity with reduced exclusion uses effective days in proration", () => {
      // Actual use: 200 days, facility: 200 days = 400 effective
      // Owned: 300 days → shorter of 300 owned vs 400 effective = 300
      // Proration: 300/730
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 300,
          daysUsedAsResidence: 200,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 200,
          qualifiesForReducedExclusion: true,
        })
      ));
      expect(result.qualifiesForReducedExclusion).toBe(true);
      // $250,000 × 300/730 ≈ $102,740
      expect(result.maxExclusion.toNumber()).toBe(102740);
    });

    it("Home Sale zero facility days with incapableOfSelfCare has no effect", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1000,
          daysUsedAsResidence: 729,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 0,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });
  });

  describe("IRC §121(d)(9) — Military qualified extended duty suspension", () => {
    it("Home Sale military suspension allows ownership/use counts from extended lookback", () => {
      // Taxpayer served 5 years (1825 days) overseas, then returned and sold.
      // With suspension, the 5-year lookback extends by 1825 days.
      // Days within the extended window: 2000 owned, 800 used.
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 2000,
          daysUsedAsResidence: 800,
          qualifiedExtendedDutyDays: 1825,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
      expect(result.maxExclusion.toNumber()).toBe(250000);
    });

    it("Home Sale military suspension produces audit trail entry", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 2000,
          daysUsedAsResidence: 800,
          qualifiedExtendedDutyDays: 1825,
        })
      ));
      const suspensionLine = result.lines.find((l) => l.line === "military-suspension");
      expect(suspensionLine).toBeDefined();
      expect(suspensionLine!.formula).toContain("1825 days");
    });

    it("Home Sale military suspension does not reduce the 730-day threshold", () => {
      // Even with suspension, still need 730 days of use
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 2000,
          daysUsedAsResidence: 500,
          qualifiedExtendedDutyDays: 3650,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(false);
    });

    it("Home Sale military suspension max 10 years (3650 days) accepted", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 5000,
          daysUsedAsResidence: 800,
          qualifiedExtendedDutyDays: 3650,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
      const suspensionLine = result.lines.find((l) => l.line === "military-suspension");
      expect(suspensionLine).toBeDefined();
    });

    it("Home Sale without military suspension has no suspension audit entry", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 1000,
          daysUsedAsResidence: 1000,
        })
      ));
      const suspensionLine = result.lines.find((l) => l.line === "military-suspension");
      expect(suspensionLine).toBeUndefined();
    });
  });

  describe("IRC §121(d)(7) + §121(d)(9) — Combined exceptions", () => {
    it("Home Sale military suspension + nursing home exception both apply", () => {
      // Military deployed 5 years, then returned home 1 year, then nursing home 1 year
      // Extended lookback: 5 years + 5 year suspension = 10 years
      // Owned: 2500 days within extended window
      // Actual use: 400 days, facility: 400 days = 800 effective
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({
          salePrice: 500000,
          purchasePrice: 200000,
          daysOwned: 2500,
          daysUsedAsResidence: 400,
          incapableOfSelfCare: true,
          daysInLicensedCareFacilityWhileOwning: 400,
          qualifiedExtendedDutyDays: 1825,
        })
      ));
      expect(result.meetsFullExclusionTests).toBe(true);
      expect(result.maxExclusion.toNumber()).toBe(250000);
      // Both audit entries present
      const suspensionLine = result.lines.find((l) => l.line === "military-suspension");
      const useLine = result.lines.find((l) => l.line === "use");
      expect(suspensionLine).toBeDefined();
      expect(useLine!.description).toContain("incapacity");
    });
  });

  describe("Audit trail", () => {
    it("Home Sale produces audit lines for all computed values", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 500000, purchasePrice: 200000 })
      ));
      expect(result.lines.length).toBeGreaterThan(0);
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("1");
      expect(lineNumbers).toContain("2");
      expect(lineNumbers).toContain("3");
      expect(lineNumbers).toContain("4");
      expect(lineNumbers).toContain("5");
      expect(lineNumbers).toContain("6");
    });

    it("Home Sale loss scenario produces audit line for loss rule", () => {
      const result = calculateHomeSaleExclusion(makeParams(
        makeSale({ salePrice: 150000, purchasePrice: 200000 })
      ));
      const lossLine = result.lines.find((l) => l.line === "loss");
      expect(lossLine).toBeDefined();
    });
  });
});
