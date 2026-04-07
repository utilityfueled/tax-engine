/**
 * Edge case tests for Form 8863 — Education Credits (AOC + LLC)
 * Spec: spec/federal/form-8863.yaml
 *
 * Focuses on:
 * - QSS filing status uses single thresholds (NOT MFJ) per IRC §25A(d)(2)
 * - HoH filing status uses single thresholds
 * - $1 boundary tests at phase-out start and end
 * - priorYearsClaimed edge values for the 4-year AOC limit
 * - Phase-out precision at non-round MAGI values
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import type { Form8863Input } from "@/engine/forms/form-8863.js";

const d = (n: number | string) => new Decimal(n);

function make(overrides: Partial<Form8863Input> = {}): Form8863Input {
  return {
    aocStudents: [],
    llcExpenses: d(0),
    magi: d(50000),
    filingStatus: "single",
    ...overrides,
  };
}

describe("Form 8863 Edge Cases — QSS Filing Status (IRC §25A(d)(2))", () => {
  // QSS uses single/HoH thresholds ($80K-$90K), NOT MFJ ($160K-$180K)
  // per IRC §25A(d)(2): "joint return" language excludes QSS

  it("Form 8863 Line 7 - QSS MAGI $80,000 gets full AOC (single threshold start)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(80000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - QSS MAGI $85,000 gets 50% AOC (mid single phase-out)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(85000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    // factor = 1 - (85K - 80K) / (90K - 80K) = 0.5
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
  });

  it("Form 8863 Line 7 - QSS MAGI $90,000 gets zero AOC (single threshold end)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(90000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  it("Form 8863 Line 10 - QSS MAGI $85,000 gets 50% LLC (single phase-out, not MFJ)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(85000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    // LLC tentative = $2,000; factor = 0.5 → $1,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
  });

  it("Form 8863 - QSS at $160,000 (MFJ start) is fully phased out because QSS uses single range", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(160000),
      filingStatus: "qualifying_surviving_spouse",
    }));
    // $160K is far above the single $90K phase-out end → zero
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 Edge Cases — HoH Filing Status", () => {
  it("Form 8863 Line 7 - HoH MAGI $80,000 gets full AOC (same as single)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(80000),
      filingStatus: "head_of_household",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - HoH MAGI $85,000 gets 50% AOC", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(85000),
      filingStatus: "head_of_household",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
  });

  it("Form 8863 Line 7 - HoH MAGI $90,000 gets zero AOC", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(90000),
      filingStatus: "head_of_household",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 Edge Cases — $1 Phase-Out Boundaries", () => {
  // Single: $80K start, $90K end

  it("Form 8863 Line 7 - single MAGI $80,001 triggers phase-out ($1 above start)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(80001),
      filingStatus: "single",
    }));
    // factor = 1 - 1/10000 = 0.9999
    // $2,500 × 0.9999 = $2,499.75 → rounded to $2,500
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - single MAGI $89,999 is nearly phased out ($1 below end)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(89999),
      filingStatus: "single",
    }));
    // factor = 1 - 9999/10000 = 0.0001
    // $2,500 × 0.0001 = $0.25 → rounded to $0
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  // MFJ: $160K start, $180K end

  it("Form 8863 Line 7 - MFJ MAGI $160,001 triggers phase-out ($1 above start)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(160001),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 1 - 1/20000 = 0.99995
    // $2,500 × 0.99995 = $2,499.875 → rounded to $2,500
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - MFJ MAGI $179,999 is nearly phased out ($1 below end)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(179999),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 1 - 19999/20000 = 0.00005
    // $2,500 × 0.00005 = $0.125 → rounded to $0
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  it("Form 8863 Line 10 - single MAGI $80,001 LLC barely reduced ($1 above start)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(80001),
      filingStatus: "single",
    }));
    // factor = 0.9999; $2,000 × 0.9999 = $1,999.80 → $2,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - single MAGI $89,999 LLC nearly zero ($1 below end)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(89999),
      filingStatus: "single",
    }));
    // factor = 0.0001; $2,000 × 0.0001 = $0.20 → $0
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 Edge Cases — 4-Year AOC Limit Boundaries", () => {
  it("Form 8863 Line 1 - priorYearsClaimed undefined defaults to 0 (eligible)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
    }));
    // No priorYearsClaimed → defaults to 0 → eligible
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 1 - priorYearsClaimed = 5 still ineligible (over 4)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000), priorYearsClaimed: 5 }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(0);
  });

  it("Form 8863 Line 1 - priorYearsClaimed = 0 student in first year is fully eligible", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Freshman", qualifiedExpenses: d(4000), priorYearsClaimed: 0 }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 - all 4 students exhausted AOC yields zero total with LLC still available", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
        { name: "B", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
      ],
      llcExpenses: d(10000),
      magi: d(50000),
    }));
    expect(result.aocTotalTentative.toNumber()).toBe(0);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
    // LLC is independent and still works
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
    expect(result.totalNonrefundable.toNumber()).toBe(2000);
  });
});

describe("Form 8863 Edge Cases — Phase-Out Precision", () => {
  it("Form 8863 Line 7 - single MAGI $82,000 gives 80% factor (20% through range)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(82000),
      filingStatus: "single",
    }));
    // factor = 1 - 2000/10000 = 0.8
    // $2,500 × 0.8 = $2,000
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 7 - single MAGI $88,000 gives 20% factor (80% through range)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(88000),
      filingStatus: "single",
    }));
    // factor = 1 - 8000/10000 = 0.2
    // $2,500 × 0.2 = $500
    expect(result.aocAfterPhaseOut.toNumber()).toBe(500);
  });

  it("Form 8863 Line 7 - single MAGI $83,333 gives non-round factor", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(83333),
      filingStatus: "single",
    }));
    // factor = 1 - 3333/10000 = 0.6667
    // $2,500 × 0.6667 = $1,666.75 → rounded to $1,667
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1667);
  });

  it("Form 8863 - AOC refundable/nonrefundable split preserves precision at odd phase-out", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(83333),
      filingStatus: "single",
    }));
    const total = result.aocAfterPhaseOut.toNumber();
    // 60% nonrefundable + 40% refundable should sum to total
    // (rounding may differ by $1 in edge cases — verify consistency)
    expect(result.aocNonrefundable.plus(result.aocRefundable).toNumber()).toBe(total);
  });
});

describe("Form 8863 Edge Cases — Combined AOC + LLC at Boundaries", () => {
  it("Form 8863 - both credits at exactly phase-out start yield full amounts", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(80000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
    expect(result.totalNonrefundable.toNumber()).toBe(3500); // 60% of $2500 + $2000
    expect(result.totalRefundable.toNumber()).toBe(1000); // 40% of $2500
  });

  it("Form 8863 - both credits at exactly phase-out end yield zero", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(90000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  it("Form 8863 - AOC + LLC at mid phase-out calculates both proportionally", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000) },
        { name: "B", qualifiedExpenses: d(4000) },
      ],
      llcExpenses: d(10000),
      magi: d(85000),
      filingStatus: "single",
    }));
    // AOC: $5,000 tentative × 0.5 = $2,500
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
    // LLC: $2,000 tentative × 0.5 = $1,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
    // Total nonrefundable: 60% of $2,500 + $1,000 = $1,500 + $1,000 = $2,500
    expect(result.totalNonrefundable.toNumber()).toBe(2500);
    // Refundable: 40% of $2,500 = $1,000
    expect(result.totalRefundable.toNumber()).toBe(1000);
  });
});

describe("Form 8863 Edge Cases — MFS Gets Zero Credits", () => {
  it("Form 8863 Line 7 - MFS with AOC-eligible student gets zero AOC (no education credits for MFS)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(30000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
    expect(result.aocNonrefundable.toNumber()).toBe(0);
  });

  it("Form 8863 Line 10 - MFS with LLC expenses gets zero LLC (no education credits for MFS)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(30000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
  });

  it("Form 8863 - MFS with both AOC and LLC gets zero across all credit lines", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(30000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });
});

describe("Form 8863 Edge Cases — MFJ Exact Phase-Out Boundaries", () => {
  it("Form 8863 Line 7 - MFJ MAGI exactly $160,000 gets full AOC (at phase-out start)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - MFJ MAGI exactly $180,000 gets zero AOC (at phase-out end)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  it("Form 8863 Line 10 - MFJ MAGI exactly $160,000 gets full LLC", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - MFJ MAGI exactly $180,000 gets zero LLC", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });

  it("Form 8863 Line 7 - MFJ MAGI $170,000 gives 50% factor (midpoint of phase-out)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(170000),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 1 - 10000/20000 = 0.5
    // $2,500 × 0.5 = $1,250
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
  });
});

describe("Form 8863 Edge Cases — AOC Expense Tier Boundaries", () => {
  it("Form 8863 Line 1 - expenses exactly $2,000 yield $2,000 AOC (100% first tier only)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(2000) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 1 - expenses $2,001 trigger 25% second tier ($2,000.25 rounds to $2,000)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(2001) }],
    }));
    // 100% of $2K + 25% of $1 = $2000 + $0.25 → round to $2,000
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 1 - expenses exactly $4,000 yield maximum $2,500 AOC", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
    }));
    // 100% of $2K + 25% of $2K = $2,000 + $500 = $2,500
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 1 - expenses $10,000 still cap at $2,500 AOC (only first $4K matters)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(10000) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 1 - expenses $1 yield $1 AOC (minimum contribution)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(1) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(1);
  });

  it("Form 8863 Line 1 - expenses $3,000 yield $2,250 (straddles both tiers)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(3000) }],
    }));
    // 100% of $2K + 25% of $1K = $2,000 + $250 = $2,250
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2250);
  });
});

describe("Form 8863 Edge Cases — LLC Expense Cap", () => {
  it("Form 8863 Line 10 - LLC expenses exactly $10,000 yield $2,000 max credit", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
    }));
    expect(result.llcTentative.toNumber()).toBe(2000);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - LLC expenses $50,000 still cap at $2,000 (only first $10K)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(50000),
    }));
    expect(result.llcTentative.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - LLC expenses $1 yield $0 (20% of $1 rounds to $0)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(1),
    }));
    expect(result.llcTentative.toNumber()).toBe(0);
  });

  it("Form 8863 Line 10 - LLC expenses $5 yield $1 (20% of $5 = $1)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(5),
    }));
    expect(result.llcTentative.toNumber()).toBe(1);
  });
});

describe("Form 8863 Edge Cases — AOC 4-Year Limit at Boundary", () => {
  it("Form 8863 Line 1 - priorYearsClaimed = 3 is still eligible (4th and final year)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Senior", qualifiedExpenses: d(4000), priorYearsClaimed: 3 }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 1 - priorYearsClaimed = 4 is ineligible (already used all 4 years)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "5thYear", qualifiedExpenses: d(4000), priorYearsClaimed: 4 }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(0);
  });

  it("Form 8863 - mix of eligible and exhausted students sums correctly", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Eligible", qualifiedExpenses: d(4000), priorYearsClaimed: 2 },
        { name: "Exhausted", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
        { name: "AlsoEligible", qualifiedExpenses: d(3000), priorYearsClaimed: 0 },
      ],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocPerStudent[1].tentativeCredit.toNumber()).toBe(0);
    expect(result.aocPerStudent[2].tentativeCredit.toNumber()).toBe(2250);
    expect(result.aocTotalTentative.toNumber()).toBe(4750);
  });
});

describe("Form 8863 Edge Cases — Zero Expenses", () => {
  it("Form 8863 - no AOC students and zero LLC expenses yields all zeros", () => {
    const result = calculateForm8863(make({
      aocStudents: [],
      llcExpenses: d(0),
    }));
    expect(result.aocTotalTentative.toNumber()).toBe(0);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcTentative.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  it("Form 8863 - AOC student with $0 expenses yields $0 credit", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(0) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(0);
    expect(result.aocTotalTentative.toNumber()).toBe(0);
  });
});
