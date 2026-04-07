/**
 * Form 8936 — Clean Vehicle Credits — Edge Cases
 * Spec: spec/federal/form-8936.yaml
 *
 * Tests boundary conditions for:
 * - Acquisition date cutoff boundary (Sept 29 vs 30 vs Oct 1)
 * - MAGI exactly at threshold for all filing statuses
 * - Foreign income exclusions pushing MAGI over threshold
 * - MSRP at exact boundary values ($55,000 and $80,000)
 * - Sale price at the $25,000 boundary
 * - Personal use percentage edge cases (fractional)
 * - Prior year AGI exactly at threshold when current year is over
 * - Multiple vehicles with mixed qualification scenarios
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8936, type Form8936Input } from "@/engine/forms/form-8936.js";
import { getConstants } from "@/models/constants.js";
import type { FilingStatus } from "@/models/constants.js";

const constants2025 = getConstants(2025).cleanVehicleCredit;

function makeInput(overrides: Partial<Form8936Input> = {}): Form8936Input {
  return {
    filingStatus: "single" as FilingStatus,
    agi: "100000",
    constants: constants2025,
    newCleanVehicles: [],
    previouslyOwnedCleanVehicles: [],
    ...overrides,
  };
}

function newVehicle(
  overrides: Partial<Form8936Input["newCleanVehicles"][0]> = {}
) {
  return {
    dateAcquired: "2025-09-30",
    criticalMineralsRequirementMet: true,
    batteryComponentsRequirementMet: true,
    msrp: "45000",
    vehicleType: "other" as const,
    personalUsePercentage: "100",
    creditTransferredToDealer: false,
    ...overrides,
  };
}

function usedVehicle(
  overrides: Partial<Form8936Input["previouslyOwnedCleanVehicles"][0]> = {}
) {
  return {
    dateAcquired: "2025-09-30",
    salePrice: "20000",
    personalUsePercentage: "100",
    creditTransferredToDealer: false,
    ...overrides,
  };
}

// ── Acquisition date cutoff boundary ─────────────────────────

describe("Form 8936 acquisition date cutoff edge cases", () => {
  it("Form 8936 - new vehicle acquired September 29, 2025 qualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ dateAcquired: "2025-09-29" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 - new vehicle acquired October 1, 2025 is disqualified", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ dateAcquired: "2025-10-01" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 - previously owned vehicle acquired September 29, 2025 qualifies", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ dateAcquired: "2025-09-29" })],
    }));
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 - previously owned vehicle acquired October 1, 2025 is disqualified", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ dateAcquired: "2025-10-01" })],
    }));
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(true);
  });

  it("Form 8936 - vehicle acquired far in the future (2026) is disqualified", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ dateAcquired: "2026-01-15" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("acquired after");
  });
});

// ── Foreign income exclusions pushing over threshold ─────────

describe("Form 8936 foreign income exclusion MAGI adjustment", () => {
  it("Form 8936 - AGI under threshold but foreign exclusion pushes MAGI over for new vehicle", () => {
    // Single threshold = $150,000
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "140000",
      foreignEarnedIncomeExclusion: "15000", // MAGI = 155,000 > 150,000
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.currentYearMagi.equals(new Decimal("155000"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(true);
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 - foreign housing deduction pushes MAGI to exactly threshold", () => {
    // Single threshold = $150,000
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "140000",
      foreignHousingDeduction: "10000", // MAGI = exactly 150,000
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.currentYearMagi.equals(new Decimal("150000"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(false);
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 - combined foreign exclusions push over previously owned threshold", () => {
    // Single previously owned threshold = $75,000
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "65000",
      foreignEarnedIncomeExclusion: "8000",
      foreignHousingDeduction: "3000", // MAGI = 76,000 > 75,000
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.currentYearMagi.equals(new Decimal("76000"))).toBe(true);
    expect(result.previouslyOwnedAgiDisqualified).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
  });
});

// ── Prior year MAGI exactly at threshold ─────────────────────

describe("Form 8936 prior year AGI at exact threshold", () => {
  it("Form 8936 - prior year MAGI exactly at new vehicle threshold qualifies", () => {
    // Single new vehicle threshold = $150,000
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "200000", // current year over
      priorYearAgi: "150000", // prior year exactly at threshold
      newCleanVehicles: [newVehicle()],
    }));
    // MAGI = lesser of 200K, 150K = 150K → qualifies
    expect(result.magi.equals(new Decimal("150000"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(false);
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 - prior year MAGI $1 over threshold still disqualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "200000",
      priorYearAgi: "150001", // $1 over
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.magi.equals(new Decimal("150001"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(true);
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 - prior year foreign exclusions affect MAGI calculation", () => {
    // Prior year AGI is under threshold but prior year foreign exclusion pushes over
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "200000",
      priorYearAgi: "140000",
      priorYearForeignEarnedIncomeExclusion: "15000", // prior MAGI = 155,000
      newCleanVehicles: [newVehicle()],
    }));
    // MAGI = lesser of 200K, 155K = 155K → over threshold
    expect(result.magi.equals(new Decimal("155000"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(true);
  });
});

// ── MSRP boundary edge cases ─────────────────────────────────

describe("Form 8936 MSRP exact boundary values", () => {
  it("Form 8936 - other vehicle MSRP at $54,999 qualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "54999", vehicleType: "other" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 - other vehicle MSRP at $55,001 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "55001", vehicleType: "other" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("MSRP");
  });

  it("Form 8936 - SUV MSRP at $79,999 qualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "79999", vehicleType: "suv_van_pickup" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 - SUV MSRP at $80,001 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "80001", vehicleType: "suv_van_pickup" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
  });
});

// ── Personal use percentage edge cases ───────────────────────

describe("Form 8936 personal use percentage boundaries", () => {
  it("Form 8936 - new vehicle at 1% personal use yields $75 credit", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ personalUsePercentage: "1" })],
    }));
    // $7,500 * 1% = $75
    expect(result.totalNewVehicleCredit.equals(new Decimal("75"))).toBe(true);
  });

  it("Form 8936 - new vehicle at 99% personal use yields $7,425", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ personalUsePercentage: "99" })],
    }));
    // $7,500 * 99% = $7,425
    expect(result.totalNewVehicleCredit.equals(new Decimal("7425"))).toBe(true);
  });

  it("Form 8936 - previously owned vehicle fractional personal use floors credit", () => {
    // $4,000 * 33% = $1,320 (floored from personal pct applied)
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ personalUsePercentage: "33" })],
    }));
    // $4,000 * 33 / 100 = $1,320 (floored)
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("1320"))).toBe(true);
  });
});

// ── Sale price boundary for previously owned ─────────────────

describe("Form 8936 previously owned sale price boundaries", () => {
  it("Form 8936 - sale price at $24,999 qualifies", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "24999" })],
    }));
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 - sale price of $1 yields $0 credit (30% of $1 = $0.30 → floors to $0)", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "1" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 - sale price of $4 yields $1 credit (30% of $4 = $1.20 → floors to $1)", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "4" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("1"))).toBe(true);
  });
});

// ── Disqualification priority ────────────────────────────────

describe("Form 8936 disqualification priority", () => {
  it("Form 8936 - acquisition cutoff checked before AGI for new vehicle", () => {
    // Vehicle acquired after cutoff AND AGI over threshold
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "200000",
      newCleanVehicles: [newVehicle({ dateAcquired: "2025-10-01" })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    // Disqualification reason should mention acquisition date, not AGI
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("acquired after");
  });

  it("Form 8936 - transfer checked before AGI for new vehicle", () => {
    // Credit transferred AND AGI over threshold
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "200000",
      newCleanVehicles: [newVehicle({ creditTransferredToDealer: true })],
    }));
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("transferred");
  });
});

// ── All vehicles disqualified scenario ───────────────────────

describe("Form 8936 all vehicles disqualified", () => {
  it("Form 8936 - all new vehicles disqualified by different reasons yields $0 total", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "160000", // over $150K threshold
      newCleanVehicles: [
        newVehicle({ dateAcquired: "2025-10-15" }), // after cutoff
        newVehicle({ creditTransferredToDealer: true }), // transferred
        newVehicle({ msrp: "60000" }), // MSRP over $55K
        newVehicle(), // AGI disqualified
      ],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails).toHaveLength(4);
    expect(result.newVehicleDetails.every(d => d.disqualified)).toBe(true);
  });
});
