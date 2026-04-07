/**
 * Edge case tests for Form 8582 — Passive Activity Loss Limitations
 * Tests $25K rental allowance phase-out, MFS restrictions, multiple
 * activity allocation, and AGI boundary conditions.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm8582,
  type Form8582Input,
  type PassiveActivity,
} from "@/engine/forms/form-8582.js";

const d = (n: number | string) => new Decimal(n);

function makeActivity(
  name: string,
  income: number,
  loss: number,
  isRental = false,
  isActive = false
): PassiveActivity {
  return {
    name,
    income: d(income),
    loss: d(loss),
    isRentalRealEstate: isRental,
    isActiveParticipant: isActive,
  };
}

function makeInput(overrides: Partial<Form8582Input> = {}): Form8582Input {
  return {
    activities: [],
    agi: d(80000),
    filingStatus: "single",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// $25K Rental Allowance Phase-Out
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - rental allowance phase-out", () => {
  it("full $25K allowance at AGI $100K or below", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -30000, true, true)],
      agi: d(100000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);
  });

  it("partial allowance at AGI $120K (50% of $20K excess = $10K reduction)", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -30000, true, true)],
      agi: d(120000),
    }));
    // $25K - $10K = $15K allowed
    expect(result.rentalAllowance.toNumber()).toBe(15000);
  });

  it("zero allowance at AGI $150K+ (fully phased out)", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -30000, true, true)],
      agi: d(150000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(30000);
  });

  it("zero allowance at AGI $200K (way over phase-out)", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(200000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(0);
  });

  it("AGI exactly at $100K boundary: full allowance", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -10000, true, true)],
      agi: d(100000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(10000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("AGI $100,001: $1 excess → $1 reduction (rounds to $1)", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(100001),
    }));
    // $1 excess × 50% = $0.50 → rounds to $1
    expect(result.rentalAllowance.toNumber()).toBe(24999);
  });

  it("rental loss less than $25K: allowance limited to loss amount", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -8000, true, true)],
      agi: d(80000),
    }));
    // min($25K, $8K) = $8K allowance
    expect(result.rentalAllowance.toNumber()).toBe(8000);
    expect(result.allowedLoss.toNumber()).toBe(8000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS: No Rental Allowance
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - MFS restrictions", () => {
  it("MFS gets zero rental allowance even at low AGI", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(50000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(25000);
  });

  it("MFS gets zero allowance even with passive income to offset", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental", 0, -25000, true, true),
        makeActivity("K1 Income", 10000, 0, false, false),
      ],
      agi: d(50000),
      filingStatus: "married_filing_separately",
    }));
    // Passive income ($10K) offsets some loss, but no rental allowance
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(10000);
    expect(result.suspendedLoss.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// Passive Income Offsets
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - passive income offsets losses", () => {
  it("passive income fully offsets passive loss: no limitation", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("LLC A", 20000, 0, false, false),
        makeActivity("LLC B", 0, -15000, false, false),
      ],
    }));
    // Net: $20K - $15K = $5K positive → no limitation
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("partial passive income offset", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("LLC A", 5000, 0, false, false),
        makeActivity("LLC B", 0, -20000, false, false),
      ],
    }));
    // Net: -$15K. Allowed = $5K (passive income only, no rental allowance)
    expect(result.allowedLoss.toNumber()).toBe(5000);
    expect(result.suspendedLoss.toNumber()).toBe(15000);
  });

  it("rental income offsets non-rental passive loss", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental", 15000, 0, true, true),
        makeActivity("LLC", 0, -20000, false, false),
      ],
    }));
    // Rental income offsets part of LLC loss
    expect(result.allowedLoss.toNumber()).toBe(15000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Activity Allocation
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - multiple activity allocation", () => {
  it("two loss activities: proportional allocation", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 0, -20000, true, true),
        makeActivity("Rental B", 0, -10000, true, true),
      ],
      agi: d(80000),
    }));
    // Total loss: $30K. Allowance: $25K.
    // Rental A: 20/30 × $25K = $16,667
    // Rental B: 10/30 × $25K = $8,333
    const allocA = result.activityAllocations.find((a) => a.name === "Rental A");
    const allocB = result.activityAllocations.find((a) => a.name === "Rental B");
    expect(allocA!.allowedLoss.toNumber()).toBeCloseTo(16667, 0);
    expect(allocB!.allowedLoss.toNumber()).toBeCloseTo(8333, 0);
    expect(result.activityAllocations).toHaveLength(2);
  });

  it("mixed rental and non-rental: only rental gets allowance", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental", 0, -20000, true, true),
        makeActivity("LLC", 0, -10000, false, false),
      ],
      agi: d(80000),
    }));
    // Total loss: $30K. Rental allowance: min($25K, $20K rental) = $20K
    // No passive income → allowed = rental allowance = $20K
    // But $20K goes to rental portion primarily
    expect(result.rentalAllowance.toNumber()).toBe(20000);
  });

  it("three activities: income, rental loss, passive loss", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Income K1", 8000, 0, false, false),
        makeActivity("Rental", 0, -15000, true, true),
        makeActivity("LLC Loss", 0, -5000, false, false),
      ],
      agi: d(80000),
    }));
    // Passive income: $8K. Rental loss: -$15K, net rental: -$15K
    // Combined: -$12K. Rental allowance: $15K (limited to rental loss)
    // But combined loss is $20K total. Allowed = $8K income + $12K rental = $20K
    expect(result.allowedLoss.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Non-Active Participant Rental
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - non-active participant rental", () => {
  it("non-active rental treated as regular passive (no $25K allowance)", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Passive Rental", 0, -20000, true, false),
      ],
      agi: d(80000),
    }));
    // Not active participant → no rental allowance
    expect(result.rentalAllowance.toNumber()).toBe(0);
    // No passive income → entire loss suspended
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Edge Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - zero and edge scenarios", () => {
  it("no activities: all zeros", () => {
    const result = calculateForm8582(makeInput());
    expect(result.passiveIncome.toNumber()).toBe(0);
    expect(result.passiveLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("all income activities: no limitation needed", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("LLC A", 10000, 0, false, false),
        makeActivity("LLC B", 5000, 0, false, false),
      ],
    }));
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("exactly $25K rental loss at low AGI: fully allowed", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(50000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("$1 rental loss: full allowance for tiny amount", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -1, true, true)],
      agi: d(50000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(1);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("HoH gets full rental allowance (same as single)", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(80000),
      filingStatus: "head_of_household",
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI Boundary — Multiple Rental Properties
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI exactly $100K with multiple rental properties", () => {
  it("AGI $100K with two rental properties: full $25K allowance on combined loss", () => {
    // AGI exactly at phase-out start → excess = $0 → no reduction
    // Total rental loss: $27K → baseAllowance = min($25K, $27K) = $25K
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 0, -15000, true, true),
        makeActivity("Rental B", 0, -12000, true, true),
      ],
      agi: d(100000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI $110K — Partial Phase-Out
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI $110K partial phase-out", () => {
  it("AGI $110K: $10K excess × 50% = $5K reduction → $20K allowance", () => {
    // $25K - ($10K excess × 50%) = $25K - $5K = $20K
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -30000, true, true)],
      agi: d(110000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(20000);
    expect(result.allowedLoss.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Three Rental Properties — Proportional Allocation
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - three rental properties proportional allocation", () => {
  it("three rental losses over $25K: each property gets proportional slice of allowance", () => {
    // Total loss: $30K. Allowance: $25K (AGI $80K, no phase-out)
    // Rental A: 15/30 × $25K = $12,500
    // Rental B:  6/30 × $25K =  $5,000
    // Rental C:  9/30 × $25K =  $7,500
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 0, -15000, true, true),
        makeActivity("Rental B", 0, -6000, true, true),
        makeActivity("Rental C", 0, -9000, true, true),
      ],
      agi: d(80000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);

    const allocA = result.activityAllocations.find((a) => a.name === "Rental A");
    const allocB = result.activityAllocations.find((a) => a.name === "Rental B");
    const allocC = result.activityAllocations.find((a) => a.name === "Rental C");
    expect(allocA!.allowedLoss.toNumber()).toBeCloseTo(12500, 0);
    expect(allocB!.allowedLoss.toNumber()).toBeCloseTo(5000, 0);
    expect(allocC!.allowedLoss.toNumber()).toBeCloseTo(7500, 0);
    expect(result.activityAllocations).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Profit + Rental Loss — Net Before Allowance
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - active participant rental profit offsets rental loss", () => {
  it("rental profit nets against rental loss before $25K allowance is applied", () => {
    // Rental A: +$8K income (profit), Rental B: -$20K loss
    // netRental = -$12K → baseAllowance = min($25K, $12K) = $12K
    // totalGrossLoss = $20K (only the loss column matters)
    // totalPassiveIncomeOffset = rentalIncome($8K) + passiveIncome($0) = $8K
    // allowedLoss = min($8K + $12K, $20K) = $20K → fully allowed
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 8000, 0, true, true),
        makeActivity("Rental B", 0, -20000, true, true),
      ],
      agi: d(80000),
    }));
    expect(result.rentalIncome.toNumber()).toBe(8000);
    expect(result.netRental.toNumber()).toBe(-12000);
    expect(result.rentalAllowance.toNumber()).toBe(12000);
    expect(result.allowedLoss.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Suspended Loss Accumulation Across Years
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - suspended loss accumulation across years", () => {
  it("year 1 suspended loss plus year 2 suspended loss equals cumulative carryforward", () => {
    // Year 1: $35K rental loss at AGI $150K → rentalAllowance $0 → $35K suspended
    const year1 = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -35000, true, true)],
      agi: d(150000),
    }));
    expect(year1.suspendedLoss.toNumber()).toBe(35000);

    // Year 2: another $20K rental loss at AGI $150K, plus the $35K carryforward,
    // all remain suspended because the rental allowance is still fully phased out.
    const year2 = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -20000, true, true)],
      agi: d(150000),
      priorYearSuspendedLosses: [{ name: "Rental", amount: d(35000) }],
    }));
    expect(year2.suspendedLoss.toNumber()).toBe(55000);
    expect(year2.rentalLoss.toNumber()).toBe(-55000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS at AGI Under $100K — Still Zero Allowance
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - MFS always gets zero rental allowance", () => {
  it("MFS at AGI $75K (well under $100K phase-out): still zero allowance", () => {
    // MFS rule is absolute — no phase-out threshold applies
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -18000, true, true)],
      agi: d(75000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(18000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Passive Income Offsets K-1 Passive Loss
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - K-1 passive income offsets K-1 passive loss before rental allowance", () => {
  it("K-1 income partially offsets K-1 loss; rental allowance covers remaining rental loss", () => {
    // K-1 income: $12K, K-1 loss: -$20K → netPassive = -$8K
    // Rental loss: -$10K → netRental = -$10K
    // combinedNet = -$18K → rentalAllowance = min($25K, $10K) = $10K
    // totalGrossLoss = $20K + $10K = $30K
    // totalPassiveIncomeOffset = passiveIncome($12K) + rentalIncome($0) = $12K
    // allowedLoss = min($12K + $10K, $30K) = $22K
    // suspendedLoss = $30K - $22K = $8K
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("K-1 Income", 12000, 0, false, false),
        makeActivity("K-1 Loss", 0, -20000, false, false),
        makeActivity("Rental", 0, -10000, true, true),
      ],
      agi: d(80000),
    }));
    expect(result.passiveIncome.toNumber()).toBe(12000);
    expect(result.rentalAllowance.toNumber()).toBe(10000);
    expect(result.allowedLoss.toNumber()).toBe(22000);
    expect(result.suspendedLoss.toNumber()).toBe(8000);
  });
});

describe("Form 8582 - AGI boundary precision", () => {
  it("AGI exactly $100,000 — full $25K allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(100000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("AGI exactly $100,001 — allowance reduced by $0.50 (rounds to $24,999 or $25,000)", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(100001),
      filingStatus: "single",
    });
    // Excess = $1, reduction = round($1 × 0.5) = $1
    expect(result.rentalAllowance.toNumber()).toBeLessThanOrEqual(25000);
    expect(result.rentalAllowance.toNumber()).toBeGreaterThanOrEqual(24999);
  });

  it("AGI exactly $125,000 — mid-phase-out $12,500 allowance", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(125000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(12500);
    expect(result.suspendedLoss.toNumber()).toBe(12500);
  });

  it("AGI exactly $150,000 — allowance fully phased out", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(150000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(25000);
  });

  it("AGI $500K — all rental loss suspended", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -50000, true, true)],
      agi: d(500000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(50000);
  });

  it("MFS — zero rental allowance regardless of AGI", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, true, true)],
      agi: d(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });

  it("rental loss exactly $25K — fully allowed at low AGI", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("non-active rental — no allowance even at low AGI", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 0, -20000, true, false)],
      agi: d(50000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });

  it("zero rental activity — no loss or allowance", () => {
    const result = calculateForm8582({
      activities: [],
      agi: d(80000),
      filingStatus: "single",
    });
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("net rental income — no limitation needed", () => {
    const result = calculateForm8582({
      activities: [makeActivity("Rental", 30000, -10000, true, true)],
      agi: d(200000),
      filingStatus: "single",
    });
    // Net income is positive, no loss to limit
    expect(result.netRental.toNumber()).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Boundary: $1 Below $100K
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI $99,999 receives full $25K rental allowance", () => {
  it("AGI $1 below $100K phase-out threshold — zero excess, full allowance", () => {
    // AGI $99,999: excess over $100K = $0 → reduction = $0 → full $25K
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -30000, true, true)],
      agi: d(99999),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Boundary: Exactly $150K (Fully Phased Out)
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - AGI $150K allowance completely eliminated", () => {
  it("AGI exactly $150K — $50K excess × 50% = $25K reduction eliminates entire allowance", () => {
    // Excess = $150K - $100K = $50K. Reduction = $25K = full allowance → $0 remains.
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -40000, true, true)],
      agi: d(150000),
    }));
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Rental Properties: Mixed Income and Loss
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - multiple rental properties with mixed income and loss", () => {
  it("profitable rental offsets losing rental; allowance applies only to remaining net loss", () => {
    // Rental A: +$12K (profit), Rental B: -$30K, Rental C: -$8K
    // rentalIncome = $12K, rentalLoss = -$38K, netRental = -$26K
    // baseAllowance = min($25K, $26K) = $25K (AGI $80K → no phase-out)
    // totalGrossLoss = $38K, passiveIncome = $0
    // allowedLoss = min($12K + $25K, $38K) = $37K
    // suspendedLoss = $38K - $37K = $1K
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 12000, 0, true, true),
        makeActivity("Rental B", 0, -30000, true, true),
        makeActivity("Rental C", 0, -8000, true, true),
      ],
      agi: d(80000),
    }));
    expect(result.rentalIncome.toNumber()).toBe(12000);
    expect(result.netRental.toNumber()).toBe(-26000);
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(37000);
    expect(result.suspendedLoss.toNumber()).toBe(1000);
  });

  it("two profitable rentals plus one losing rental — net rental income means no limitation", () => {
    // Rental A: +$20K, Rental B: +$5K, Rental C: -$18K → netRental = +$7K
    // No limitation since net is positive
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Rental A", 20000, 0, true, true),
        makeActivity("Rental B", 5000, 0, true, true),
        makeActivity("Rental C", 0, -18000, true, true),
      ],
      agi: d(200000),
    }));
    expect(result.netRental.toNumber()).toBe(7000);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Active Participation vs Passive (No Active Participation)
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - active participation vs passive-only rental comparison", () => {
  it("identical rental loss: active participant gets $25K allowance, passive gets zero", () => {
    const activeResult = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -20000, true, true)],
      agi: d(80000),
    }));
    const passiveResult = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -20000, true, false)],
      agi: d(80000),
    }));

    // Active participant: full loss allowed via $25K allowance
    expect(activeResult.rentalAllowance.toNumber()).toBe(20000);
    expect(activeResult.allowedLoss.toNumber()).toBe(20000);
    expect(activeResult.suspendedLoss.toNumber()).toBe(0);

    // Non-active participant: treated as generic passive, no allowance, entire loss suspended
    expect(passiveResult.rentalAllowance.toNumber()).toBe(0);
    expect(passiveResult.allowedLoss.toNumber()).toBe(0);
    expect(passiveResult.suspendedLoss.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Suspended Losses Carried Forward
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - suspended losses carried forward when AGI remains over $150K", () => {
  it("losses suspended three years running accumulate correctly in caller's ledger", () => {
    const makeHighAgiInput = (lossAmount: number) =>
      makeInput({
        activities: [makeActivity("Rental", 0, lossAmount, true, true)],
        agi: d(175000),
      });

    // Year 1: -$15K at $175K AGI → $0 allowance → $15K suspended
    const yr1 = calculateForm8582(makeHighAgiInput(-15000));
    expect(yr1.rentalAllowance.toNumber()).toBe(0);
    expect(yr1.suspendedLoss.toNumber()).toBe(15000);

    // Year 2: -$10K at $175K AGI, plus the $15K carryforward, all remain suspended
    const yr2 = calculateForm8582({
      ...makeHighAgiInput(-10000),
      priorYearSuspendedLosses: [{ name: "Rental", amount: d(15000) }],
    });
    expect(yr2.suspendedLoss.toNumber()).toBe(25000);

    // Year 3: -$5K at $175K AGI, plus the rolling $25K carryforward, still all suspended
    const yr3 = calculateForm8582({
      ...makeHighAgiInput(-5000),
      priorYearSuspendedLosses: [{ name: "Rental", amount: d(25000) }],
    });
    expect(yr3.suspendedLoss.toNumber()).toBe(30000);

    // The rolling carryforward equals the latest suspended-loss result.
    expect(yr3.suspendedLoss.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Prior Year Suspended Losses Releasing
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - prior year suspended losses tracked via priorYearSuspendedLosses", () => {
  it("AGI drops below $100K: current year allowance also applies to matched prior suspended losses", () => {
    // Year 1 (high AGI): $20K rental loss fully suspended
    const yr1 = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -20000, true, true)],
      agi: d(160000),
    }));
    expect(yr1.suspendedLoss.toNumber()).toBe(20000);

    // Year 2 (AGI drops to $80K): the same $25K allowance now applies to the
    // combined $20K carryforward plus the current-year $8K rental loss.
    const yr2 = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -8000, true, true)],
      agi: d(80000),
      priorYearSuspendedLosses: [{ name: "Rental", amount: yr1.suspendedLoss }],
    }));
    expect(yr2.rentalAllowance.toNumber()).toBe(25000);
    expect(yr2.allowedLoss.toNumber()).toBe(25000);
    expect(yr2.suspendedLoss.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Passive Income — No Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - net passive income means passive loss limitation does not apply", () => {
  it("passive income exceeds all passive losses — no loss is suspended", () => {
    // Non-rental passive income: $50K, passive loss: -$30K, rental loss: -$15K (active)
    // netPassive = +$20K, netRental = -$15K, combinedNet = +$5K → no limitation
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("Fund A", 50000, 0, false, false),
        makeActivity("Fund B", 0, -30000, false, false),
        makeActivity("Rental", 0, -15000, true, true),
      ],
      agi: d(200000),
    }));
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("passive income exactly equals passive loss — net zero, no limitation triggered", () => {
    // $25K income vs $25K loss → combined net = $0 → positive (not negative)
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("LLC Income", 25000, 0, false, false),
        makeActivity("LLC Loss", 0, -25000, false, false),
      ],
      agi: d(180000),
    }));
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Entries for Passive Loss Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8582 - audit trail records all key limitation lines", () => {
  it("audit trail contains Form 8582 lines 1a, 1b, 1c, 3a, 3b, 3c, 5, 7, 9, 10", () => {
    const result = calculateForm8582(makeInput({
      activities: [
        makeActivity("K-1", 5000, 0, false, false),
        makeActivity("Rental", 0, -30000, true, true),
      ],
      agi: d(120000),
    }));

    const form8582Lines = result.lines.filter((l) => l.form === "Form 8582");
    const lineNumbers = form8582Lines.map((l) => l.line);

    expect(lineNumbers).toContain("1a");
    expect(lineNumbers).toContain("1b");
    expect(lineNumbers).toContain("1c");
    expect(lineNumbers).toContain("3a");
    expect(lineNumbers).toContain("3b");
    expect(lineNumbers).toContain("3c");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("7");
    expect(lineNumbers).toContain("9");
    expect(lineNumbers).toContain("10");
  });

  it("audit trail line 7 value matches computed rentalAllowance", () => {
    // AGI $130K → excess $30K × 50% = $15K reduction → allowance = $10K
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -25000, true, true)],
      agi: d(130000),
    }));

    const line7 = result.lines.find(
      (l) => l.form === "Form 8582" && l.line === "7"
    );
    expect(line7).toBeDefined();
    expect(line7!.value.toNumber()).toBe(result.rentalAllowance.toNumber());
    expect(line7!.value.toNumber()).toBe(10000);
  });

  it("audit trail line 10 value matches suspendedLoss for MFS filer", () => {
    const result = calculateForm8582(makeInput({
      activities: [makeActivity("Rental", 0, -22000, true, true)],
      agi: d(60000),
      filingStatus: "married_filing_separately",
    }));

    const line10 = result.lines.find(
      (l) => l.form === "Form 8582" && l.line === "10"
    );
    expect(line10).toBeDefined();
    expect(line10!.value.toNumber()).toBe(result.suspendedLoss.toNumber());
    expect(line10!.value.toNumber()).toBe(22000);
  });
});
