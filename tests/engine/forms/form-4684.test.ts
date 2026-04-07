/**
 * Form 4684 — Casualties and Thefts, Section A (Personal Use Property)
 * Spec: spec/federal/form-4684.yaml
 *
 * Tests the per-property loss/gain computation, per-event $100 floor,
 * aggregate loss/gain netting, and 10% AGI threshold for personal
 * casualty and theft losses under IRC §165(h).
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4684 } from "@/engine/forms/form-4684.js";
import type { Form4684Input } from "@/models/inputs.js";

function d(v: number | string): Decimal {
  return new Decimal(v);
}

function makeInput(events: Form4684Input["events"]): Form4684Input {
  return { events };
}

// ── Per-Property Calculations ──────────────────────────────────────

describe("Form 4684 per-property calculations", () => {
  it("Form 4684 per-property - loss is smaller of basis or FMV decrease", () => {
    // Basis $20,000, FMV drop $15,000, no insurance → loss = $15,000 (FMV decrease < basis)
    const result = calculateForm4684(
      makeInput([{
        description: "Hurricane",
        femaDeclarationNumber: "DR-4000",
        properties: [{
          description: "Fence",
          costOrBasis: "20000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "25000",
          fairMarketValueAfter: "10000",
        }],
      }]),
      d(100000)
    );
    // FMV decrease = 15000, min(20000, 15000) = 15000, minus insurance 0 = 15000
    // After $100 floor: 14900
    // After 10% AGI ($10,000): $4,900
    expect(result.deductibleLoss.toNumber()).toBe(4900);
  });

  it("Form 4684 per-property - basis limits loss when FMV decrease is larger", () => {
    // Basis $5,000, FMV drop $20,000 → loss capped at $5,000
    const result = calculateForm4684(
      makeInput([{
        description: "Tornado",
        femaDeclarationNumber: "DR-4001",
        properties: [{
          description: "Car",
          costOrBasis: "5000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "30000",
          fairMarketValueAfter: "10000",
        }],
      }]),
      d(30000)
    );
    // FMV decrease = 20000, min(5000, 20000) = 5000, minus insurance 0 = 5000
    // After $100 floor: 4900
    // After 10% AGI ($3,000): $1,900
    expect(result.deductibleLoss.toNumber()).toBe(1900);
  });

  it("Form 4684 per-property - insurance reduces loss", () => {
    // Basis $10,000, FMV drop $10,000, insurance $6,000 → net loss $4,000
    const result = calculateForm4684(
      makeInput([{
        description: "Flood",
        femaDeclarationNumber: "DR-4002",
        properties: [{
          description: "Basement contents",
          costOrBasis: "10000",
          insuranceReimbursement: "6000",
          fairMarketValueBefore: "10000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(20000)
    );
    // min(10000, 10000) = 10000, minus 6000 = 4000
    // After $100: 3900
    // After 10% AGI ($2000): $1,900
    expect(result.deductibleLoss.toNumber()).toBe(1900);
  });

  it("Form 4684 per-property - gain when insurance exceeds basis", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Fire",
        femaDeclarationNumber: "DR-4003",
        properties: [{
          description: "Jewelry",
          costOrBasis: "5000",
          insuranceReimbursement: "8000",
          fairMarketValueBefore: "12000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    );
    // Insurance $8,000 > basis $5,000 → gain of $3,000
    // Net loss for this property = 0 (insurance covers more than basis)
    expect(result.totalGains.toNumber()).toBe(3000);
    expect(result.totalLosses.toNumber()).toBe(0);
  });

  it("Form 4684 per-property - net loss floors at zero", () => {
    // Insurance exactly equals loss basis → net loss is 0
    const result = calculateForm4684(
      makeInput([{
        description: "Storm",
        femaDeclarationNumber: "DR-4004",
        properties: [{
          description: "Roof",
          costOrBasis: "15000",
          insuranceReimbursement: "15000",
          fairMarketValueBefore: "15000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    );
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.totalGains.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── Per-Event $100 Floor ───────────────────────────────────────────

describe("Form 4684 per-event $100 floor", () => {
  it("Form 4684 input guardrail - missing FEMA declaration number throws in the supported 2025 personal-loss slice", () => {
    expect(() => calculateForm4684(
      makeInput([{
        description: "Undeclared local storm",
        properties: [{
          description: "Fence",
          costOrBasis: "2000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "2000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    )).toThrow(/FEMA declaration number/i);
  });

  it("Form 4684 per-event - $100 floor subtracted from aggregate loss", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Wildfire",
        femaDeclarationNumber: "DR-4005",
        properties: [{
          description: "Shed",
          costOrBasis: "3000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "3000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(10000)
    );
    // Property loss: min(3000, 3000) - 0 = 3000
    // After $100 floor: 2900
    // After 10% AGI ($1000): 1900
    expect(result.totalLosses.toNumber()).toBe(2900);
    expect(result.deductibleLoss.toNumber()).toBe(1900);
  });

  it("Form 4684 per-event - $100 floor applies per event not per property", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Hurricane",
        femaDeclarationNumber: "DR-4006",
        properties: [
          {
            description: "Fence",
            costOrBasis: "2000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "2000",
            fairMarketValueAfter: "0",
          },
          {
            description: "Shed",
            costOrBasis: "3000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "3000",
            fairMarketValueAfter: "0",
          },
        ],
      }]),
      d(0)
    );
    // Property losses: 2000 + 3000 = 5000
    // One event → one $100 floor: 5000 - 100 = 4900
    expect(result.totalLosses.toNumber()).toBe(4900);
  });

  it("Form 4684 per-event - multiple events each get their own $100 floor", () => {
    const result = calculateForm4684(
      makeInput([
        {
          description: "Hurricane",
          femaDeclarationNumber: "DR-4007",
          properties: [{
            description: "Fence",
            costOrBasis: "2000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "2000",
            fairMarketValueAfter: "0",
          }],
        },
        {
          description: "Tornado",
          femaDeclarationNumber: "DR-4008",
          properties: [{
            description: "Car",
            costOrBasis: "3000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "3000",
            fairMarketValueAfter: "0",
          }],
        },
      ]),
      d(0)
    );
    // Event 1: 2000 - 100 = 1900
    // Event 2: 3000 - 100 = 2900
    // Total: 4800 (vs 4900 if single event)
    expect(result.totalLosses.toNumber()).toBe(4800);
  });

  it("Form 4684 per-event - $100 floor eliminates small losses", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Hail",
        femaDeclarationNumber: "DR-4009",
        properties: [{
          description: "Mailbox",
          costOrBasis: "80",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "80",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    );
    // Loss 80 - $100 floor = 0 (floored)
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── Aggregate Calculations ─────────────────────────────────────────

describe("Form 4684 aggregate calculations", () => {
  it("Form 4684 aggregate - total losses summed across events", () => {
    const result = calculateForm4684(
      makeInput([
        {
          description: "Flood",
          femaDeclarationNumber: "DR-4010",
          properties: [{
            costOrBasis: "10000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "10000",
            fairMarketValueAfter: "0",
          }],
        },
        {
          description: "Fire",
          femaDeclarationNumber: "DR-4011",
          properties: [{
            costOrBasis: "5000",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "5000",
            fairMarketValueAfter: "0",
          }],
        },
      ]),
      d(0)
    );
    // Event 1: 10000 - 100 = 9900
    // Event 2: 5000 - 100 = 4900
    // Total losses: 14800
    expect(result.totalLosses.toNumber()).toBe(14800);
  });

  it("Form 4684 aggregate - gains offset losses", () => {
    const result = calculateForm4684(
      makeInput([
        {
          description: "Storm",
          femaDeclarationNumber: "DR-4012",
          properties: [
            {
              description: "Damaged house",
              costOrBasis: "200000",
              insuranceReimbursement: "50000",
              fairMarketValueBefore: "300000",
              fairMarketValueAfter: "150000",
            },
            {
              description: "Over-insured car",
              costOrBasis: "10000",
              insuranceReimbursement: "15000",
              fairMarketValueBefore: "12000",
              fairMarketValueAfter: "0",
            },
          ],
        },
      ]),
      d(100000)
    );
    // House: FMV decrease = 150000, min(200000, 150000) = 150000, minus 50000 = 100000
    // Car: insurance 15000 > basis 10000 → gain = 5000, net loss = 0
    // Event losses: 100000 - 100 = 99900
    // Total gains: 5000
    // Net: 99900 - 5000 = 94900
    // 10% AGI: 10000
    // Deductible: 94900 - 10000 = 84900
    expect(result.totalLosses.toNumber()).toBe(99900);
    expect(result.totalGains.toNumber()).toBe(5000);
    expect(result.deductibleLoss.toNumber()).toBe(84900);
  });

  it("Form 4684 aggregate - net gain when gains exceed losses", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Fire",
        femaDeclarationNumber: "DR-4013",
        properties: [
          {
            description: "Old shed (over-insured)",
            costOrBasis: "1000",
            insuranceReimbursement: "10000",
            fairMarketValueBefore: "5000",
            fairMarketValueAfter: "0",
          },
          {
            description: "Fence",
            costOrBasis: "500",
            insuranceReimbursement: "0",
            fairMarketValueBefore: "500",
            fairMarketValueAfter: "0",
          },
        ],
      }]),
      d(50000)
    );
    // Shed: insurance 10000 > basis 1000 → gain 9000, net loss 0
    // Fence: loss 500
    // Event losses: 500 - 100 = 400
    // Total gains: 9000
    // Gains > losses → net gain = 9000 - 400 = 8600
    expect(result.netCasualtyGain.toNumber()).toBe(8600);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 aggregate - 10% AGI threshold applied", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Earthquake",
        femaDeclarationNumber: "DR-4014",
        properties: [{
          costOrBasis: "50000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "50000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(200000)
    );
    // Loss: 50000 - 100 = 49900
    // 10% AGI: 20000
    // Deductible: 49900 - 20000 = 29900
    expect(result.tenPercentAgi.toNumber()).toBe(20000);
    expect(result.deductibleLoss.toNumber()).toBe(29900);
  });

  it("Form 4684 aggregate - 10% AGI eliminates small losses", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Flood",
        femaDeclarationNumber: "DR-4015",
        properties: [{
          costOrBasis: "5000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "5000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(100000)
    );
    // Loss: 5000 - 100 = 4900
    // 10% AGI: 10000
    // 4900 - 10000 = negative → 0
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 aggregate - deductible loss flows to Schedule A Line 15", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Hurricane",
        femaDeclarationNumber: "DR-4016",
        properties: [{
          costOrBasis: "100000",
          insuranceReimbursement: "20000",
          fairMarketValueBefore: "100000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    );
    // Loss: min(100000, 100000) - 20000 = 80000
    // After $100: 79900
    // 10% AGI: 5000
    // Deductible: 74900
    expect(result.deductibleLoss.toNumber()).toBe(74900);
  });

  it("Form 4684 aggregate - net loss before 10% AGI threshold", () => {
    const result = calculateForm4684(
      makeInput([
        {
          description: "Wildfire",
          femaDeclarationNumber: "DR-4017",
          properties: [{
            costOrBasis: "30000",
            insuranceReimbursement: "5000",
            fairMarketValueBefore: "30000",
            fairMarketValueAfter: "0",
          }],
        },
        {
          description: "Flood",
          femaDeclarationNumber: "DR-4018",
          properties: [{
            costOrBasis: "2000",
            insuranceReimbursement: "500",
            fairMarketValueBefore: "3000",
            fairMarketValueAfter: "1000",
          }],
        },
      ]),
      d(80000)
    );
    // Event 1: loss = min(30000, 30000) - 5000 = 25000, after $100 = 24900
    // Event 2: FMV decrease = 2000, min(2000, 2000) - 500 = 1500, after $100 = 1400
    // Total losses: 26300
    // Net loss (no gains): 26300
    // 10% AGI: 8000
    // Deductible: 18300
    expect(result.netLossBeforeAgi.toNumber()).toBe(26300);
    expect(result.deductibleLoss.toNumber()).toBe(18300);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────

describe("Form 4684 edge cases", () => {
  it("Form 4684 - empty events produces zero", () => {
    const result = calculateForm4684(makeInput([]), d(100000));
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.totalGains.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - event with no properties produces zero", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Empty event",
        femaDeclarationNumber: "DR-4019",
        properties: [],
      }]),
      d(50000)
    );
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - zero AGI means no 10% threshold reduction", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Storm",
        femaDeclarationNumber: "DR-4020",
        properties: [{
          costOrBasis: "5000",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "5000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(0)
    );
    // Loss: 5000 - 100 = 4900
    // 10% of 0 = 0
    // Deductible: 4900
    expect(result.deductibleLoss.toNumber()).toBe(4900);
  });

  it("Form 4684 - mixed gain and loss properties in same event", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Tornado",
        femaDeclarationNumber: "DR-4021",
        properties: [
          {
            description: "House (loss)",
            costOrBasis: "150000",
            insuranceReimbursement: "100000",
            fairMarketValueBefore: "200000",
            fairMarketValueAfter: "50000",
          },
          {
            description: "Classic car (gain)",
            costOrBasis: "20000",
            insuranceReimbursement: "35000",
            fairMarketValueBefore: "40000",
            fairMarketValueAfter: "0",
          },
        ],
      }]),
      d(100000)
    );
    // House: FMV decrease = 150000, min(150000, 150000) = 150000, minus 100000 = 50000
    // Car: insurance 35000 > basis 20000 → gain = 15000, net loss = 0
    // Event losses: 50000, after $100 = 49900
    // Total gains: 15000
    // Net: 49900 - 15000 = 34900
    // 10% AGI: 10000
    // Deductible: 24900
    expect(result.totalLosses.toNumber()).toBe(49900);
    expect(result.totalGains.toNumber()).toBe(15000);
    expect(result.deductibleLoss.toNumber()).toBe(24900);
  });

  it("Form 4684 - property with insurance exactly equal to loss", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Hail",
        femaDeclarationNumber: "DR-4022",
        properties: [{
          costOrBasis: "10000",
          insuranceReimbursement: "10000",
          fairMarketValueBefore: "15000",
          fairMarketValueAfter: "5000",
        }],
      }]),
      d(50000)
    );
    // FMV decrease = 10000, min(10000, 10000) = 10000, minus 10000 = 0
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - penny-accurate on fractional amounts", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Flood",
        femaDeclarationNumber: "DR-4023",
        properties: [{
          costOrBasis: "1234.56",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "1234.56",
          fairMarketValueAfter: "0",
        }],
      }]),
      d("5000.50")
    );
    // Loss: 1234.56 - 100 = 1134.56
    // 10% AGI: 500.05
    // Deductible: 1134.56 - 500.05 = 634.51
    expect(result.deductibleLoss.toNumber()).toBe(634.51);
  });

  it("Form 4684 - audit trail includes line-level detail", () => {
    const result = calculateForm4684(
      makeInput([{
        description: "Hurricane",
        femaDeclarationNumber: "DR-4024",
        properties: [{
          costOrBasis: "10000",
          insuranceReimbursement: "2000",
          fairMarketValueBefore: "10000",
          fairMarketValueAfter: "0",
        }],
      }]),
      d(50000)
    );
    expect(result.lines.length).toBeGreaterThan(0);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("13");
    expect(lineNumbers).toContain("14");
    expect(lineNumbers).toContain("20");
  });
});
