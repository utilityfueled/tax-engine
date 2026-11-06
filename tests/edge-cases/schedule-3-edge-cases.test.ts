/**
 * Edge case tests for Schedule 3 — Additional Credits and Payments
 * Spec: spec/federal/schedule-3.yaml
 *
 * Focuses on:
 * - Lines 6b-6m credit flow-through (prior year AMT credit, general business
 *   credit, adoption credit, elderly/disabled credit, clean vehicle credits)
 * - All 12 nonrefundable credit types combined
 * - All 4 refundable credit types combined
 * - Grand total with every credit type populated
 * - Excess SS withholding boundary precision ($10,918.20 exact threshold)
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule3, calculateExcessSSWithholding } from "@/engine/schedules/schedule-3.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Line 6b — Prior Year Minimum Tax Credit (Form 8801)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6b - prior year minimum tax credit", () => {
  it("Schedule 3 Line 6b - Form 8801 credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      priorYearMinimumTaxCredit: d(3500),
    });
    expect(result.priorYearMinimumTaxCredit.toNumber()).toBe(3500);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(3500);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);

    const line6b = result.lines.find((l) => l.line === "6b");
    expect(line6b).toBeDefined();
    expect(line6b!.value.toNumber()).toBe(3500);
  });

  it("Schedule 3 Line 6b - prior year AMT credit combined with FTC and education credits", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(800),
      educationCredits: d(2500),
      priorYearMinimumTaxCredit: d(4200),
    });
    // 800 + 2500 + 4200 = 7500
    expect(result.totalNonrefundableCredits.toNumber()).toBe(7500);
  });

  it("Schedule 3 Line 6b - zero prior year AMT credit does not affect total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      priorYearMinimumTaxCredit: d(0),
    });
    expect(result.priorYearMinimumTaxCredit.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6a — General Business Credit (Form 3800)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6a - general business credit", () => {
  it("Schedule 3 Line 6a - Form 3800 credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      generalBusinessCredit: d(12000),
    });
    expect(result.generalBusinessCredit.toNumber()).toBe(12000);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(12000);

    const line6a = result.lines.find((l) => l.line === "6a");
    expect(line6a).toBeDefined();
    expect(line6a!.value.toNumber()).toBe(12000);
  });

  it("Schedule 3 Line 6a - general business credit stacks with energy credits", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      generalBusinessCredit: d(8000),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(1200),
    });
    // 8000 + 9000 + 1200 = 18200
    expect(result.totalNonrefundableCredits.toNumber()).toBe(18200);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6c — Adoption Credit (Form 8839)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6c - adoption credit", () => {
  it("Schedule 3 Line 6c - Form 8839 adoption credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      adoptionCredit: d(16810),  // 2025 max adoption credit
    });
    expect(result.adoptionCredit.toNumber()).toBe(16810);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(16810);

    const line6c = result.lines.find((l) => l.line === "6c");
    expect(line6c).toBeDefined();
    expect(line6c!.value.toNumber()).toBe(16810);
  });

  it("Schedule 3 Line 6c - adoption credit with child/dependent care credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      adoptionCredit: d(10000),
      childDependentCareCredit: d(1200),
    });
    // 10000 + 1200 = 11200
    expect(result.totalNonrefundableCredits.toNumber()).toBe(11200);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6d — Elderly or Disabled Credit (Schedule R)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6d - elderly or disabled credit", () => {
  it("Schedule 3 Line 6d - Schedule R credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      elderlyOrDisabledCredit: d(750),
    });
    expect(result.elderlyOrDisabledCredit.toNumber()).toBe(750);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(750);

    const line6d = result.lines.find((l) => l.line === "6d");
    expect(line6d).toBeDefined();
    expect(line6d!.value.toNumber()).toBe(750);
  });

  it("Schedule 3 Line 6d - max elderly credit ($1,125 for single age 65+) combined with FTC", () => {
    // Schedule R max credit: $7,500 base × 15% = $1,125 for single filer age 65+
    const result = calculateSchedule3(simpleW2Fixture, {
      elderlyOrDisabledCredit: d(1125),
      foreignTaxCredit: d(300),
    });
    expect(result.elderlyOrDisabledCredit.toNumber()).toBe(1125);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1425);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6f — New Clean Vehicle Credit (Form 8936 Part III)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6f - new clean vehicle credit", () => {
  it("Schedule 3 Line 6f - Form 8936 Part III credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      newCleanVehicleCredit: d(7500),  // Max new EV credit
    });
    expect(result.newCleanVehicleCredit.toNumber()).toBe(7500);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(7500);

    const line6f = result.lines.find((l) => l.line === "6f");
    expect(line6f).toBeDefined();
    expect(line6f!.value.toNumber()).toBe(7500);
  });

  it("Schedule 3 Line 6f - partial new clean vehicle credit ($3,750 for battery only)", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      newCleanVehicleCredit: d(3750),
    });
    expect(result.newCleanVehicleCredit.toNumber()).toBe(3750);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(3750);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6m — Previously Owned Clean Vehicle Credit (Form 8936 Part IV)
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 6m - previously owned clean vehicle credit", () => {
  it("Schedule 3 Line 6m - Form 8936 Part IV credit flows to nonrefundable total", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      previouslyOwnedCleanVehicleCredit: d(4000),  // Max used EV credit
    });
    expect(result.previouslyOwnedCleanVehicleCredit.toNumber()).toBe(4000);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(4000);

    const line6m = result.lines.find((l) => l.line === "6m");
    expect(line6m).toBeDefined();
    expect(line6m!.value.toNumber()).toBe(4000);
  });

  it("Schedule 3 Line 6m - used EV credit with new EV credit (both present)", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      newCleanVehicleCredit: d(7500),
      previouslyOwnedCleanVehicleCredit: d(4000),
    });
    expect(result.newCleanVehicleCredit.toNumber()).toBe(7500);
    expect(result.previouslyOwnedCleanVehicleCredit.toNumber()).toBe(4000);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(11500);
  });
});

// ═══════════════════════════════════════════════════════════
// All 12 Nonrefundable Credits Combined
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Line 8 - all 12 nonrefundable credit types", () => {
  it("Schedule 3 Line 8 - every nonrefundable credit line populated sums correctly", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),                       // Line 1
      childDependentCareCredit: d(1200),              // Line 2
      educationCredits: d(2500),                      // Line 3
      retirementSavingsCredit: d(1000),               // Line 4
      residentialCleanEnergyCredit: d(9000),          // Line 5a
      energyImprovementCredit: d(3200),               // Line 5b
      priorYearMinimumTaxCredit: d(2000),             // Line 6b
      generalBusinessCredit: d(5000),                 // Line 6a
      adoptionCredit: d(8000),                        // Line 6c
      elderlyOrDisabledCredit: d(750),                // Line 6d
      newCleanVehicleCredit: d(7500),                 // Line 6f
      previouslyOwnedCleanVehicleCredit: d(4000),     // Line 6m
    });
    // Sum: 500 + 1200 + 2500 + 1000 + 9000 + 3200 + 2000 + 5000 + 8000 + 750 + 7500 + 4000 = 44650
    expect(result.totalNonrefundableCredits.toNumber()).toBe(44650);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 - Lines 6b-6m do not affect refundable total (Line 15)", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      priorYearMinimumTaxCredit: d(5000),
      generalBusinessCredit: d(10000),
      adoptionCredit: d(8000),
      elderlyOrDisabledCredit: d(500),
      newCleanVehicleCredit: d(7500),
      previouslyOwnedCleanVehicleCredit: d(4000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(35000);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// All Credits — Nonrefundable + Refundable Grand Total
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - grand total with all 16 credit types", () => {
  it("Schedule 3 - all 12 nonrefundable + all 4 refundable credits produce correct totals", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      // Nonrefundable (Lines 1-6m)
      foreignTaxCredit: d(500),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      retirementSavingsCredit: d(1000),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
      priorYearMinimumTaxCredit: d(2000),
      generalBusinessCredit: d(5000),
      adoptionCredit: d(8000),
      elderlyOrDisabledCredit: d(750),
      newCleanVehicleCredit: d(7500),
      previouslyOwnedCleanVehicleCredit: d(4000),
      // Refundable (Lines 10, 13a, 14a, 14b)
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(1482),
      additionalChildTaxCredit: d(1700),
      aocRefundablePortion: d(1000),
    });
    // Nonrefundable: 500+1200+2500+1000+9000+3200+2000+5000+8000+750+7500+4000 = 44650
    expect(result.totalNonrefundableCredits.toNumber()).toBe(44650);
    // Schedule 3 payments: 3600 + 1482 = 5082; ACTC/AOC are direct 1040 lines.
    expect(result.totalRefundableCredits.toNumber()).toBe(5082);
    // Grand total
    const grandTotal = result.totalNonrefundableCredits.plus(result.totalRefundableCredits);
    expect(grandTotal.toNumber()).toBe(49732);
  });

  it("Schedule 3 - audit trail includes all Line 6x entries", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      priorYearMinimumTaxCredit: d(100),
      generalBusinessCredit: d(200),
      adoptionCredit: d(300),
      elderlyOrDisabledCredit: d(400),
      newCleanVehicleCredit: d(500),
      previouslyOwnedCleanVehicleCredit: d(600),
    });
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("6b");
    expect(lineIds).toContain("6a");
    expect(lineIds).toContain("6c");
    expect(lineIds).toContain("6d");
    expect(lineIds).toContain("6f");
    expect(lineIds).toContain("6m");
  });
});

// ═══════════════════════════════════════════════════════════
// Excess SS Withholding Boundary Precision
// ═══════════════════════════════════════════════════════════

describe("Excess SS Withholding - boundary precision at $10,918.20", () => {
  it("total withholding at exactly $10,918.20 (max) produces zero excess", () => {
    // Two employers whose combined withholding = $10,918.20
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.10",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.10",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    // Total: $5459.10 + $5459.10 = $10918.20 = max → excess = 0
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("total withholding $0.01 over max produces $0.01 excess", () => {
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.11",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.10",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    // Total: $5459.11 + $5459.10 = $10918.21. Max: $10918.20. Excess: $0.01
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0.01);
  });

  it("total withholding $0.01 under max produces zero excess", () => {
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.10",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459.09",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    // Total: $5459.10 + $5459.09 = $10918.19. Max: $10918.20. Excess: 0
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("four employers each withholding half the max produce exactly double excess", () => {
    // 4 employers × $5,459.10 = $21,836.40. Max: $10,918.20. Excess: $10,918.20
    const w2s = Array.from({ length: 4 }, (_, i) => ({
      employer: { name: `Corp ${i}`, ein: `${i}${i}-${i}` },
      wages: "88050",
      federalWithheld: "0",
      socialSecurityWages: "88050",
      socialSecurityWithheld: "5459.10",
      medicareWages: "88050",
      medicareWithheld: "1276.73",
      stateTaxWithheld: "0",
      stateWages: "0",
      localTaxWithheld: "0",
    }));
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    // 4 × 5459.10 = 21836.40 - 10918.20 = 10918.20
    expect(excess.toNumber()).toBe(10918.20);
  });
});
