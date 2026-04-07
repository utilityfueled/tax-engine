/**
 * Form 8863 — Education Credits
 * Spec: spec/federal/form-8863.yaml
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

describe("Form 8863 - American Opportunity Credit", () => {
  // ── Line 1: AOC per student ──────────────────────────────
  it("Form 8863 Line 1 - AOC per student: max $2,500", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(10000) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 1 - AOC per student: $2K expenses", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(2000) }],
    }));
    // 100% of $2K = $2K
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 1 - AOC per student: $3K expenses", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(3000) }],
    }));
    // 100% of $2K + 25% of $1K = $2,250
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2250);
  });

  it("Form 8863 Line 1 - AOC per student: $500 expenses", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(500) }],
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(500);
  });

  // ── Line 2: AOC total ────────────────────────────────────
  it("Form 8863 Line 2 - AOC total for multiple students", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000) },
        { name: "B", qualifiedExpenses: d(4000) },
      ],
    }));
    expect(result.aocTotalTentative.toNumber()).toBe(5000); // $2,500 each
  });

  // ── Line 7: AOC phase-out ────────────────────────────────
  it("Form 8863 Line 7 - AOC no phase-out under threshold", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(70000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - AOC partial phase-out (single)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(85000),
      filingStatus: "single",
    }));
    // Phase-out: ($85K - $80K) / ($90K - $80K) = 50% reduced
    // $2,500 × 0.5 = $1,250
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
  });

  it("Form 8863 Line 7 - AOC fully phased out (single)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(90000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  it("Form 8863 Line 7 - AOC MFJ phase-out", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(170000),
      filingStatus: "married_filing_jointly",
    }));
    // ($170K - $160K) / ($180K - $160K) = 50%
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
  });

  it("Form 8863 Line 7 - AOC zero for MFS", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      filingStatus: "married_filing_separately",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });

  // ── Lines 8 & 14: Refundable / nonrefundable split ──────
  it("Form 8863 Line 8 - nonrefundable AOC is 60%", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(50000),
    }));
    expect(result.aocNonrefundable.toNumber()).toBe(1500); // 60% of $2,500
  });

  it("Form 8863 Line 14 - refundable AOC is 40%", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(50000),
    }));
    expect(result.aocRefundable.toNumber()).toBe(1000); // 40% of $2,500
  });
});

describe("Form 8863 - Lifetime Learning Credit", () => {
  it("Form 8863 Line 10 - LLC basic calculation", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(5000),
      magi: d(50000),
    }));
    // 20% × $5,000 = $1,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
  });

  it("Form 8863 Line 10 - LLC capped at $10K expenses", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(15000),
      magi: d(50000),
    }));
    // 20% × $10,000 = $2,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - LLC with phase-out (single)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(85000),
      filingStatus: "single",
    }));
    // $2,000 × 50% = $1,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);
  });

  it("Form 8863 Line 10 - LLC zero for MFS", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 - Totals", () => {
  it("Form 8863 Line 19 - total nonrefundable (AOC + LLC)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(5000),
      magi: d(50000),
    }));
    // Nonrefundable AOC = $1,500 + LLC = $1,000 = $2,500
    expect(result.totalNonrefundable.toNumber()).toBe(2500);
  });

  it("no students and no LLC expenses means zero", () => {
    const result = calculateForm8863(make());
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  it("produces audit trail for all lines", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(5000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("19");
  });
});

describe("Form 8863 - Additional AOC scenarios", () => {
  // ── AOC with expenses exactly $4,000 ─────────────────────
  it("Form 8863 Line 1 - AOC with exactly $4,000 expenses yields full $2,500", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(4000) }],
    }));
    // 100% of $2K = $2,000 + 25% of $2K = $500 → $2,500
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  // ── AOC with expenses $2,000 ──────────────────────────────
  it("Form 8863 Line 1 - AOC with $2,000 expenses yields partial $2,000 credit", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(2000) }],
    }));
    // 100% of $2K = $2,000, second tier is $0
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2000);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2000);
  });

  // ── AOC refundable (40%) vs nonrefundable (60%) split ────
  it("Form 8863 Lines 8 & 14 - partial AOC credit splits 40/60 correctly", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "Student A", qualifiedExpenses: d(2000) }],
      magi: d(50000),
    }));
    // aocAfterPhaseOut = $2,000; 60% nonrefundable = $1,200; 40% refundable = $800
    expect(result.aocNonrefundable.toNumber()).toBe(1200);
    expect(result.aocRefundable.toNumber()).toBe(800);
    expect(result.aocNonrefundable.plus(result.aocRefundable).toNumber()).toBe(2000);
  });

  // ── Multiple students: 3 students with varying expenses ──
  it("Form 8863 Line 2 - three students with varying expenses sum correctly", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Student A", qualifiedExpenses: d(4000) }, // $2,000 + 25%×$2,000 = $2,500
        { name: "Student B", qualifiedExpenses: d(3000) }, // $2,000 + 25%×$1,000 = $2,250
        { name: "Student C", qualifiedExpenses: d(1000) }, // $1,000
      ],
      magi: d(50000),
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocPerStudent[1].tentativeCredit.toNumber()).toBe(2250);
    expect(result.aocPerStudent[2].tentativeCredit.toNumber()).toBe(1000);
    expect(result.aocTotalTentative.toNumber()).toBe(5750);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(5750);
  });

  // ── MFJ AOC phase-out range: $160K–$180K ─────────────────
  it("Form 8863 Line 7 - MFJ AOC no phase-out at exactly $160K (threshold boundary)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    }));
    // At $160K the factor is 1.0 — full credit
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  it("Form 8863 Line 7 - MFJ AOC partial phase-out at $164K (20% reduction)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(164000),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 1 - (164K - 160K) / (180K - 160K) = 1 - 4/20 = 0.8
    // $2,500 × 0.8 = $2,000
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 7 - MFJ AOC fully phased out at $180K", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 - Additional LLC scenarios", () => {
  // ── LLC with expenses exactly $10,000 ────────────────────
  it("Form 8863 Line 10 - LLC with exactly $10,000 expenses yields max $2,000", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(50000),
    }));
    // 20% × $10,000 = $2,000 (no phase-out below $80K single)
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  // ── MFJ LLC phase-out range: $160K–$180K ─────────────────
  it("Form 8863 Line 10 - MFJ LLC no phase-out at exactly $160K (threshold boundary)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 1.0 — full $2,000
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  it("Form 8863 Line 10 - MFJ LLC partial phase-out at $164K (20% reduction)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(164000),
      filingStatus: "married_filing_jointly",
    }));
    // factor = 0.8; $2,000 × 0.8 = $1,600
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1600);
  });

  it("Form 8863 Line 10 - MFJ LLC fully phased out at $180K", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });
});

describe("Form 8863 - Audit trail line IDs", () => {
  it("audit trail contains one Line 1 entry per AOC student", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Student A", qualifiedExpenses: d(4000) },
        { name: "Student B", qualifiedExpenses: d(3000) },
      ],
    }));
    const line1Entries = result.lines.filter((l) => l.line === "1");
    expect(line1Entries).toHaveLength(2);
  });

  it("audit trail Line 1 exposes AOC year-limit eligibility inputs for an exhausted student", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Senior", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
      ],
      magi: d(50000),
    }));

    const line1 = result.lines.find((l) => l.line === "1" && l.description === "AOC for Senior");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(0);
    expect((line1!.inputs["Qualified expenses"] as Decimal).toNumber()).toBe(4000);
    expect((line1!.inputs["Prior AOC years claimed"] as Decimal).toNumber()).toBe(4);
    expect(line1!.inputs["Current-year AOC eligible"]).toBe("no");
  });

  it("audit trail contains all required line IDs when only LLC claimed", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(8000),
      magi: d(60000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    // LLC path: lines 2, 7, 8, 10, 14, 19 must all be present
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("19");
  });

  it("audit trail Line 10 value matches llcAfterPhaseOut result field", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(85000),
      filingStatus: "single",
    }));
    const line10 = result.lines.find((l) => l.line === "10");
    expect(line10).toBeDefined();
    expect(line10!.value.toNumber()).toBe(result.llcAfterPhaseOut.toNumber());
  });

  it("audit trail Line 19 value matches totalNonrefundable result field", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(5000),
      magi: d(50000),
    }));
    const line19 = result.lines.find((l) => l.line === "19");
    expect(line19).toBeDefined();
    expect(line19!.value.toNumber()).toBe(result.totalNonrefundable.toNumber());
  });
});

describe("Form 8863 - New coverage: 4-year limit, mixed credits, and more", () => {
  // ── 4-year AOC limit ──────────────────────────────────────
  it("Form 8863 Line 1 - student with 4 prior AOC years is ineligible and yields $0", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Senior", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
      ],
      magi: d(50000),
    }));
    // Student has already used all 4 AOC-eligible years → no credit
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(0);
    expect(result.aocTotalTentative.toNumber()).toBe(0);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
  });

  it("Form 8863 Line 1 - student with 3 prior AOC years is still eligible for year 4", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Junior", qualifiedExpenses: d(4000), priorYearsClaimed: 3 },
      ],
      magi: d(50000),
    }));
    // 3 prior years + current year = 4 total → still eligible
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocRefundable.toNumber()).toBe(1000);
  });

  it("Form 8863 Line 1 - mixed eligibility: one student eligible, one exhausted 4-year limit", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Freshman", qualifiedExpenses: d(4000), priorYearsClaimed: 0 },
        { name: "Grad", qualifiedExpenses: d(4000), priorYearsClaimed: 4 },
      ],
      magi: d(50000),
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500); // eligible
    expect(result.aocPerStudent[1].tentativeCredit.toNumber()).toBe(0);    // exhausted
    expect(result.aocTotalTentative.toNumber()).toBe(2500);
    expect(result.aocRefundable.toNumber()).toBe(1000);
    expect(result.aocNonrefundable.toNumber()).toBe(1500);
  });

  // ── AOC: 25% second-tier rate clearly isolated ────────────
  it("Form 8863 Line 1 - AOC expenses of $2,500 yield $2,125 (100% first $2K + 25% of $500)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(2500) }],
      magi: d(50000),
    }));
    // 100% × $2,000 = $2,000; 25% × $500 = $125; total = $2,125
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2125);
  });

  // ── AOC: $1,000 max refundable per return (40% × max $2,500 × number of students) ──
  it("Form 8863 Line 14 - two students at max AOC yield $2,000 total refundable (40% of $5,000)", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000) },
        { name: "B", qualifiedExpenses: d(4000) },
      ],
      magi: d(50000),
    }));
    // Each student: $2,500 credit; total tentative = $5,000
    // 40% refundable = $2,000; 60% nonrefundable = $3,000
    expect(result.aocTotalTentative.toNumber()).toBe(5000);
    expect(result.aocRefundable.toNumber()).toBe(2000);
    expect(result.aocNonrefundable.toNumber()).toBe(3000);
  });

  // ── AOC + LLC: can't claim both for the same student ─────
  it("Form 8863 - AOC and LLC expenses are separate pools; AOC student expenses must not be included in LLC", () => {
    // Taxpayer has one student eligible for AOC and separate LLC expenses for themselves.
    // The engine keeps the pools distinct; there is no double-counting.
    const aocOnly = calculateForm8863(make({
      aocStudents: [{ name: "Child", qualifiedExpenses: d(4000) }],
      llcExpenses: d(0),
      magi: d(50000),
    }));
    const llcOnly = calculateForm8863(make({
      aocStudents: [],
      llcExpenses: d(4000),
      magi: d(50000),
    }));
    const both = calculateForm8863(make({
      aocStudents: [{ name: "Child", qualifiedExpenses: d(4000) }],
      // Taxpayer's OWN separate courses — not the AOC student's expenses
      llcExpenses: d(4000),
      magi: d(50000),
    }));
    // AOC only: $2,500 credit, $0 LLC
    expect(aocOnly.aocAfterPhaseOut.toNumber()).toBe(2500);
    expect(aocOnly.llcAfterPhaseOut.toNumber()).toBe(0);
    // LLC only: 20% × $4,000 = $800, $0 AOC
    expect(llcOnly.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(llcOnly.llcAfterPhaseOut.toNumber()).toBe(800);
    // Both together: credits are additive, not merged
    expect(both.aocAfterPhaseOut.toNumber()).toBe(2500);
    expect(both.llcAfterPhaseOut.toNumber()).toBe(800);
    // Total nonrefundable = $1,500 (60% AOC) + $800 (LLC) = $2,300
    expect(both.totalNonrefundable.toNumber()).toBe(2300);
  });

  // ── Multiple students: AOC students + per-return LLC ─────
  it("Form 8863 - two AOC students plus per-return LLC expenses compute all credits independently", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "Child1", qualifiedExpenses: d(4000) }, // $2,500 AOC
        { name: "Child2", qualifiedExpenses: d(2000) }, // $2,000 AOC
      ],
      llcExpenses: d(5000), // taxpayer's own continuing-ed: 20% × $5K = $1,000
      magi: d(50000),
    }));
    expect(result.aocTotalTentative.toNumber()).toBe(4500); // $2,500 + $2,000
    expect(result.aocAfterPhaseOut.toNumber()).toBe(4500);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1000);  // 20% × $5,000
    // Nonrefundable = 60% × $4,500 + $1,000 = $2,700 + $1,000 = $3,700
    expect(result.totalNonrefundable.toNumber()).toBe(3700);
    // Refundable = 40% × $4,500 = $1,800
    expect(result.totalRefundable.toNumber()).toBe(1800);
  });

  // ── LLC: 20% rate verified on below-cap amount ───────────
  it("Form 8863 Line 10 - LLC with $3,000 expenses yields $600 (20% rate clearly shown)", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(3000),
      magi: d(50000),
      filingStatus: "single",
    }));
    expect(result.llcTentative.toNumber()).toBe(600);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(600);
  });

  // ── LLC: single filer partial phase-out at $80K boundary ─
  it("Form 8863 Line 10 - single MAGI exactly $80K gives full LLC credit with no phase-out reduction", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(10000),
      magi: d(80000),
      filingStatus: "single",
    }));
    // $80K is at the start of the phase-out band → factor = 1.0
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  // ── MFS: no credits of any kind ──────────────────────────
  it("Form 8863 - MFS with large expenses and low MAGI still receives zero for both credits", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000) },
        { name: "B", qualifiedExpenses: d(4000) },
      ],
      llcExpenses: d(10000),
      magi: d(30000), // well below any threshold, but MFS disqualifies entirely
      filingStatus: "married_filing_separately",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  // ── Audit trail: Line 7 and Line 8 cross-check ───────────
  it("audit trail Line 7 value matches aocAfterPhaseOut and Line 8 is exactly 60% of Line 7", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(85000),
      filingStatus: "single",
    }));
    const line7 = result.lines.find((l) => l.line === "7");
    const line8 = result.lines.find((l) => l.line === "8");
    expect(line7).toBeDefined();
    expect(line8).toBeDefined();
    expect(line7!.value.toNumber()).toBe(result.aocAfterPhaseOut.toNumber());
    // Line 8 must be exactly 60% of Line 7
    expect(line8!.value.toNumber()).toBe(
      new Decimal(line7!.value).times("0.6").toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    );
  });
});

describe("Form 8863 - Extended coverage", () => {
  // ── AOTC 40% refundable / 60% nonrefundable split ─────
  it("Form 8863 Lines 8 & 14 - AOTC refundable 40% and nonrefundable 60% sum to full credit after phase-out", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(85000),
      filingStatus: "single",
    }));
    // Phase-out factor = 0.5, credit = $2,500 * 0.5 = $1,250
    expect(result.aocAfterPhaseOut.toNumber()).toBe(1250);
    expect(result.aocRefundable.toNumber()).toBe(500);       // 40% of $1,250
    expect(result.aocNonrefundable.toNumber()).toBe(750);    // 60% of $1,250
    expect(result.aocRefundable.plus(result.aocNonrefundable).toNumber()).toBe(1250);
  });

  // ── LLC is nonrefundable only ──────────────────────────
  it("Form 8863 - LLC contributes only to nonrefundable total, never to refundable", () => {
    const result = calculateForm8863(make({
      llcExpenses: d(8000),
      magi: d(50000),
      filingStatus: "single",
    }));
    // LLC = 20% * $8,000 = $1,600, no phase-out
    expect(result.llcAfterPhaseOut.toNumber()).toBe(1600);
    expect(result.totalNonrefundable.toNumber()).toBe(1600);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  // ── MFS exclusion from both credits ────────────────────
  it("Form 8863 - MFS filing status zeroes out both AOC and LLC credits", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(50000),
      filingStatus: "married_filing_separately",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
    expect(result.aocNonrefundable.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });

  // ── Phase-out exact boundary: single $80K ──────────────
  it("Form 8863 Line 7 - single MAGI exactly $80K gets full credit (phase-out start boundary)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      magi: d(80000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
  });

  // ── Phase-out exact boundary: single $90K ──────────────
  it("Form 8863 Line 7 - single MAGI exactly $90K gets zero credit (phase-out end boundary)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(90000),
      filingStatus: "single",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });

  // ── Phase-out exact boundary: MFJ $160K ────────────────
  it("Form 8863 Line 7 - MFJ MAGI exactly $160K gets full credit (phase-out start boundary)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(160000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(2500);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(2000);
  });

  // ── Phase-out exact boundary: MFJ $180K ────────────────
  it("Form 8863 Line 7 - MFJ MAGI exactly $180K gets zero credit (phase-out end boundary)", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(4000) }],
      llcExpenses: d(10000),
      magi: d(180000),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
  });

  // ── Multiple students with mixed expenses ──────────────
  it("Form 8863 - four students each hit different AOC tiers", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(500) },   // $500
        { name: "B", qualifiedExpenses: d(2000) },  // $2,000
        { name: "C", qualifiedExpenses: d(3500) },  // $2,000 + 25%*$1,500 = $2,375
        { name: "D", qualifiedExpenses: d(6000) },  // $2,000 + 25%*$2,000 = $2,500
      ],
      magi: d(50000),
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(500);
    expect(result.aocPerStudent[1].tentativeCredit.toNumber()).toBe(2000);
    expect(result.aocPerStudent[2].tentativeCredit.toNumber()).toBe(2375);
    expect(result.aocPerStudent[3].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocTotalTentative.toNumber()).toBe(7375);
    // 60/40 split on full $7,375
    expect(result.aocNonrefundable.toNumber()).toBe(4425);
    expect(result.aocRefundable.toNumber()).toBe(2950);
  });

  // ── Expenses exactly at $4,000 AOTC cap ────────────────
  it("Form 8863 Line 1 - expenses at exactly $4,000 cap yield max $2,500 per student", () => {
    const result = calculateForm8863(make({
      aocStudents: [
        { name: "A", qualifiedExpenses: d(4000) },
        { name: "B", qualifiedExpenses: d(4000) },
      ],
      magi: d(50000),
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocPerStudent[1].tentativeCredit.toNumber()).toBe(2500);
    expect(result.aocTotalTentative.toNumber()).toBe(5000);
    // No additional benefit from more expenses beyond $4K
    const overResult = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(50000) }],
      magi: d(50000),
    }));
    expect(overResult.aocPerStudent[0].tentativeCredit.toNumber()).toBe(2500);
  });

  // ── Zero expenses everywhere ───────────────────────────
  it("Form 8863 - zero expenses for both AOC students and LLC yields all-zero results", () => {
    const result = calculateForm8863(make({
      aocStudents: [{ name: "A", qualifiedExpenses: d(0) }],
      llcExpenses: d(0),
      magi: d(50000),
    }));
    expect(result.aocPerStudent[0].tentativeCredit.toNumber()).toBe(0);
    expect(result.aocTotalTentative.toNumber()).toBe(0);
    expect(result.aocAfterPhaseOut.toNumber()).toBe(0);
    expect(result.aocNonrefundable.toNumber()).toBe(0);
    expect(result.aocRefundable.toNumber()).toBe(0);
    expect(result.llcTentative.toNumber()).toBe(0);
    expect(result.llcAfterPhaseOut.toNumber()).toBe(0);
    expect(result.totalNonrefundable.toNumber()).toBe(0);
    expect(result.totalRefundable.toNumber()).toBe(0);
  });
});
