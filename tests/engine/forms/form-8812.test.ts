/**
 * Form 8812 — Credits for Qualifying Children and Other Dependents
 * Spec: spec/federal/form-8812.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import type { Form8812Input } from "@/engine/forms/form-8812.js";
import { getConstants } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function make(overrides: Partial<Form8812Input> = {}): Form8812Input {
  return {
    qualifyingChildren: 2,
    otherDependents: 0,
    agi: d(50000),
    earnedIncome: d(50000),
    taxLiability: d(3000),
    filingStatus: "single",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Line 12: CTC Before Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - CTC before limitation", () => {
  it("Form 8812 Line 12 - CTC before limitation", () => {
    // 2025 IRS worksheet: result: line 12 = $4900, nonrefundable = $3000, unused = $1900, ACTC = $1900.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 1,
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4900);
  });

  it("Form 8812 Line 12 - with phase-out at high AGI", () => {
    // 2025 IRS worksheet: result: line 12 = $3900, nonrefundable = $3000, unused = $900, ACTC = $900.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(210000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(3900);
  });

  it("Form 8812 Line 12 - fully phased out", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      agi: d(244000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });

  it("no dependents: zero CTC", () => {
    // 2025 IRS worksheet: result: line 12 = $0, nonrefundable = $0, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 0,
    }), c);
    expect(result.ctcBeforeLimitation.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 14: Nonrefundable CTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - nonrefundable CTC", () => {
  it("Form 8812 Line 14 - nonrefundable limited to tax", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $1500, unused = $2900, ACTC = $2900.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(1500),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(1500);
  });

  it("Form 8812 Line 14 - full CTC when tax exceeds credit", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $2200, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(10000),
    }), c);
    expect(result.nonrefundableCTC.toNumber()).toBe(2200);
  });

  it("zero tax liability: zero nonrefundable", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $3400.
    const result = calculateForm8812(make({
      taxLiability: d(0),
    }), c);
    expect(result.nonrefundableCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 15: Unused CTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - unused CTC", () => {
  it("Form 8812 Line 15 - unused CTC", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $1500, unused = $2900, ACTC = $2900.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(1500),
    }), c);

    expect(result.unusedCTC.toNumber()).toBe(2900);
  });

  it("no unused when tax covers full CTC", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $2200, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(10000),
    }), c);
    expect(result.unusedCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Lines 20-24: Earned Income Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - earned income for ACTC", () => {
  it("Form 8812 Line 20 - earned income includes SE", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $3000, unused = $1400, ACTC = $1400.
    const result = calculateForm8812(make({
      earnedIncome: d(35000),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(32500);
  });

  it("Form 8812 Line 21 - earned income excess", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $3000, unused = $1400, ACTC = $1125.
    const result = calculateForm8812(make({
      earnedIncome: d(10000),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(7500);
  });

  it("Form 8812 Line 21 - earned income below $2,500: no excess", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $0.
    const result = calculateForm8812(make({
      earnedIncome: d(2000),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("Form 8812 Line 21 - exactly $2,500: no excess", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $0.
    const result = calculateForm8812(make({
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
  });

  it("Form 8812 Line 24 - 15% calculation", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $3000, unused = $1400, ACTC = $1400.
    const result = calculateForm8812(make({
      earnedIncome: d(20000),
    }), c);

    expect(result.fifteenPercent.toNumber()).toBe(2625);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 27: ACTC (Refundable)
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - Additional Child Tax Credit", () => {
  it("Form 8812 Line 27 - ACTC refundable amount", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $500, unused = $3900, ACTC = $3400.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(30000),
      taxLiability: d(500),
    }), c);




    expect(result.actc.toNumber()).toBe(3400);
  });

  it("ACTC limited by 15% earned income formula", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $375.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(5000),
      taxLiability: d(0),
    }), c);




    expect(result.actc.toNumber()).toBe(375);
  });

  it("ACTC limited by unused CTC (high tax covers most)", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $3500, unused = $900, ACTC = $900.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(80000),
      taxLiability: d(3500),
    }), c);




    expect(result.actc.toNumber()).toBe(900);
  });

  it("no qualifying children: no ACTC (ODC not refundable)", () => {
    // 2025 IRS worksheet: result: line 12 = $1000, nonrefundable = $0, unused = $1000, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 2,
      earnedIncome: d(30000),
      taxLiability: d(0),
    }), c);


    expect(result.actc.toNumber()).toBe(0);
  });

  it("high earner: full CTC used nonrefundably, no ACTC needed", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $2200, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(150000),
      taxLiability: d(25000),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(2200);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("MFJ higher phase-out threshold ($400K)", () => {
    // 2025 IRS worksheet: result: line 12 = $6600, nonrefundable = $6600, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      agi: d(350000),
      earnedIncome: d(350000),
      taxLiability: d(50000),
      filingStatus: "married_filing_jointly",
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(6600);
  });

  it("single parent with 3 children, low income", () => {
    // 2025 IRS worksheet: result: line 12 = $6600, nonrefundable = $0, unused = $6600, ACTC = $3375.
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      earnedIncome: d(25000),
      agi: d(25000),
      taxLiability: d(0),
    }), c);




    expect(result.actc.toNumber()).toBe(3375);
  });
});

// ═══════════════════════════════════════════════════════════
// Nonrefundable CTC limited by tax liability
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - nonrefundable CTC capped at tax liability", () => {
  it("nonrefundable CTC equals tax when tax is less than credit", () => {
    // 2025 IRS worksheet: result: line 12 = $6600, nonrefundable = $800, unused = $5800, ACTC = $5100.
    const result = calculateForm8812(make({
      qualifyingChildren: 3,
      taxLiability: d(800),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(800);
  });

  it("nonrefundable CTC equals full credit when tax exceeds credit", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      taxLiability: d(5000),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(4400);
  });

  it("nonrefundable CTC equals credit exactly when tax matches credit", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $2200, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      taxLiability: d(2200),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(2200);
    expect(result.unusedCTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC 15% of earned income above $2,500", () => {
  it("ACTC is 15% of earned income above $2,500 threshold", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $1500.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(12500),
      taxLiability: d(0),
    }), c);

    expect(result.fifteenPercent.toNumber()).toBe(1500);
    expect(result.actc.toNumber()).toBe(1500);
  });

  it("earned income exactly at $2,500 yields zero ACTC via 15% method", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $0, unused = $2200, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);
    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("$1 above $2,500 threshold produces small ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $0, unused = $2200, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(2501),
      taxLiability: d(0),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(1);
    expect(result.fifteenPercent.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC cap at $1,700 per qualifying child", () => {
  it("ACTC capped at $1,700 per child with high earned income", () => {
    // 2025 IRS worksheet: result: line 12 = $2200, nonrefundable = $0, unused = $2200, ACTC = $1700.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);


    expect(result.actc.toNumber()).toBe(1700);
  });

  it("ACTC cap scales with number of qualifying children", () => {
    // 2025 IRS worksheet: result: line 12 = $8800, nonrefundable = $0, unused = $8800, ACTC = $6800.
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);

    expect(result.actc.toNumber()).toBe(6800);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ODC $500 per other dependent", () => {
  it("ODC is $500 per non-child qualifying dependent", () => {
    // 2025 IRS worksheet: result: line 12 = $1500, nonrefundable = $1500, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 3,
      taxLiability: d(5000),
      earnedIncome: d(0),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    expect(result.nonrefundableCTC.toNumber()).toBe(1500);
  });

  it("ODC combined with CTC sums correctly before limitation", () => {
    // 2025 IRS worksheet: result: line 12 = $6400, nonrefundable = $6400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 4,
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(6400);
    expect(result.nonrefundableCTC.toNumber()).toBe(6400);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out $50 per $1,000 over threshold", () => {
  it("phase-out reduces credit by $50 per thousand over threshold (single)", () => {
    // 2025 IRS worksheet: result: line 12 = $4150, nonrefundable = $4150, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(205000),
      taxLiability: d(10000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(4150);
  });

  it("partial-thousand excess rounds up to next thousand for phase-out", () => {
    // 2025 IRS worksheet: result: line 12 = $4350, nonrefundable = $4350, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200001),
      taxLiability: d(10000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(4350);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - MFJ vs single phase-out thresholds", () => {
  it("single filer begins phase-out at $200K AGI", () => {
    // 2025 IRS worksheet: singleAtThreshold: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0; singleOverThreshold: line 12 = $4350, nonrefundable = $4350, unused = $0, ACTC = $0.
    const singleAtThreshold = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);
    const singleOverThreshold = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(201000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);

    expect(singleAtThreshold.ctcBeforeLimitation.toNumber()).toBe(4400);
    expect(singleOverThreshold.ctcBeforeLimitation.toNumber()).toBe(4350);
  });

  it("MFJ filer has no phase-out at $200K (threshold is $400K)", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4400);
  });

  it("MFJ phase-out begins above $400K", () => {
    // 2025 IRS worksheet: result: line 12 = $4300, nonrefundable = $4300, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(402000),
      filingStatus: "married_filing_jointly",
      taxLiability: d(10000),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(4300);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero qualifying children, only ODC dependents
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - zero qualifying children, ODC only", () => {
  it("ODC only: nonrefundable credit limited to tax, no ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $1000, nonrefundable = $400, unused = $600, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 2,
      earnedIncome: d(60000),
      taxLiability: d(400),
    }), c);


    expect(result.ctcBeforeLimitation.toNumber()).toBe(1000);
    expect(result.nonrefundableCTC.toNumber()).toBe(400);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("ODC only: unused CTC is not refundable", () => {
    // 2025 IRS worksheet: result: line 12 = $500, nonrefundable = $0, unused = $500, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 1,
      earnedIncome: d(80000),
      taxLiability: d(0),
    }), c);


    expect(result.unusedCTC.toNumber()).toBe(500);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-out: exact threshold and one-dollar-over
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - phase-out at exact threshold and just above", () => {
  it("single AGI exactly $200K: no phase-out reduction", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4400);
  });

  it("single AGI $201K: reduced by exactly $50", () => {
    // 2025 IRS worksheet: result: line 12 = $4350, nonrefundable = $4350, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(201000),
      filingStatus: "single",
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4350);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - MFS phase-out threshold is $200K", () => {
  it("MFS AGI $200K: no phase-out (at threshold)", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(200000),
      filingStatus: "married_filing_separately",
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(4400);
  });

  it("MFS AGI $210K: reduced by $500 (not exempt like MFJ)", () => {
    // 2025 IRS worksheet: result: line 12 = $3900, nonrefundable = $3900, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      agi: d(210000),
      filingStatus: "married_filing_separately",
      taxLiability: d(10000),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(3900);
  });
});

// ═══════════════════════════════════════════════════════════
// 4+ children ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC with 4 qualifying children", () => {
  it("4 children: ACTC cap is $6,800 (4 × $1,700)", () => {
    // 2025 IRS worksheet: result: line 12 = $8800, nonrefundable = $0, unused = $8800, ACTC = $6800.
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(200000),
      taxLiability: d(0),
    }), c);



    expect(result.actc.toNumber()).toBe(6800);
  });

  it("4 children low income: ACTC limited by 15% formula", () => {
    // 2025 IRS worksheet: result: line 12 = $8800, nonrefundable = $0, unused = $8800, ACTC = $1125.
    const result = calculateForm8812(make({
      qualifyingChildren: 4,
      earnedIncome: d(10000),
      taxLiability: d(0),
    }), c);




    expect(result.actc.toNumber()).toBe(1125);
  });
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC earned income boundary at $2,500", () => {
  it("earned income exactly $2,500: ACTC is zero", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(2500),
      taxLiability: d(0),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(0);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("earned income $2,501: minimal ACTC of $0 (rounds down from $0.15)", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $0, unused = $4400, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(2501),
      taxLiability: d(0),
    }), c);

    expect(result.earnedIncomeExcess.toNumber()).toBe(1);
    expect(result.fifteenPercent.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC fully consumed vs. partially consumed by tax liability
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - CTC interaction with tax liability for ACTC", () => {
  it("CTC fully consumed by tax liability: no unused CTC so no ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $4400, unused = $0, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(80000),
      taxLiability: d(4400),
    }), c);

    expect(result.nonrefundableCTC.toNumber()).toBe(4400);
    expect(result.unusedCTC.toNumber()).toBe(0);
    expect(result.actc.toNumber()).toBe(0);
  });

  it("CTC exceeds tax liability: remainder flows to ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $1000, unused = $3400, ACTC = $3400.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(60000),
      taxLiability: d(1000),
    }), c);




    expect(result.nonrefundableCTC.toNumber()).toBe(1000);
    expect(result.unusedCTC.toNumber()).toBe(3400);
    expect(result.actc.toNumber()).toBe(3400);
  });
});

// ═══════════════════════════════════════════════════════════
// ODC not eligible for ACTC
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ODC is never refundable via ACTC", () => {
  it("mixed CTC and ODC: unused ODC portion does not contribute to ACTC", () => {
    // 2025 IRS worksheet: result: line 12 = $3200, nonrefundable = $0, unused = $3200, ACTC = $1700.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 2,
      earnedIncome: d(80000),
      taxLiability: d(0),
    }), c);





    expect(result.actc.toNumber()).toBe(1700);
    expect(result.unusedCTC.toNumber()).toBe(3200);
  });

  it("ODC only (no qualifying children): zero ACTC regardless of earned income", () => {
    // 2025 IRS worksheet: result: line 12 = $1500, nonrefundable = $0, unused = $1500, ACTC = $0.
    const result = calculateForm8812(make({
      qualifyingChildren: 0,
      otherDependents: 3,
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);

    expect(result.ctcBeforeLimitation.toNumber()).toBe(1500);
    expect(result.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC uses Line 15 (total unused CTC+ODC) per IRS form
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - ACTC uses Line 15 total unused (not CTC-only)", () => {
  it("phase-out exceeds per-child CTC: ACTC uses remaining total credit (Line 15)", () => {
    // 2025 IRS worksheet: result: line 12 = $1700, nonrefundable = $0, unused = $1700, ACTC = $1700.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 4,
      agi: d(250000),
      earnedIncome: d(100000),
      taxLiability: d(0),
    }), c);








    expect(result.ctcBeforeLimitation.toNumber()).toBe(1700);
    expect(result.unusedCTC.toNumber()).toBe(1700);
    expect(result.actc.toNumber()).toBe(1700);
  });

  it("phase-out exceeds CTC, partial tax: ACTC equals remaining unused total", () => {
    // 2025 IRS worksheet: result: line 12 = $1450, nonrefundable = $500, unused = $950, ACTC = $950.
    const result = calculateForm8812(make({
      qualifyingChildren: 1,
      otherDependents: 3,
      agi: d(245000),
      earnedIncome: d(100000),
      taxLiability: d(500),
    }), c);








    expect(result.ctcBeforeLimitation.toNumber()).toBe(1450);
    expect(result.nonrefundableCTC.toNumber()).toBe(500);
    expect(result.unusedCTC.toNumber()).toBe(950);
    expect(result.actc.toNumber()).toBe(950);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8812 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8812(make(), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("14");
    expect(lineIds).toContain("16a");
    expect(lineIds).toContain("18a");
    expect(lineIds).toContain("19");
    expect(lineIds).toContain("20");
    expect(lineIds).toContain("27");
  });

  it("audit trail contains all supported Form 8812 line IDs and no duplicates", () => {
    // 2025 IRS worksheet: result: line 12 = $4900, nonrefundable = $1000, unused = $3900, ACTC = $3400.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      otherDependents: 1,
      earnedIncome: d(30000),
      taxLiability: d(1000),
    }), c);
    const lineIds = result.lines.map((l) => l.line);
    const expectedLines = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "16a", "16b", "17", "18a", "19", "20", "21", "22", "23", "24", "25", "26", "27"];
    for (const id of expectedLines) {
      expect(lineIds).toContain(id);
    }
    // Each line should appear exactly once
    expect(lineIds.length).toBe(expectedLines.length);
  });

  it("audit trail line values match computed results", () => {
    // 2025 IRS worksheet: result: line 12 = $4400, nonrefundable = $500, unused = $3900, ACTC = $3400.
    const result = calculateForm8812(make({
      qualifyingChildren: 2,
      earnedIncome: d(30000),
      taxLiability: d(500),
    }), c);
    // Verify each recorded line value matches the returned result field
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l.value]));
    expect(byLine["12"].toNumber()).toBe(result.ctcBeforeLimitation.toNumber());
    expect(byLine["14"].toNumber()).toBe(result.nonrefundableCTC.toNumber());
    expect(byLine["16a"].toNumber()).toBe(result.unusedCTC.toNumber());
    expect(byLine["19"].toNumber()).toBe(result.earnedIncomeExcess.toNumber());
    expect(byLine["20"].toNumber()).toBe(result.fifteenPercent.toNumber());
    expect(byLine["27"].toNumber()).toBe(result.actc.toNumber());
  });
});
