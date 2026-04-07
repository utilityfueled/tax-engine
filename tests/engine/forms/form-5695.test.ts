/**
 * Tests for Form 5695 — Residential Energy Credits
 * Spec: spec/federal/form-5695.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm5695 } from "@/engine/forms/form-5695.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

// ═══════════════════════════════════════════════════════════
// Part I: Residential Clean Energy Credit
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part I - Clean Energy Credit", () => {
  it("Form 5695 Part I - total qualified costs", () => {
    const result = calculateForm5695({
      solarElectricCost: "25000",
      solarWaterHeatingCost: "5000",
      fuelCellCost: "0",
      smallWindCost: "0",
      geoThermalHeatPumpCost: "0",
      batteryStorageCost: "10000",
    });
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(40000);
  });

  it("Form 5695 Part I - 30% credit rate", () => {
    const result = calculateForm5695({
      solarElectricCost: "30000",
    });
    // $30K × 30% = $9K
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(9000);
  });

  it("Form 5695 Part I - no cap on clean energy credit", () => {
    const result = calculateForm5695({
      solarElectricCost: "50000",
      batteryStorageCost: "15000",
    });
    // $65K × 30% = $19,500 — no cap
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(19500);
  });

  it("Form 5695 Part I - zero costs produce zero credit", () => {
    const result = calculateForm5695({
      solarElectricCost: "0",
    });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
  });

  it("Form 5695 Part I - all cost types", () => {
    const result = calculateForm5695({
      solarElectricCost: "10000",
      solarWaterHeatingCost: "5000",
      fuelCellCost: "3000",
      smallWindCost: "2000",
      geoThermalHeatPumpCost: "8000",
      batteryStorageCost: "7000",
    });
    // Total: $35K, Credit: $10,500
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(35000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(10500);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Energy Efficient Home Improvement Credit
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II - Energy Improvement Credit", () => {
  it("Form 5695 Part II - total improvement costs", () => {
    const result = calculateForm5695({
      insulationCost: "2000",
      energyPropertyCost: "3000",
      homeEnergyAuditCost: "400",
    });
    expect(result.totalImprovementCosts.toNumber()).toBe(5400);
  });

  it("Form 5695 Part II - 30% credit rate", () => {
    const result = calculateForm5695({
      insulationCost: "2000",
    });
    // $2K × 30% = $600
    expect(result.improvementCreditBeforeLimits.toNumber()).toBe(600);
  });

  it("Form 5695 Part II - capped at $3,200", () => {
    const result = calculateForm5695({
      insulationCost: "5000", // 30% = $1,500 → capped at $1,200
      energyPropertyCost: "8000", // 30% = $2,400 → capped at $2,000
      homeEnergyAuditCost: "1000", // 30% = $300 → capped at $150
    });
    // Sub-limits: $1,200 + $2,000 + $150 = $3,350, but overall cap = $3,200
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Form 5695 Part II - under cap gets full credit", () => {
    const result = calculateForm5695({
      insulationCost: "1000",
      energyPropertyCost: "2000",
    });
    // $1K × 30% = $300 (under $1,200 sub-limit)
    // $2K × 30% = $600 (under $2,000 sub-limit)
    // Total: $900 (under $3,200 cap)
    expect(result.energyImprovementCredit.toNumber()).toBe(900);
  });

  it("Form 5695 Part II - insulation sub-limit $1,200", () => {
    const result = calculateForm5695({
      insulationCost: "10000", // 30% = $3,000 → capped at $1,200
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Form 5695 Part II - energy property sub-limit $2,000", () => {
    const result = calculateForm5695({
      energyPropertyCost: "10000", // 30% = $3,000 → capped at $2,000
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("Form 5695 Part II - audit sub-limit $150", () => {
    const result = calculateForm5695({
      homeEnergyAuditCost: "1000", // 30% = $300 → capped at $150
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════
// No Input / Undefined
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - no input", () => {
  it("undefined input produces zero credits", () => {
    const result = calculateForm5695(undefined);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
  });

  it("Form 5695 audit - undefined input still emits zero-value lines for 1-6, 14, 18-20, 24, and 30", () => {
    const result = calculateForm5695(undefined);
    const lineIds = result.lines.map((line) => line.line);
    const byLine = Object.fromEntries(result.lines.map((line) => [line.line, line.value]));

    expect(lineIds).toEqual(["1-6", "14", "18-20", "24", "30"]);
    expect(byLine["1-6"].toNumber()).toBe(0);
    expect(byLine["14"].toNumber()).toBe(0);
    expect(byLine["18-20"].toNumber()).toBe(0);
    expect(byLine["24"].toNumber()).toBe(0);
    expect(byLine["30"].toNumber()).toBe(0);
  });

  it("produces audit trail even with no input", () => {
    const result = calculateForm5695(undefined);
    expect(result.lines.length).toBeGreaterThan(0);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("30");
  });
});

// ═══════════════════════════════════════════════════════════
// Part I + Part II Combined
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - combined credits", () => {
  it("both clean energy and improvement credits calculated independently", () => {
    const result = calculateForm5695({
      solarElectricCost: "25000",
      insulationCost: "3000",
      energyPropertyCost: "4000",
    });
    // Part I: $25K × 30% = $7,500
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(7500);
    // Part II: insulation $900 (under $1,200), energy property $1,200 (under $2,000)
    // Total: $2,100 (under $3,200 cap)
    expect(result.energyImprovementCredit.toNumber()).toBe(2100);
  });

  it("Part II at maximum sub-limits sum exceeds overall cap", () => {
    const result = calculateForm5695({
      insulationCost: "4001", // 30% = $1,200.30 → capped $1,200
      energyPropertyCost: "6667", // 30% = $2,000.10 → capped $2,000
      homeEnergyAuditCost: "500", // 30% = $150 → capped $150
    });
    // Sum sub-limits: $1,200 + $2,000 + $150 = $3,350 → capped at $3,200
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("very small costs produce precise credits", () => {
    const result = calculateForm5695({
      solarElectricCost: "100",
    });
    // $100 × 30% = $30
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional targeted tests
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part I - solar electric only at 30%", () => {
  it("solar electric only: 30% credit rate applied correctly", () => {
    const result = calculateForm5695({
      solarElectricCost: "20000",
    });
    // $20K × 30% = $6K
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(6000);
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(20000);
  });
});

describe("Form 5695 Part I - solar + wind combined at 30%", () => {
  it("solar + small wind combined: both at 30% with no cap", () => {
    const result = calculateForm5695({
      solarElectricCost: "15000",
      smallWindCost: "10000",
    });
    // Total: $25K × 30% = $7,500
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(25000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(7500);
  });
});

describe("Form 5695 Part II - insulation + windows + doors combined", () => {
  it("insulation + energy property (windows/doors) combined under sub-limits", () => {
    const result = calculateForm5695({
      insulationCost: "2000",   // 30% = $600 (under $1,200 sub-limit)
      energyPropertyCost: "3000", // 30% = $900 (under $2,000 sub-limit)
    });
    // Total credit: $600 + $900 = $1,500 (under $3,200 cap)
    expect(result.totalImprovementCosts.toNumber()).toBe(5000);
    expect(result.energyImprovementCredit.toNumber()).toBe(1500);
  });
});

describe("Form 5695 Part II - cap enforcement", () => {
  it("general improvement sub-limit caps at $1,200 for insulation", () => {
    const result = calculateForm5695({
      insulationCost: "8000", // 30% = $2,400 → capped at $1,200
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("heat pump / energy property sub-limit caps at $2,000", () => {
    const result = calculateForm5695({
      energyPropertyCost: "15000", // 30% = $4,500 → capped at $2,000
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });
});

describe("Form 5695 - zero costs produce zero credits", () => {
  it("all zero costs produce zero Part I and Part II credits", () => {
    const result = calculateForm5695({
      solarElectricCost: "0",
      solarWaterHeatingCost: "0",
      fuelCellCost: "0",
      smallWindCost: "0",
      geoThermalHeatPumpCost: "0",
      batteryStorageCost: "0",
      insulationCost: "0",
      energyPropertyCost: "0",
      homeEnergyAuditCost: "0",
    });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(0);
    expect(result.totalImprovementCosts.toNumber()).toBe(0);
  });
});

describe("Form 5695 - audit trail line IDs", () => {
  it("audit trail contains all expected line IDs for a full calculation", () => {
    const result = calculateForm5695({
      solarElectricCost: "10000",
      insulationCost: "2000",
      energyPropertyCost: "3000",
      homeEnergyAuditCost: "500",
    });
    const lineIds = result.lines.map((l) => l.line);
    // Part I lines
    expect(lineIds).toContain("1-6");
    expect(lineIds).toContain("14");
    // Part II lines
    expect(lineIds).toContain("18-20");
    expect(lineIds).toContain("24");
    expect(lineIds).toContain("30");
  });
});

describe("Form 5695 Part I - very large solar installation", () => {
  it("$100K solar installation yields $30K credit at 30% with no cap", () => {
    const result = calculateForm5695({
      solarElectricCost: "100000",
    });
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(100000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(30000);
  });
});

describe("Form 5695 Part I - battery storage credit at 30%", () => {
  it("battery storage standalone: 30% credit rate applied", () => {
    const result = calculateForm5695({
      batteryStorageCost: "20000",
    });
    // $20K × 30% = $6K
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(20000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(6000);
  });

  it("battery storage combined with solar: additive at 30%", () => {
    const result = calculateForm5695({
      solarElectricCost: "30000",
      batteryStorageCost: "10000",
    });
    // Total: $40K × 30% = $12K
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(40000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Credit Limits and Boundary Conditions
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - edge cases and boundary conditions", () => {
  it("Part II insulation at exact sub-limit boundary ($4,000 × 30% = $1,200)", () => {
    const result = calculateForm5695({
      insulationCost: "4000", // 30% = $1,200 — exactly at sub-limit
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("Part II energy property at exact sub-limit boundary ($6666.67 × 30% ≈ $2,000)", () => {
    const result = calculateForm5695({
      energyPropertyCost: "6667", // 30% = $2,000.10 → capped at $2,000
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
    // Just under the limit
    const result2 = calculateForm5695({
      energyPropertyCost: "6666", // 30% = $1,999.80 → under limit
    });
    expect(result2.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("Part II audit at exact sub-limit boundary ($500 × 30% = $150)", () => {
    const result = calculateForm5695({
      homeEnergyAuditCost: "500", // 30% = $150 — exactly at sub-limit
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });

  it("Part I fractional dollar amounts round correctly", () => {
    const result = calculateForm5695({
      solarElectricCost: "1", // $1 × 30% = $0.30 → rounds to $0
    });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);

    const result2 = calculateForm5695({
      solarElectricCost: "5", // $5 × 30% = $1.50 → rounds to $2
    });
    expect(result2.residentialCleanEnergyCredit.toNumber()).toBe(2);
  });

  it("Part II fractional dollar amounts round correctly under sub-limits", () => {
    const result = calculateForm5695({
      insulationCost: "3", // $3 × 30% = $0.90 → rounds to $1
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1);
  });

  it("only Part I costs provided produces zero Part II credit", () => {
    const result = calculateForm5695({
      solarElectricCost: "25000",
      batteryStorageCost: "10000",
    });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(10500);
    expect(result.totalImprovementCosts.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
  });

  it("only Part II costs provided produces zero Part I credit", () => {
    const result = calculateForm5695({
      insulationCost: "2000",
      energyPropertyCost: "3000",
      homeEnergyAuditCost: "400",
    });
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    // insulation: $2K × 30% = $600, energy property: $3K × 30% = $900, audit: $400 × 30% = $120
    expect(result.energyImprovementCredit.toNumber()).toBe(1620);
  });

  it("improvementCreditBeforeLimits reflects raw 30% before sub-limits", () => {
    const result = calculateForm5695({
      insulationCost: "10000",
      energyPropertyCost: "10000",
      homeEnergyAuditCost: "1000",
    });
    // Raw: ($10K + $10K + $1K) × 30% = $6,300
    expect(result.improvementCreditBeforeLimits.toNumber()).toBe(6300);
    // After sub-limits: min($3,000, $1,200) + min($3,000, $2,000) + min($300, $150) = $3,350 → capped at $3,200
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("geothermal heat pump standalone at 30% with no cap", () => {
    const result = calculateForm5695({
      geoThermalHeatPumpCost: "18000",
    });
    // $18K × 30% = $5,400
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(18000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(5400);
  });

  it("fuel cell standalone at 30% with no cap", () => {
    const result = calculateForm5695({
      fuelCellCost: "40000",
    });
    // $40K × 30% = $12,000
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(40000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(12000);
  });

  it("combined Part I and Part II both produce maximum credits independently", () => {
    const result = calculateForm5695({
      // Part I: large solar
      solarElectricCost: "50000",
      batteryStorageCost: "20000",
      // Part II: all sub-limits maxed
      insulationCost: "10000",
      energyPropertyCost: "10000",
      homeEnergyAuditCost: "1000",
    });
    // Part I: $70K × 30% = $21,000 (no cap)
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(21000);
    // Part II: general pool = min($1,200+$150, $1,200) = $1,200 + heat pump $2,000 = $3,200
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });
});

// ═══════════════════════════════════════════════════════════
// IRC §25C(b) — Audit credit within $1,200 general pool
// Per IRS: "$1,200 for energy efficient property costs...with limits on...home energy audits ($150)"
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part II — audit credit within $1,200 general pool (IRC §25C(b))", () => {
  it("insulation $1,140 + audit $150 — general pool capped at $1,200, not $1,290", () => {
    // insulationCost $3,800 × 30% = $1,140; audit $500 × 30% = $150
    // Per IRS: general pool = min($1,140 + $150, $1,200) = $1,200
    // Bug (old code): $1,140 + $150 = $1,290 (audit treated as independent)
    const result = calculateForm5695({
      insulationCost: "3800",
      homeEnergyAuditCost: "500",
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("insulation at $1,200 cap + audit $150 — general pool still $1,200, not $1,350", () => {
    // insulationCost $4,000 × 30% = $1,200; audit $500 × 30% = $150
    // Per IRS: general pool = min($1,200 + $150, $1,200) = $1,200
    const result = calculateForm5695({
      insulationCost: "4000",
      homeEnergyAuditCost: "500",
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("insulation $1,080 + audit $150 + heat pump $1,500 — general pool $1,200 not $1,230", () => {
    // insulationCost $3,600 × 30% = $1,080; audit $500 × 30% = $150
    // energyProperty $5,000 × 30% = $1,500
    // Per IRS: general = min($1,080 + $150, $1,200) = $1,200; total = $1,200 + $1,500 = $2,700
    // Bug (old code): $1,080 + $1,500 + $150 = $2,730
    const result = calculateForm5695({
      insulationCost: "3600",
      homeEnergyAuditCost: "500",
      energyPropertyCost: "5000",
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(2700);
  });

  it("audit-only stays under $1,200 general pool — no change needed", () => {
    // Audit alone: $500 × 30% = $150, well under $1,200
    const result = calculateForm5695({
      homeEnergyAuditCost: "500",
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════
// New Tests: Targeted Coverage for Specific Credit Types
// ═══════════════════════════════════════════════════════════

describe("Form 5695 Part I - solar water heating credit at 30%", () => {
  it("solar water heating standalone: 30% credit rate applied correctly", () => {
    const result = calculateForm5695({
      solarWaterHeatingCost: "8000",
    });
    // $8K × 30% = $2,400
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(8000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(2400);
  });

  it("solar water heating combined with solar electric: additive totals at 30%", () => {
    const result = calculateForm5695({
      solarElectricCost: "20000",
      solarWaterHeatingCost: "5000",
    });
    // $25K × 30% = $7,500
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(25000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(7500);
  });
});

describe("Form 5695 Part I - residential clean energy credit at exactly 30%", () => {
  it("credit is precisely 30% of total qualified clean energy costs", () => {
    const result = calculateForm5695({
      solarElectricCost: "40000",
      batteryStorageCost: "5000",
      geoThermalHeatPumpCost: "10000",
    });
    const expectedTotal = 55000;
    const expectedCredit = new Decimal(expectedTotal).times("0.30").toNumber();
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(expectedTotal);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(expectedCredit);
  });
});

describe("Form 5695 Part II - heat pump sub-cap at $2,000", () => {
  it("heat pump (energyProperty) cost of $7,000 yields credit capped at $2,000", () => {
    const result = calculateForm5695({
      energyPropertyCost: "7000", // 30% = $2,100 → capped at $2,000
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("heat pump cost just below cap ($6,666) yields uncapped credit of $1,999.80 → $2,000", () => {
    // $6,666 × 30% = $1,999.80 → rounds to $2,000
    const result = calculateForm5695({
      energyPropertyCost: "6666",
    });
    // rounds to $2,000
    expect(result.energyImprovementCredit.toNumber()).toBe(2000);
  });

  it("heat pump cost of $5,000 yields credit of $1,500 under $2,000 sub-cap", () => {
    const result = calculateForm5695({
      energyPropertyCost: "5000", // 30% = $1,500 — under sub-cap
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1500);
  });
});

describe("Form 5695 Part II - windows/doors/insulation $1,200 sub-cap", () => {
  it("insulation (windows/doors) cost of $5,000 yields credit capped at $1,200", () => {
    const result = calculateForm5695({
      insulationCost: "5000", // 30% = $1,500 → capped at $1,200
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
  });

  it("insulation cost of $2,000 yields credit of $600 under $1,200 sub-cap", () => {
    const result = calculateForm5695({
      insulationCost: "2000", // 30% = $600 — under sub-cap
    });
    expect(result.energyImprovementCredit.toNumber()).toBe(600);
  });
});

describe("Form 5695 - zero qualifying expenses produce zero credits", () => {
  it("zero solar electric expense produces zero clean energy credit", () => {
    const result = calculateForm5695({
      solarElectricCost: "0",
      solarWaterHeatingCost: "0",
      batteryStorageCost: "0",
    });
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
  });

  it("zero improvement expenses produce zero improvement credit", () => {
    const result = calculateForm5695({
      insulationCost: "0",
      energyPropertyCost: "0",
      homeEnergyAuditCost: "0",
    });
    expect(result.totalImprovementCosts.toNumber()).toBe(0);
    expect(result.improvementCreditBeforeLimits.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
  });
});

describe("Form 5695 Part I - very large solar installation over $100K", () => {
  it("$150K combined solar+battery installation yields $45K credit at 30% with no cap", () => {
    const result = calculateForm5695({
      solarElectricCost: "120000",
      batteryStorageCost: "30000",
    });
    expect(result.totalCleanEnergyCosts.toNumber()).toBe(150000);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(45000);
  });
});

describe("Form 5695 - combined residential + improvement credits", () => {
  it("Part I and Part II credits are both computed and independently correct", () => {
    const result = calculateForm5695({
      // Part I
      solarElectricCost: "30000",       // 30% = $9,000
      solarWaterHeatingCost: "5000",    // 30% = $1,500
      // Part II
      insulationCost: "3000",           // 30% = $900 (under $1,200)
      energyPropertyCost: "5000",       // 30% = $1,500 (under $2,000)
      homeEnergyAuditCost: "300",       // 30% = $90 (under $150)
    });
    // Part I: $35K × 30% = $10,500
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(10500);
    // Part II: $900 + $1,500 + $90 = $2,490 (under $3,200 cap)
    expect(result.energyImprovementCredit.toNumber()).toBe(2490);
  });
});

describe("Form 5695 - credit exceeds tax liability (nonrefundable limitation)", () => {
  it("massive clean energy credit cannot reduce income tax below zero via federal pipeline", () => {
    // $300K solar → $90K credit, far exceeding tax on modest wages
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "300000",
      },
    };
    const result = calculateFederalTax(fixture);
    // Nonrefundable credit: income tax floor is 0, total tax must be >= 0
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal(0))).toBe(true);
  });

  it("improvement credit capped by nonrefundable rule: total tax >= 0 even with $3,200 credit", () => {
    // Low income scenario — improvement credit may exceed income tax
    const lowIncomeFixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        insulationCost: "10000",    // → $1,200 after cap
        energyPropertyCost: "10000", // → $2,000 after cap
        homeEnergyAuditCost: "1000", // → $150 after cap
        // Total improvement credit: $3,200
      },
    };
    const result = calculateFederalTax(lowIncomeFixture);
    expect(result.totalTax.greaterThanOrEqualTo(new Decimal(0))).toBe(true);
  });
});

describe("Form 5695 - audit trail line value verification", () => {
  it("audit trail line 14 records the exact residential clean energy credit amount", () => {
    const result = calculateForm5695({
      solarElectricCost: "50000", // 30% = $15,000
    });
    const line14 = result.lines.find((l) => l.line === "14");
    expect(line14).toBeDefined();
    expect(line14!.value.toNumber()).toBe(15000);
  });

  it("audit trail line 30 records the exact energy improvement credit amount", () => {
    const result = calculateForm5695({
      insulationCost: "2000",       // 30% = $600
      energyPropertyCost: "3000",   // 30% = $900
    });
    const line30 = result.lines.find((l) => l.line === "30");
    expect(line30).toBeDefined();
    expect(line30!.value.toNumber()).toBe(1500);
  });

  it("audit trail line 24 records improvement credit before sub-limits are applied", () => {
    const result = calculateForm5695({
      insulationCost: "10000",      // total cost $10K
      energyPropertyCost: "10000",  // total cost $10K
    });
    const line24 = result.lines.find((l) => l.line === "24");
    expect(line24).toBeDefined();
    // Raw 30% before sub-limits: $20K × 30% = $6,000
    expect(line24!.value.toNumber()).toBe(6000);
  });

  it("audit trail line 1-6 records total clean energy costs before credit calculation", () => {
    const result = calculateForm5695({
      solarElectricCost: "20000",
      batteryStorageCost: "10000",
    });
    const line16 = result.lines.find((l) => l.line === "1-6");
    expect(line16).toBeDefined();
    expect(line16!.value.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal Pipeline Integration
// ═══════════════════════════════════════════════════════════

describe("Form 5695 - federal pipeline", () => {
  it("solar credit flows through to reduce total tax", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);

    const withSolar: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "20000",
      },
    };
    const solarResult = calculateFederalTax(withSolar);

    // $20K × 30% = $6K credit → should reduce tax
    expect(solarResult.totalTax.lessThan(baseResult.totalTax)).toBe(true);
  });

  it("energy improvement credit flows through Schedule 3", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        energyPropertyCost: "5000", // 30% = $1,500 → capped at sub-limit
      },
    };
    const result = calculateFederalTax(fixture);
    // Should see Form 5695 lines in audit trail
    const form5695Lines = result.allLines.filter((l) => l.form === "Form 5695");
    expect(form5695Lines.length).toBeGreaterThan(0);
  });

  it("combined Part I and Part II credits both reduce total tax", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);

    const withBoth: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "20000", // Part I: $6,000
        insulationCost: "3000", // Part II: $900
      },
    };
    const bothResult = calculateFederalTax(withBoth);

    // Both credits should reduce tax by more than either alone
    const withSolarOnly: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "20000",
      },
    };
    const solarOnlyResult = calculateFederalTax(withSolarOnly);

    expect(bothResult.totalTax.lessThan(baseResult.totalTax)).toBe(true);
    expect(bothResult.totalTax.lessThan(solarOnlyResult.totalTax)).toBe(true);
  });

  it("nonrefundable credits cannot reduce income tax below zero", () => {
    // Use a very large solar installation that would generate credits exceeding tax
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      energyCredits: {
        solarElectricCost: "500000", // $150K credit — far exceeds tax on $85K wages
      },
    };
    const result = calculateFederalTax(fixture);
    // totalTax includes additional taxes (SE, NIIT etc.) but tax after credits floor at 0
    // The total tax should not go negative
    expect(result.totalTax.greaterThanOrEqualTo(0)).toBe(true);
  });
});
