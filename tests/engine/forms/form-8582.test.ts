/**
 * Tests for Form 8582 — Passive Activity Loss Limitations
 * Spec: spec/federal/form-8582.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8582, type Form8582Input, type PassiveActivity } from "@/engine/forms/form-8582.js";

const d = (n: number | string) => new Decimal(n);

function makeActivity(
  name: string,
  income: number,
  loss: number,
  opts?: { isRentalRealEstate?: boolean; isActiveParticipant?: boolean }
): PassiveActivity {
  return {
    name,
    income: d(income),
    loss: d(loss),
    isRentalRealEstate: opts?.isRentalRealEstate ?? false,
    isActiveParticipant: opts?.isActiveParticipant ?? false,
  };
}

// ═══════════════════════════════════════════════════════════
// Basic Passive Activity Limitations
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - Basic Passive Limitations", () => {
  it("Form 8582 Line 1a - passive income", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 5000, 0), makeActivity("Fund B", 3000, 0)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.passiveIncome.toNumber()).toBe(8000);
  });

  it("Form 8582 Line 1b - passive losses", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 0, -4000), makeActivity("Fund B", 0, -6000)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.passiveLoss.toNumber()).toBe(-10000);
  });

  it("Form 8582 Line 1c - net passive", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 3000, 0), makeActivity("Fund B", 0, -8000)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.netPassive.toNumber()).toBe(-5000);
  });

  it("Form 8582 - no limitation when net passive is positive", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 10000, 0), makeActivity("Fund B", 0, -3000)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.combinedLoss.toNumber()).toBe(0);
  });

  it("Form 8582 Line 5 - combined losses", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 0, -15000)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.combinedLoss.toNumber()).toBe(-15000);
  });

  it("Form 8582 Line 9 - allowed loss equals passive income when no rental", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 5000, 0),
        makeActivity("Fund B", 0, -12000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.allowedLoss.toNumber()).toBe(5000);
  });

  it("Form 8582 Line 10 - suspended loss", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 2000, 0),
        makeActivity("Fund B", 0, -10000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.allowedLoss.toNumber()).toBe(2000);
    expect(result.suspendedLoss.toNumber()).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Real Estate Special Allowance
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - Rental Real Estate Allowance", () => {
  it("Form 8582 Line 3a - rental income", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 8000, 0, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalIncome.toNumber()).toBe(8000);
  });

  it("Form 8582 Line 3b - rental loss", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalLoss.toNumber()).toBe(-15000);
  });

  it("Form 8582 Line 3c - net rental", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental A", 5000, 0, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Rental B", 0, -12000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.netRental.toNumber()).toBe(-7000);
  });

  it("Form 8582 Line 7 - rental allowance under $100K AGI", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(20000); // $20K loss, under $25K cap
  });

  it("Form 8582 Line 7 - rental allowance capped at $25,000", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -40000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(25000);
  });

  it("Form 8582 Line 7 - rental allowance phased out at $120K AGI", () => {
    // Phase-out: 50% × ($120K - $100K) = $10,000 reduction
    // Allowance: $25,000 - $10,000 = $15,000
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(120000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(15000);
  });

  it("Form 8582 Line 7 - rental allowance fully phased out at $150K AGI", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(150000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(0);
  });

  it("Form 8582 Line 7 - MFS who lived with spouse gets $0 rental allowance (IRC §469(i)(4))", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(60000),
      filingStatus: "married_filing_separately",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(0);
  });

  it("Form 8582 - rental not active participant treated as regular passive", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental (not active)", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: false }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    // Not active = no special allowance, treated as regular passive
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.passiveLoss.toNumber()).toBe(-20000);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - Mixed Activities", () => {
  it("rental allowance plus passive income offset", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("K-1 Income", 10000, 0),
        makeActivity("K-1 Loss", 0, -25000),
        makeActivity("Rental Loss", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(90000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    // Passive income: $10K offsets passive losses
    // Rental allowance: min($25K, $15K loss) = $15K
    // Allowed: $10K + $15K = $25K
    // Total loss: $25K + $15K = $40K
    // Suspended: $40K - $25K = $15K
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(15000);
  });

  it("per-activity allocation of allowed loss", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 0, -6000),
        makeActivity("Fund B", 0, -4000),
        makeActivity("Income Fund", 5000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    // Allowed: $5K income. Loss: $10K. Suspended: $5K
    expect(result.allowedLoss.toNumber()).toBe(5000);
    // Fund A: 60% of loss → $3K allowed, $3K suspended
    // Fund B: 40% of loss → $2K allowed, $2K suspended
    const fundA = result.activityAllocations.find((a) => a.name === "Fund A");
    const fundB = result.activityAllocations.find((a) => a.name === "Fund B");
    expect(fundA?.allowedLoss.toNumber()).toBe(3000);
    expect(fundA?.suspendedLoss.toNumber()).toBe(3000);
    expect(fundB?.allowedLoss.toNumber()).toBe(2000);
    expect(fundB?.suspendedLoss.toNumber()).toBe(2000);
  });

  it("zero losses means no limitation", () => {
    const input: Form8582Input = {
      activities: [makeActivity("Fund A", 10000, 0)],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - audit trail", () => {
  it("produces complete audit trail", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund", 0, -10000),
        makeActivity("Rental", 0, -5000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(110000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("1b");
    expect(lineIds).toContain("1c");
    expect(lineIds).toContain("3a");
    expect(lineIds).toContain("3b");
    expect(lineIds).toContain("3c");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("9");
    expect(lineIds).toContain("10");
  });

  it("Form 8582 audit trail - all line IDs present for net passive income scenario", () => {
    // Even when no limitation is needed, all audit lines must still be recorded
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 20000, 0),
        makeActivity("Fund B", 0, -5000),
        makeActivity("Rental", 0, -3000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(90000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("1b");
    expect(lineIds).toContain("1c");
    expect(lineIds).toContain("3a");
    expect(lineIds).toContain("3b");
    expect(lineIds).toContain("3c");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("9");
    expect(lineIds).toContain("10");
  });
});

// ═══════════════════════════════════════════════════════════
// AGI Phase-Out Boundary Conditions
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI Phase-Out Boundaries", () => {
  it("Form 8582 Line 7 - AGI exactly $100K gets full $25K rental allowance", () => {
    // Phase-out: 50% × ($100K - $100K) = $0 reduction → full $25K allowance
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(100000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(25000);
  });

  it("Form 8582 Line 7 - AGI at $125K yields partial allowance of $12,500", () => {
    // Phase-out: 50% × ($125K - $100K) = $12,500 reduction
    // Allowance: $25,000 - $12,500 = $12,500
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(125000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(12500);
  });

  it("Form 8582 Line 7 - AGI at $150K yields zero rental allowance", () => {
    // Phase-out: 50% × ($150K - $100K) = $25,000 reduction → $0 allowance
    const input: Form8582Input = {
      activities: [
        makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(150000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    // Loss fully suspended since no allowance and no passive income
    expect(result.suspendedLoss.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - Additional Scenarios", () => {
  it("multiple activities some profitable some losing — net offset reduces suspended loss", () => {
    // Profitable passive: $8K income from Fund A
    // Losing passive: -$12K loss from Fund B, -$5K loss from Fund C
    // Total passive income: $8K offsets $8K of the $17K loss
    // No rental activities → rentalAllowance = $0
    // Allowed: $8K, suspended: $17K - $8K = $9K
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 8000, 0),
        makeActivity("Fund B", 0, -12000),
        makeActivity("Fund C", 0, -5000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.passiveIncome.toNumber()).toBe(8000);
    expect(result.passiveLoss.toNumber()).toBe(-17000);
    expect(result.netPassive.toNumber()).toBe(-9000);
    expect(result.allowedLoss.toNumber()).toBe(8000);
    expect(result.suspendedLoss.toNumber()).toBe(9000);
  });

  it("non-rental passive activity receives no $25K special allowance", () => {
    // A K-1 loss from a partnership (not rental) cannot use the rental allowance.
    // With AGI $80K and $20K passive loss and no passive income, full $20K is suspended.
    const input: Form8582Input = {
      activities: [
        makeActivity("Partnership K-1", 0, -20000, { isRentalRealEstate: false, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });

  it("suspended loss tracking — per-activity suspended amounts are correctly computed", () => {
    // Three loss activities in proportion 50% / 30% / 20%
    // Total loss: $20K, passive income: $5K allowed
    // Suspended: $15K allocated proportionally
    const input: Form8582Input = {
      activities: [
        makeActivity("Income Fund", 5000, 0),
        makeActivity("Fund X", 0, -10000), // 50% of loss
        makeActivity("Fund Y", 0, -6000),  // 30% of loss
        makeActivity("Fund Z", 0, -4000),  // 20% of loss
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.allowedLoss.toNumber()).toBe(5000);
    expect(result.suspendedLoss.toNumber()).toBe(15000);

    const fundX = result.activityAllocations.find((a) => a.name === "Fund X");
    const fundY = result.activityAllocations.find((a) => a.name === "Fund Y");
    const fundZ = result.activityAllocations.find((a) => a.name === "Fund Z");
    // Fund X: 50% × $5K allowed = $2,500 allowed; $7,500 suspended
    expect(fundX?.allowedLoss.toNumber()).toBe(2500);
    expect(fundX?.suspendedLoss.toNumber()).toBe(7500);
    // Fund Y: 30% × $5K allowed = $1,500 allowed; $4,500 suspended
    expect(fundY?.allowedLoss.toNumber()).toBe(1500);
    expect(fundY?.suspendedLoss.toNumber()).toBe(4500);
    // Fund Z: 20% × $5K allowed = $1,000 allowed; $3,000 suspended
    expect(fundZ?.allowedLoss.toNumber()).toBe(1000);
    expect(fundZ?.suspendedLoss.toNumber()).toBe(3000);
  });

  it("net passive income — no limitation triggered, all losses offset by income", () => {
    // Passive income exceeds passive losses → combinedNet is positive → no suspension
    const input: Form8582Input = {
      activities: [
        makeActivity("Fund A", 15000, 0),
        makeActivity("Fund B", 0, -8000),
        makeActivity("Fund C", 0, -3000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);
    expect(result.netPassive.toNumber()).toBe(4000);
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    // No activity allocations when there is no net loss
    expect(result.activityAllocations).toHaveLength(0);
  });
});

describe("Form 8582 - additional edge cases", () => {
  it("zero activities — all fields zero", () => {
    const result = calculateForm8582({
      activities: [],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.passiveIncome.toNumber()).toBe(0);
    expect(result.passiveLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("single activity with net income — no loss to limit", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental A", 20000, -5000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.netRental.toNumber()).toBeGreaterThanOrEqual(0);
  });

  it("AGI at phase-out end $150K — zero allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(150000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(25000);
  });

  it("multiple activities — loss allocated proportionally", () => {
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental A", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Rental B", 0, -10000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    // Total loss $25K, allowance $25K — fully allowed
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("rental loss $26K at low AGI — $1K suspended (exceeds $25K max)", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -26000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(1000);
  });

  it("MFJ gets same $25K allowance as single", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "married_filing_jointly",
    });
    expect(result.rentalAllowance.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("HoH gets $25K allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(90000),
      filingStatus: "head_of_household",
    });
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// New Tests: Boundaries, Participation, Mixed, Prior Year, Audit
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI $100K exact boundary — full $25K allowance", () => {
  it("Form 8582 Line 7 - AGI exactly $100,002 triggers $1 phase-out reduction", () => {
    // Phase-out: 50% × ($100,002 - $100,000) = $1 reduction → $24,999
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(100002),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(24999);
  });

  it("Form 8582 Line 7 - AGI $149,999 yields $0 allowance due to ROUND_HALF_UP", () => {
    // Phase-out: 50% × ($149,999 - $100,000) = $24,999.50
    // ROUND_HALF_UP: $24,999.50 → $25,000 reduction → allowance = $25,000 - $25,000 = $0
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(149999),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
  });
});

describe("Form 8582 - Active vs non-active participation contrast", () => {
  it("active-participant rental gets $25K allowance; non-active gets none", () => {
    const activeResult = calculateForm8582({
      activities: [makeActivity("Rental Active", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
    });
    const nonActiveResult = calculateForm8582({
      activities: [makeActivity("Rental NonActive", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: false })],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(activeResult.rentalAllowance.toNumber()).toBe(20000);
    expect(activeResult.suspendedLoss.toNumber()).toBe(0);
    expect(nonActiveResult.rentalAllowance.toNumber()).toBe(0);
    expect(nonActiveResult.suspendedLoss.toNumber()).toBe(20000);
  });

  it("non-active rental loss goes into passiveLoss, not rentalLoss", () => {
    // A rental activity where isActiveParticipant=false is treated as a plain passive activity
    const result = calculateForm8582({
      activities: [makeActivity("Rental NonActive", 0, -12000, { isRentalRealEstate: true, isActiveParticipant: false })],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.passiveLoss.toNumber()).toBe(-12000);
    expect(result.rentalLoss.toNumber()).toBe(0);
    expect(result.rentalIncome.toNumber()).toBe(0);
  });
});

describe("Form 8582 - Multiple activities with mixed rental and passive income/loss", () => {
  it("rental income offsets non-rental passive loss — combined net positive means no suspension", () => {
    // Rental income: +$15,000 (active participant)
    // Non-rental passive loss: -$10,000
    // Combined net: +$5,000 → no limitation, no suspended loss
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental Income", 15000, 0, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("K-1 Loss", 0, -10000),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.rentalIncome.toNumber()).toBe(15000);
    expect(result.passiveLoss.toNumber()).toBe(-10000);
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("four mixed activities — rental loss + rental income + passive loss + passive income allocates proportionally", () => {
    // Rental A: income $5K, loss $0
    // Rental B: income $0, loss $-8K
    // K-1 Fund X: income $3K, loss $0
    // K-1 Fund Y: income $0, loss $-6K
    // Net rental: $5K - $8K = -$3K; net passive: $3K - $6K = -$3K; combined: -$6K
    // Rental allowance (AGI $80K, net rental loss $3K): min($25K, $3K) = $3K
    // Passive income offset = $5K + $3K = $8K
    // Allowed = min($8K + $3K, $14K) = min($11K, $14K) = $11K
    // Suspended = $14K - $11K = $3K
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental A", 5000, 0, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Rental B", 0, -8000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Fund X", 3000, 0),
        makeActivity("Fund Y", 0, -6000),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.rentalIncome.toNumber()).toBe(5000);
    expect(result.rentalLoss.toNumber()).toBe(-8000);
    expect(result.netRental.toNumber()).toBe(-3000);
    expect(result.passiveIncome.toNumber()).toBe(3000);
    expect(result.passiveLoss.toNumber()).toBe(-6000);
    expect(result.netPassive.toNumber()).toBe(-3000);
    expect(result.rentalAllowance.toNumber()).toBe(3000);
    expect(result.allowedLoss.toNumber()).toBe(11000);
    expect(result.suspendedLoss.toNumber()).toBe(3000);
  });
});

describe("Form 8582 - Zero rental activities (passive only)", () => {
  it("no rental activities means rentalIncome, rentalLoss, netRental, and rentalAllowance are all zero", () => {
    const result = calculateForm8582({
      activities: [
        makeActivity("Fund A", 2000, 0),
        makeActivity("Fund B", 0, -9000),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.rentalIncome.toNumber()).toBe(0);
    expect(result.rentalLoss.toNumber()).toBe(0);
    expect(result.netRental.toNumber()).toBe(0);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    // Only passive income offsets: $2K allowed, $7K suspended
    expect(result.allowedLoss.toNumber()).toBe(2000);
    expect(result.suspendedLoss.toNumber()).toBe(7000);
  });
});

describe("Form 8582 - MFS who lived with spouse — zero rental allowance regardless of AGI", () => {
  it("MFS who lived with spouse at any time gets $0 rental allowance even with AGI well below $100K", () => {
    // MFS filers who lived with spouse at any time never qualify for the rental allowance
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(15000);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("MFS who explicitly lived with spouse (flag false) gets $0 rental allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(40000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: false,
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Lived Apart — $12,500 Allowance (IRC §469(i)(4)(B))
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - MFS lived apart from spouse all year — $12,500 allowance (IRC §469(i)(4)(B))", () => {
  it("MFS lived apart gets $12,500 max rental allowance with MAGI below $50K", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(40000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(12500);
    expect(result.allowedLoss.toNumber()).toBe(12500);
    expect(result.suspendedLoss.toNumber()).toBe(7500);
  });

  it("MFS lived apart — rental loss below $12,500 cap gets full loss as allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -8000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(40000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(8000);
    expect(result.allowedLoss.toNumber()).toBe(8000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("MFS lived apart — MAGI exactly $50,000 gets full $12,500 allowance (no phase-out yet)", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(50000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(12500);
  });

  it("MFS lived apart — MAGI $60,000 yields $7,500 allowance after phase-out", () => {
    // Phase-out: 50% × ($60K - $50K) = $5,000 reduction
    // Allowance: $12,500 - $5,000 = $7,500
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(60000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(7500);
    expect(result.allowedLoss.toNumber()).toBe(7500);
    expect(result.suspendedLoss.toNumber()).toBe(12500);
  });

  it("MFS lived apart — MAGI $62,500 yields $6,250 allowance (midpoint phase-out)", () => {
    // Phase-out: 50% × ($62,500 - $50,000) = $6,250 reduction
    // Allowance: $12,500 - $6,250 = $6,250
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(62500),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(6250);
  });

  it("MFS lived apart — MAGI $75,000 fully phases out allowance to $0", () => {
    // Phase-out: 50% × ($75K - $50K) = $12,500 reduction → $0 allowance
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(75000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });

  it("MFS lived apart — MAGI above $75,000 still $0 allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(100000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
  });

  it("MFS lived apart — $50,002 MAGI triggers $1 phase-out reduction", () => {
    // Phase-out: 50% × ($50,002 - $50,000) = $1 → $12,499
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(50002),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(12499);
  });

  it("MFS lived apart — mixed rental and passive activities with $12,500 allowance", () => {
    // Rental (active): $15K loss, Non-rental: $8K loss, Passive income: $3K
    // Rental allowance: min($12,500, $15K net rental loss) = $12,500
    // Passive income offset: $3K
    // Allowed: $3K + $12,500 = $15,500
    // Total loss: $15K + $8K = $23K
    // Suspended: $23K - $15,500 = $7,500
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Fund", 3000, -8000),
      ],
      agi: d(40000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(12500);
    expect(result.allowedLoss.toNumber()).toBe(15500);
    expect(result.suspendedLoss.toNumber()).toBe(7500);
  });

  it("MFS lived apart — flag is ignored for non-MFS filing statuses", () => {
    // Single filer with the flag set should still get the normal $25K allowance
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -30000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
      mfsLivedApartFromSpouseAllYear: true,
    });
    expect(result.rentalAllowance.toNumber()).toBe(25000);
  });

  it("MFS lived apart — audit trail formula references IRC §469(i)(4)(B)", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(40000),
      filingStatus: "married_filing_separately",
      mfsLivedApartFromSpouseAllYear: true,
    });
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7?.formula).toContain("$12,500");
    expect(line7?.formula).toContain("§469(i)(4)(B)");
  });
});

describe("Form 8582 - Net passive income scenario (no limitation)", () => {
  it("rental income alone exceeds all losses — no limitation, activityAllocations empty", () => {
    // Rental income $30K, rental loss $5K, passive loss $10K
    // Net rental: +$25K, net passive: -$10K, combined: +$15K → no limitation
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental", 30000, -5000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("K-1 Fund", 0, -10000),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.netRental.toNumber()).toBe(25000);
    expect(result.netPassive.toNumber()).toBe(-10000);
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.activityAllocations).toHaveLength(0);
  });
});

describe("Form 8582 - Prior year suspended losses", () => {
  it("priorYearSuspendedLosses are added to a matching active-participant rental activity before the current-year limitation is computed", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
      priorYearSuspendedLosses: [{ name: "Rental", amount: new Decimal(10000) }],
    });

    expect(result.rentalLoss.toNumber()).toBe(-30000);
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);

    const rental = result.activityAllocations.find((a) => a.name === "Rental");
    expect(rental?.totalLoss.toNumber()).toBe(-30000);
    expect(rental?.allowedLoss.toNumber()).toBe(25000);
    expect(rental?.suspendedLoss.toNumber()).toBe(5000);
  });

  it("priorYearSuspendedLosses without a matching current-year activity stay in the non-rental passive bucket", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -10000, { isRentalRealEstate: true, isActiveParticipant: true })],
      agi: d(80000),
      filingStatus: "single",
      priorYearSuspendedLosses: [{ name: "Old Partnership", amount: new Decimal(6000) }],
    });

    expect(result.passiveLoss.toNumber()).toBe(-6000);
    expect(result.rentalLoss.toNumber()).toBe(-10000);
    expect(result.rentalAllowance.toNumber()).toBe(10000);
    expect(result.allowedLoss.toNumber()).toBe(10000);
    expect(result.suspendedLoss.toNumber()).toBe(6000);

    const carryforward = result.activityAllocations.find((a) => a.name === "Old Partnership");
    expect(carryforward?.totalLoss.toNumber()).toBe(-6000);
    // Under the IRS two-step method: the rental gets its full $10K via the special allowance,
    // leaving the entire $6K Old Partnership loss as the only remaining unallowed amount.
    expect(carryforward?.allowedLoss.toNumber()).toBe(0);
    expect(carryforward?.suspendedLoss.toNumber()).toBe(6000);
  });
});

describe("Form 8582 - Audit trail completeness with line values", () => {
  it("audit trail line values match computed result fields for a rental-loss scenario", () => {
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Fund", 5000, 0),
      ],
      agi: d(110000),
      filingStatus: "single",
    });
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l.value]));

    // Line 3b should equal rentalLoss
    expect(byLine["3b"].toNumber()).toBe(result.rentalLoss.toNumber());
    // Line 3c should equal netRental
    expect(byLine["3c"].toNumber()).toBe(result.netRental.toNumber());
    // Line 7 should equal rentalAllowance
    expect(byLine["7"].toNumber()).toBe(result.rentalAllowance.toNumber());
    // Line 9 should equal allowedLoss
    expect(byLine["9"].toNumber()).toBe(result.allowedLoss.toNumber());
    // Line 10 should equal suspendedLoss
    expect(byLine["10"].toNumber()).toBe(result.suspendedLoss.toNumber());
  });

  it("audit trail contains correct count of line entries for a fully populated scenario", () => {
    const result = calculateForm8582({
      activities: [
        makeActivity("Fund A", 3000, 0),
        makeActivity("Fund B", 0, -8000),
        makeActivity("Rental", 2000, -5000, { isRentalRealEstate: true, isActiveParticipant: true }),
      ],
      agi: d(95000),
      filingStatus: "single",
    });
    // Expect at least the 10 required lines: 1a, 1b, 1c, 3a, 3b, 3c, 5, 7, 9, 10
    expect(result.lines.length).toBeGreaterThanOrEqual(10);
    const lineIds = result.lines.map((l) => l.line);
    const requiredLines = ["1a", "1b", "1c", "3a", "3b", "3c", "5", "7", "9", "10"];
    for (const id of requiredLines) {
      expect(lineIds).toContain(id);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Per-Activity Allocation — IRS Two-Step Method (Parts VI/VII)
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - IRS per-activity allocation (special allowance then remaining)", () => {
  it("rental loss receives full special allowance; non-rental gets only passive income offset", () => {
    // Rental (active): $20K loss, Non-rental: $10K loss, $5K passive income
    // Total allowed = $25K (income $5K + rental allowance $20K)
    // IRS method: SA $20K → rental only; remaining $5K unallowed → non-rental only
    // Per IRS Part VI: special allowance ($20K) allocated to rental
    // Per IRS Part VII: unallowed ($5K) allocated to remaining loss (non-rental $10K)
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental", 0, -20000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Fund", 5000, -10000),
      ],
      agi: d(80000),
      filingStatus: "single",
    });
    // Aggregate totals unchanged
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);

    const rental = result.activityAllocations.find((a) => a.name === "Rental");
    const fund = result.activityAllocations.find((a) => a.name === "Fund");

    // IRS allocation: rental gets $20K allowed (full SA), $0 suspended
    expect(rental?.allowedLoss.toNumber()).toBe(20000);
    expect(rental?.suspendedLoss.toNumber()).toBe(0);

    // IRS allocation: non-rental gets $5K allowed (from income offset), $5K suspended
    expect(fund?.allowedLoss.toNumber()).toBe(5000);
    expect(fund?.suspendedLoss.toNumber()).toBe(5000);
  });

  it("two rental activities share special allowance proportionally; non-rental gets rest", () => {
    // Rental A: $15K loss, Rental B: $5K loss (both active), Non-rental: $10K loss
    // Passive income: $3K, AGI $120K → phase-out: 50% × $20K = $10K → allowance = $10K
    // Total allowed = $13K (income $3K + SA $10K). Suspended = $17K.
    // IRS Part VI: SA $10K → Rental A: $7,500 (75%), Rental B: $2,500 (25%)
    // Remaining: Rental A $7,500, Rental B $2,500, Non-rental $10K = $20K total
    // IRS Part VII: Unallowed $17K allocated proportionally by remaining:
    //   Rental A: $17K × (7.5/20) = $6,375
    //   Rental B: $17K × (2.5/20) = $2,125
    //   Non-rental: $17K × (10/20) = $8,500
    const result = calculateForm8582({
      activities: [
        makeActivity("Rental A", 0, -15000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Rental B", 0, -5000, { isRentalRealEstate: true, isActiveParticipant: true }),
        makeActivity("Fund", 3000, -10000),
      ],
      agi: d(120000),
      filingStatus: "single",
    });

    expect(result.allowedLoss.toNumber()).toBe(13000);
    expect(result.suspendedLoss.toNumber()).toBe(17000);

    const rentalA = result.activityAllocations.find((a) => a.name === "Rental A");
    const rentalB = result.activityAllocations.find((a) => a.name === "Rental B");
    const fund = result.activityAllocations.find((a) => a.name === "Fund");

    // Rental A: $15K - $6,375 = $8,625 allowed
    expect(rentalA?.allowedLoss.toNumber()).toBe(8625);
    expect(rentalA?.suspendedLoss.toNumber()).toBe(6375);

    // Rental B: $5K - $2,125 = $2,875 allowed
    expect(rentalB?.allowedLoss.toNumber()).toBe(2875);
    expect(rentalB?.suspendedLoss.toNumber()).toBe(2125);

    // Non-rental: $10K - $8,500 = $1,500 allowed
    expect(fund?.allowedLoss.toNumber()).toBe(1500);
    expect(fund?.suspendedLoss.toNumber()).toBe(8500);
  });
});

// ═══════════════════════════════════════════════════════════
// PTP Loss Segregation — IRC §469(k)
// ═══════════════════════════════════════════════════════════

function makePTPActivity(
  name: string,
  income: number,
  loss: number,
  opts?: {
    isRentalRealEstate?: boolean;
    isActiveParticipant?: boolean;
    ptpFullyDisposedInTaxableTransaction?: boolean;
    ptpDispositionGainOrLoss?: number;
  }
): PassiveActivity {
  return {
    name,
    income: d(income),
    loss: d(loss),
    isRentalRealEstate: opts?.isRentalRealEstate ?? false,
    isActiveParticipant: opts?.isActiveParticipant ?? false,
    isPubliclyTradedPartnership: true,
    ptpFullyDisposedInTaxableTransaction: opts?.ptpFullyDisposedInTaxableTransaction,
    ptpDispositionGainOrLoss: opts?.ptpDispositionGainOrLoss !== undefined ? d(opts.ptpDispositionGainOrLoss) : undefined,
  };
}

describe("Form 8582 - PTP Loss Segregation (IRC §469(k))", () => {
  it("PTP with net loss — entire loss is suspended, not included in Lines 1-10", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 2000, -8000),
        makeActivity("Non-PTP Fund", 5000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP net loss = 2000 - 8000 = -6000 → fully suspended
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].name).toBe("MLP Alpha");
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(6000);
    expect(result.ptpSuspendedLosses[0].currentYearIncome.toNumber()).toBe(2000);
    expect(result.ptpSuspendedLosses[0].currentYearLoss.toNumber()).toBe(8000);
    expect(result.ptpSuspendedLosses[0].priorYearCarryforward.toNumber()).toBe(0);

    // Non-PTP fund income should be in the regular passive pool
    expect(result.passiveIncome.toNumber()).toBe(5000);
    // PTP loss should NOT be in passiveLoss
    expect(result.passiveLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("PTP with net income — income flows into regular passive pool", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Beta", 12000, -3000),
        makeActivity("Non-PTP Loser", 0, -20000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP net income = 12000 - 3000 = 9000 → flows into passive pool
    expect(result.ptpNetIncome.toNumber()).toBe(9000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);

    // Regular passive pool: PTP income 9000 + non-PTP loss -20000
    expect(result.passiveIncome.toNumber()).toBe(9000);
    expect(result.passiveLoss.toNumber()).toBe(-20000);
    // Allowed loss = passive income offset (9000), suspended = 20000 - 9000 = 11000
    expect(result.allowedLoss.toNumber()).toBe(9000);
    expect(result.suspendedLoss.toNumber()).toBe(11000);
  });

  it("PTP loss cannot offset non-PTP passive income", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Gamma", 0, -15000),
        makeActivity("Non-PTP Winner", 20000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP loss is fully suspended — does NOT offset the non-PTP income
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(15000);

    // Non-PTP income is in passive pool, no losses to offset it
    expect(result.passiveIncome.toNumber()).toBe(20000);
    expect(result.passiveLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("Multiple PTPs handled independently — losses from one cannot offset income from another", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 10000, 0),
        makePTPActivity("MLP Beta", 0, -7000),
        makePTPActivity("MLP Gamma", 3000, -5000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // MLP Alpha: net +10000 → income into passive pool
    // MLP Beta: net -7000 → fully suspended
    // MLP Gamma: net 3000-5000 = -2000 → fully suspended
    expect(result.ptpNetIncome.toNumber()).toBe(10000);
    expect(result.ptpSuspendedLosses).toHaveLength(2);

    const beta = result.ptpSuspendedLosses.find((p) => p.name === "MLP Beta");
    const gamma = result.ptpSuspendedLosses.find((p) => p.name === "MLP Gamma");
    expect(beta?.netSuspended.toNumber()).toBe(7000);
    expect(gamma?.netSuspended.toNumber()).toBe(2000);

    // MLP Alpha income flows into the passive pool
    expect(result.passiveIncome.toNumber()).toBe(10000);
  });

  it("PTP prior-year carryforward offsets current-year PTP income from same PTP", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 8000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Alpha", amount: d(5000) },
      ],
    };
    const result = calculateForm8582(input);

    // PTP net = 8000 income - 0 loss - 5000 carryforward = 3000 net income
    expect(result.ptpNetIncome.toNumber()).toBe(3000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
    expect(result.passiveIncome.toNumber()).toBe(3000);
  });

  it("PTP prior-year carryforward exceeds current income — remainder stays suspended", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 3000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Alpha", amount: d(10000) },
      ],
    };
    const result = calculateForm8582(input);

    // PTP net = 3000 - 0 - 10000 = -7000 → still suspended
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(7000);
    expect(result.ptpSuspendedLosses[0].priorYearCarryforward.toNumber()).toBe(10000);
    expect(result.ptpSuspendedLosses[0].currentYearIncome.toNumber()).toBe(3000);
    expect(result.ptpNetIncome.toNumber()).toBe(0);
  });

  it("PTP carryforward from prior year with no current activity remains suspended", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Non-PTP Fund", 5000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Old", amount: d(4000) },
      ],
    };
    const result = calculateForm8582(input);

    // No current PTP activity — carryforward remains fully suspended
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].name).toBe("MLP Old");
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(4000);
    expect(result.ptpSuspendedLosses[0].currentYearIncome.toNumber()).toBe(0);
    expect(result.ptpSuspendedLosses[0].currentYearLoss.toNumber()).toBe(0);
    expect(result.ptpSuspendedLosses[0].priorYearCarryforward.toNumber()).toBe(4000);
  });

  it("PTP carryforward does not cross to a different PTP", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP New", 20000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Old", amount: d(15000) },
      ],
    };
    const result = calculateForm8582(input);

    // MLP New has income → into passive pool, carryforward from MLP Old stays suspended
    expect(result.ptpNetIncome.toNumber()).toBe(20000);
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].name).toBe("MLP Old");
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(15000);
  });

  it("Mixed PTP and non-PTP: PTP does not interact with non-PTP passive limitation", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Loss", 1000, -9000),
        makeActivity("Non-PTP Loss", 0, -6000),
        makeActivity("Non-PTP Win", 4000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP: net 1000-9000 = -8000 → fully suspended per §469(k)
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(8000);

    // Non-PTP passive pool: income 4000, loss -6000 → net -2000
    expect(result.passiveIncome.toNumber()).toBe(4000);
    expect(result.passiveLoss.toNumber()).toBe(-6000);
    expect(result.allowedLoss.toNumber()).toBe(4000);
    expect(result.suspendedLoss.toNumber()).toBe(2000);
  });

  it("PTP with both current loss and prior carryforward accumulates", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 0, -5000),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Alpha", amount: d(3000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = 0 - 5000 - 3000 = -8000 → all suspended
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(8000);
    expect(result.ptpSuspendedLosses[0].currentYearLoss.toNumber()).toBe(5000);
    expect(result.ptpSuspendedLosses[0].priorYearCarryforward.toNumber()).toBe(3000);
  });

  it("PTP income exactly absorbs carryforward — zero net, no suspended loss", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 7000, -2000),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Alpha", amount: d(5000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = 7000 - 2000 - 5000 = 0 → no income into pool, no suspended loss
    expect(result.ptpNetIncome.toNumber()).toBe(0);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("No PTP activities — ptpSuspendedLosses is empty, ptpNetIncome is zero", () => {
    const input: Form8582Input = {
      activities: [
        makeActivity("Non-PTP A", 5000, 0),
        makeActivity("Non-PTP B", 0, -3000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    expect(result.ptpNetIncome.toNumber()).toBe(0);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP with net income does not reduce non-PTP suspended losses", () => {
    // PTP income flows into passive pool, helping offset non-PTP losses
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Income", 15000, 0),
        makeActivity("Non-PTP Loser", 0, -25000),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP net income 15000 flows into passive pool
    expect(result.ptpNetIncome.toNumber()).toBe(15000);
    // Passive pool: income 15000 (from PTP), loss -25000 (non-PTP)
    // Allowed = 15000, suspended = 10000
    expect(result.passiveIncome.toNumber()).toBe(15000);
    expect(result.passiveLoss.toNumber()).toBe(-25000);
    expect(result.allowedLoss.toNumber()).toBe(15000);
    expect(result.suspendedLoss.toNumber()).toBe(10000);
  });

  it("Multiple PTP carryforwards from different PTPs track independently", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Alpha", 12000, 0),
        makePTPActivity("MLP Beta", 2000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Alpha", amount: d(8000) },
        { name: "MLP Beta", amount: d(6000) },
        { name: "MLP Gamma", amount: d(3000) }, // no current activity
      ],
    };
    const result = calculateForm8582(input);

    // MLP Alpha: 12000 - 0 - 8000 = 4000 net income
    // MLP Beta: 2000 - 0 - 6000 = -4000 net loss → suspended
    // MLP Gamma: no current activity → 3000 stays suspended
    expect(result.ptpNetIncome.toNumber()).toBe(4000);

    expect(result.ptpSuspendedLosses).toHaveLength(2);
    const beta = result.ptpSuspendedLosses.find((p) => p.name === "MLP Beta");
    const gamma = result.ptpSuspendedLosses.find((p) => p.name === "MLP Gamma");
    expect(beta?.netSuspended.toNumber()).toBe(4000);
    expect(gamma?.netSuspended.toNumber()).toBe(3000);
  });

  it("PTP rental real estate with active participation — still segregated per §469(k)", () => {
    // Even if a PTP is rental real estate with active participation,
    // §469(k) takes precedence and the loss is segregated
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Rental REIT", 0, -10000, {
          isRentalRealEstate: true,
          isActiveParticipant: true,
        }),
        makeActivity("Non-PTP Rental", 0, -5000, {
          isRentalRealEstate: true,
          isActiveParticipant: true,
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // PTP rental loss is fully suspended per §469(k), NOT eligible for $25K allowance
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(10000);

    // Non-PTP rental gets the $25K allowance
    expect(result.rentalLoss.toNumber()).toBe(-5000);
    expect(result.rentalAllowance.toNumber()).toBe(5000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// PTP Disposition — IRC §469(g)(1)
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - PTP Disposition (IRC §469(g)(1))", () => {
  it("PTP disposition releases all suspended losses as nonpassive", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, -3000, { ptpFullyDisposedInTaxableTransaction: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(12000) },
      ],
    };
    const result = calculateForm8582(input);

    // All losses released: current 3000 + prior 12000 = 15000
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].name).toBe("MLP Sold");
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(15000);
    expect(result.ptpDispositionReleasedLosses[0].currentYearLoss.toNumber()).toBe(3000);
    expect(result.ptpDispositionReleasedLosses[0].priorYearSuspendedLoss.toNumber()).toBe(12000);
    expect(result.ptpDispositionReleasedLosses[0].dispositionGain.toNumber()).toBe(0);

    // Disposed PTP should NOT appear in ptpSuspendedLosses
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP disposition with gain partially absorbs suspended losses", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 2000, -1000, {
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: 5000,
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(10000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = income 2000 + gain 5000 - loss 1000 - prior 10000 = -4000
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(4000);
    expect(result.ptpDispositionReleasedLosses[0].dispositionGain.toNumber()).toBe(5000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP disposition gain fully absorbs suspended losses — no release", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, 0, {
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: 20000,
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(8000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = 0 + gain 20000 - 0 - 8000 = +12000 → no loss to release
    expect(result.ptpDispositionReleasedLosses).toHaveLength(0);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP disposition with no prior carryforward releases only current-year loss", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, -7000, { ptpFullyDisposedInTaxableTransaction: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    // Only current-year loss of 7000 released
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(7000);
    expect(result.ptpDispositionReleasedLosses[0].currentYearLoss.toNumber()).toBe(7000);
    expect(result.ptpDispositionReleasedLosses[0].priorYearSuspendedLoss.toNumber()).toBe(0);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP disposition with no current activity releases prior-year carryforward only", () => {
    // No current-year K-1 activity, but has prior-year suspended losses
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, 0, { ptpFullyDisposedInTaxableTransaction: true }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(9000) },
      ],
    };
    const result = calculateForm8582(input);

    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(9000);
    expect(result.ptpDispositionReleasedLosses[0].currentYearLoss.toNumber()).toBe(0);
    expect(result.ptpDispositionReleasedLosses[0].priorYearSuspendedLoss.toNumber()).toBe(9000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("PTP disposition with disposition loss adds to released amount", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 1000, -2000, {
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: -3000, // loss on sale
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(5000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = income 1000 + gain 0 (negative gain is an outflow) - loss 2000 - disposition loss 3000 - prior 5000 = -9000
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(9000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("Mixed disposed and continuing PTPs — only disposed PTP releases losses", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, -5000, { ptpFullyDisposedInTaxableTransaction: true }),
        makePTPActivity("MLP Held", 0, -8000),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(10000) },
        { name: "MLP Held", amount: d(3000) },
      ],
    };
    const result = calculateForm8582(input);

    // MLP Sold: disposed → releases 5000 + 10000 = 15000
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].name).toBe("MLP Sold");
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(15000);

    // MLP Held: continuing → 8000 + 3000 = 11000 stays suspended
    expect(result.ptpSuspendedLosses).toHaveLength(1);
    expect(result.ptpSuspendedLosses[0].name).toBe("MLP Held");
    expect(result.ptpSuspendedLosses[0].netSuspended.toNumber()).toBe(11000);
  });

  it("Multiple PTP dispositions in same year", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP A", 0, -2000, { ptpFullyDisposedInTaxableTransaction: true }),
        makePTPActivity("MLP B", 500, -1500, {
          ptpFullyDisposedInTaxableTransaction: true,
          ptpDispositionGainOrLoss: 3000,
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP A", amount: d(6000) },
        { name: "MLP B", amount: d(4000) },
      ],
    };
    const result = calculateForm8582(input);

    // MLP A: 0 - 2000 - 6000 = -8000 → released
    const a = result.ptpDispositionReleasedLosses.find((p) => p.name === "MLP A");
    expect(a?.totalReleased.toNumber()).toBe(8000);

    // MLP B: 500 + 3000 - 1500 - 4000 = -2000 → released
    const b = result.ptpDispositionReleasedLosses.find((p) => p.name === "MLP B");
    expect(b?.totalReleased.toNumber()).toBe(2000);

    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("Disposed PTP does not affect non-PTP passive limitation", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, -10000, { ptpFullyDisposedInTaxableTransaction: true }),
        makeActivity("Non-PTP Loss", 0, -5000),
        makeActivity("Non-PTP Win", 3000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(20000) },
      ],
    };
    const result = calculateForm8582(input);

    // PTP released: 10000 + 20000 = 30000 (nonpassive, outside Form 8582 limitation)
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(30000);

    // Non-PTP passive pool unaffected: income 3000, loss -5000, net -2000
    expect(result.passiveIncome.toNumber()).toBe(3000);
    expect(result.passiveLoss.toNumber()).toBe(-5000);
    expect(result.allowedLoss.toNumber()).toBe(3000);
    expect(result.suspendedLoss.toNumber()).toBe(2000);
  });

  it("PTP disposition with zero net — no release, no suspended", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 5000, -2000, {
          ptpFullyDisposedInTaxableTransaction: true,
        }),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(3000) },
      ],
    };
    const result = calculateForm8582(input);

    // Net = 5000 - 2000 - 3000 = 0 → no release, no suspended
    expect(result.ptpDispositionReleasedLosses).toHaveLength(0);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
  });

  it("Non-disposed PTP is unaffected by disposed PTP flag on a different PTP", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP Sold", 0, -5000, { ptpFullyDisposedInTaxableTransaction: true }),
        makePTPActivity("MLP Continuing", 10000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
      priorYearPTPSuspendedLosses: [
        { name: "MLP Sold", amount: d(15000) },
        { name: "MLP Continuing", amount: d(6000) },
      ],
    };
    const result = calculateForm8582(input);

    // MLP Sold: disposed → released 5000 + 15000 = 20000
    expect(result.ptpDispositionReleasedLosses).toHaveLength(1);
    expect(result.ptpDispositionReleasedLosses[0].totalReleased.toNumber()).toBe(20000);

    // MLP Continuing: income 10000 - prior 6000 = 4000 net income → passive pool
    expect(result.ptpNetIncome.toNumber()).toBe(4000);
    expect(result.ptpSuspendedLosses).toHaveLength(0);
    expect(result.passiveIncome.toNumber()).toBe(4000);
  });

  it("ptpDispositionReleasedLosses is empty when no PTPs are disposed", () => {
    const input: Form8582Input = {
      activities: [
        makePTPActivity("MLP A", 0, -5000),
        makeActivity("Non-PTP", 3000, 0),
      ],
      agi: d(80000),
      filingStatus: "single",
    };
    const result = calculateForm8582(input);

    expect(result.ptpDispositionReleasedLosses).toHaveLength(0);
  });
});
