/**
 * Tests for Form 8959 — Additional Medicare Tax
 * Spec: spec/federal/form-8959.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

// ═══════════════════════════════════════════════════════════
// Line Calculations
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - Lines", () => {
  it("Form 8959 Line 1 - Medicare wages from W-2s", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "single", c);
    expect(result.medicareWages.toNumber()).toBe(85000);
  });

  it("Form 8959 Line 2 - supported Form 4137 unreported tips increase the Additional Medicare base", () => {
    const result = calculateForm8959({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "198000",
        medicareWages: "198000",
        medicareWithheld: "2871",
      }],
      form4137: {
        unreportedTipIncome: "4000",
      },
    }, d(0), "single", c);

    expect(result.unreportedTips.toNumber()).toBe(4000);
    expect(result.totalEarnings.toNumber()).toBe(202000);
    expect(result.additionalMedicareTax.toNumber()).toBe(18);
  });

  it("Form 8959 Line 3 - supported Form 8919 wages increase the Additional Medicare base", () => {
    const result = calculateForm8959({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "198000",
        medicareWages: "198000",
        medicareWithheld: "2871",
      }],
      form8919: {
        wagesNotReportedOnW2: "4000",
      },
    }, d(0), "single", c);

    expect(result.form8919Wages.toNumber()).toBe(4000);
    expect(result.totalEarnings.toNumber()).toBe(202000);
    expect(result.additionalMedicareTax.toNumber()).toBe(18);
  });

  it("Form 8959 Line 1 - multiple W-2s", () => {
    const result = calculateForm8959(complexMFJFixture, d(0), "married_filing_jointly", c);
    // $200K + $50K = $250K
    expect(result.medicareWages.toNumber()).toBe(250000);
  });

  it("Form 8959 Line 7 - single threshold $200K", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "single", c);
    expect(result.threshold.toNumber()).toBe(200000);
  });

  it("Form 8959 Line 7 - MFJ threshold $250K", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "married_filing_jointly", c);
    expect(result.threshold.toNumber()).toBe(250000);
  });

  it("Form 8959 Line 7 - MFS threshold $125K", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - Tax Calculation", () => {
  it("Form 8959 Line 18 - no tax below threshold", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "single", c);
    // $85K < $200K → $0
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Form 8959 Line 18 - tax on wages over threshold", () => {
    const result = calculateForm8959(complexMFJFixture, d(15000), "married_filing_jointly", c);
    // Total = $250K + $15K = $265K. Excess = $265K - $250K = $15K
    // Tax = $15K × 0.9% = $135
    expect(result.additionalMedicareTax.toNumber()).toBe(135);
  });

  it("Form 8959 Line 18 - MFS hits threshold sooner", () => {
    const result = calculateForm8959(simpleW2Fixture, d(50000), "married_filing_separately", c);
    // Total = $85K + $50K = $135K. Excess = $135K - $125K = $10K
    // Tax = $10K × 0.9% = $90
    expect(result.additionalMedicareTax.toNumber()).toBe(90);
  });

  it("Form 8959 Line 18 - large excess", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "500000", medicareWages: "500000" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Excess = $500K - $200K = $300K. Tax = $300K × 0.9% = $2,700
    expect(result.additionalMedicareTax.toNumber()).toBe(2700);
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Credit
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - Withholding Credit", () => {
  it("Form 8959 Line 19 - no credit when no excess withholding", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "single", c);
    // $85K × 1.45% = $1,232.50. Actual withheld = $1,232.50 → no excess
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });

  it("Form 8959 Line 19 - credit for employer excess withholding", () => {
    // Employer withholds additional Medicare on wages > $200K
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        medicareWages: "300000",
        // Regular 1.45% on $300K = $4,350
        // Plus 0.9% on $100K over $200K = $900
        // Total withheld: $5,250
        medicareWithheld: "5250",
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Expected regular: $300K × 1.45% = $4,350
    // Credit = $5,250 - $4,350 = $900
    expect(result.withholdingCredit.toNumber()).toBe(900);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Earnings Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - SE earnings", () => {
  it("SE earnings only (no W-2) above threshold", () => {
    const input = { ...simpleW2Fixture, w2s: [] };
    const result = calculateForm8959(input, d(250000), "single", c);
    // $0 wages + $250K SE = $250K. Excess = $250K - $200K = $50K
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(450); // $50K × 0.9%
  });

  it("SE earnings below threshold alone", () => {
    const input = { ...simpleW2Fixture, w2s: [] };
    const result = calculateForm8959(input, d(100000), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("W-2 wages + SE earnings combined cross threshold", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", medicareWages: "150000", medicareWithheld: "2175" }],
    };
    // $150K W-2 + $80K SE = $230K. Excess = $230K - $200K = $30K
    const result = calculateForm8959(input, d(80000), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(230000);
    expect(result.excessOverThreshold.toNumber()).toBe(30000);
    expect(result.additionalMedicareTax.toNumber()).toBe(270); // $30K × 0.9%
  });
});

// ═══════════════════════════════════════════════════════════
// Threshold Boundary Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - threshold boundaries", () => {
  it("exactly at threshold: zero tax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", medicareWages: "200000", medicareWithheld: "2900" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("$1 over threshold: minimal tax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200001", medicareWages: "200001", medicareWithheld: "2900.01" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // $1 × 0.9% = $0.009 → rounds to $0
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("$1,000 over threshold", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "201000", medicareWages: "201000", medicareWithheld: "2914.50" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(9); // $1K × 0.9%
  });

  it("HoH uses same threshold as single ($200K)", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "250000", medicareWages: "250000", medicareWithheld: "3625" }],
    };
    const result = calculateForm8959(input, d(0), "head_of_household", c);
    // $250K - $200K = $50K × 0.9% = $450
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });

  it("QSS uses $200K threshold (same as single/HoH — IRC §3101(b)(2)(C))", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "260000", medicareWages: "260000", medicareWithheld: "3770" }],
    };
    const result = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    // $260K - $200K = $60K × 0.9% = $540
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.additionalMedicareTax.toNumber()).toBe(540);
  });
});

// ═══════════════════════════════════════════════════════════
// Multi-Employer Withholding
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - multi-employer withholding", () => {
  it("two employers both withhold additional Medicare → large credit", () => {
    // Each employer independently withholds 0.9% on wages over $200K
    const input = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Corp A", ein: "11-1111111" },
          wages: "250000",
          medicareWages: "250000",
          // 1.45% on $200K + 2.35% on $50K = $2,900 + $1,175 = $4,075
          medicareWithheld: "4075",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Corp B", ein: "22-2222222" },
          wages: "250000",
          medicareWages: "250000",
          medicareWithheld: "4075",
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Total wages = $500K, excess = $300K, tax = $2,700
    // Total withheld = $8,150, expected regular = $500K × 1.45% = $7,250
    // Credit = $8,150 - $7,250 = $900
    expect(result.medicareWages.toNumber()).toBe(500000);
    expect(result.additionalMedicareTax.toNumber()).toBe(2700);
    expect(result.withholdingCredit.toNumber()).toBe(900);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8959(complexMFJFixture, d(15000), "married_filing_jointly", c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("18");
    expect(lineIds).toContain("19");
  });

  it("Form 8959 audit trail - all required line IDs are present and no duplicates", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "single", c);
    const lineIds = result.lines.map((l) => l.line);
    const requiredLines = ["1", "5", "7", "18", "19"];
    for (const lineId of requiredLines) {
      expect(lineIds).toContain(lineId);
    }
    // Each line should appear exactly once
    for (const lineId of requiredLines) {
      expect(lineIds.filter((id) => id === lineId)).toHaveLength(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Rate Verification
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - rate and threshold constants", () => {
  it("Form 8959 Line 7 - Additional Medicare Tax rate is exactly 0.9%", () => {
    // The rate used for Line 18 must be exactly 0.9% per IRC § 3101(b)(2)
    expect(c.additionalMedicareTax.rate.toNumber()).toBe(0.009);
    // Verify the rate is applied correctly: $100K excess × 0.9% = $900
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "300000", medicareWages: "300000", medicareWithheld: "4350" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Excess = $300K - $200K = $100K. Tax = $100K × 0.009 = $900
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });

  it("Form 8959 Line 7 - all 5 filing statuses have correct thresholds", () => {
    // IRC § 3101(b)(2): $200K single/HoH, $250K MFJ/QSS, $125K MFS
    const baseInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", medicareWages: "100000", medicareWithheld: "1450" }],
    };
    const expectedThresholds: Array<[Parameters<typeof calculateForm8959>[2], number]> = [
      ["single", 200000],
      ["married_filing_jointly", 250000],
      ["married_filing_separately", 125000],
      ["head_of_household", 200000],
      ["qualifying_surviving_spouse", 200000],
    ];
    for (const [status, expected] of expectedThresholds) {
      const result = calculateForm8959(baseInput, d(0), status, c);
      expect(result.threshold.toNumber()).toBe(expected);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Line 19 Withholding Credit Formula
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - Line 19 withholding credit formula", () => {
  it("Form 8959 Line 19 - credit equals total withheld minus 1.45% of Medicare wages", () => {
    // Employer withholds 1.45% regular + 0.9% additional on wages over $200K
    // Credit = actual withheld − (medicareWages × 1.45%)
    const medicareWages = 280000;
    const regularMedicare = medicareWages * 0.0145; // $4,060
    const additionalOnExcess = (medicareWages - 200000) * 0.009; // $720
    const totalWithheld = regularMedicare + additionalOnExcess; // $4,780
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: String(medicareWages),
        medicareWages: String(medicareWages),
        medicareWithheld: String(totalWithheld),
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Credit = $4,780 − $4,060 = $720
    expect(result.withholdingCredit.toNumber()).toBeCloseTo(720, 5);
  });

  it("Form 8959 Line 19 - no credit when withheld equals exactly 1.45% of wages", () => {
    // Employer withholds exactly the regular 1.45% — no credit for additional Medicare
    const medicareWages = 150000;
    const exactRegular = medicareWages * 0.0145; // $2,175
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: String(medicareWages),
        medicareWages: String(medicareWages),
        medicareWithheld: String(exactRegular),
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Earnings Boundary Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - SE earnings boundary", () => {
  it("SE earnings exactly at $200K single threshold → zero excess", () => {
    // $200K SE income for single filer sits exactly at the threshold — no additional tax
    const input = { ...simpleW2Fixture, w2s: [] };
    const result = calculateForm8959(input, d(200000), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Combined W-2 and SE both contribute to excess over threshold", () => {
    // W-2 wages alone are under threshold; SE alone is under threshold;
    // but together they cross it — both amounts contribute to the taxable excess
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000", medicareWages: "120000", medicareWithheld: "1740" }],
    };
    // $120K W-2 + $100K SE = $220K total. Excess = $220K - $200K = $20K
    const result = calculateForm8959(input, d(100000), "single", c);
    expect(result.medicareWages.toNumber()).toBe(120000);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(100000);
    expect(result.totalEarnings.toNumber()).toBe(220000);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    // Tax = $20K × 0.9% = $180
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Small Excess Rounding
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - rounding behavior", () => {
  it("$111 over threshold → $0.999 rounds to $1 tax", () => {
    // $111 excess × 0.9% = $0.999 → rounds to $1
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200111", medicareWages: "200111", medicareWithheld: "2901.61" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(111);
    expect(result.additionalMedicareTax.toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Two W-2 Aggregation
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFJ two W-2 wage aggregation", () => {
  it("MFJ with two W-2s aggregates wages before comparing to $250K threshold", () => {
    // Spouse 1: $160K, Spouse 2: $110K → combined $270K > $250K MFJ threshold
    // Neither spouse alone exceeds threshold; only the aggregate does
    const input = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Corp A", ein: "11-1111111" },
          wages: "160000",
          medicareWages: "160000",
          medicareWithheld: "2320",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Corp B", ein: "22-2222222" },
          wages: "110000",
          medicareWages: "110000",
          medicareWithheld: "1595",
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.medicareWages.toNumber()).toBe(270000);
    expect(result.threshold.toNumber()).toBe(250000);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    // Tax = $20K × 0.9% = $180
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS $125K Threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFS $125K threshold", () => {
  it("MFS wages at $125K threshold produce zero additional tax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "125000", medicareWages: "125000", medicareWithheld: "1812.50" }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("MFS wages $50K over $125K threshold", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "175000", medicareWages: "175000", medicareWithheld: "2537.50" }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    // Excess = $175K - $125K = $50K. Tax = $50K × 0.9% = $450
    expect(result.excessOverThreshold.toNumber()).toBe(50000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });
});

// ═══════════════════════════════════════════════════════════
// HoH $200K Threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - HoH $200K threshold", () => {
  it("HoH wages exactly at $200K threshold produce zero tax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", medicareWages: "200000", medicareWithheld: "2900" }],
    };
    const result = calculateForm8959(input, d(0), "head_of_household", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("HoH wages plus SE earnings exceed $200K threshold", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "180000", medicareWages: "180000", medicareWithheld: "2610" }],
    };
    // $180K wages + $40K SE = $220K. Excess = $220K - $200K = $20K
    const result = calculateForm8959(input, d(40000), "head_of_household", c);
    expect(result.totalEarnings.toNumber()).toBe(220000);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    // Tax = $20K × 0.9% = $180
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS $200K Threshold (IRC §3101(b)(2)(C))
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - QSS $200K threshold (IRC §3101(b)(2)(C))", () => {
  it("QSS wages exactly at $200K threshold produce zero tax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "200000", medicareWages: "200000", medicareWithheld: "2900" }],
    };
    const result = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("QSS wages plus SE above $200K threshold", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "180000", medicareWages: "180000", medicareWithheld: "2610" }],
    };
    // $180K wages + $50K SE = $230K. Excess = $230K - $200K = $30K
    const result = calculateForm8959(input, d(50000), "qualifying_surviving_spouse", c);
    expect(result.totalEarnings.toNumber()).toBe(230000);
    expect(result.excessOverThreshold.toNumber()).toBe(30000);
    // Tax = $30K × 0.9% = $270
    expect(result.additionalMedicareTax.toNumber()).toBe(270);
  });
});

// ═══════════════════════════════════════════════════════════
// Negative SE Income
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - negative SE income", () => {
  it("negative SE income does NOT reduce wage-based Additional Medicare Tax", () => {
    // Per IRS Form 8959 Parts I/II, SE losses don't offset wages.
    // Wages $220K, SE loss -$30K → SE floored to $0, tax on wages only.
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "220000", medicareWages: "220000", medicareWithheld: "3190" }],
    };
    const result = calculateForm8959(input, d(-30000), "single", c);
    // SE floored to $0 (negative SE does not offset wages)
    expect(result.selfEmploymentEarnings.toNumber()).toBe(0);
    expect(result.totalEarnings.toNumber()).toBe(220000);
    // $220K - $200K = $20K × 0.9% = $180
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });

  it("negative SE with no wages produces zero tax (SE floored at zero)", () => {
    const input = { ...simpleW2Fixture, w2s: [] };
    const result = calculateForm8959(input, d(-50000), "single", c);
    // SE floored to $0 — negative SE doesn't create negative total
    expect(result.selfEmploymentEarnings.toNumber()).toBe(0);
    expect(result.totalEarnings.toNumber()).toBe(0);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Credit Detailed Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - withholding credit calculation", () => {
  it("MFS filer gets withholding credit for employer excess on wages over $200K", () => {
    // MFS threshold is $125K, but employer always withholds additional Medicare
    // on wages over $200K. Filer gets credit for employer-withheld additional Medicare.
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "250000",
        medicareWages: "250000",
        // Regular 1.45% on $250K = $3,625
        // Additional 0.9% on $50K over $200K = $450
        // Total withheld: $4,075
        medicareWithheld: "4075",
      }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    // Expected regular: $250K × 1.45% = $3,625
    // Credit = $4,075 - $3,625 = $450
    expect(result.withholdingCredit.toNumber()).toBe(450);
    // Tax = ($250K - $125K) × 0.9% = $1,125
    expect(result.additionalMedicareTax.toNumber()).toBe(1125);
  });

  it("withholding credit cannot go negative (floor at zero)", () => {
    // If employer under-withholds Medicare (unusual), credit is 0 not negative
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "100000",
        medicareWages: "100000",
        // Under-withheld: only $1,000 vs expected $1,450
        medicareWithheld: "1000",
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - very high income", () => {
  it("$2M wages single filer", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "2000000",
        medicareWages: "2000000",
        // Regular 1.45% on $2M = $29,000
        // Additional 0.9% on $1.8M over $200K = $16,200
        // Total withheld: $45,200
        medicareWithheld: "45200",
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Excess = $2M - $200K = $1.8M. Tax = $1.8M × 0.9% = $16,200
    expect(result.excessOverThreshold.toNumber()).toBe(1800000);
    expect(result.additionalMedicareTax.toNumber()).toBe(16200);
    // Credit = $45,200 - $29,000 = $16,200
    expect(result.withholdingCredit.toNumber()).toBe(16200);
  });

  it("$5M combined wages and SE income MFJ", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "3000000",
        medicareWages: "3000000",
        // Regular 1.45% on $3M = $43,500
        // Additional 0.9% on $2.8M over $200K = $25,200
        // Total withheld: $68,700
        medicareWithheld: "68700",
      }],
    };
    // $3M wages + $2M SE = $5M. Excess = $5M - $250K = $4.75M
    const result = calculateForm8959(input, d(2000000), "married_filing_jointly", c);
    expect(result.totalEarnings.toNumber()).toBe(5000000);
    expect(result.excessOverThreshold.toNumber()).toBe(4750000);
    // Tax = $4.75M × 0.9% = $42,750
    expect(result.additionalMedicareTax.toNumber()).toBe(42750);
    // Credit = $68,700 - $43,500 = $25,200
    expect(result.withholdingCredit.toNumber()).toBe(25200);
  });
});

// ═══════════════════════════════════════════════════════════
// Threshold Symmetry: Single vs HoH both use $200K
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - single and HoH share identical $200K threshold", () => {
  it("single and HoH filers at the same income produce identical additional tax", () => {
    // IRC § 3101(b)(2): $200K applies to both single and head_of_household
    // Same wages must yield same tax regardless of which of these two statuses is used
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "240000", medicareWages: "240000", medicareWithheld: "3480" }],
    };
    const singleResult = calculateForm8959(input, d(0), "single", c);
    const hohResult = calculateForm8959(input, d(0), "head_of_household", c);
    // Both thresholds must be $200K
    expect(singleResult.threshold.toNumber()).toBe(200000);
    expect(hohResult.threshold.toNumber()).toBe(200000);
    // Both should compute identical excess and tax: $40K excess × 0.9% = $360
    expect(singleResult.excessOverThreshold.toNumber()).toBe(40000);
    expect(hohResult.excessOverThreshold.toNumber()).toBe(40000);
    expect(singleResult.additionalMedicareTax.toNumber()).toBe(360);
    expect(hohResult.additionalMedicareTax.toNumber()).toBe(360);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Threshold Boundary: $1 over $250K
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFJ wages $1 over $250K threshold", () => {
  it("MFJ wages $250,001 produce $0.009 additional tax which rounds to $0", () => {
    // $1 excess × 0.9% = $0.009 → rounds down to $0 for MFJ filers at $250K threshold
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "250001", medicareWages: "250001", medicareWithheld: "3625.01" }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.threshold.toNumber()).toBe(250000);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    // $1 × 0.009 = $0.009 → rounds to $0
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Income Contribution for MFJ Filer
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - SE income drives Additional Medicare Tax for MFJ filer", () => {
  it("MFJ filer with SE earnings only (no W-2) above $250K threshold owes additional tax", () => {
    // SE income alone can trigger the 0.9% additional Medicare tax for MFJ filers
    const input = { ...simpleW2Fixture, w2s: [] };
    const result = calculateForm8959(input, d(300000), "married_filing_jointly", c);
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(300000);
    expect(result.totalEarnings.toNumber()).toBe(300000);
    expect(result.threshold.toNumber()).toBe(250000);
    // Excess = $300K - $250K = $50K. Tax = $50K × 0.9% = $450
    expect(result.excessOverThreshold.toNumber()).toBe(50000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined W-2 + SE for MFS Filer
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - combined W-2 and SE for MFS filer", () => {
  it("MFS combined W-2 and SE earnings exceeding $125K threshold", () => {
    // MFS threshold is $125K; even small combined totals can trigger the tax
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "80000", medicareWages: "80000", medicareWithheld: "1160" }],
    };
    // $80K W-2 + $70K SE = $150K. Excess = $150K - $125K = $25K
    const result = calculateForm8959(input, d(70000), "married_filing_separately", c);
    expect(result.medicareWages.toNumber()).toBe(80000);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(70000);
    expect(result.totalEarnings.toNumber()).toBe(150000);
    expect(result.threshold.toNumber()).toBe(125000);
    expect(result.excessOverThreshold.toNumber()).toBe(25000);
    // Tax = $25K × 0.9% = $225
    expect(result.additionalMedicareTax.toNumber()).toBe(225);
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Allocation: Employer Uses $200K Per-Employer Threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - withholding allocated between regular and additional Medicare", () => {
  it("employer withholds additional Medicare on wages above $200K independent of filer threshold", () => {
    // Per IRS rules, employers withhold the additional 0.9% on wages over $200K per W-2.
    // A MFS filer's $125K threshold does not affect employer withholding behavior.
    // The filer receives credit for any employer-withheld additional Medicare tax.
    const wages = 220000;
    const regularMedicare = wages * 0.0145;         // $3,190
    const additionalOnEmployerExcess = (wages - 200000) * 0.009; // $180 on $20K over employer $200K threshold
    const totalWithheld = regularMedicare + additionalOnEmployerExcess; // $3,370
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: String(wages),
        medicareWages: String(wages),
        medicareWithheld: String(totalWithheld),
      }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    // MFS threshold = $125K; tax = ($220K - $125K) × 0.9% = $855
    expect(result.additionalMedicareTax.toNumber()).toBe(855);
    // Credit = total withheld - regular 1.45% = $3,370 - $3,190 = $180
    expect(result.withholdingCredit.toNumber()).toBeCloseTo(180, 5);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS vs Single: Same Income, More Tax Under MFS
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFS half-threshold produces more tax than single at same income", () => {
  it("MFS filer pays more additional Medicare tax than single filer on identical income", () => {
    // At $180K wages: single ($200K threshold) owes $0; MFS ($125K threshold) owes $495
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "180000", medicareWages: "180000", medicareWithheld: "2610" }],
    };
    const singleResult = calculateForm8959(input, d(0), "single", c);
    const mfsResult = calculateForm8959(input, d(0), "married_filing_separately", c);
    // Single: $180K < $200K threshold → zero tax
    expect(singleResult.additionalMedicareTax.toNumber()).toBe(0);
    // MFS: $180K - $125K = $55K excess × 0.9% = $495
    expect(mfsResult.additionalMedicareTax.toNumber()).toBe(495);
    // MFS tax strictly exceeds single tax at this income level
    expect(mfsResult.additionalMedicareTax.greaterThan(singleResult.additionalMedicareTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Threshold Matches Single (NOT MFJ) — IRC §3101(b)(2)(C)
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - QSS and single thresholds are equal at $200K", () => {
  it("QSS filer and single filer with identical income produce identical additional tax (both $200K)", () => {
    // IRC §3101(b)(2)(C): QSS is "any other individual" = $200K, same as single
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "275000", medicareWages: "275000", medicareWithheld: "3987.50" }],
    };
    const singleResult = calculateForm8959(input, d(0), "single", c);
    const qssResult = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    expect(singleResult.threshold.toNumber()).toBe(200000);
    expect(qssResult.threshold.toNumber()).toBe(200000);
    // $275K - $200K = $75K excess × 0.9% = $675 for both
    expect(singleResult.additionalMedicareTax.toNumber()).toBe(675);
    expect(qssResult.additionalMedicareTax.toNumber()).toBe(675);
    expect(singleResult.additionalMedicareTax.equals(qssResult.additionalMedicareTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Wages $2M+ — Withholding Fully Offsets Tax
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - very high wages withholding fully offsets additional Medicare tax", () => {
  it("$2.5M wages single filer — withholding credit equals the additional Medicare tax owed", () => {
    // When employer withholds exactly the right amount, the credit nets out the tax
    const wages = 2500000;
    const regularMedicare = wages * 0.0145;              // $36,250
    const additionalOnExcess = (wages - 200000) * 0.009; // $20,700 on $2.3M
    const totalWithheld = regularMedicare + additionalOnExcess; // $56,950
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: String(wages),
        medicareWages: String(wages),
        medicareWithheld: String(totalWithheld),
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(2300000);
    // Tax = $2.3M × 0.9% = $20,700
    expect(result.additionalMedicareTax.toNumber()).toBe(20700);
    // Credit = $56,950 - $36,250 = $20,700 — exactly covers the tax
    expect(result.withholdingCredit.toNumber()).toBeCloseTo(20700, 5);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Carries Correct Values on All Lines
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - audit trail line values are accurate", () => {
  it("audit trail Line 1 value matches computed medicareWages", () => {
    const result = calculateForm8959(complexMFJFixture, d(15000), "married_filing_jointly", c);
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(result.medicareWages.toNumber());
  });

  it("audit trail Line 5 value matches SE earnings input", () => {
    const seAmount = d(75000);
    const result = calculateForm8959(simpleW2Fixture, seAmount, "single", c);
    const line5 = result.lines.find((l) => l.line === "5");
    expect(line5).toBeDefined();
    expect(line5!.value.toNumber()).toBe(seAmount.toNumber());
  });

  it("audit trail Line 7 value matches filing-status threshold", () => {
    const result = calculateForm8959(simpleW2Fixture, d(0), "married_filing_separately", c);
    const line7 = result.lines.find((l) => l.line === "7");
    expect(line7).toBeDefined();
    // MFS threshold must be $125K
    expect(line7!.value.toNumber()).toBe(125000);
  });

  it("audit trail Line 18 value matches computed additionalMedicareTax", () => {
    const input = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "350000", medicareWages: "350000", medicareWithheld: "5075" }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    const line18 = result.lines.find((l) => l.line === "18");
    expect(line18).toBeDefined();
    // Excess = $350K - $200K = $150K. Tax = $150K × 0.9% = $1,350
    expect(line18!.value.toNumber()).toBe(1350);
    expect(line18!.value.toNumber()).toBe(result.additionalMedicareTax.toNumber());
  });

  it("audit trail Line 24 value matches computed withholdingCredit", () => {
    // Employer withholds additional Medicare on wages over $200K
    const input = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        medicareWages: "300000",
        // Regular 1.45% on $300K = $4,350; additional 0.9% on $100K = $900 → total $5,250
        medicareWithheld: "5250",
      }],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    const line19 = result.lines.find((l) => l.line === "24");
    expect(line19).toBeDefined();
    // Credit = $5,250 - $4,350 = $900
    expect(line19!.value.toNumber()).toBe(900);
    expect(line19!.value.toNumber()).toBe(result.withholdingCredit.toNumber());
  });
});
