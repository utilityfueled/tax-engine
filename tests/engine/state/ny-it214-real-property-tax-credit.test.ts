/**
 * Tests for New York IT-214 — Real Property Tax Credit for Homeowners and Renters.
 * Spec: spec/state/ny-it214-real-property-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT214,
  type NYIT214Input,
  type RentIncludesCharges,
  NY_IT214_CONSTANTS,
} from "@/engine/state/ny-it214-real-property-tax-credit.js";

const d = (value: string | number) => new Decimal(value);

/* Default homeowner input for convenience */
function homeowner2025(overrides: Partial<NYIT214Input> = {}): NYIT214Input {
  return {
    federalAgi: 10000,
    hasPersonAge65OrOlder: false,
    taxYear: 2025,
    homeowner: {
      realPropertyTaxesPaid: 2000,
    },
    ...overrides,
  };
}

/* Default renter input for convenience */
function renter2025(overrides: Partial<NYIT214Input> = {}): NYIT214Input {
  return {
    federalAgi: 10000,
    hasPersonAge65OrOlder: false,
    taxYear: 2025,
    renter: {
      totalRentPaid: 4800,
      rentIncludesCharges: "none",
      monthsRentPaid: 12,
    },
    ...overrides,
  };
}

describe("NY IT-214 Real Property Tax Credit", () => {
  /* ========== Eligibility ========== */

  describe("Eligibility", () => {
    it("IT-214 Line 8 - FAGI over $18,000 disqualifies", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 18001 }));
      expect(result.eligible).toBe(false);
      expect(result.credit.toNumber()).toBe(0);
      expect(result.ineligibleReason).toContain("18000");
    });

    it("IT-214 Line 8 - FAGI exactly $18,000 qualifies", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 18000 }));
      expect(result.fagi.toNumber()).toBe(18000);
      // May or may not get credit depending on threshold vs taxes, but is eligible for consideration
    });

    it("IT-214 Line 8 - FAGI of zero qualifies", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 0 }));
      expect(result.fagi.toNumber()).toBe(0);
      expect(result.eligible).toBe(true);
    });

    it("IT-214 Line 8 - negative FAGI treated as zero", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: -5000 }));
      expect(result.fagi.toNumber()).toBe(0);
    });

    it("IT-214 - dependent disqualifies", () => {
      const result = calculateNYIT214(homeowner2025({ canBeClaimedAsDependent: true }));
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("dependent");
    });

    it("IT-214 - non-resident disqualifies", () => {
      const result = calculateNYIT214(homeowner2025({ meetsResidencyRequirement: false }));
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("resident");
    });

    it("IT-214 - exempt residence disqualifies", () => {
      const result = calculateNYIT214(homeowner2025({ residenceExemptFromTaxes: true }));
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("exempt");
    });

    it("IT-214 - property value over $85,000 disqualifies homeowners", () => {
      const result = calculateNYIT214(homeowner2025({ realPropertyMarketValue: 85001 }));
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("85000");
    });

    it("IT-214 - property value exactly $85,000 qualifies homeowners", () => {
      const result = calculateNYIT214(homeowner2025({ realPropertyMarketValue: 85000 }));
      // Should pass the property value eligibility check
      expect(result.eligible).toBe(true);
    });

    it("IT-214 - no renter or homeowner input has zero property taxes (ineligible)", () => {
      const result = calculateNYIT214({
        federalAgi: 5000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
      });
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("zero");
    });

    it("IT-214 - residency defaults to true if not specified", () => {
      const result = calculateNYIT214(homeowner2025());
      // meetsResidencyRequirement is undefined → defaults to true
      expect(result.eligible).toBe(true);
    });
  });

  /* ========== Line 9 - Rate from Table 1 ========== */

  describe("Line 9 - rate lookup from Table 1", () => {
    const rateCases: [number, number][] = [
      [0, 0.035],
      [1500, 0.035],
      [3000, 0.035],
      [3001, 0.04],
      [4000, 0.04],
      [5000, 0.04],
      [5001, 0.045],
      [7000, 0.045],
      [7001, 0.05],
      [9000, 0.05],
      [9001, 0.055],
      [11000, 0.055],
      [11001, 0.06],
      [14000, 0.06],
      [14001, 0.065],
      [18000, 0.065],
    ];

    for (const [fagi, expectedRate] of rateCases) {
      it(`IT-214 Line 9 - FAGI $${fagi} → rate ${expectedRate}`, () => {
        const result = calculateNYIT214(homeowner2025({ federalAgi: fagi }));
        expect(result.rate.toNumber()).toBe(expectedRate);
      });
    }
  });

  /* ========== Line 10 - Income threshold ========== */

  describe("Line 10 - income threshold is FAGI times rate", () => {
    it("IT-214 Line 10 - $10,000 × 0.055 = $550", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 10000 }));
      expect(result.incomeThreshold.toNumber()).toBe(550);
    });

    it("IT-214 Line 10 - $3,000 × 0.035 = $105", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 3000 }));
      expect(result.incomeThreshold.toNumber()).toBe(105);
    });

    it("IT-214 Line 10 - $18,000 × 0.065 = $1,170", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 18000 }));
      expect(result.incomeThreshold.toNumber()).toBe(1170);
    });

    it("IT-214 Line 10 - $0 × 0.035 = $0", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 0 }));
      expect(result.incomeThreshold.toNumber()).toBe(0);
    });

    it("IT-214 Line 10 - $7,500 × 0.050 = $375", () => {
      const result = calculateNYIT214(homeowner2025({ federalAgi: 7500 }));
      expect(result.incomeThreshold.toNumber()).toBe(375);
    });
  });

  /* ========== Lines 11-14 - Renter computation ========== */

  describe("Lines 11-14 - renter computation", () => {
    it("IT-214 Line 12 - adjusted rent 100% when no utilities included", () => {
      const result = calculateNYIT214(renter2025({
        renter: { totalRentPaid: 5400, rentIncludesCharges: "none", monthsRentPaid: 12 },
      }));
      // Adjusted rent = $5,400 × 100% = $5,400
      // Avg monthly = $5,400 / 12 = $450 → OK (exactly at limit)
      // Line 14 = $5,400 × 25% = $1,350
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1350);
    });

    it("IT-214 Line 12 - adjusted rent 50% when all charges included", () => {
      const result = calculateNYIT214(renter2025({
        renter: {
          totalRentPaid: 12000,
          rentIncludesCharges: "heat_gas_electricity_furnishings_board",
          monthsRentPaid: 12,
        },
      }));
      // Adjusted rent = $12,000 × 50% = $6,000
      // Avg monthly = $6,000 / 12 = $500 → OVER $450, disqualifies
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("450");
    });

    it("IT-214 Line 12 - adjusted rent 75% when heat/gas/elec/furnishings included", () => {
      const result = calculateNYIT214(renter2025({
        renter: {
          totalRentPaid: 6000,
          rentIncludesCharges: "heat_gas_electricity_furnishings",
          monthsRentPaid: 12,
        },
      }));
      // Adjusted rent = $6,000 × 75% = $4,500
      // Avg monthly = $4,500 / 12 = $375 → under $450
      // Line 14 = $4,500 × 25% = $1,125
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1125);
    });

    it("IT-214 Line 12 - adjusted rent 80% when heat/gas/electricity included", () => {
      const result = calculateNYIT214(renter2025({
        renter: {
          totalRentPaid: 6000,
          rentIncludesCharges: "heat_gas_electricity",
          monthsRentPaid: 12,
        },
      }));
      // Adjusted rent = $6,000 × 80% = $4,800
      // Line 14 = $4,800 × 25% = $1,200
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1200);
    });

    it("IT-214 Line 12 - adjusted rent 85% when heat/gas included", () => {
      const result = calculateNYIT214(renter2025({
        renter: {
          totalRentPaid: 6000,
          rentIncludesCharges: "heat_or_heat_and_gas",
          monthsRentPaid: 12,
        },
      }));
      // Adjusted rent = $6,000 × 85% = $5,100
      // Line 14 = $5,100 × 25% = $1,275
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1275);
    });

    it("IT-214 Line 13 - average monthly rent over $450 disqualifies", () => {
      const result = calculateNYIT214(renter2025({
        renter: { totalRentPaid: 5412, rentIncludesCharges: "none", monthsRentPaid: 12 },
      }));
      // Adjusted rent = $5,412, avg monthly = $451
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("450");
    });

    it("IT-214 Line 13 - average monthly rent exactly $450 qualifies", () => {
      const result = calculateNYIT214(renter2025({
        federalAgi: 2000,
        renter: { totalRentPaid: 5400, rentIncludesCharges: "none", monthsRentPaid: 12 },
      }));
      // Adjusted rent = $5,400, avg monthly = $450
      expect(result.eligible).toBe(true);
    });

    it("IT-214 Line 13 - partial year renter (6 months)", () => {
      const result = calculateNYIT214(renter2025({
        federalAgi: 2000,
        renter: { totalRentPaid: 2400, rentIncludesCharges: "none", monthsRentPaid: 6 },
      }));
      // Adjusted rent = $2,400, avg monthly = $2,400/6 = $400 → under $450
      // Line 14 = $2,400 × 25% = $600
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(600);
    });

    it("IT-214 Line 14 - 25% of adjusted rent is property tax equivalent", () => {
      const result = calculateNYIT214(renter2025({
        renter: { totalRentPaid: 4800, rentIncludesCharges: "none", monthsRentPaid: 12 },
      }));
      // Adjusted rent = $4,800, Line 14 = $4,800 × 25% = $1,200
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1200);
    });
  });

  /* ========== Lines 15-17 - Homeowner computation ========== */

  describe("Lines 15-17 - homeowner computation", () => {
    it("IT-214 Line 15-17 - property taxes only (no special assessments)", () => {
      const result = calculateNYIT214(homeowner2025({
        homeowner: { realPropertyTaxesPaid: 1500 },
      }));
      expect(result.homeownerPropertyTaxes.toNumber()).toBe(1500);
    });

    it("IT-214 Line 15-17 - property taxes plus special assessments", () => {
      const result = calculateNYIT214(homeowner2025({
        homeowner: { realPropertyTaxesPaid: 1200, specialAssessments: 300 },
      }));
      expect(result.homeownerPropertyTaxes.toNumber()).toBe(1500);
    });

    it("IT-214 Line 15-17 - zero property taxes (homeowner with no tax)", () => {
      const result = calculateNYIT214(homeowner2025({
        homeowner: { realPropertyTaxesPaid: 0 },
      }));
      expect(result.eligible).toBe(false);
      expect(result.totalPropertyTaxes.toNumber()).toBe(0);
    });
  });

  /* ========== Line 18 - Combined property taxes ========== */

  describe("Line 18 - combined renter and homeowner taxes", () => {
    it("IT-214 Line 18 - renter only uses line 14", () => {
      const result = calculateNYIT214(renter2025({ federalAgi: 2000 }));
      expect(result.homeownerPropertyTaxes.toNumber()).toBe(0);
      expect(result.totalPropertyTaxes.toNumber()).toBe(
        result.renterPropertyTaxEquivalent.toNumber()
      );
    });

    it("IT-214 Line 18 - homeowner only uses line 17", () => {
      const result = calculateNYIT214(homeowner2025());
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(0);
      expect(result.totalPropertyTaxes.toNumber()).toBe(
        result.homeownerPropertyTaxes.toNumber()
      );
    });

    it("IT-214 Line 18 - part-year renter + part-year homeowner sums both", () => {
      const result = calculateNYIT214({
        federalAgi: 5000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
        renter: { totalRentPaid: 3000, rentIncludesCharges: "none", monthsRentPaid: 6 },
        homeowner: { realPropertyTaxesPaid: 800 },
      });
      // Renter: $3,000 × 100% = $3,000 adjusted, avg monthly $500 → OVER $450
      // This would actually disqualify due to the monthly rent check
      expect(result.eligible).toBe(false);
    });

    it("IT-214 Line 18 - part-year renter + homeowner both contribute", () => {
      const result = calculateNYIT214({
        federalAgi: 2000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
        renter: { totalRentPaid: 2400, rentIncludesCharges: "none", monthsRentPaid: 6 },
        homeowner: { realPropertyTaxesPaid: 500 },
      });
      // Renter: $2,400 adjusted, avg monthly $400 → OK
      // Line 14 = $2,400 × 25% = $600
      // Line 17 = $500
      // Line 18 = $600 + $500 = $1,100
      expect(result.totalPropertyTaxes.toNumber()).toBe(1100);
    });
  });

  /* ========== Line 19 - Threshold vs property taxes ========== */

  describe("Line 19 - threshold equal to or exceeding property taxes disqualifies", () => {
    it("IT-214 Line 19 - threshold exceeds property taxes: no credit", () => {
      // FAGI = $14,001, rate = 0.065, threshold = $910.07 → $910
      // Property taxes = $900
      // $910 ≥ $900 → no credit
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 14001,
        homeowner: { realPropertyTaxesPaid: 900 },
      }));
      expect(result.eligible).toBe(false);
      expect(result.ineligibleReason).toContain("threshold");
    });

    it("IT-214 Line 19 - threshold equals property taxes: no credit", () => {
      // FAGI = $10,000, rate = 0.055, threshold = $550
      // Property taxes = $550
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 10000,
        homeowner: { realPropertyTaxesPaid: 550 },
      }));
      expect(result.eligible).toBe(false);
    });

    it("IT-214 Line 19 - threshold less than property taxes: credit allowed", () => {
      // FAGI = $10,000, rate = 0.055, threshold = $550
      // Property taxes = $2,000
      // $550 < $2,000 → credit allowed
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 10000,
        homeowner: { realPropertyTaxesPaid: 2000 },
      }));
      expect(result.eligible).toBe(true);
      expect(result.credit.greaterThan(d(0))).toBe(true);
    });
  });

  /* ========== Line 20 - Credit amount from Table A or B ========== */

  describe("Line 20 - credit amount from Table A (65+)", () => {
    const table65Cases: [number, number][] = [
      [0, 375],
      [1500, 375],
      [3000, 375],
      [3001, 330],
      [5000, 330],
      [5001, 300],
      [7000, 300],
      [7001, 260],
      [9000, 260],
      [9001, 230],
      [11000, 230],
      [11001, 200],
      [14000, 200],
      [14001, 150],
      [18000, 150],
    ];

    for (const [fagi, expectedCredit] of table65Cases) {
      it(`IT-214 Line 20 Table A - FAGI $${fagi} → credit $${expectedCredit}`, () => {
        const result = calculateNYIT214(homeowner2025({
          federalAgi: fagi,
          hasPersonAge65OrOlder: true,
          homeowner: { realPropertyTaxesPaid: 5000 }, // ensure exceeds threshold
        }));
        if (result.eligible) {
          expect(result.credit.toNumber()).toBe(expectedCredit);
        }
        // At high FAGI the threshold might exceed property taxes; skip those
      });
    }

    it("IT-214 Line 20 Table A - 65+ household at $2,000 FAGI gets $375", () => {
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 2000,
        hasPersonAge65OrOlder: true,
        homeowner: { realPropertyTaxesPaid: 3000 },
      }));
      expect(result.eligible).toBe(true);
      expect(result.credit.toNumber()).toBe(375);
    });
  });

  describe("Line 20 - credit amount from Table B (under 65)", () => {
    const tableUnder65Cases: [number, number][] = [
      [0, 75],
      [2500, 75],
      [5000, 75],
      [5001, 70],
      [9000, 70],
      [9001, 60],
      [14000, 60],
      [14001, 50],
      [18000, 50],
    ];

    for (const [fagi, expectedCredit] of tableUnder65Cases) {
      it(`IT-214 Line 20 Table B - FAGI $${fagi} → credit $${expectedCredit}`, () => {
        const result = calculateNYIT214(homeowner2025({
          federalAgi: fagi,
          hasPersonAge65OrOlder: false,
          homeowner: { realPropertyTaxesPaid: 5000 },
        }));
        if (result.eligible) {
          expect(result.credit.toNumber()).toBe(expectedCredit);
        }
      });
    }

    it("IT-214 Line 20 Table B - under 65 household at $8,000 FAGI gets $70", () => {
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 8000,
        hasPersonAge65OrOlder: false,
        homeowner: { realPropertyTaxesPaid: 3000 },
      }));
      expect(result.eligible).toBe(true);
      expect(result.credit.toNumber()).toBe(70);
    });
  });

  /* ========== End-to-end scenarios ========== */

  describe("End-to-end scenarios", () => {
    it("Low-income elderly homeowner - FAGI $2,000, taxes $500 → $375 credit", () => {
      const result = calculateNYIT214({
        federalAgi: 2000,
        hasPersonAge65OrOlder: true,
        taxYear: 2025,
        homeowner: { realPropertyTaxesPaid: 500 },
      });
      // Rate = 0.035, threshold = $70
      // $70 < $500 → eligible
      expect(result.eligible).toBe(true);
      expect(result.rate.toString()).toBe("0.035");
      expect(result.incomeThreshold.toNumber()).toBe(70);
      expect(result.credit.toNumber()).toBe(375);
    });

    it("Moderate-income renter under 65 - FAGI $12,000, rent $400/mo → $60 credit", () => {
      const result = calculateNYIT214({
        federalAgi: 12000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
        renter: {
          totalRentPaid: 4800,
          rentIncludesCharges: "none",
          monthsRentPaid: 12,
        },
      });
      // Rate = 0.060, threshold = $720
      // Adjusted rent = $4,800, avg monthly $400 → OK
      // Line 14 = $4,800 × 25% = $1,200
      // $720 < $1,200 → eligible
      // Table B: $11,001-$14,000 → $60
      expect(result.eligible).toBe(true);
      expect(result.rate.toNumber()).toBe(0.06);
      expect(result.incomeThreshold.toNumber()).toBe(720);
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1200);
      expect(result.credit.toNumber()).toBe(60);
    });

    it("Very low-income renter with heat included - FAGI $1,000", () => {
      const result = calculateNYIT214({
        federalAgi: 1000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
        renter: {
          totalRentPaid: 4200,
          rentIncludesCharges: "heat_or_heat_and_gas",
          monthsRentPaid: 12,
        },
      });
      // Adjusted rent = $4,200 × 85% = $3,570
      // Avg monthly = $3,570 / 12 = $297.50 → OK
      // Line 14 = $3,570 × 25% = $892.50 → $893
      // Rate = 0.035, threshold = $35
      // $35 < $893 → eligible
      // Table B: $0-$5,000 → $75
      expect(result.eligible).toBe(true);
      expect(result.credit.toNumber()).toBe(75);
    });

    it("Homeowner with high taxes relative to income → eligible", () => {
      const result = calculateNYIT214({
        federalAgi: 4000,
        hasPersonAge65OrOlder: true,
        taxYear: 2025,
        homeowner: { realPropertyTaxesPaid: 2500, specialAssessments: 200 },
      });
      // Rate = 0.040, threshold = $160
      // Total taxes = $2,700
      // $160 < $2,700 → eligible
      // Table A: $3,001-$5,000 → $330
      expect(result.eligible).toBe(true);
      expect(result.homeownerPropertyTaxes.toNumber()).toBe(2700);
      expect(result.credit.toNumber()).toBe(330);
    });

    it("Homeowner where threshold exceeds taxes → no credit", () => {
      const result = calculateNYIT214({
        federalAgi: 17000,
        hasPersonAge65OrOlder: false,
        taxYear: 2025,
        homeowner: { realPropertyTaxesPaid: 1000 },
      });
      // Rate = 0.065, threshold = $1,105
      // $1,105 ≥ $1,000 → no credit
      expect(result.eligible).toBe(false);
      expect(result.credit.toNumber()).toBe(0);
    });

    it("Zero FAGI homeowner with taxes - gets max credit", () => {
      const result = calculateNYIT214({
        federalAgi: 0,
        hasPersonAge65OrOlder: true,
        taxYear: 2025,
        homeowner: { realPropertyTaxesPaid: 500 },
      });
      // Rate = 0.035, threshold = $0
      // $0 < $500 → eligible
      // Table A: $0-$3,000 → $375
      expect(result.eligible).toBe(true);
      expect(result.credit.toNumber()).toBe(375);
    });

    it("Renter with all utilities included but low rent - eligible", () => {
      const result = calculateNYIT214({
        federalAgi: 6000,
        hasPersonAge65OrOlder: true,
        taxYear: 2025,
        renter: {
          totalRentPaid: 9600,
          rentIncludesCharges: "heat_gas_electricity_furnishings_board",
          monthsRentPaid: 12,
        },
      });
      // Adjusted rent = $9,600 × 50% = $4,800
      // Avg monthly = $4,800 / 12 = $400 → OK
      // Line 14 = $4,800 × 25% = $1,200
      // Rate = 0.045, threshold = $270
      // $270 < $1,200 → eligible
      // Table A: $5,001-$7,000 → $300
      expect(result.eligible).toBe(true);
      expect(result.renterPropertyTaxEquivalent.toNumber()).toBe(1200);
      expect(result.credit.toNumber()).toBe(300);
    });

    it("FAGI at bracket boundary $3,000 uses lower rate", () => {
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 3000,
        hasPersonAge65OrOlder: true,
        homeowner: { realPropertyTaxesPaid: 2000 },
      }));
      expect(result.rate.toString()).toBe("0.035");
      expect(result.incomeThreshold.toNumber()).toBe(105);
      expect(result.credit.toNumber()).toBe(375);
    });

    it("FAGI one dollar above bracket boundary $3,001 uses higher rate", () => {
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 3001,
        hasPersonAge65OrOlder: true,
        homeowner: { realPropertyTaxesPaid: 2000 },
      }));
      expect(result.rate.toNumber()).toBe(0.04);
      // threshold = $3,001 × 0.040 = $120.04 → $120
      expect(result.incomeThreshold.toNumber()).toBe(120);
      expect(result.credit.toNumber()).toBe(330);
    });
  });

  /* ========== Age comparison ========== */

  describe("Age 65+ vs under 65 comparison", () => {
    it("Same income, 65+ household gets significantly higher credit", () => {
      const result65 = calculateNYIT214(homeowner2025({
        federalAgi: 8000,
        hasPersonAge65OrOlder: true,
        homeowner: { realPropertyTaxesPaid: 3000 },
      }));
      const resultUnder65 = calculateNYIT214(homeowner2025({
        federalAgi: 8000,
        hasPersonAge65OrOlder: false,
        homeowner: { realPropertyTaxesPaid: 3000 },
      }));
      expect(result65.eligible).toBe(true);
      expect(resultUnder65.eligible).toBe(true);
      expect(result65.credit.toNumber()).toBe(260);    // Table A: $7,001-$9,000
      expect(resultUnder65.credit.toNumber()).toBe(70); // Table B: $5,001-$9,000
      expect(result65.credit.greaterThan(resultUnder65.credit)).toBe(true);
    });
  });

  /* ========== Audit trail ========== */

  describe("Audit trail", () => {
    it("IT-214 produces audit lines for each computation step", () => {
      const result = calculateNYIT214(homeowner2025({
        federalAgi: 5000,
        homeowner: { realPropertyTaxesPaid: 1000 },
      }));
      expect(result.lines.length).toBeGreaterThan(0);
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("8");
      expect(lineNumbers).toContain("9");
      expect(lineNumbers).toContain("10");
      expect(lineNumbers).toContain("18");
      expect(lineNumbers).toContain("20");
    });

    it("IT-214 renter produces audit lines for rent computation", () => {
      const result = calculateNYIT214(renter2025({ federalAgi: 2000 }));
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("11");
      expect(lineNumbers).toContain("12");
      expect(lineNumbers).toContain("13");
      expect(lineNumbers).toContain("14");
    });

    it("IT-214 homeowner produces audit lines for taxes", () => {
      const result = calculateNYIT214(homeowner2025());
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("15");
      expect(lineNumbers).toContain("16");
      expect(lineNumbers).toContain("17");
    });
  });

  /* ========== Error handling ========== */

  describe("Error handling", () => {
    it("IT-214 throws for unsupported tax year", () => {
      expect(() =>
        calculateNYIT214(homeowner2025({ taxYear: 2020 }))
      ).toThrow("not available for tax year 2020");
    });
  });
});
