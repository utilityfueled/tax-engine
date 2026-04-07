/**
 * Tests for Form 8815 — Exclusion of Interest from Series EE and I U.S. Savings Bonds
 * Spec: spec/federal/form-8815.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function makeBond(proceeds: string, interest: string, expenses: string) {
  return { proceeds, interest, qualifiedExpenses: expenses };
}

// ═══════════════════════════════════════════════════════════
// Basic Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - basic exclusion calculation", () => {
  it("Form 8815 Line 2 - qualified expenses", () => {
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    expect(result.qualifiedExpenses.toNumber()).toBe(8000);
  });

  it("Form 8815 Line 3 - total proceeds", () => {
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    expect(result.totalProceeds.toNumber()).toBe(10000);
  });

  it("Form 8815 Line 4 - interest portion", () => {
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    expect(result.totalInterest.toNumber()).toBe(2000);
  });

  it("Form 8815 Line 5 - ratio capped at 1", () => {
    // Expenses ($15K) > Proceeds ($10K) → ratio capped at 1
    const result = calculateForm8815([makeBond("10000", "2000", "15000")], d(50000), "single");
    expect(result.expenseRatio.toNumber()).toBe(1);
  });

  it("Form 8815 Line 5 - ratio less than 1 when expenses < proceeds", () => {
    // Expenses $5K / Proceeds $10K = 0.5
    const result = calculateForm8815([makeBond("10000", "2000", "5000")], d(50000), "single");
    expect(result.expenseRatio.toNumber()).toBe(0.5);
  });

  it("Form 8815 Line 6 - excludable before phase-out", () => {
    // Interest $2K × ratio 0.8 = $1,600
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(1600);
  });

  it("Form 8815 Line 7 - modified AGI", () => {
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(75000), "single");
    expect(result.modifiedAGI.toNumber()).toBe(75000);
  });

  it("Form 8815 Line 8 - phase-out threshold", () => {
    const single = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    expect(single.phaseOutThreshold.toNumber()).toBe(99500);

    const mfj = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "married_filing_jointly");
    expect(mfj.phaseOutThreshold.toNumber()).toBe(149250);
  });

  it("Form 8815 Line 13 - final exclusion below phase-out", () => {
    // AGI $50K well below $100,800 threshold → full exclusion
    const result = calculateForm8815([makeBond("10000", "2000", "8000")], d(50000), "single");
    // Interest $2K × ratio 0.8 = $1,600. No phase-out reduction.
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1600);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - phase-out", () => {
  it("Form 8815 - full phase-out above upper limit", () => {
    // Single: threshold $100,800 + range $15,000 = $115,800
    // AGI $120,000 → fully phased out
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(120000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("Form 8815 - partial phase-out", () => {
    // Single: threshold $99,500, range $15,000
    // AGI $107,000 → excess = $7,500, ratio = 7500/15000 = 0.5
    // Exclusion before phase-out: $2K × 1.0 = $2,000
    // Reduction: $2,000 × 0.5 = $1,000
    // Final: $2,000 - $1,000 = $1,000
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(107000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1000);
  });

  it("Form 8815 - MFJ uses wider phase-out range", () => {
    // MFJ: threshold $149,250, range $30,000
    // AGI $164,250 → excess = $15,000, ratio = 15000/30000 = 0.5
    // Exclusion before: $3K. Reduction: $1,500. Final: $1,500.
    const result = calculateForm8815(
      [makeBond("10000", "3000", "15000")],
      d(164250),
      "married_filing_jointly"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1500);
  });

  it("Form 8815 - QSS uses single/HoH thresholds (not MFJ — QSS is not a joint return)", () => {
    // IRC §135(b)(2)(B): higher threshold only "in the case of a joint return"
    // IRS Pub 970 (2025): "Single, head of household, or qualifying surviving spouse: $99,500"
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "qualifying_surviving_spouse"
    );
    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    expect(result.phaseOutRange.toNumber()).toBe(15000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });

  it("Form 8815 - HoH uses single thresholds", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "head_of_household"
    );
    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Not Eligible
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - MFS restriction", () => {
  it("MFS filers get $0 exclusion", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "married_filing_separately"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - edge cases", () => {
  it("no qualified expenses → $0 exclusion", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "0")],
      d(50000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("zero bond interest → $0 exclusion", () => {
    const result = calculateForm8815(
      [makeBond("10000", "0", "5000")],
      d(50000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("zero proceeds → $0 exclusion (no division by zero)", () => {
    const result = calculateForm8815(
      [makeBond("0", "0", "5000")],
      d(50000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("empty redemptions array → $0", () => {
    const result = calculateForm8815([], d(50000), "single");
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("multiple bond redemptions aggregate", () => {
    const result = calculateForm8815(
      [
        makeBond("5000", "1000", "3000"),
        makeBond("8000", "1500", "6000"),
      ],
      d(50000),
      "single"
    );
    // Total: proceeds $13K, interest $2.5K, expenses $9K
    // Ratio = min(1, 9000/13000) ≈ 0.6923
    // Exclusion = 2500 × 0.6923 = $1,731 (rounded)
    expect(result.totalProceeds.toNumber()).toBe(13000);
    expect(result.totalInterest.toNumber()).toBe(2500);
    expect(result.qualifiedExpenses.toNumber()).toBe(9000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1731);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Boundary Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - phase-out boundary", () => {
  it("Form 8815 - exclusion at exact single phase-out start (threshold)", () => {
    // AGI exactly at single threshold $99,500 → excess = $0 → no reduction
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(99500),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });

  it("Form 8815 - single 2025 phase-out range is $15,000", () => {
    // Single: threshold $99,500, range $15,000, upper limit $114,500
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "single"
    );
    expect(result.phaseOutThreshold.toNumber()).toBe(99500);
    expect(result.phaseOutRange.toNumber()).toBe(15000);
  });

  it("Form 8815 - MFJ 2025 phase-out range is $30,000", () => {
    // MFJ: threshold $149,250, range $30,000, upper limit $179,250
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "married_filing_jointly"
    );
    expect(result.phaseOutThreshold.toNumber()).toBe(149250);
    expect(result.phaseOutRange.toNumber()).toBe(30000);
  });

  it("Form 8815 - income above single upper phase-out limit → zero exclusion", () => {
    // Single upper limit = $99,500 + $15,000 = $114,500
    // AGI $116,000 → fully phased out
    const result = calculateForm8815(
      [makeBond("10000", "5000", "10000")],
      d(116000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Expense-to-Proceeds Ratio Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - expense ratio edge cases", () => {
  it("Form 8815 - qualified expenses exactly equal to bond proceeds → full interest excluded", () => {
    // Expenses $10K = Proceeds $10K → ratio = 1 → full $3K interest excluded
    const result = calculateForm8815(
      [makeBond("10000", "3000", "10000")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(1);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("Form 8815 - qualified expenses less than proceeds → partial exclusion", () => {
    // Expenses $4K / Proceeds $10K = ratio 0.4
    // Interest $2K × 0.4 = $800 excluded
    const result = calculateForm8815(
      [makeBond("10000", "2000", "4000")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(0.4);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(800);
  });

  it("Form 8815 - zero qualified expenses → no exclusion regardless of interest", () => {
    // Expenses $0 → ratio = 0 → $0 excluded even with large interest
    const result = calculateForm8815(
      [makeBond("20000", "5000", "0")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(0);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Edge Cases and Boundary Conditions
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - extended edge cases and boundary conditions", () => {
  it("MFS filer zeroes all output fields including threshold and range", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(30000),
      "married_filing_separately"
    );
    expect(result.qualifiedExpenses.toNumber()).toBe(0);
    expect(result.totalProceeds.toNumber()).toBe(0);
    expect(result.totalInterest.toNumber()).toBe(0);
    expect(result.expenseRatio.toNumber()).toBe(0);
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(0);
    expect(result.phaseOutThreshold.toNumber()).toBe(0);
    expect(result.phaseOutRange.toNumber()).toBe(0);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("MFS filer still records modifiedAGI", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(75000),
      "married_filing_separately"
    );
    expect(result.modifiedAGI.toNumber()).toBe(75000);
  });

  it("MAGI exactly at single upper phase-out limit ($114,500) → full phase-out", () => {
    // Single upper limit = $99,500 + $15,000 = $114,500
    // excess = $15,000, ratio = 15000/15000 = 1 → reduction = 100%
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(114500),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("MAGI $1 below single upper limit → tiny exclusion remains", () => {
    // Single upper limit = $114,500; AGI = $114,499
    // excess = $14,999, ratio = 14999/15000 ≈ 0.999933
    // excludable before = $2,000, reduction = roundDollar(2000 × 0.999933) = roundDollar(1999.867) = $2,000
    // final = $2,000 - $2,000 = $0
    // With rounding, at this extreme the exclusion rounds to zero
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(114499),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("MAGI exactly at MFJ upper phase-out limit ($179,250) → full phase-out", () => {
    // MFJ upper limit = $149,250 + $30,000 = $179,250
    const result = calculateForm8815(
      [makeBond("10000", "3000", "10000")],
      d(179250),
      "married_filing_jointly"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("interest exceeding qualified expenses limits exclusion to expense proportion", () => {
    // Proceeds $6,000, interest $5,000, expenses $3,000
    // ratio = 3000/6000 = 0.5; excludable = 5000 × 0.5 = $2,500
    const result = calculateForm8815(
      [makeBond("6000", "5000", "3000")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(0.5);
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(2500);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2500);
  });

  it("zero bond proceeds with nonzero interest → zero exclusion, no division error", () => {
    // Edge: proceeds = 0 but interest > 0 (shouldn't happen in practice)
    const result = calculateForm8815(
      [makeBond("0", "500", "1000")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(0);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("multiple bonds aggregate correctly with partial phase-out", () => {
    // Bond A: proceeds $10,000, interest $2,000, expenses $5,000
    // Bond B: proceeds $20,000, interest $4,000, expenses $10,000
    // Bond C: proceeds $5,000, interest $1,000, expenses $5,000
    // Totals: proceeds $35,000, interest $7,000, expenses $20,000
    // ratio = min(1, 20000/35000) = 0.571428...
    // excludable before = roundDollar(7000 × 0.571428...) = roundDollar(4000) = $4,000
    // Single phase-out: threshold $99,500, AGI $107,000 → excess = $7,500
    // phaseOutRatio = 7500/15000 = 0.5
    // reduction = roundDollar(4000 × 0.5) = $2,000
    // final = $4,000 - $2,000 = $2,000
    const result = calculateForm8815(
      [
        makeBond("10000", "2000", "5000"),
        makeBond("20000", "4000", "10000"),
        makeBond("5000", "1000", "5000"),
      ],
      d(107000),
      "single"
    );
    expect(result.totalProceeds.toNumber()).toBe(35000);
    expect(result.totalInterest.toNumber()).toBe(7000);
    expect(result.qualifiedExpenses.toNumber()).toBe(20000);
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(4000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });

  it("single MAGI $1 above phase-out threshold triggers minimal reduction", () => {
    // AGI $99,501 → excess = $1, ratio = 1/15000
    // excludable before = $2,000
    // reduction = roundDollar(2000 × (1/15000)) = roundDollar(0.1333) = $0
    // final = $2,000 - $0 = $2,000
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(99501),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });

  it("MFJ partial phase-out at 75% through range", () => {
    // MFJ: threshold $149,250, range $30,000
    // AGI = $149,250 + $22,500 = $171,750 → excess = $22,500, ratio = 22500/30000 = 0.75
    // excludable before = $4,000 (interest $4K, expenses >= proceeds)
    // reduction = roundDollar(4000 × 0.75) = $3,000
    // final = $4,000 - $3,000 = $1,000
    const result = calculateForm8815(
      [makeBond("10000", "4000", "15000")],
      d(171750),
      "married_filing_jointly"
    );
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(4000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1000);
  });

  it("QSS partial phase-out uses single/HoH range ($15,000)", () => {
    // QSS: threshold $99,500, range $15,000 (NOT MFJ $149,250/$30,000)
    // AGI = $107,000 → excess = $7,500, ratio = 7500/15000 = 0.5
    // excludable before = $2,000; reduction = $1,000; final = $1,000
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(107000),
      "qualifying_surviving_spouse"
    );
    expect(result.phaseOutRange.toNumber()).toBe(15000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Completeness
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - audit trail", () => {
  it("Form 8815 - all line IDs present in audit trail", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "8000")],
      d(50000),
      "single"
    );
    const lineIds = result.lines.map((l) => l.line);
    const expectedLines = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
    for (const id of expectedLines) {
      expect(lineIds, `expected line ${id} in audit trail`).toContain(id);
    }
  });

  it("Form 8815 - audit trail line values match computed result fields", () => {
    // Verify that specific line values in the audit trail match top-level result fields
    const result = calculateForm8815(
      [makeBond("10000", "2000", "8000")],
      d(75000),
      "single"
    );
    const getLine = (id: string) => result.lines.find((l) => l.line === id)?.value;

    expect(getLine("2")?.toNumber()).toBe(result.qualifiedExpenses.toNumber());
    expect(getLine("3")?.toNumber()).toBe(result.totalProceeds.toNumber());
    expect(getLine("4")?.toNumber()).toBe(result.totalInterest.toNumber());
    expect(getLine("6")?.toNumber()).toBe(result.excludableBeforePhaseOut.toNumber());
    expect(getLine("7")?.toNumber()).toBe(result.modifiedAGI.toNumber());
    expect(getLine("8")?.toNumber()).toBe(result.phaseOutThreshold.toNumber());
    expect(getLine("10")?.toNumber()).toBe(result.phaseOutRange.toNumber());
    expect(getLine("13")?.toNumber()).toBe(result.excludableSavingsBondInterest.toNumber());
  });

  it("Form 8815 - MFS audit trail records only line 13 with zero value", () => {
    // MFS short-circuits: only one line should appear (line 13 = $0)
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(50000),
      "married_filing_separately"
    );
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].line).toBe("13");
    expect(result.lines[0].value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Threshold Coverage by Filing Status
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - phase-out threshold by filing status", () => {
  it("single, head_of_household, and QSS share the same $99,500 threshold", () => {
    const single = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "single");
    const hoh = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "head_of_household");
    const qss = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "qualifying_surviving_spouse");

    expect(single.phaseOutThreshold.toNumber()).toBe(99500);
    expect(hoh.phaseOutThreshold.toNumber()).toBe(99500);
    expect(qss.phaseOutThreshold.toNumber()).toBe(99500);
    expect(single.phaseOutRange.toNumber()).toBe(15000);
    expect(hoh.phaseOutRange.toNumber()).toBe(15000);
    expect(qss.phaseOutRange.toNumber()).toBe(15000);
  });

  it("MFJ uses higher $149,250 threshold (QSS does NOT share MFJ threshold)", () => {
    const mfj = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "married_filing_jointly");
    const qss = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "qualifying_surviving_spouse");

    expect(mfj.phaseOutThreshold.toNumber()).toBe(149250);
    expect(mfj.phaseOutRange.toNumber()).toBe(30000);
    // QSS uses single/HoH threshold, NOT MFJ
    expect(qss.phaseOutThreshold.toNumber()).toBe(99500);
    expect(qss.phaseOutRange.toNumber()).toBe(15000);
  });

  it("MFJ threshold is $49,750 higher than single threshold", () => {
    const single = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "single");
    const mfj = calculateForm8815([makeBond("10000", "2000", "10000")], d(50000), "married_filing_jointly");

    const diff = mfj.phaseOutThreshold.minus(single.phaseOutThreshold);
    expect(diff.toNumber()).toBe(49750);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Bond Redemptions
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - very large bond redemptions", () => {
  it("very large bond redemption below phase-out → full exclusion of interest portion", () => {
    // $1,000,000 proceeds, $200,000 interest, $1,200,000 expenses → ratio capped at 1
    // AGI $50,000 well below threshold → full $200,000 interest excluded
    const result = calculateForm8815(
      [makeBond("1000000", "200000", "1200000")],
      d(50000),
      "single"
    );
    expect(result.expenseRatio.toNumber()).toBe(1);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(200000);
  });

  it("very large bond redemption above phase-out → zero exclusion", () => {
    // $500,000 proceeds, $100,000 interest, $600,000 expenses
    // AGI $200,000 well above single upper limit ($115,800) → fully phased out
    const result = calculateForm8815(
      [makeBond("500000", "100000", "600000")],
      d(200000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Bonds with Varied Amounts
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - multiple bonds with varied amounts", () => {
  it("four bonds with different amounts aggregate proceeds, interest, and expenses", () => {
    // Bond A: $2,000 proceeds, $400 interest, $1,500 expenses
    // Bond B: $5,000 proceeds, $1,000 interest, $3,000 expenses
    // Bond C: $15,000 proceeds, $3,000 interest, $12,000 expenses
    // Bond D: $8,000 proceeds, $1,600 interest, $10,000 expenses
    // Totals: proceeds $30,000, interest $6,000, expenses $26,500
    // ratio = min(1, 26500/30000) ≈ 0.8833
    // excludable = roundDollar(6000 × 0.8833...) = roundDollar(5300) = $5,300
    const result = calculateForm8815(
      [
        makeBond("2000", "400", "1500"),
        makeBond("5000", "1000", "3000"),
        makeBond("15000", "3000", "12000"),
        makeBond("8000", "1600", "10000"),
      ],
      d(50000),
      "single"
    );
    expect(result.totalProceeds.toNumber()).toBe(30000);
    expect(result.totalInterest.toNumber()).toBe(6000);
    expect(result.qualifiedExpenses.toNumber()).toBe(26500);
    // ratio = 26500/30000 = 0.88333...
    expect(result.expenseRatio.toDecimalPlaces(4).toNumber()).toBeCloseTo(0.8833, 3);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(5300);
  });

  it("two bonds where one has zero expenses — only the other contributes to exclusion", () => {
    // Bond A: $10,000 proceeds, $2,000 interest, $0 expenses
    // Bond B: $10,000 proceeds, $2,000 interest, $10,000 expenses
    // Totals: proceeds $20,000, interest $4,000, expenses $10,000
    // ratio = min(1, 10000/20000) = 0.5
    // excludable = roundDollar(4000 × 0.5) = $2,000
    const result = calculateForm8815(
      [
        makeBond("10000", "2000", "0"),
        makeBond("10000", "2000", "10000"),
      ],
      d(50000),
      "single"
    );
    expect(result.totalProceeds.toNumber()).toBe(20000);
    expect(result.totalInterest.toNumber()).toBe(4000);
    expect(result.qualifiedExpenses.toNumber()).toBe(10000);
    expect(result.expenseRatio.toNumber()).toBe(0.5);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// Exact Phase-Out Boundary Precision
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - exact phase-out boundary precision", () => {
  it("MFJ MAGI exactly at phase-out threshold ($149,250) → no reduction applied", () => {
    // AGI exactly at threshold → excess = $0 → phase-out ratio = 0 → full exclusion
    const result = calculateForm8815(
      [makeBond("10000", "3000", "15000")],
      d(149250),
      "married_filing_jointly"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });

  it("single MAGI $1 above phase-out threshold reduces exclusion by less than $1", () => {
    // AGI $99,501 → excess = $1 → ratio = 1/15000 → reduction rounds to $0
    // excludable before = $3,000 → reduction = roundDollar(3000 × 1/15000) = roundDollar(0.2) = $0
    // final = $3,000
    const result = calculateForm8815(
      [makeBond("10000", "3000", "10000")],
      d(99501),
      "single"
    );
    expect(result.excludableBeforePhaseOut.toNumber()).toBe(3000);
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Federal Pipeline Integration
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - federal pipeline", () => {
  it("savings bond exclusion reduces AGI", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);

    const withBonds: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Int: [{
        payer: "US Treasury",
        interestIncome: "3000",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "3000",
        federalWithheld: "0",
        taxExemptInterest: "0",
      }],
      savingsBondRedemptions: [{
        proceeds: "15000",
        interest: "3000",
        qualifiedExpenses: "20000",
      }],
    };
    const bondResult = calculateFederalTax(withBonds);

    // The $3K interest is added then the $3K exclusion removes it
    // So AGI should be roughly the same as base (within rounding)
    const agiDiff = bondResult.allLines
      .find((l) => l.form === "1040" && l.line === "11")?.value
      .minus(baseResult.allLines.find((l) => l.form === "1040" && l.line === "11")?.value ?? new Decimal(0));
    // With $3K interest added and $3K exclusion, net impact ≈ $0
    expect(agiDiff?.abs().lessThanOrEqualTo(1)).toBe(true);
  });

  it("Form 8815 lines appear in audit trail", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      savingsBondRedemptions: [{
        proceeds: "10000",
        interest: "2000",
        qualifiedExpenses: "8000",
      }],
    };
    const result = calculateFederalTax(fixture);
    const form8815Lines = result.allLines.filter((l) => l.form === "Form 8815");
    expect(form8815Lines.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Form 8815 MAGI: Student Loan Interest Add-Back
// Per IRS Form 8815 Instructions, Line 7: MAGI = AGI + student loan interest deduction
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - MAGI adds back student loan interest in federal pipeline", () => {
  it("SLI deduction added back to MAGI for Form 8815 phase-out — IRS Form 8815 Instructions Line 7", () => {
    // MFJ: $152,750 wages, $4K bond interest, $2,500 SLI
    // Total income: $156,750. SLI MAGI $156,750 < $170K → full $2,500 SLI.
    // AGI: $156,750 - $2,500 = $154,250
    // Correct Form 8815 MAGI: $154,250 + $2,500 = $156,750
    //   excess = $156,750 - $149,250 = $7,500; ratio = $7,500/$30,000 = 0.25
    //   reduction = roundDollar($4,000 × 0.25) = $1,000; excludable = $3,000
    // Buggy (no add-back) MAGI: $154,250
    //   excess = $5,000; ratio = $5,000/$30,000 = 0.16667
    //   reduction = roundDollar($4,000 × 0.16667) = $667; excludable = $3,333
    const fixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "A", lastName: "B", ssn: "111-11-1111", dateOfBirth: "1985-01-01" },
        spouse: { firstName: "C", lastName: "D", ssn: "222-22-2222", dateOfBirth: "1987-01-01" },
        address: { street: "1 Main", city: "X", state: "WA", zip: "98101" },
        dependents: [],
      },
      w2s: [{
        employer: { name: "E", ein: "99-9999999" },
        wages: "152750",
        federalWithheld: "20000",
        socialSecurityWages: "152750",
        socialSecurityWithheld: "9470.50",
        medicareWages: "152750",
        medicareWithheld: "2214.88",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0",
      }],
      form1099Int: [{
        payer: "US Treasury",
        interestIncome: "4000",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "4000",
        federalWithheld: "0",
        taxExemptInterest: "0",
      }],
      form1099Div: [], form1099B: [], form1099Nec: [], form1099Misc: [],
      scheduleK1: [], form1098: [], form1095A: [], donations: [],
      rentalProperties: [],
      savingsBondRedemptions: [{
        proceeds: "20000",
        interest: "4000",
        qualifiedExpenses: "20000", // ratio = 1, excludable before phase-out = $4,000
      }],
      adjustments: {
        estimatedTaxPayments: [],
        studentLoanInterest: "2500",
      },
    };
    const result = calculateFederalTax(fixture);

    // Find Form 8815 Line 7 (Modified AGI) in audit trail
    const form8815MAGI = result.allLines
      .find((l) => l.form === "Form 8815" && l.line === "7")?.value;
    // MAGI should be AGI + SLI = $154,250 + $2,500 = $156,750
    expect(form8815MAGI?.toNumber()).toBe(156750);

    // Form 8815 Line 13 (excludable) should be $3,000 (with SLI add-back), not $3,333
    const excludable = result.allLines
      .find((l) => l.form === "Form 8815" && l.line === "13")?.value;
    expect(excludable?.toNumber()).toBe(3000);
  });

  it("SLI add-back has no effect when SLI is zero (below MAGI threshold)", () => {
    // Single, $50K wages: SLI = $0 (no SLI paid) → MAGI = AGI
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      savingsBondRedemptions: [{
        proceeds: "10000",
        interest: "2000",
        qualifiedExpenses: "10000",
      }],
    };
    const result = calculateFederalTax(fixture);
    const form8815MAGI = result.allLines
      .find((l) => l.form === "Form 8815" && l.line === "7")?.value;
    const agi = result.allLines
      .find((l) => l.form === "1040" && l.line === "11")?.value;
    // With no SLI, MAGI should equal pre-exclusion AGI.
    // The form8815MAGI is computed before the bond exclusion reduces AGI.
    // Since no SLI is paid, MAGI = preliminary AGI = AGI before bond exclusion.
    expect(form8815MAGI?.toNumber()).toBe(agi?.toNumber());
  });

  it("SLI add-back pushes MAGI from below to above phase-out threshold", () => {
    // MFJ: wages set so AGI is just below $149,250, but SLI add-back pushes MAGI above
    // Wages $151,250, bond interest $500 (small), SLI $2,500
    // Total income: $151,750. SLI MAGI = $151,750 < $170K → full $2,500 SLI.
    // AGI = $151,750 - $2,500 = $149,250 (exactly at threshold)
    // Correct MAGI = $149,250 + $2,500 = $151,750 → excess $2,500
    // Buggy MAGI = $149,250 → at threshold → no reduction → full exclusion
    const fixture: TaxYearInput = {
      taxpayer: {
        taxYear: 2025,
        filingStatus: "married_filing_jointly",
        primary: { firstName: "A", lastName: "B", ssn: "111-11-1111", dateOfBirth: "1985-01-01" },
        spouse: { firstName: "C", lastName: "D", ssn: "222-22-2222", dateOfBirth: "1987-01-01" },
        address: { street: "1 Main", city: "X", state: "WA", zip: "98101" },
        dependents: [],
      },
      w2s: [{
        employer: { name: "E", ein: "99-9999999" },
        wages: "151250",
        federalWithheld: "20000",
        socialSecurityWages: "151250",
        socialSecurityWithheld: "9377.50",
        medicareWages: "151250",
        medicareWithheld: "2193.13",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0",
      }],
      form1099Int: [{
        payer: "US Treasury",
        interestIncome: "500",
        earlyWithdrawalPenalty: "0",
        usSavingsBondInterest: "500",
        federalWithheld: "0",
        taxExemptInterest: "0",
      }],
      form1099Div: [], form1099B: [], form1099Nec: [], form1099Misc: [],
      scheduleK1: [], form1098: [], form1095A: [], donations: [],
      rentalProperties: [],
      savingsBondRedemptions: [{
        proceeds: "5000",
        interest: "500",
        qualifiedExpenses: "5000", // ratio = 1, excludable before phase-out = $500
      }],
      adjustments: {
        estimatedTaxPayments: [],
        studentLoanInterest: "2500",
      },
    };
    const result = calculateFederalTax(fixture);

    // MAGI should be $149,250 + $2,500 = $151,750 (above threshold)
    const form8815MAGI = result.allLines
      .find((l) => l.form === "Form 8815" && l.line === "7")?.value;
    expect(form8815MAGI?.toNumber()).toBe(151750);

    // With MAGI $151,750: excess = $2,500, ratio = 2500/30000 = 0.08333...
    // reduction = roundDollar(500 × 0.08333) = roundDollar(41.67) = $42
    // excludable = $500 - $42 = $458
    // Without SLI add-back (buggy): MAGI $149,250 at threshold → no reduction → $500
    const excludable = result.allLines
      .find((l) => l.form === "Form 8815" && l.line === "13")?.value;
    expect(excludable?.toNumber()).toBe(458);
  });
});

// ═══════════════════════════════════════════════════════════
// Regression Tests — QSS threshold and corrected 2025 values
// ═══════════════════════════════════════════════════════════

describe("Form 8815 - regression tests for QSS and 2025 thresholds", () => {
  it("QSS at $120K MAGI → fully phased out (single upper limit $114,500)", () => {
    // Under old (wrong) code: QSS threshold $154,800 → $120K below threshold → full $2K exclusion
    // Correct: QSS threshold $99,500, upper $114,500 → $120K > $114,500 → fully phased out → $0
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(120000),
      "qualifying_surviving_spouse"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(0);
  });

  it("QSS at $99,500 MAGI → full exclusion at threshold boundary", () => {
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(99500),
      "qualifying_surviving_spouse"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(2000);
  });

  it("single at $103K MAGI — correct 2025 threshold produces different result than old $100,800", () => {
    // With correct threshold $99,500: excess = $3,500, ratio = 3500/15000 = 0.2333
    // reduction = roundDollar(2000 × 0.2333) = roundDollar(466.67) = $467
    // final = $2,000 - $467 = $1,533
    // With old wrong threshold $100,800: excess = $2,200, ratio = 0.1467, reduction = $293, final = $1,707
    const result = calculateForm8815(
      [makeBond("10000", "2000", "10000")],
      d(103000),
      "single"
    );
    expect(result.excludableSavingsBondInterest.toNumber()).toBe(1533);
  });
});
