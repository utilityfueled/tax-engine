/**
 * Form 8936 — Clean Vehicle Credits
 * Spec: spec/federal/form-8936.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
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
  overrides: Partial<Form8936Input["newCleanVehicles"][0] & { dateAcquired: string }> = {}
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
  overrides: Partial<Form8936Input["previouslyOwnedCleanVehicles"][0] & { dateAcquired: string }> = {}
) {
  return {
    dateAcquired: "2025-09-30",
    salePrice: "20000",
    personalUsePercentage: "100",
    creditTransferredToDealer: false,
    ...overrides,
  };
}

// ── Part I: Modified AGI ──────────────────────────────────

describe("Form 8936 MAGI calculation", () => {
  it("Form 8936 MAGI defaults to AGI when no foreign exclusions", () => {
    const result = calculateForm8936(makeInput({ agi: "120000" }));
    expect(result.currentYearMagi.equals(new Decimal("120000"))).toBe(true);
    expect(result.magi.equals(new Decimal("120000"))).toBe(true);
  });

  it("Form 8936 MAGI includes foreign earned income exclusion", () => {
    const result = calculateForm8936(makeInput({
      agi: "100000",
      foreignEarnedIncomeExclusion: "30000",
    }));
    expect(result.currentYearMagi.equals(new Decimal("130000"))).toBe(true);
  });

  it("Form 8936 MAGI includes foreign housing deduction", () => {
    const result = calculateForm8936(makeInput({
      agi: "100000",
      foreignHousingDeduction: "10000",
    }));
    expect(result.currentYearMagi.equals(new Decimal("110000"))).toBe(true);
  });

  it("Form 8936 uses prior-year MAGI when it is lower", () => {
    const result = calculateForm8936(makeInput({
      agi: "200000",
      priorYearAgi: "140000",
    }));
    expect(result.currentYearMagi.equals(new Decimal("200000"))).toBe(true);
    expect(result.priorYearMagi.equals(new Decimal("140000"))).toBe(true);
    expect(result.magi.equals(new Decimal("140000"))).toBe(true);
  });

  it("Form 8936 uses current-year MAGI when it is lower than prior year", () => {
    const result = calculateForm8936(makeInput({
      agi: "100000",
      priorYearAgi: "200000",
    }));
    expect(result.magi.equals(new Decimal("100000"))).toBe(true);
  });

  it("Form 8936 Line 5 uses lesser of current or prior year MAGI", () => {
    const result = calculateForm8936(makeInput({
      agi: "160000",
      foreignEarnedIncomeExclusion: "10000", // current MAGI = 170000
      priorYearAgi: "145000",
      priorYearForeignEarnedIncomeExclusion: "5000", // prior MAGI = 150000
    }));
    expect(result.magi.equals(new Decimal("150000"))).toBe(true);
  });

  it("Form 8936 uses current-year MAGI when no prior year data provided", () => {
    const result = calculateForm8936(makeInput({ agi: "130000" }));
    // No priorYearAgi → defaults to 0, but hasPriorYear check should use current
    expect(result.magi.equals(new Decimal("130000"))).toBe(true);
  });
});

// ── New Clean Vehicle Credit (IRC §30D) ───────────────────

describe("Form 8936 new clean vehicle credit", () => {
  it("Form 8936 new vehicle full $7,500 credit when both requirements met", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleDetails[0].maxCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 new vehicle $3,750 credit when only critical minerals requirement met", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ batteryComponentsRequirementMet: false })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("3750"))).toBe(true);
    expect(result.newVehicleDetails[0].maxCredit.equals(new Decimal("3750"))).toBe(true);
  });

  it("Form 8936 new vehicle $3,750 credit when only battery components requirement met", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ criticalMineralsRequirementMet: false })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("3750"))).toBe(true);
  });

  it("Form 8936 new vehicle $0 when neither requirement met", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({
        criticalMineralsRequirementMet: false,
        batteryComponentsRequirementMet: false,
      })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails[0].maxCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 MSRP over limit disqualifies new vehicle credit - other vehicle", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "55001" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("MSRP");
  });

  it("Form 8936 MSRP at exactly $55,000 limit qualifies for other vehicle", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "55000" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 SUV/van/pickup uses $80,000 MSRP limit", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "79000", vehicleType: "suv_van_pickup" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 SUV/van/pickup MSRP over $80,000 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "80001", vehicleType: "suv_van_pickup" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
  });

  it("Form 8936 SUV MSRP at exactly $80,000 qualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ msrp: "80000", vehicleType: "suv_van_pickup" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 AGI over threshold disqualifies new vehicle credit - single", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "150001",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
  });

  it("Form 8936 AGI at exactly $150,000 qualifies - single", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "150000",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(false);
  });

  it("Form 8936 AGI over threshold disqualifies - MFJ at $300,001", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "married_filing_jointly",
      agi: "300001",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(true);
  });

  it("Form 8936 AGI at $300,000 qualifies - MFJ", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "married_filing_jointly",
      agi: "300000",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 HoH AGI threshold is $225,000", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "head_of_household",
      agi: "225001",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);

    const result2 = calculateForm8936(makeInput({
      filingStatus: "head_of_household",
      agi: "225000",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result2.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 QSS uses MFJ thresholds ($300,000)", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "qualifying_surviving_spouse",
      agi: "300000",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 MFS AGI threshold is $150,000", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "married_filing_separately",
      agi: "150001",
      newCleanVehicles: [newVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 transfer election yields $0 personal credit", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ creditTransferredToDealer: true })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("transferred");
  });

  it("Form 8936 new vehicle acquired after September 30, 2025 is disqualified", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ dateAcquired: "2025-10-01" })],
    }));

    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(true);
    expect(result.newVehicleDetails[0].disqualificationReason).toContain("acquired after");
  });

  it("Form 8936 new vehicle acquired on September 30, 2025 still qualifies", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ dateAcquired: "2025-09-30" })],
    }));

    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 partial personal use reduces new vehicle credit", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ personalUsePercentage: "60" })],
    }));
    // $7,500 × 60% = $4,500
    expect(result.totalNewVehicleCredit.equals(new Decimal("4500"))).toBe(true);
  });

  it("Form 8936 Line 9 sums credits from multiple new vehicles", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [
        newVehicle(), // $7,500
        newVehicle({ batteryComponentsRequirementMet: false }), // $3,750
      ],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("11250"))).toBe(true);
  });

  it("Form 8936 prior year AGI qualifies even when current year is over threshold", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "160000", // over $150K current year
      priorYearAgi: "140000", // under $150K prior year
      newCleanVehicles: [newVehicle()],
    }));
    // MAGI = lesser of 160K, 140K = 140K → qualifies
    expect(result.magi.equals(new Decimal("140000"))).toBe(true);
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
  });

  it("Form 8936 both years over threshold still disqualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "160000",
      priorYearAgi: "155000",
      newCleanVehicles: [newVehicle()],
    }));
    // MAGI = lesser of 160K, 155K = 155K → still over $150K
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 zero personal use yields $0 credit", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle({ personalUsePercentage: "0" })],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 no new vehicles yields $0 total", () => {
    const result = calculateForm8936(makeInput());
    expect(result.totalNewVehicleCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleDetails).toHaveLength(0);
  });
});

// ── Previously Owned Clean Vehicle Credit (IRC §25E) ──────

describe("Form 8936 previously owned clean vehicle credit", () => {
  it("Form 8936 previously owned credit is lesser of $4,000 or 30% of sale price", () => {
    // 30% of $20,000 = $6,000 → capped at $4,000
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "20000" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 previously owned credit uses 30% when less than $4,000", () => {
    // 30% of $10,000 = $3,000
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "10000" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("3000"))).toBe(true);
  });

  it("Form 8936 previously owned credit at $13,334 sale price is $4,000", () => {
    // 30% of $13,334 = $4,000.20 → min with $4,000 → $4,000
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "13334" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 previously owned credit at $13,333 sale price is $3,999", () => {
    // 30% of $13,333 = $3,999.90 → floored to $3,999
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "13333" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("3999"))).toBe(true);
  });

  it("Form 8936 sale price over $25,000 disqualifies previously owned credit", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "25001" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualificationReason).toContain("25000");
  });

  it("Form 8936 sale price at exactly $25,000 qualifies", () => {
    // 30% of $25,000 = $7,500 → capped at $4,000
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "25000" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(false);
  });

  it("Form 8936 previously owned AGI threshold - single at $75,001 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "75001",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.previouslyOwnedAgiDisqualified).toBe(true);
  });

  it("Form 8936 previously owned AGI threshold - single at $75,000 qualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "75000",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
    expect(result.previouslyOwnedAgiDisqualified).toBe(false);
  });

  it("Form 8936 previously owned AGI threshold - MFJ at $150,000 qualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "married_filing_jointly",
      agi: "150000",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 previously owned AGI threshold - MFJ at $150,001 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "married_filing_jointly",
      agi: "150001",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 previously owned AGI threshold - HoH at $112,500 qualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "head_of_household",
      agi: "112500",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 previously owned AGI threshold - HoH at $112,501 disqualifies", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "head_of_household",
      agi: "112501",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
  });

  it("Form 8936 previously owned transfer election yields $0", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ creditTransferredToDealer: true })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(true);
  });

  it("Form 8936 previously owned vehicle acquired after September 30, 2025 is disqualified", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ dateAcquired: "2025-10-01" })],
    }));

    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualified).toBe(true);
    expect(result.previouslyOwnedDetails[0].disqualificationReason).toContain("acquired after");
  });

  it("Form 8936 previously owned partial personal use reduces credit", () => {
    // $4,000 × 75% = $3,000
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ personalUsePercentage: "75" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("3000"))).toBe(true);
  });

  it("Form 8936 previously owned prior year AGI qualifies when current is over", () => {
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "80000", // over $75K
      priorYearAgi: "70000", // under $75K
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.magi.equals(new Decimal("70000"))).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 no previously owned vehicles yields $0", () => {
    const result = calculateForm8936(makeInput({ agi: "60000" }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.previouslyOwnedDetails).toHaveLength(0);
  });

  it("Form 8936 previously owned $0 sale price yields $0 credit", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle({ salePrice: "0" })],
    }));
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
  });
});

// ── Combined scenarios ────────────────────────────────────

describe("Form 8936 combined scenarios", () => {
  it("Form 8936 both new and previously owned vehicles yield separate credits", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      newCleanVehicles: [newVehicle()], // $7,500
      previouslyOwnedCleanVehicles: [usedVehicle()], // $4,000
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 AGI disqualifies new vehicle but not previously owned when between thresholds", () => {
    // Single: new vehicle limit = $150K, previously owned limit = $75K
    // AGI = $74,000 → qualifies for both
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "74000",
      newCleanVehicles: [newVehicle()],
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4000"))).toBe(true);
  });

  it("Form 8936 AGI over previously owned threshold but under new vehicle threshold", () => {
    // Single: $100K AGI → under $150K new vehicle limit, over $75K previously owned limit
    const result = calculateForm8936(makeInput({
      filingStatus: "single",
      agi: "100000",
      newCleanVehicles: [newVehicle()],
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("0"))).toBe(true);
    expect(result.newVehicleAgiDisqualified).toBe(false);
    expect(result.previouslyOwnedAgiDisqualified).toBe(true);
  });

  it("Form 8936 multiple vehicles of each type sum correctly", () => {
    const result = calculateForm8936(makeInput({
      agi: "50000",
      newCleanVehicles: [
        newVehicle(), // $7,500
        newVehicle({ criticalMineralsRequirementMet: false }), // $3,750
      ],
      previouslyOwnedCleanVehicles: [
        usedVehicle({ salePrice: "10000" }), // $3,000
        usedVehicle({ salePrice: "5000" }), // $1,500
      ],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("11250"))).toBe(true);
    expect(result.totalPreviouslyOwnedCredit.equals(new Decimal("4500"))).toBe(true);
  });

  it("Form 8936 mixed qualified and disqualified vehicles in same return", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [
        newVehicle(), // qualifies: $7,500
        newVehicle({ msrp: "60000" }), // MSRP over $55K limit: $0
        newVehicle({ creditTransferredToDealer: true }), // transferred: $0
      ],
    }));
    expect(result.totalNewVehicleCredit.equals(new Decimal("7500"))).toBe(true);
    expect(result.newVehicleDetails[0].disqualified).toBe(false);
    expect(result.newVehicleDetails[1].disqualified).toBe(true);
    expect(result.newVehicleDetails[2].disqualified).toBe(true);
  });
});

// ── Audit trail ───────────────────────────────────────────

describe("Form 8936 audit trail", () => {
  it("Form 8936 records MAGI audit lines", () => {
    const result = calculateForm8936(makeInput({
      agi: "100000",
      priorYearAgi: "90000",
      newCleanVehicles: [newVehicle()],
    }));
    const magiLines = result.lines.filter((l) => l.form === "Form 8936" && (l.line === "2" || l.line === "4" || l.line === "5"));
    expect(magiLines.length).toBe(3);
  });

  it("Form 8936 records per-vehicle audit lines for new vehicles", () => {
    const result = calculateForm8936(makeInput({
      newCleanVehicles: [newVehicle(), newVehicle()],
    }));
    const vehicleLines = result.lines.filter((l) => l.line.startsWith("NV-"));
    expect(vehicleLines.length).toBe(2);
  });

  it("Form 8936 records per-vehicle audit lines for previously owned vehicles", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    const vehicleLines = result.lines.filter((l) => l.line.startsWith("PO-"));
    expect(vehicleLines.length).toBe(1);
  });

  it("Form 8936 records total credit audit lines", () => {
    const result = calculateForm8936(makeInput({
      agi: "60000",
      newCleanVehicles: [newVehicle()],
      previouslyOwnedCleanVehicles: [usedVehicle()],
    }));
    const line9 = result.lines.find((l) => l.line === "9");
    const line14 = result.lines.find((l) => l.line === "14");
    expect(line9).toBeDefined();
    expect(line14).toBeDefined();
  });
});

// Spec: spec/federal/form-8936.yaml verified source, transfer and ordering lines.
describe("Form 8936 verified year transition", () => {
  const evidence = {vin:"1ABCDEFGH23456789",owner:"primary" as const,datePlacedInService:"2026-01-02",bindingContractDate:"2025-09-30",paymentDate:"2025-09-30",bindingContractConfirmed:true,sellerReportReceived:true,sellerReportCreditAmount:"7500",eligibilityConfirmed:true,resoldWithin30Days:false,returnedToSellerWithin30Days:false,powertrain:"battery" as const};
  const verifiedNew = (extra: Partial<Form8936Input["newCleanVehicles"][number]>={}) => newVehicle({...evidence,...extra});
  const verifiedUsed = (extra: Partial<Form8936Input["previouslyOwnedCleanVehicles"][number]>={}) => usedVehicle({...evidence,vin:"2ABCDEFGH23456789",sellerReportCreditAmount:"4000",...extra});
  const current = (extra: Partial<Form8936Input>={}) => makeInput({taxYear:2026,agi:"70000",agiAdjustmentsConfirmed:true,taxLiabilityLimit:new Decimal(20000),incomeTaxBeforeCredits:new Decimal(20000),...extra});
  it("2026 requires actual acquisition and service-year evidence", () => {
    expect(calculateForm8936(current({newCleanVehicles:[verifiedNew()]})).totalNewVehicleCredit.toString()).toBe("7500");
    for(const overrides of [{datePlacedInService:undefined},{bindingContractDate:undefined},{paymentDate:undefined},{sellerReportReceived:undefined},{eligibilityConfirmed:undefined},{resoldWithin30Days:undefined},{vin:undefined},{owner:undefined},{datePlacedInService:"2026-02-30"},{paymentDate:"2026-01-03"}]) {
      expect(()=>calculateForm8936(current({newCleanVehicles:[verifiedNew(overrides)]}))).toThrow();
    }
    for(const overrides of [{datePlacedInService:"2025-12-31"},{bindingContractConfirmed:false},{paymentDate:"2025-10-01"},{bindingContractDate:"2025-10-01"},{eligibilityConfirmed:false},{sellerReportReceived:false}]) {
      expect(calculateForm8936(current({newCleanVehicles:[verifiedNew(overrides)]})).totalNewVehicleCredit.toString()).toBe("0");
    }
    expect(()=>calculateForm8936(current({agiAdjustmentsConfirmed:undefined,newCleanVehicles:[verifiedNew()]}))).toThrow();
    expect(()=>calculateForm8936(current({taxLiabilityLimit:undefined,newCleanVehicles:[verifiedNew()]}))).toThrow();
  });
  it("2026 uses known zero prior AGI and each years actual status", () => {
    const base=current({agi:"400000",priorYearAgi:"0",priorYearFilingStatus:"single",priorYearAgiAdjustmentsConfirmed:true,newCleanVehicles:[verifiedNew()]});
    expect(calculateForm8936(base).totalNewVehicleCredit.toString()).toBe("7500");
    expect(calculateForm8936(base).priorYearMagi.toString()).toBe("0");
    expect(()=>calculateForm8936({...base,priorYearAgi:undefined})).toThrow(/prior/);
    expect(()=>calculateForm8936({...base,priorYearFilingStatus:undefined})).toThrow(/status/);
    expect(calculateForm8936({...base,filingStatus:"married_filing_jointly",priorYearAgi:"200000"}).totalNewVehicleCredit.toString()).toBe("0");
    expect(calculateForm8936({...base,filingStatus:"single",priorYearAgi:"200000",priorYearFilingStatus:"married_filing_jointly"}).totalNewVehicleCredit.toString()).toBe("7500");
    expect(calculateForm8936({...base,priorYearAgi:"149000",priorYearPossessionIncomeExclusion:"1001"}).totalNewVehicleCredit.toString()).toBe("0");
    expect(calculateForm8936({...base,filingStatus:"married_filing_jointly",newCleanVehicles:[verifiedNew({owner:"spouse",priorYearMagi:"140000",priorYearFilingStatus:"single",priorYearMagiConfirmed:true})]}).totalNewVehicleCredit.toString()).toBe("7500");
    expect(()=>calculateForm8936({...base,filingStatus:"married_filing_jointly",newCleanVehicles:[verifiedNew({owner:"spouse"})]})).toThrow(/owner/);
  });
  it("2026 preserves actual seller credits and used credit without personal proration", () => {
    expect(calculateForm8936(current({newCleanVehicles:[verifiedNew({sellerReportCreditAmount:"3750",batteryComponentsRequirementMet:false})]})).totalNewVehicleCredit.toString()).toBe("3750");
    expect(calculateForm8936(current({newCleanVehicles:[verifiedNew({powertrain:"fuel_cell",criticalMineralsRequirementMet:false,batteryComponentsRequirementMet:false})]})).totalNewVehicleCredit.toString()).toBe("7500");
    expect(calculateForm8936(current({previouslyOwnedCleanVehicles:[verifiedUsed({salePrice:"13333",personalUsePercentage:"33"})]})).totalPreviouslyOwnedCredit.toString()).toBe("4000");
    expect(()=>calculateForm8936(current({newCleanVehicles:[verifiedNew({sellerReportCreditAmount:"7501"})]}))).toThrow(/seller/);
    expect(calculateForm8936(current({previouslyOwnedCleanVehicles:[verifiedUsed({bindingContractDate:"2022-12-31",paymentDate:"2022-12-31"})]})).totalPreviouslyOwnedCredit.toString()).toBe("0");
    for(const overrides of [{msrp:"-1"},{personalUsePercentage:"101"},{personalUsePercentage:"-1"},{sellerReportCreditAmount:"NaN"}]) expect(()=>calculateForm8936(current({newCleanVehicles:[verifiedNew(overrides)]}))).toThrow();
  });
  it("2026 reconciles transfers without double claims or invented taxpayer repayment", () => {
    const transfer=verifiedNew({creditTransferredToDealer:true,creditTransferredAmount:"7500"});
    const zeroTax=calculateForm8936(current({taxLiabilityLimit:new Decimal(0),incomeTaxBeforeCredits:new Decimal(0),newCleanVehicles:[transfer]}));
    expect(zeroTax.totalNewVehicleCredit.toString()).toBe("0");
    expect(zeroTax.transferredCreditRepayment.toString()).toBe("0");
    const high=current({agi:"400000",priorYearAgi:"400000",priorYearFilingStatus:"single",priorYearAgiAdjustmentsConfirmed:true,newCleanVehicles:[transfer],previouslyOwnedCleanVehicles:[verifiedUsed({creditTransferredToDealer:true,creditTransferredAmount:"4000"})]});
    const r=calculateForm8936(high);
    expect(r.transferredNewVehicleCreditRepayment.toString()).toBe("7500");
    expect(r.transferredPreviouslyOwnedCreditRepayment.toString()).toBe("4000");
    expect(r.transferredCreditRepayment.toString()).toBe("11500");
    expect(calculateForm8936(current({newCleanVehicles:[{...transfer,resoldWithin30Days:true}]})).transferredCreditRepayment.toString()).toBe("7500");
    const returned=calculateForm8936(current({newCleanVehicles:[{...transfer,returnedToSellerWithin30Days:true,sellerReportUpdatedForReturn:true}]}));
    expect(returned.transferredCreditRepayment.toString()).toBe("0");
    expect(returned.dealerTransferReconciliationAmount.toString()).toBe("7500");
    for(const overrides of [{creditTransferredAmount:undefined},{creditTransferredAmount:"4000"},{returnedToSellerWithin30Days:true},{eligibilityConfirmed:false}]) expect(()=>calculateForm8936(current({newCleanVehicles:[{...transfer,...overrides}]}))).toThrow();
  });
  it("2026 applies used then new credit limits and preserves business credit", () => {
    const r=calculateForm8936(current({taxLiabilityLimit:new Decimal("5000"),incomeTaxBeforeCredits:new Decimal("6000"),newCleanVehicles:[verifiedNew({personalUsePercentage:"33.33"})],previouslyOwnedCleanVehicles:[verifiedUsed()]}));
    expect(r.tentativeNewVehicleCredit.toString()).toBe("2500");
    expect(r.businessInvestmentCredit.toString()).toBe("5000");
    expect(r.requiresForm3800).toBe(true);
    expect(r.totalPreviouslyOwnedCredit.toString()).toBe("4000");
    expect(r.totalNewVehicleCredit.toString()).toBe("1000");
    expect(r.unusedPersonalCredit.toString()).toBe("1500");
    expect(Object.fromEntries(r.lines.map(l=>[l.line,l.value.toString()]))).toMatchObject({"6":"5000","9":"2500","10":"6000","11":"5000","12":"1000","13":"1000","14":"4000","15":"6000","16":"1000","17":"5000","18":"4000"});
  });
  it("2026 rejects duplicate VINs and owner-specific election conflicts", () => {
    expect(()=>calculateForm8936(current({newCleanVehicles:[verifiedNew(),verifiedNew()]}))).toThrow(/VIN/);
    expect(()=>calculateForm8936(current({previouslyOwnedCleanVehicles:[verifiedUsed(),verifiedUsed({vin:"3ABCDEFGH23456789"})]}))).toThrow(/owner/);
    const transfers=["1","2","3"].map(prefix=>verifiedNew({vin:`${prefix}ABCDEFGH23456789`,creditTransferredToDealer:true,creditTransferredAmount:"7500"}));
    expect(()=>calculateForm8936(current({newCleanVehicles:transfers}))).toThrow(/two/);
    expect(calculateForm8936(current({filingStatus:"married_filing_jointly",newCleanVehicles:[transfers[0],transfers[1],{...transfers[2],owner:"spouse"}]})).transferredCreditRepayment.toString()).toBe("0");
  });
});

// Spec: spec/federal/form-8936.yaml verified-MAGI; known zero is not omission.
it("known zero prior AGI remains known in the historical interface", () => {
  expect(calculateForm8936(makeInput({agi:"200000",priorYearAgi:"0",newCleanVehicles:[newVehicle()]})).totalNewVehicleCredit.toString()).toBe("7500");
  expect(calculateForm8936(makeInput({agi:"200000",newCleanVehicles:[newVehicle()]})).totalNewVehicleCredit.toString()).toBe("0");
});
