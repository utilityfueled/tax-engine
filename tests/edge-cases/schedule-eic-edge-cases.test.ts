/**
 * Edge case tests for Schedule EIC — Earned Income Credit.
 * Covers MFJ-specific phase-out boundaries, investment income threshold
 * precision, AGI vs earned income divergence across child counts, MFS
 * separated-spouse exception variations, plateau verification, and
 * filing-status comparison at identical income.
 *
 * Spec: spec/federal/schedule-eic.yaml
 * Constants (2025): Rev. Proc. 2024-40 §3.06
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateEic } from "@/engine/forms/schedule-eic.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);
const d = (n: number | string) => new Decimal(n);

function eic(overrides: {
  filingStatus?: string;
  qualifyingChildren?: number;
  earnedIncome?: number | string;
  agi?: number | string;
  investmentIncome?: number | string;
  primaryAge?: number;
  mfsEicEligible?: boolean;
}) {
  return calculateEic(
    {
      filingStatus: (overrides.filingStatus ?? "single") as "single",
      qualifyingChildren: overrides.qualifyingChildren ?? 0,
      earnedIncome: d(overrides.earnedIncome ?? 15000),
      agi: d(overrides.agi ?? overrides.earnedIncome ?? 15000),
      investmentIncome: d(overrides.investmentIncome ?? 0),
      primaryAge: overrides.primaryAge ?? 35,
      mfsEicEligible: overrides.mfsEicEligible ?? false,
    },
    constants,
  );
}

// ═══════════════════════════════════════════════════════════
// Investment Income Boundary Precision
// ═══════════════════════════════════════════════════════════

describe("EIC - investment income boundary", () => {
  it("EIC - investment income at $11,951 disqualifies ($1 above limit)", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, investmentIncome: 11951 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("11950");
  });

  it("EIC - investment income at $11,949 still allowed ($1 below limit)", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, investmentIncome: 11949 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.disqualified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ 0-Children Phase-Out Boundaries
// ═══════════════════════════════════════════════════════════

describe("EIC - MFJ 0 children boundaries", () => {
  it("EIC - 0 children MFJ at exact phase-out start ($17,730) gets max credit", () => {
    // phase-in = 7.65% × $8,490 = $649.485, phase-out = $0
    // credit = floor($649.485) = $649
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 0,
      earnedIncome: 17730,
      primaryAge: 35,
    });
    expect(result.credit.toNumber()).toBe(649);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - 0 children MFJ mid-phase-out ($22,000)", () => {
    // phase-in = 7.65% × $8,490 = $649.485
    // phase-out = 7.65% × ($22,000 − $17,730) = 7.65% × $4,270 = $326.655
    // credit = floor($649.485 − $326.655) = floor($322.83) = $322
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 0,
      earnedIncome: 22000,
      primaryAge: 35,
    });
    expect(result.credit.toNumber()).toBe(322);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ 2+ Children Phase-Out Boundaries
// ═══════════════════════════════════════════════════════════

describe("EIC - MFJ 2+ children boundaries", () => {
  it("EIC - 2 children MFJ at exact phase-out start ($30,470) gets max credit", () => {
    // phase-in = 40% × $17,880 = $7,152, phase-out = $0
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 2,
      earnedIncome: 30470,
    });
    expect(result.credit.toNumber()).toBe(7152);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - 3 children MFJ mid-phase-out ($50,000)", () => {
    // phase-in = 45% × $17,880 = $8,046
    // phase-out = 21.06% × ($50,000 − $30,470) = 21.06% × $19,530 = $4,113.018
    // credit = floor($8,046 − $4,113.018) = floor($3,932.982) = $3,932
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 3,
      earnedIncome: 50000,
    });
    expect(result.credit.toNumber()).toBe(3932);
  });
});

// ═══════════════════════════════════════════════════════════
// 3 Children Single Mid-Phase-Out
// ═══════════════════════════════════════════════════════════

describe("EIC - 3 children single", () => {
  it("EIC - 3 children single mid-phase-out ($40,000)", () => {
    // phase-in = 45% × $17,880 = $8,046
    // phase-out = 21.06% × ($40,000 − $23,350) = 21.06% × $16,650 = $3,506.49
    // credit = floor($8,046 − $3,506.49) = floor($4,539.51) = $4,539
    const result = eic({ qualifyingChildren: 3, earnedIncome: 40000 });
    expect(result.credit.toNumber()).toBe(4539);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI vs Earned Income Divergence (multiple child counts)
// ═══════════════════════════════════════════════════════════

describe("EIC - AGI vs earned income divergence", () => {
  it("EIC - 0 children: AGI higher than earned income drives phase-out", () => {
    // earned $9,000, AGI $15,000 (AGI higher from other income)
    // phase-in = 7.65% × $8,490 = $649.485 (earned > $8,490 cap)
    // phase-out income = max($9,000, $15,000) = $15,000
    // phase-out = 7.65% × ($15,000 − $10,620) = 7.65% × $4,380 = $335.07
    // credit = floor($649.485 − $335.07) = floor($314.415) = $314
    const result = eic({
      qualifyingChildren: 0,
      earnedIncome: 9000,
      agi: 15000,
      primaryAge: 35,
    });
    expect(result.credit.toNumber()).toBe(314);
  });

  it("EIC - 2 children: AGI higher than earned income drives phase-out", () => {
    // earned $20,000, AGI $50,000
    // phase-in = 40% × $17,880 = $7,152
    // phase-out income = max($20,000, $50,000) = $50,000
    // phase-out = 21.06% × ($50,000 − $23,350) = 21.06% × $26,650 = $5,612.49
    // credit = floor($7,152 − $5,612.49) = floor($1,539.51) = $1,539
    const result = eic({
      qualifyingChildren: 2,
      earnedIncome: 20000,
      agi: 50000,
    });
    expect(result.credit.toNumber()).toBe(1539);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Separated-Spouse Exception Variations
// ═══════════════════════════════════════════════════════════

describe("EIC - MFS separated-spouse exception", () => {
  it("EIC - MFS with exception uses single/HoH thresholds at mid-phase-out", () => {
    // MFS eligible, 1 child, earned $45,000
    // phase-in = 34% × $12,730 = $4,328.20
    // phase-out = 15.98% × ($45,000 − $23,350) = 15.98% × $21,650 = $3,459.67
    // credit = floor($4,328.20 − $3,459.67) = floor($868.53) = $868
    const result = eic({
      filingStatus: "married_filing_separately",
      qualifyingChildren: 1,
      earnedIncome: 45000,
      mfsEicEligible: true,
    });
    expect(result.credit.toNumber()).toBe(868);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - MFS with exception still subject to childless age restriction", () => {
    // MFS eligible, 0 children, earned $8,000, age 24 → disqualified by age
    const result = eic({
      filingStatus: "married_filing_separately",
      qualifyingChildren: 0,
      earnedIncome: 8000,
      primaryAge: 24,
      mfsEicEligible: true,
    });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("age");
  });

  it("EIC - MFS with exception 0 children age 25 qualifies", () => {
    // MFS eligible, 0 children, earned $8,000, age 25 → uses single/HoH thresholds
    // phase-in = 7.65% × $8,000 = $612 (earned < $8,490)
    // phase-out = 7.65% × max(0, $8,000 − $10,620) = $0 (below phase-out start)
    // credit = floor($612) = $612
    const result = eic({
      filingStatus: "married_filing_separately",
      qualifyingChildren: 0,
      earnedIncome: 8000,
      primaryAge: 25,
      mfsEicEligible: true,
    });
    expect(result.credit.toNumber()).toBe(612);
    expect(result.disqualified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-In Ceiling Boundary ($1 Below Earned Income Amount)
// ═══════════════════════════════════════════════════════════

describe("EIC - phase-in ceiling boundary", () => {
  it("EIC - 2 children earned $17,879 ($1 below ceiling) gets $7,151", () => {
    // phase-in = 40% × $17,879 = $7,151.60
    // credit = floor($7,151.60) = $7,151
    // vs at $17,880: floor($7,152.00) = $7,152 → the $1 matters
    const below = eic({ qualifyingChildren: 2, earnedIncome: 17879 });
    const atCeiling = eic({ qualifyingChildren: 2, earnedIncome: 17880 });
    expect(below.credit.toNumber()).toBe(7151);
    expect(atCeiling.credit.toNumber()).toBe(7152);
  });
});

// ═══════════════════════════════════════════════════════════
// Plateau Verification (Between Phase-In Ceiling & Phase-Out Start)
// ═══════════════════════════════════════════════════════════

describe("EIC - plateau verification", () => {
  it("EIC - 0 children single on plateau ($9,500) gets max credit", () => {
    // $9,500 is between earned income amount ($8,490) and phase-out start ($10,620)
    // phase-in = 7.65% × $8,490 = $649.485, phase-out = $0
    // credit = floor($649.485) = $649
    const result = eic({ qualifyingChildren: 0, earnedIncome: 9500, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(649);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - 1 child single on plateau ($18,000) gets max credit", () => {
    // $18,000 is between earned income amount ($12,730) and phase-out start ($23,350)
    // credit = floor(34% × $12,730) = floor($4,328.20) = $4,328
    const result = eic({ qualifyingChildren: 1, earnedIncome: 18000 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Extreme Age with Children (No Age Restriction)
// ═══════════════════════════════════════════════════════════

describe("EIC - age restriction applies only to childless filers", () => {
  it("EIC - filer age 18 with 2 children qualifies", () => {
    const result = eic({ qualifyingChildren: 2, earnedIncome: 15000, primaryAge: 18 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - filer age 80 with 1 child qualifies", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: 15000, primaryAge: 80 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.disqualified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// All Filing Statuses at Identical Income (1 child, $25,000)
// ═══════════════════════════════════════════════════════════

describe("EIC - filing status comparison at same income", () => {
  it("EIC - 1 child at $25,000: single, HoH, MFJ, QSS, MFS produce correct brackets", () => {
    // Single: phase-out = 15.98% × ($25,000 − $23,350) = 15.98% × $1,650 = $263.67
    //   credit = floor($4,328.20 − $263.67) = floor($4,064.53) = $4,064
    const single = eic({ filingStatus: "single", qualifyingChildren: 1, earnedIncome: 25000 });
    expect(single.credit.toNumber()).toBe(4064);

    // HoH: same thresholds as single → $4,064
    const hoh = eic({ filingStatus: "head_of_household", qualifyingChildren: 1, earnedIncome: 25000 });
    expect(hoh.credit.toNumber()).toBe(4064);

    // MFJ: phase-out start $30,470, $25,000 < $30,470 → no phase-out → max $4,328
    const mfj = eic({ filingStatus: "married_filing_jointly", qualifyingChildren: 1, earnedIncome: 25000 });
    expect(mfj.credit.toNumber()).toBe(4328);

    // QSS: same as MFJ → $4,328
    const qss = eic({ filingStatus: "qualifying_surviving_spouse", qualifyingChildren: 1, earnedIncome: 25000 });
    expect(qss.credit.toNumber()).toBe(4328);

    // MFS without exception: disqualified → $0
    const mfs = eic({ filingStatus: "married_filing_separately", qualifyingChildren: 1, earnedIncome: 25000 });
    expect(mfs.credit.toNumber()).toBe(0);
    expect(mfs.disqualified).toBe(true);

    // MFS with exception: same as single → $4,064
    const mfsExc = eic({
      filingStatus: "married_filing_separately",
      qualifyingChildren: 1,
      earnedIncome: 25000,
      mfsEicEligible: true,
    });
    expect(mfsExc.credit.toNumber()).toBe(4064);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined Edge: Max Investment Income + Mid-Phase-Out
// ═══════════════════════════════════════════════════════════

describe("EIC - combined boundary conditions", () => {
  it("EIC - investment income at exact limit combined with mid-phase-out", () => {
    // 1 child, earned $35,000, investment income exactly $11,950
    // Investment income ≤ $11,950 → allowed
    // phase-in = 34% × $12,730 = $4,328.20
    // phase-out = 15.98% × ($35,000 − $23,350) = $1,861.67
    // credit = floor($4,328.20 − $1,861.67) = floor($2,466.53) = $2,466
    const result = eic({
      qualifyingChildren: 1,
      earnedIncome: 35000,
      investmentIncome: 11950,
    });
    expect(result.credit.toNumber()).toBe(2466);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - investment income $1 above limit kills credit even with qualifying income", () => {
    // Same scenario but $11,951 investment income → disqualified
    const result = eic({
      qualifyingChildren: 1,
      earnedIncome: 35000,
      investmentIncome: 11951,
    });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Disqualification: Zero and Negative Earned Income
// ═══════════════════════════════════════════════════════════

describe("EIC - zero and negative earned income", () => {
  it("EIC - zero earned income disqualifies regardless of children", () => {
    const result = eic({ qualifyingChildren: 2, earnedIncome: 0, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("greater than $0");
  });

  it("EIC - negative earned income (SE loss) disqualifies", () => {
    const result = eic({ qualifyingChildren: 1, earnedIncome: -500, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Childless Age Upper Boundary (25–64 Inclusive)
// ═══════════════════════════════════════════════════════════

describe("EIC - childless age upper boundary", () => {
  it("EIC - childless age 65 disqualified (1 above upper limit)", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 65 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(true);
    expect(result.disqualificationReason).toContain("age");
  });

  it("EIC - childless age 64 qualifies (exact upper limit)", () => {
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 64 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });

  it("EIC - childless age 25 qualifies (exact lower limit)", () => {
    // 7.65% × $8,000 = $612
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8000, primaryAge: 25 });
    expect(result.credit.toNumber()).toBe(612);
    expect(result.disqualified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Investment Income at Exact Limit ($11,950)
// ═══════════════════════════════════════════════════════════

describe("EIC - investment income exact limit", () => {
  it("EIC - investment income at exact $11,950 limit still qualifies", () => {
    // $11,950 ≤ $11,950 → not disqualified (limit is "exceeds", not "equals")
    const result = eic({ qualifyingChildren: 1, earnedIncome: 20000, investmentIncome: 11950 });
    expect(result.credit.toNumber()).toBeGreaterThan(0);
    expect(result.disqualified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Single 0-Children Phase-Out Start and Completion
// ═══════════════════════════════════════════════════════════

describe("EIC - single 0 children phase-out boundaries", () => {
  it("EIC - 0 children single at phase-out start ($10,620) gets max $649", () => {
    // phase-in = 7.65% × $8,490 = $649.485, phase-out = $0
    const result = eic({ qualifyingChildren: 0, earnedIncome: 10620, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(649);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - 0 children single $1 above phase-out start ($10,621) still $649", () => {
    // phase-out = 7.65% × $1 = $0.0765, net = $649.4085, floor = $649
    const result = eic({ qualifyingChildren: 0, earnedIncome: 10621, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(649);
  });

  it("EIC - 0 children single at $19,096 gets last $1 of credit", () => {
    // phase-out = 7.65% × ($19,096 − $10,620) = 7.65% × $8,476 = $648.414
    // raw = $649.485 − $648.414 = $1.071 → floor = $1
    const result = eic({ qualifyingChildren: 0, earnedIncome: 19096, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(1);
  });

  it("EIC - 0 children single at $19,097 credit drops to $0", () => {
    // phase-out = 7.65% × $8,477 = $648.4905
    // raw = $649.485 − $648.4905 = $0.9945 → floor = $0
    const result = eic({ qualifyingChildren: 0, earnedIncome: 19097, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Single 1-Child Phase-Out Start and Completion
// ═══════════════════════════════════════════════════════════

describe("EIC - single 1 child phase-out completion", () => {
  it("EIC - 1 child single at phase-out start ($23,350) gets max $4,328", () => {
    // phase-in = 34% × $12,730 = $4,328.20, phase-out = $0
    const result = eic({ qualifyingChildren: 1, earnedIncome: 23350 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - 1 child single at $50,428 gets last $1 of credit", () => {
    // phase-out = 15.98% × ($50,428 − $23,350) = 15.98% × $27,078 = $4,327.0644
    // raw = $4,328.20 − $4,327.0644 = $1.1356 → floor = $1
    const result = eic({ qualifyingChildren: 1, earnedIncome: 50428 });
    expect(result.credit.toNumber()).toBe(1);
  });

  it("EIC - 1 child single at $50,429 credit drops to $0", () => {
    // phase-out = 15.98% × $27,079 = $4,327.2242
    // raw = $4,328.20 − $4,327.2242 = $0.9758 → floor = $0
    const result = eic({ qualifyingChildren: 1, earnedIncome: 50429 });
    expect(result.credit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Earned Income Amount Boundaries (Max Phase-In Point)
// ═══════════════════════════════════════════════════════════

describe("EIC - earned income amount boundaries", () => {
  it("EIC - 0 children at exact earned income amount ($8,490) gets max $649", () => {
    // 7.65% × $8,490 = $649.485, floor = $649
    // Income below phase-out start ($10,620) → no reduction
    const result = eic({ qualifyingChildren: 0, earnedIncome: 8490, primaryAge: 35 });
    expect(result.credit.toNumber()).toBe(649);
    expect(result.maxCredit.toNumber()).toBe(649);
  });

  it("EIC - 1 child at exact earned income amount ($12,730) gets max $4,328", () => {
    // 34% × $12,730 = $4,328.20, floor = $4,328
    // Income below phase-out start ($23,350) → no reduction
    const result = eic({ qualifyingChildren: 1, earnedIncome: 12730 });
    expect(result.credit.toNumber()).toBe(4328);
    expect(result.maxCredit.toNumber()).toBe(4328);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Uses MFJ Thresholds (Not Single/HoH)
// ═══════════════════════════════════════════════════════════

describe("EIC - QSS uses MFJ thresholds", () => {
  it("EIC - QSS 0 children at MFJ phase-out start ($17,730) gets max $649", () => {
    const result = eic({
      filingStatus: "qualifying_surviving_spouse",
      qualifyingChildren: 0,
      earnedIncome: 17730,
      primaryAge: 35,
    });
    expect(result.credit.toNumber()).toBe(649);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });

  it("EIC - QSS 2 children on plateau ($20,000) gets max $7,152", () => {
    // phase-in = 40% × $17,880 = $7,152 (earned > amount)
    // phase-out start $30,470 (MFJ), $20,000 < $30,470 → $0
    const result = eic({
      filingStatus: "qualifying_surviving_spouse",
      qualifyingChildren: 2,
      earnedIncome: 20000,
    });
    expect(result.credit.toNumber()).toBe(7152);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 3 Children MFJ Complete Phase-Out Boundary
// ═══════════════════════════════════════════════════════════

describe("EIC - 3 children MFJ phase-out completion", () => {
  it("EIC - 3 children MFJ at $68,670 gets last $1 of credit", () => {
    // max = floor(45% × $17,880) = $8,046
    // phase-out = 21.06% × ($68,670 − $30,470) = 21.06% × $38,200 = $8,044.92
    // raw = $8,046 − $8,044.92 = $1.08 → floor = $1
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 3,
      earnedIncome: 68670,
    });
    expect(result.credit.toNumber()).toBe(1);
  });

  it("EIC - 3 children MFJ at $68,671 credit drops to $0", () => {
    // phase-out = 21.06% × $38,201 = $8,045.1306
    // raw = $8,046 − $8,045.1306 = $0.8694 → floor = $0
    const result = eic({
      filingStatus: "married_filing_jointly",
      qualifyingChildren: 3,
      earnedIncome: 68671,
    });
    expect(result.credit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income: Phased Out but Not Disqualified
// ═══════════════════════════════════════════════════════════

describe("EIC - very high income", () => {
  it("EIC - $500,000 single 3 children yields $0 (phased out, not disqualified)", () => {
    const result = eic({ qualifyingChildren: 3, earnedIncome: 500000 });
    expect(result.credit.toNumber()).toBe(0);
    expect(result.disqualified).toBe(false);
  });
});
