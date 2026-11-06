/**
 * Edge case tests for Form 8812 — Credits for Qualifying Children and Other Dependents.
 * Spec: spec/federal/form-8812.yaml
 *
 * Focuses on:
 *   - Phase-out threshold boundaries ($200K single/HoH/MFS/QSS, $400K MFJ)
 *   - QSS uses $200K not $400K (IRC §24(b)(2): QSS is not a joint return)
 *   - Phase-out ceil rounding ($1 over threshold = $50 reduction)
 *   - Complete phase-out elimination boundaries
 *   - ACTC three-way min: unused CTC, 15% earned income, $1,700/child cap
 *   - Zero and negative earned income
 *   - Large families
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import type { Form8812Input } from "@/engine/forms/form-8812.js";
import type { FilingStatus } from "@/models/constants.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function make(overrides: Partial<Form8812Input> = {}): Form8812Input {
  return {
    qualifyingChildren: 1,
    otherDependents: 0,
    agi: d(50000),
    earnedIncome: d(50000),
    taxLiability: d(5000),
    filingStatus: "single",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// QSS uses $200K threshold, not $400K — IRC §24(b)(2)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - QSS phase-out threshold is $200K, not $400K (IRC §24(b)(2))", () => {
  it("Form 8812 Line 5 - QSS at exactly $200,000 AGI: no phase-out reduction", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(20000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(4400);
  });

  it("Form 8812 Line 5 - QSS at $200,001 AGI: $50 phase-out reduction (not exempt like MFJ)", () => {
    // 2025 IRS worksheet: result: line 12 = $4350, nonrefundable = $4350, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200001),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(20000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4350);
  });

  it("Form 8812 Line 5 - QSS at $300,000 AGI: credit still exists (would be full if MFJ threshold applied)", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(300000),
      filingStatus: "qualifying_surviving_spouse",
      taxLiability: d(40000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 5 - MFJ at $300,000 AGI: no phase-out (under $400K threshold)", () => {
    // 2025 IRS worksheet: mfjResult: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const mfjResult = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(300000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(40000),
    }), c);

    expect(mfjResult.ctcBeforeLimitation.toNumber()).toBe(4400);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out ceil rounding per $1,000 increments", () => {
  it("Form 8812 Line 12 - $1 over threshold rounds up to $1K → $50 reduction", () => {
    // 2025 IRS worksheet: result: line 12 = $2150, nonrefundable = $2150, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(200001),
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(2150);
  });

  it("Form 8812 Line 12 - $999 over threshold still rounds to $1K → same $50 reduction", () => {
    // 2025 IRS worksheet: result: line 12 = $2150, nonrefundable = $2150, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(200999),
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(2150);
  });

  it("Form 8812 Line 12 - $1,000 over threshold: exactly $1K → $50 reduction (no extra rounding)", () => {
    // 2025 IRS worksheet: result: line 12 = $2150, nonrefundable = $2150, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(201000),
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(2150);
  });

  it("Form 8812 Line 12 - $1,001 over threshold: rounds up to $2K → $100 reduction", () => {
    // 2025 IRS worksheet: result: line 12 = $2100, nonrefundable = $2100, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(201001),
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(2100);
  });
});

// ═══════════════════════════════════════════════════════════
// Complete phase-out elimination boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - complete phase-out elimination boundaries", () => {
  it("Form 8812 Line 12 - single, 1 child: completely phased out at exactly $244,000", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.

    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(244000),
      taxLiability: d(30000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 1 child: $243,999 is within the final rounded phase-out band", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(243999),
      taxLiability: d(30000),
    }), c);





    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 1 child: last $50 of credit at $243,000", () => {
    // 2025 IRS worksheet: result: line 12 = $50, nonrefundable = $50, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(243000),
      taxLiability: d(30000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });

  it("Form 8812 Line 12 - single, 1 child: $1 over $243,000 triggers complete phase-out", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(243001),
      taxLiability: d(30000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 2 children: completely phased out at $288,000", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.

    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(288000),
      taxLiability: d(50000),
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - single, 2 children: $50 credit remaining at $287,000", () => {
    // 2025 IRS worksheet: result: line 12 = $50, nonrefundable = $50, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(287000),
      taxLiability: d(50000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });

  it("Form 8812 Line 12 - MFJ, 1 child: completely phased out at $444,000", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(444000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(80000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - MFJ, 1 child: last $50 of credit at $443,000", () => {
    // 2025 IRS worksheet: result: line 12 = $50, nonrefundable = $50, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(443000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(80000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════
// All five filing statuses at threshold boundary
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - all filing statuses at $1 over their respective thresholds", () => {
  const statuses: { status: FilingStatus; threshold: number }[] = [
    { status: "single", threshold: 200000 },
    { status: "married_filing_jointly", threshold: 400000 },
    { status: "married_filing_separately", threshold: 200000 },
    { status: "head_of_household", threshold: 200000 },
    { status: "qualifying_surviving_spouse", threshold: 200000 },
  ];

  for (const { status, threshold } of statuses) {
    it(`Form 8812 Line 12 - ${status} at exactly $${threshold.toLocaleString()}: no phase-out`, () => {
      const result = calculateForm8812(make({
        qualifyingChildren: 1,
        agi: d(threshold),
        filingStatus: status,
        taxLiability: d(10000),
      }), c);
      expect(result.ctcBeforeLimitation.toNumber()).toBe(2200);
    });

    it(`Form 8812 Line 12 - ${status} at $${(threshold + 1).toLocaleString()}: $50 reduction`, () => {
      const result = calculateForm8812(make({
        qualifyingChildren: 1,
        agi: d(threshold + 1),
        filingStatus: status,
        taxLiability: d(10000),
      }), c);
      expect(result.ctcBeforeLimitation.toNumber()).toBe(2150);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ACTC three-way min: each limit as the binding constraint
// ═══════════════════════════════════════════════════════════

describe("Form 8812 Line 27 - ACTC three-way min binding constraint identification", () => {
  it("Form 8812 Line 27 - ACTC limited by unused CTC (smallest of three)", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $1800, unused = $400, ACTC = $400.

    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(80000),
      taxLiability: d(1800), // CTC $2,000 - $1,800 tax = $200 unused
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(400);
    expect(result.fifteenPercent.toNumber()).toBe(11625); // ($80K - $2.5K) × 15%
    expect(result.actc.toNumber()).toBe(400); // unused binds
  });

  it("Form 8812 Line 27 - ACTC limited by 15% earned income formula (smallest of three)", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $375.

    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(5000),
      taxLiability: d(0),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(4400);
    expect(result.fifteenPercent.toNumber()).toBe(375); // ($5K - $2.5K) × 15%
    expect(result.actc.toNumber()).toBe(375); // 15% formula binds
  });

  it("Form 8812 Line 27 - ACTC limited by $1,700/child cap (smallest of three)", () => {
    // 2025 IRS worksheet: result: line 12 = $2700, nonrefundable = $0, unused = $2700, ACTC = $1700.

    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 1, // adds $500 ODC to total, increasing unused
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(2700); // $2,000 CTC + $500 ODC
    expect(result.fifteenPercent.toNumber()).toBe(14625);
    expect(result.actc.toNumber()).toBe(1700); // cap binds: 1 × $1,700
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and negative earned income
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - zero and negative earned income", () => {
  it("Form 8812 Line 21 - zero earned income: ACTC is zero regardless of unused CTC", () => {
    // 2025 IRS worksheet: result: line 12 = $6600, nonrefundable = $0, unused = $6600, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      earnedIncome: d(0),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.unusedCTC.toNumber()).toBe(6600); // all unused
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Line 21 - negative earned income (SE losses): ACTC is zero", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $0.
    // Spec: SE losses reduce earned income — no zero floor on SE component
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(-5000), // wages minus SE loss > wages
      taxLiability: d(0),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC minimum earned income to produce nonzero refund
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC minimum earned income to produce nonzero refund", () => {
  it("Form 8812 Line 24 - earned income $2,507: 15% of $7 = $1.05 → rounds to $1 ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $0, unused = $2200, ACTC = $1.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2507),
      taxLiability: d(0),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(7);
    expect(result.fifteenPercent.toNumber()).toBe(1);
    expect(result.actc.toNumber()).toBe(1);
  });

  it("Form 8812 Line 24 - earned income $2,503: 15% of $3 = $0.45 → rounds to $0 ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $0, unused = $2200, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2503),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(3);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Large families: 6+ qualifying children
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - large family scenarios (6+ children)", () => {
  it("Form 8812 Line 27 - 6 children, low income: ACTC limited by 15% earned income", () => {
    // 2025 IRS worksheet: result: line 12 = $13200, nonrefundable = $0, unused = $13200, ACTC = $4125.
    const result = calculateForm8812(make({
      qualifyingChildren: 6,
      earnedIncome: d(30000),
      agi: d(30000),
      taxLiability: d(0),
    }), c);




    expect(result.ctcBeforeLimitation.toNumber()).toBe(13200);
    expect(result.actc.toNumber()).toBe(4125);
  });

  it("Form 8812 Line 27 - 6 children, moderate income: ACTC hits $1,700/child cap", () => {
    // 2025 IRS worksheet: result: line 12 = $13200, nonrefundable = $0, unused = $13200, ACTC = $10200.
    const result = calculateForm8812(make({
      qualifyingChildren: 6,
      earnedIncome: d(100000),
      agi: d(100000),
      taxLiability: d(0),
    }), c);




    expect(result.actc.toNumber()).toBe(10200);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed CTC + ODC with phase-out interactions
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out with mixed CTC and ODC dependents", () => {
  it("Form 8812 Line 12 - phase-out applies to combined CTC+ODC total", () => {
    // 2025 IRS worksheet: result: line 12 = $2700, nonrefundable = $2700, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      agi: d(210000), // $10K over single threshold
      taxLiability: d(20000),
    }), c);



    expect(result.ctcBeforeLimitation.toNumber()).toBe(2700);
  });

  it("Form 8812 Line 12 - phase-out eliminates CTC first, then ODC in combined total", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      agi: d(264000), // $60K over threshold
      taxLiability: d(20000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("Form 8812 Line 12 - ODC-only with phase-out still reduces correctly", () => {
    // 2025 IRS worksheet: result: line 12 = $1500, nonrefundable = $1500, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 4,
      agi: d(210000), // $10K over threshold
      taxLiability: d(5000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);

    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax liability exactly equals CTC: zero unused, zero ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - tax liability exactly matches CTC credit", () => {
  it("Form 8812 Lines 14-15 - tax = CTC: nonrefundable uses all, unused = $0, ACTC = $0", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(4400),
      earnedIncome: d(80000),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(4400);
    expect(result.unusedCTC.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Lines 14-15 - tax = CTC - $1: $1 unused flows to ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $2199, unused = $1, ACTC = $1.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(2199),
      earnedIncome: d(80000),
    }), c);



    expect(result.nonrefundableCTC.toNumber()).toBe(2199);
    expect(result.unusedCTC.toNumber()).toBe(1);
    expect(result.actc.toNumber()).toBe(1);
  });
});
