/**
 * Form 4684 — Casualties and Thefts: Edge Case Tests
 * Spec: spec/federal/form-4684.yaml
 *
 * Tests boundary conditions for the $100 per-event floor (IRC §165(h)(1)),
 * 10% AGI threshold (IRC §165(h)(2)(A)), gain/loss netting, and
 * property-level loss computations.
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

function singleProperty(
  overrides: {
    costOrBasis?: string;
    insuranceReimbursement?: string;
    fairMarketValueBefore?: string;
    fairMarketValueAfter?: string;
  } = {}
) {
  return {
    description: "Test property",
    costOrBasis: overrides.costOrBasis ?? "10000",
    insuranceReimbursement: overrides.insuranceReimbursement ?? "0",
    fairMarketValueBefore: overrides.fairMarketValueBefore ?? "10000",
    fairMarketValueAfter: overrides.fairMarketValueAfter ?? "0",
  };
}

function singleEvent(
  properties: ReturnType<typeof singleProperty>[],
  fema = "DR-9000"
) {
  return {
    description: "Test event",
    femaDeclarationNumber: fema,
    properties,
  };
}

// ── $100 Per-Event Floor Boundary ─────────────────────────────────

describe("Form 4684 $100 floor boundary", () => {
  it("Form 4684 - event loss exactly $100 yields $0 after floor", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "100",
        fairMarketValueBefore: "100",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    // Loss = 100, floor = 100, net = 0
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - event loss exactly $101 yields $1 after floor", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "101",
        fairMarketValueBefore: "101",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    // Loss = 101, floor = 100, net = 1
    expect(result.totalLosses.toNumber()).toBe(1);
    expect(result.deductibleLoss.toNumber()).toBe(1);
  });

  it("Form 4684 - event loss exactly $99 yields $0 after floor", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "99",
        fairMarketValueBefore: "99",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - three events each with exactly $100 loss yield $0 total", () => {
    const events = [
      singleEvent([singleProperty({ costOrBasis: "100", fairMarketValueBefore: "100", fairMarketValueAfter: "0" })], "DR-9001"),
      singleEvent([singleProperty({ costOrBasis: "100", fairMarketValueBefore: "100", fairMarketValueAfter: "0" })], "DR-9002"),
      singleEvent([singleProperty({ costOrBasis: "100", fairMarketValueBefore: "100", fairMarketValueAfter: "0" })], "DR-9003"),
    ];
    const result = calculateForm4684(makeInput(events), d(0));
    expect(result.totalLosses.toNumber()).toBe(0);
  });
});

// ── 10% AGI Threshold Boundary ────────────────────────────────────

describe("Form 4684 10% AGI threshold boundary", () => {
  it("Form 4684 - 10% AGI exactly equals net loss yields $0 deductible", () => {
    // Net loss after $100 floor = 4900 (5000 - 100)
    // Need 10% AGI = 4900, so AGI = 49000
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "5000",
        fairMarketValueBefore: "5000",
        fairMarketValueAfter: "0",
      })])]),
      d(49000)
    );
    expect(result.totalLosses.toNumber()).toBe(4900);
    expect(result.tenPercentAgi.toNumber()).toBe(4900);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - 10% AGI is $1 less than net loss yields $1 deductible", () => {
    // Net loss after $100 floor = 4900
    // Need 10% AGI = 4899, so AGI = 48990
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "5000",
        fairMarketValueBefore: "5000",
        fairMarketValueAfter: "0",
      })])]),
      d(48990)
    );
    expect(result.totalLosses.toNumber()).toBe(4900);
    expect(result.tenPercentAgi.toNumber()).toBe(4899);
    expect(result.deductibleLoss.toNumber()).toBe(1);
  });

  it("Form 4684 - 10% AGI is $1 more than net loss yields $0 deductible", () => {
    // Net loss after $100 floor = 4900
    // Need 10% AGI = 4901, so AGI = 49010
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "5000",
        fairMarketValueBefore: "5000",
        fairMarketValueAfter: "0",
      })])]),
      d(49010)
    );
    expect(result.totalLosses.toNumber()).toBe(4900);
    expect(result.tenPercentAgi.toNumber()).toBe(4901);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - very high AGI ($10M) eliminates $100K casualty loss", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "100000",
        fairMarketValueBefore: "100000",
        fairMarketValueAfter: "0",
      })])]),
      d(10000000)
    );
    // Net loss = 99900, 10% of $10M = $1,000,000
    expect(result.totalLosses.toNumber()).toBe(99900);
    expect(result.tenPercentAgi.toNumber()).toBe(1000000);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── Gain/Loss Netting Boundaries ──────────────────────────────────

describe("Form 4684 gain/loss netting boundary", () => {
  it("Form 4684 - gains exactly equal losses yields net $0 (no gain, no deductible loss)", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([
        // Property with gain
        singleProperty({
          costOrBasis: "5000",
          insuranceReimbursement: "10000",
          fairMarketValueBefore: "5000",
          fairMarketValueAfter: "0",
        }),
        // Property with loss to match after $100 floor
        // Need loss after floor = gain = 5000, so raw event loss = 5100
        singleProperty({
          costOrBasis: "5100",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "5100",
          fairMarketValueAfter: "0",
        }),
      ])]),
      d(50000)
    );
    // Gain = 5000 (insurance 10000 - basis 5000)
    // Event loss: 5100, after $100 floor: 5000
    // Gains equal losses → goes to net gain path since gains > losses is false, losses > gains is false
    // Actually gains (5000) is NOT > losses (5000), so it goes to the else branch
    expect(result.totalGains.toNumber()).toBe(5000);
    expect(result.totalLosses.toNumber()).toBe(5000);
    expect(result.netCasualtyGain.toNumber()).toBe(0);
    expect(result.netLossBeforeAgi.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - gains exceed losses by $1 produces net casualty gain of $1", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([
        singleProperty({
          costOrBasis: "5000",
          insuranceReimbursement: "10001",
          fairMarketValueBefore: "5000",
          fairMarketValueAfter: "0",
        }),
        singleProperty({
          costOrBasis: "5100",
          insuranceReimbursement: "0",
          fairMarketValueBefore: "5100",
          fairMarketValueAfter: "0",
        }),
      ])]),
      d(50000)
    );
    // Gain = 5001, losses after $100 floor = 5000
    // Gains > losses → net casualty gain = 1
    expect(result.totalGains.toNumber()).toBe(5001);
    expect(result.totalLosses.toNumber()).toBe(5000);
    expect(result.netCasualtyGain.toNumber()).toBe(1);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── Property-Level Edge Cases ─────────────────────────────────────

describe("Form 4684 property-level boundaries", () => {
  it("Form 4684 - property with zero FMV decrease yields zero loss", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "50000",
        fairMarketValueBefore: "50000",
        fairMarketValueAfter: "50000",
      })])]),
      d(100000)
    );
    // FMV decrease = 0, min(50000, 0) = 0, loss = 0
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });

  it("Form 4684 - property with zero basis yields zero loss regardless of FMV drop", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "0",
        fairMarketValueBefore: "50000",
        fairMarketValueAfter: "0",
      })])]),
      d(100000)
    );
    // FMV decrease = 50000, min(0, 50000) = 0, loss = 0
    expect(result.totalLosses.toNumber()).toBe(0);
  });

  it("Form 4684 - insurance exactly $1 below basis yields no gain and reduced loss", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "10000",
        insuranceReimbursement: "9999",
        fairMarketValueBefore: "10000",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    // Loss = min(10000, 10000) - 9999 = 1
    // After $100 floor: 0 (1 < 100)
    expect(result.totalGains.toNumber()).toBe(0);
    expect(result.totalLosses.toNumber()).toBe(0);
  });

  it("Form 4684 - insurance exactly $1 above basis yields $1 gain and zero loss", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "10000",
        insuranceReimbursement: "10001",
        fairMarketValueBefore: "10000",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    expect(result.totalGains.toNumber()).toBe(1);
    expect(result.totalLosses.toNumber()).toBe(0);
  });

  it("Form 4684 - FMV decrease smaller than basis limits loss to FMV decrease", () => {
    // Basis = 50000, FMV drop = 20000 → loss limited to 20000 (the smaller value)
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "50000",
        fairMarketValueBefore: "50000",
        fairMarketValueAfter: "30000",
      })])]),
      d(0)
    );
    // Loss = min(50000, 20000) - 0 = 20000, after $100 floor = 19900
    expect(result.totalLosses.toNumber()).toBe(19900);
    expect(result.deductibleLoss.toNumber()).toBe(19900);
  });

  it("Form 4684 - insurance exactly equals loss base yields zero loss and zero gain", () => {
    // Basis = 10000, FMV drop = 10000, insurance = 10000
    // Loss base = min(10000, 10000) = 10000, net loss = 10000 - 10000 = 0
    // Gain = max(0, 10000 - 10000) = 0
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "10000",
        insuranceReimbursement: "10000",
        fairMarketValueBefore: "10000",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    expect(result.totalGains.toNumber()).toBe(0);
    expect(result.totalLosses.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── Multi-Property / Multi-Event Interactions ────────────────────

describe("Form 4684 multi-property and multi-event interactions", () => {
  it("Form 4684 - two properties in one event: one gain, one loss, net after $100 floor", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([
        // Property 1: gain of $2000 (insurance $12000 > basis $10000)
        singleProperty({
          costOrBasis: "10000",
          insuranceReimbursement: "12000",
          fairMarketValueBefore: "10000",
          fairMarketValueAfter: "0",
        }),
        // Property 2: loss of $8000 (basis $8000, no insurance)
        singleProperty({
          costOrBasis: "8000",
          fairMarketValueBefore: "8000",
          fairMarketValueAfter: "0",
        }),
      ])]),
      d(0)
    );
    // Gain from P1 = 2000, Loss from P2 = 8000
    // Event loss = 8000, after $100 floor = 7900
    // Net: losses (7900) > gains (2000) → netLossBeforeAgi = 5900
    expect(result.totalGains.toNumber()).toBe(2000);
    expect(result.totalLosses.toNumber()).toBe(7900);
    expect(result.netLossBeforeAgi.toNumber()).toBe(5900);
    expect(result.deductibleLoss.toNumber()).toBe(5900);
  });

  it("Form 4684 - three events: two below $100 floor, one above, only one contributes", () => {
    const events = [
      singleEvent([singleProperty({ costOrBasis: "50", fairMarketValueBefore: "50", fairMarketValueAfter: "0" })], "DR-9001"),
      singleEvent([singleProperty({ costOrBasis: "99", fairMarketValueBefore: "99", fairMarketValueAfter: "0" })], "DR-9002"),
      singleEvent([singleProperty({ costOrBasis: "500", fairMarketValueBefore: "500", fairMarketValueAfter: "0" })], "DR-9003"),
    ];
    const result = calculateForm4684(makeInput(events), d(0));
    // Event 1: 50 - 100 = 0, Event 2: 99 - 100 = 0, Event 3: 500 - 100 = 400
    expect(result.totalLosses.toNumber()).toBe(400);
    expect(result.deductibleLoss.toNumber()).toBe(400);
  });

  it("Form 4684 - multiple properties summing to exactly $100 in one event yields $0", () => {
    // Three properties with losses of $40, $30, $30 = $100 total
    const result = calculateForm4684(
      makeInput([singleEvent([
        singleProperty({ costOrBasis: "40", fairMarketValueBefore: "40", fairMarketValueAfter: "0" }),
        singleProperty({ costOrBasis: "30", fairMarketValueBefore: "30", fairMarketValueAfter: "0" }),
        singleProperty({ costOrBasis: "30", fairMarketValueBefore: "30", fairMarketValueAfter: "0" }),
      ])]),
      d(0)
    );
    // Aggregate event loss = 100, after $100 floor = 0
    expect(result.totalLosses.toNumber()).toBe(0);
  });

  it("Form 4684 - multiple properties summing to $101 in one event yields $1", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([
        singleProperty({ costOrBasis: "51", fairMarketValueBefore: "51", fairMarketValueAfter: "0" }),
        singleProperty({ costOrBasis: "50", fairMarketValueBefore: "50", fairMarketValueAfter: "0" }),
      ])]),
      d(0)
    );
    // Event loss = 101, after $100 floor = 1
    expect(result.totalLosses.toNumber()).toBe(1);
    expect(result.deductibleLoss.toNumber()).toBe(1);
  });
});

// ── AGI Threshold Precision ──────────────────────────────────────

describe("Form 4684 AGI threshold precision", () => {
  it("Form 4684 - AGI producing recurring decimal 10% (e.g., AGI $33333 → 10% = $3333.3)", () => {
    // Loss = 10000, after $100 floor = 9900
    // 10% of $33333 = $3333.3
    // Deductible = 9900 - 3333.3 = 6566.7
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "10000",
        fairMarketValueBefore: "10000",
        fairMarketValueAfter: "0",
      })])]),
      d(33333)
    );
    expect(result.tenPercentAgi.toNumber()).toBe(3333.3);
    expect(result.deductibleLoss.toNumber()).toBe(6566.7);
  });

  it("Form 4684 - zero AGI means no 10% threshold reduction", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "5000",
        fairMarketValueBefore: "5000",
        fairMarketValueAfter: "0",
      })])]),
      d(0)
    );
    // Loss = 5000, after $100 floor = 4900, 10% of 0 = 0
    expect(result.tenPercentAgi.toNumber()).toBe(0);
    expect(result.deductibleLoss.toNumber()).toBe(4900);
  });

  it("Form 4684 - very low AGI ($10) with large loss produces nearly full deduction", () => {
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "50000",
        fairMarketValueBefore: "50000",
        fairMarketValueAfter: "0",
      })])]),
      d(10)
    );
    // Loss = 50000, after $100 floor = 49900, 10% of $10 = $1
    expect(result.tenPercentAgi.toNumber()).toBe(1);
    expect(result.deductibleLoss.toNumber()).toBe(49899);
  });

  it("Form 4684 - $100 floor and 10% AGI together exactly eliminate deduction", () => {
    // Want: loss after $100 floor = 10% of AGI exactly
    // Property loss = $600, after $100 floor = $500
    // Need 10% AGI = $500, so AGI = $5000
    const result = calculateForm4684(
      makeInput([singleEvent([singleProperty({
        costOrBasis: "600",
        fairMarketValueBefore: "600",
        fairMarketValueAfter: "0",
      })])]),
      d(5000)
    );
    expect(result.totalLosses.toNumber()).toBe(500);
    expect(result.tenPercentAgi.toNumber()).toBe(500);
    expect(result.deductibleLoss.toNumber()).toBe(0);
  });
});

// ── FEMA Declaration Validation ──────────────────────────────────

describe("Form 4684 FEMA declaration validation", () => {
  it("Form 4684 - missing FEMA declaration number throws error", () => {
    expect(() =>
      calculateForm4684(
        makeInput([{
          description: "Storm damage",
          femaDeclarationNumber: "",
          properties: [singleProperty()],
        }]),
        d(50000)
      )
    ).toThrow(/FEMA declaration number/);
  });

  it("Form 4684 - whitespace-only FEMA declaration number throws error", () => {
    expect(() =>
      calculateForm4684(
        makeInput([{
          description: "Flood damage",
          femaDeclarationNumber: "   ",
          properties: [singleProperty()],
        }]),
        d(50000)
      )
    ).toThrow(/FEMA declaration number/);
  });

  it("Form 4684 - multiple events with different FEMA numbers aggregate correctly", () => {
    const events = [
      singleEvent([singleProperty({ costOrBasis: "5000", fairMarketValueBefore: "5000", fairMarketValueAfter: "0" })], "DR-4001"),
      singleEvent([singleProperty({ costOrBasis: "3000", fairMarketValueBefore: "3000", fairMarketValueAfter: "0" })], "DR-4002"),
    ];
    const result = calculateForm4684(makeInput(events), d(0));
    // Event 1: 5000 - 100 = 4900, Event 2: 3000 - 100 = 2900
    expect(result.totalLosses.toNumber()).toBe(7800);
    expect(result.deductibleLoss.toNumber()).toBe(7800);
  });
});
