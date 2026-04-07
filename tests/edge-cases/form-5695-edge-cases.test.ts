/**
 * Edge case tests for Form 5695 — Residential Energy Credits.
 * Covers sub-limit boundaries, pool interactions, and cap stacking.
 *
 * Spec: spec/federal/form-5695.yaml
 *
 * Part I:  Residential Clean Energy Credit = 30% of costs, NO cap.
 * Part II: Energy Efficient Home Improvement Credit = 30% of costs, subject to:
 *   - Audit sub-cap: $150 credit (= $500 cost × 30%)
 *   - General pool (insulation/windows/doors + audit): $1,200 cap
 *   - Energy property (heat pumps, HP water heaters, biomass): $2,000 cap
 *   - Total Part II: $3,200 annual cap ($1,200 + $2,000)
 *
 * Key: audit $150 is WITHIN the $1,200 general pool, not in addition to it.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm5695 } from "@/engine/forms/form-5695.js";
import type { EnergyCredits } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function ec(overrides: Partial<EnergyCredits> = {}): EnergyCredits {
  return {
    solarElectricCost: undefined,
    solarWaterHeatingCost: undefined,
    fuelCellCost: undefined,
    smallWindCost: undefined,
    geoThermalHeatPumpCost: undefined,
    batteryStorageCost: undefined,
    insulationCost: undefined,
    energyPropertyCost: undefined,
    homeEnergyAuditCost: undefined,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Part I: Clean Energy Credit — No Cap
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part I - clean energy credit has no cap", () => {
  it("Form 5695 Line 14 - $50K solar installation → $15,000 credit (30%, uncapped)", () => {
    const result = calculateForm5695(ec({ solarElectricCost: "50000" }));
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(15000);
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(50000);
  });

  it("Form 5695 Line 14 - $100K combined clean energy → $30,000 credit (no cap)", () => {
    const result = calculateForm5695(ec({
      solarElectricCost: "30000",
      batteryStorageCost: "15000",
      geoThermalHeatPumpCost: "25000",
      smallWindCost: "20000",
      fuelCellCost: "10000",
    }));
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(100000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(30000);
  });

  it("Form 5695 Line 14 - $1 solar cost → $0 credit (30 cents rounds to $0)", () => {
    const result = calculateForm5695(ec({ solarElectricCost: "1" }));
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
  });

  it("Form 5695 Line 14 - $2 solar cost → $1 credit (60 cents rounds to $1)", () => {
    const result = calculateForm5695(ec({ solarElectricCost: "2" }));
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(1);
  });

  it("Form 5695 Lines 1-6 - zero clean energy costs → $0 credit", () => {
    const result = calculateForm5695(ec());
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Audit Sub-Cap ($150 Credit = $500 Cost)
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - audit credit sub-cap at $150", () => {
  it("Form 5695 Line 30 - audit cost $500 → audit credit $150 (exactly at cap)", () => {
    // $500 × 30% = $150, which is exactly the audit cap
    const result = calculateForm5695(ec({ homeEnergyAuditCost: "500" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });

  it("Form 5695 Line 30 - audit cost $499 → audit credit $150 ($149.70 rounds to $150)", () => {
    // $499 × 30% = $149.70 → rounds to $150; min($150, $150) = $150
    const result = calculateForm5695(ec({ homeEnergyAuditCost: "499" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });

  it("Form 5695 Line 30 - audit cost $1,000 → audit credit still $150 (capped)", () => {
    // $1,000 × 30% = $300, but capped at $150
    const result = calculateForm5695(ec({ homeEnergyAuditCost: "1000" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });

  it("Form 5695 Line 30 - audit cost $100 → audit credit $30 (below cap)", () => {
    // $100 × 30% = $30, under the $150 cap
    const result = calculateForm5695(ec({ homeEnergyAuditCost: "100" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: General Pool Cap ($1,200) — Insulation + Audit
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - general pool cap at $1,200 (insulation + audit)", () => {
  it("Form 5695 Line 30 - insulation $4,000 → credit $1,200 (exactly at general pool cap)", () => {
    // $4,000 × 30% = $1,200 = general pool cap
    const result = calculateForm5695(ec({ insulationCost: "4000" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Line 30 - insulation $3,999 → credit $1,200 ($1,199.70 rounds to $1,200)", () => {
    const result = calculateForm5695(ec({ insulationCost: "3999" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Line 30 - insulation $10,000 → credit $1,200 (capped)", () => {
    // $10,000 × 30% = $3,000, but general pool capped at $1,200
    const result = calculateForm5695(ec({ insulationCost: "10000" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Line 30 - insulation $3,500 + audit $500 → general pool $1,200 (audit WITHIN pool)", () => {
    // insulation credit = $3,500 × 30% = $1,050
    // audit credit = min($500 × 30%, $150) = $150
    // general pool = min($1,050 + $150, $1,200) = min($1,200, $1,200) = $1,200
    const result = calculateForm5695(ec({ insulationCost: "3500", homeEnergyAuditCost: "500" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Line 30 - insulation $4,000 + audit $500 → general pool still $1,200 (audit absorbed)", () => {
    // insulation credit = $4,000 × 30% = $1,200
    // audit credit = $150
    // general pool = min($1,200 + $150, $1,200) = $1,200 (audit doesn't add to the cap)
    const result = calculateForm5695(ec({ insulationCost: "4000", homeEnergyAuditCost: "500" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Line 30 - insulation $2,000 + audit $500 → general pool $750 (both under cap)", () => {
    // insulation credit = $2,000 × 30% = $600
    // audit credit = min($150, $150) = $150
    // general pool = min($600 + $150, $1,200) = $750
    const result = calculateForm5695(ec({ insulationCost: "2000", homeEnergyAuditCost: "500" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Energy Property (Heat Pump) Cap ($2,000)
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - energy property cap at $2,000", () => {
  it("Form 5695 Line 30 - heat pump cost $6,667 → credit $2,000 (exactly at cap)", () => {
    // $6,667 × 30% = $2,000.10 → rounds to $2,000; min($2,000, $2,000) = $2,000
    const result = calculateForm5695(ec({ energyPropertyCost: "6667" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("Form 5695 Line 30 - heat pump cost $6,666 → credit $2,000 ($1,999.80 rounds to $2,000)", () => {
    const result = calculateForm5695(ec({ energyPropertyCost: "6666" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("Form 5695 Line 30 - heat pump cost $15,000 → credit $2,000 (capped)", () => {
    // $15,000 × 30% = $4,500, but capped at $2,000
    const result = calculateForm5695(ec({ energyPropertyCost: "15000" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("Form 5695 Line 30 - heat pump cost $3,333 → credit $1,000 (under cap)", () => {
    // $3,333 × 30% = $999.90 → rounds to $1,000
    const result = calculateForm5695(ec({ energyPropertyCost: "3333" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Total Cap ($3,200 = $1,200 General + $2,000 Heat Pump)
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - total annual cap at $3,200", () => {
  it("Form 5695 Line 30 - insulation $4K + heat pump $6,667 → $3,200 (both pools maxed)", () => {
    // general pool = $1,200, energy property = $2,000
    // total = min($1,200 + $2,000, $3,200) = $3,200
    const result = calculateForm5695(ec({ insulationCost: "4000", energyPropertyCost: "6667" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Form 5695 Line 30 - insulation $4K + audit $500 + heat pump $7K → $3,200 (all capped)", () => {
    // general pool = min($1,200 + $150, $1,200) = $1,200
    // energy property = min($2,100, $2,000) = $2,000
    // total = min($1,200 + $2,000, $3,200) = $3,200
    const result = calculateForm5695(ec({
      insulationCost: "4000",
      homeEnergyAuditCost: "500",
      energyPropertyCost: "7000",
    }));
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Form 5695 Line 30 - insulation $2K + heat pump $3,333 → $1,600 (under total cap)", () => {
    // general pool = min($600, $1,200) = $600
    // energy property = min($1,000, $2,000) = $1,000
    // total = $600 + $1,000 = $1,600 (under $3,200)
    const result = calculateForm5695(ec({ insulationCost: "2000", energyPropertyCost: "3333" }));
    expect(result.energyImprovementCredit.toNumber()).toBe(1600);
  });
});

// ═══════════════════════════════════════════════════════════
// Part I + Part II: Both Credits
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - combined Part I and Part II credits", () => {
  it("Form 5695 - solar $30K + insulation $4K + heat pump $7K → Part I $9K, Part II $3,200", () => {
    const result = calculateForm5695(ec({
      solarElectricCost: "30000",
      insulationCost: "4000",
      energyPropertyCost: "7000",
    }));
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(9000);
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Form 5695 - Part I uncapped while Part II hits cap", () => {
    const result = calculateForm5695(ec({
      solarElectricCost: "100000",
      insulationCost: "10000",
      energyPropertyCost: "20000",
    }));
    // Part I: $100K × 30% = $30,000 (no cap)
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(30000);
    // Part II: general $1,200 + heat pump $2,000 = $3,200
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: improvementCreditBeforeLimits vs After Limits
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - before-limits vs after-limits comparison", () => {
  it("Form 5695 Lines 24 vs 30 - $20K total costs → $6,000 before limits, $3,200 after", () => {
    // insulation $10K + heat pump $10K = $20K
    // Before limits: $20K × 30% = $6,000
    // After limits: general $1,200 + heat pump $2,000 = $3,200
    const result = calculateForm5695(ec({ insulationCost: "10000", energyPropertyCost: "10000" }));
    expect(result.improvementCreditBeforeLimits.toNumber()).toBe(6000);
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Form 5695 Lines 24 vs 30 - $1K total costs → $300 before limits equals after limits", () => {
    // $1K × 30% = $300, well under all caps
    const result = calculateForm5695(ec({ insulationCost: "1000" }));
    expect(result.improvementCreditBeforeLimits.toNumber()).toBe(300);
    expect(result.energyImprovementCredit.toNumber()).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════
// Undefined / Zero Input
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - undefined and zero input handling", () => {
  it("Form 5695 - undefined input → all zeros with audit trail", () => {
    const result = calculateForm5695(undefined);
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.totalImprovementCosts.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("Form 5695 - all-zero costs → all-zero credits", () => {
    const result = calculateForm5695(ec());
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
  });
});
