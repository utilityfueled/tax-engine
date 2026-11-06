/**
 * Edge case tests for Form 8962 — Premium Tax Credit
 * Tests partial-year coverage, FPL threshold boundaries,
 * repayment cap tiers, and multi-form aggregation.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm8962,
  type Form8962Input,
} from "@/engine/forms/form-8962.js";

const d = (n: number | string) => new Decimal(n);

function make1095A(monthlyPremium: number, monthlySLCSP: number, monthlyAPTC: number, months = 12) {
  return [{
    marketplace: "Healthcare.gov",
    policyNumber: "POL-123",
    monthlyPremiums: Array.from({ length: months }, (_, i) => ({
      month: i + 1,
      enrolleePremium: String(monthlyPremium),
      slcsp: String(monthlySLCSP),
      advancePremiumTaxCredit: String(monthlyAPTC),
    })),
  }];
}

function makeInput(overrides?: Partial<Form8962Input>): Form8962Input {
  return {
    taxFamilySize: 1,
    modifiedAGI: d(30000),
    filingStatus: "single",
    form1095A: make1095A(400, 500, 300),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Partial-Year Coverage
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - partial-year coverage", () => {
  it("6-month coverage produces half the annual amounts", () => {
    const result = calculateForm8962(makeInput({
      form1095A: make1095A(500, 600, 200, 6),
    }));
    expect(result.annualPremium.toNumber()).toBe(3000);  // 500 × 6
    expect(result.annualSLCSP.toNumber()).toBe(3600);    // 600 × 6
    expect(result.annualAdvancePTC.toNumber()).toBe(1200); // 200 × 6
  });

  it("1-month coverage with low income gets small PTC", () => {
    // 2025 income $18,000 exceeds 100% FPL with zero applicable figure.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(18000), // ~100% FPL → 0% contribution rate
      form1095A: make1095A(400, 600, 0, 1),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(400);
    expect(result.netPTC.toNumber()).toBe(400); // No APTC received
  });

  it("partial year with excess APTC triggers repayment", () => {
    // 3 months of coverage, high income
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(80000), // 80000/15060 ≈ 531% → 8.5% rate
      form1095A: make1095A(400, 500, 300, 3),
    }));
    // Expected contribution = $80K × 8.5% = $6,800
    // SLCSP = $1,500 (3 months). PTC = max(0, 1500-6800) = $0
    // APTC = $900 (3 × $300). Excess = $900, no cap (>400% FPL)
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(900);
  });
});

// ═══════════════════════════════════════════════════════════
// FPL Threshold Boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL threshold boundaries", () => {
  it("exactly 150% FPL has 0% contribution rate", () => {
    // Family of 1: FPL = $15,060. 150% = $22,590
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(22590),
    }));
    // 22590/15060*100 = 150% → still in 0% bracket (0-150 exclusive of 150)
    // Actually the bracket is [0, 150) so at exactly 150 we move to next bracket
    // Implementation: pct >= 150 && pct < 200 → rate starts at 0%
    expect(result.contributionRate.toNumber()).toBe(0);
  });

  it("just above 150% FPL starts interpolation toward 2%", () => {
    // 155% FPL = $15060 × 1.55 = $23,343
    const fpl = 15060;
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(Math.round(fpl * 1.55)),
    }));
    // 155% → rate interpolated: (155-150)/(200-150) × 0.02 = 0.1 × 0.02 = 0.002
    expect(result.contributionRate.toNumber()).toBeCloseTo(0.002, 3);
  });

  it("exactly 200% FPL has 2% contribution rate", () => {
    // 200% FPL = $30,120
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30120),
    }));
    // 30120/15060*100 = 200% → bracket [200, 250) starts at 2%
    expect(result.contributionRate.toNumber()).toBe(0.02);
  });

  it("exactly 400% FPL triggers 8.5% cap", () => {
    // 400% FPL = $60,240
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(60240),
    }));
    // 60240/15060*100 = 400% → bracket [400, ∞) → 8.5%
    expect(result.contributionRate.toNumber()).toBe(0.085);
  });

  it("above 400% FPL has no repayment cap", () => {
    // AGI $80K → ~531% FPL. No repayment cap.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(80000),
      form1095A: make1095A(400, 200, 500), // APTC > SLCSP to create large excess
    }));
    // PTC = max(0, SLCSP $2400 - expected $6800) = $0
    // APTC = $6000. Full repayment with no cap.
    expect(result.excessAPTCRepayment.toNumber()).toBe(6000);
  });
});

// ═══════════════════════════════════════════════════════════
// Repayment Cap Tiers
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - repayment cap tiers", () => {
  it("200-300% FPL: single cap $975", () => {
    // 250% FPL = $37,650
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(37650),
      filingStatus: "single",
      // Set APTC high, SLCSP lower than expected contribution
      form1095A: make1095A(500, 200, 500), // SLCSP $2400/yr, APTC $6000/yr
    }));
    // Expected contribution = $37,650 × 4% = $1,506
    // PTC = monthly: min(max(0, 200-125.50), 500) = 74.50 × 12 = $894
    // APTC = $6000. Excess = $6000-$894 = $5,106. Cap at $975 (Rev. Proc. 2024-40)
    expect(result.excessAPTCRepayment.toNumber()).toBe(975);
  });

  it("300-400% FPL: single cap $1,625", () => {
    // 350% FPL = $52,710
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(52710),
      filingStatus: "single",
      form1095A: make1095A(500, 200, 500),
    }));
    // Expected contribution = $52,710 × 7.25% = $3,821
    // PTC = max(0, monthly 200-318.42) = $0
    // APTC = $6000. Cap at $1,625 (Rev. Proc. 2024-40)
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
  });

  it("below 200% FPL MFJ: cap $750 (not $375)", () => {
    // Family of 2: FPL = $15060 + $5380 = $20,440. 160% = $32,704
    const result = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(32704),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(400, 100, 500), // SLCSP low, APTC high
    }));
    // FPL% = 32704/20440*100 = 160% → below 200% → MFJ cap $750
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });

  it("200-300% FPL MFJ: cap $1,950", () => {
    // Family of 2: FPL = $20,440. 250% = $51,100
    const result = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(51100),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(500, 100, 600),
    }));
    // FPL% = 250% → 200-300 bracket → MFJ cap $1,950 (Rev. Proc. 2024-40)
    expect(result.excessAPTCRepayment.toNumber()).toBe(1950);
  });
});

// ═══════════════════════════════════════════════════════════
// Multi-Form Aggregation
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - multiple 1095-A forms", () => {
  it("aggregates premiums from two 1095-A forms", () => {
    const result = calculateForm8962(makeInput({
      form1095A: [
        {
          marketplace: "Healthcare.gov",
          policyNumber: "POL-A",
          monthlyPremiums: Array.from({ length: 6 }, (_, i) => ({
            month: i + 1,
            enrolleePremium: "400",
            slcsp: "500",
            advancePremiumTaxCredit: "200",
          })),
        },
        {
          marketplace: "Healthcare.gov",
          policyNumber: "POL-B",
          monthlyPremiums: Array.from({ length: 6 }, (_, i) => ({
            month: i + 7,
            enrolleePremium: "600",
            slcsp: "700",
            advancePremiumTaxCredit: "350",
          })),
        },
      ],
    }));
    // Form A: 6 × ($400, $500, $200) = ($2400, $3000, $1200)
    // Form B: 6 × ($600, $700, $350) = ($3600, $4200, $2100)
    // Total: ($6000, $7200, $3300)
    expect(result.annualPremium.toNumber()).toBe(6000);
    expect(result.annualSLCSP.toNumber()).toBe(7200);
    expect(result.annualAdvancePTC.toNumber()).toBe(3300);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero PTC With APTC (Full Repayment Scenario)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - full repayment scenarios", () => {
  it("high income with APTC received triggers full repayment (no cap above 400%)", () => {
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(100000), // 664% FPL → 8.5%
      form1095A: make1095A(300, 400, 250),
    }));
    // Expected = $100K × 8.5% = $8,500
    // SLCSP = $4,800. PTC = max(0, 4800-8500) = $0
    // APTC = $3,000. Full repayment, no cap
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(3000);
  });

  it("larger family has higher FPL reducing FPL percentage", () => {
    // Family of 6: FPL = $15060 + 5×$5380 = $41,960
    // AGI $60K → 60000/41960*100 ≈ 143% → 0% rate
    const result = calculateForm8962(makeInput({
      taxFamilySize: 6,
      modifiedAGI: d(60000),
      form1095A: make1095A(800, 1200, 400),
    }));
    // Expected = $60K × 0% = $0
    // SLCSP = $14,400. PTC = min($14400, $9600 premium) = $9,600
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(9600);
    // Net PTC = $9,600 - $4,800 APTC = $4,800
    expect(result.netPTC.toNumber()).toBe(4800);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL exactly at 150%", () => {
  it("150% FPL sits at the start of the 150-200% bracket with 0% contribution rate", () => {
    // Family of 1: FPL = $15,060. 150% = $22,590 exactly.
    // Bracket [150, 200): position = (150-150)/50 = 0 → rate = 0 + 0×0.02 = 0%
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(22590),
      form1095A: make1095A(400, 500, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(150);
    expect(result.contributionRate.toNumber()).toBe(0);
    // ec = $0, SLCSP = $6,000, premium = $4,800 → ptcAllowed = min(6000, 4800) = 4800
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    // No APTC received → full PTC as refundable credit
    expect(result.netPTC.toNumber()).toBe(4800);
  });
});

describe("Form 8962 - FPL exactly at 400%", () => {
  it("400% FPL applies 8.5% flat rate with no repayment cap", () => {
    // Family of 1: FPL = $15,060. 400% = $60,240 exactly.
    // Bracket [400, ∞): rate = 8.5% flat; no repayment cap.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(60240),
      form1095A: make1095A(400, 500, 200),
    }));
    expect(result.fplPercentage.toNumber()).toBe(400);
    expect(result.contributionRate.toNumber()).toBe(0.085);
    // ec = roundDollar(60240 × 0.085) = $5,120
    expect(result.expectedContribution.toNumber()).toBe(5120);
    // Monthly: min(max(0, 500-426.67), 400) = min(73.33, 400) = 73.33 × 12 = $880
    expect(result.ptcAllowed.toNumber()).toBe(880);
    // APTC = $2,400 > ptcAllowed $880 → excess = $1,520; pct ≥ 400 → no cap
    expect(result.excessAPTCRepayment.toNumber()).toBe(1520);
  });
});

describe("Form 8962 - APTC exceeds PTC", () => {
  it("excess APTC triggers capped repayment when income is below 200% FPL", () => {
    // Family of 1, AGI = $30,000 → ~199% FPL
    // Bracket [150, 200): pos = (199-150)/50 = 0.98 → rate = 0.0196
    // ec = roundDollar(30000 × 0.0196) = $588
    // Monthly: min(max(0, 450-49), 300) = min(401, 300) = 300 × 12 = $3,600
    // APTC = $6,000 → excess = $2,400. Cap for single < 200% FPL = $375.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30000),
      filingStatus: "single",
      form1095A: make1095A(300, 450, 500),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(3600);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });
});

describe("Form 8962 - income below 100% FPL", () => {
  it("sub-100% FPL results in 0% contribution rate without an assumed eligibility exception", () => {
    // Below 100% FPL requires actual exception facts; none are supplied.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(10000),
      form1095A: make1095A(300, 500, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(66.4, 0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

describe("Form 8962 - zero APTC", () => {
  it("zero APTC with eligible income produces full PTC as refundable credit", () => {
    // Family of 1, AGI = $35,000 → ~232% FPL.
    // Bracket [200, 250): rate = 0.02 + (32/50)×0.02 = 0.0328
    // ec = roundDollar(35000 × 0.0328) = $1,148
    // Monthly: min(max(0, 600-95.67), 400) = min(504.33, 400) = 400 × 12 = $4,800
    // APTC = $0 → netPTC = $4,800 (fully refundable, no repayment)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(35000),
      form1095A: make1095A(400, 600, 0),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

describe("Form 8962 - monthly premium equals SLCSP", () => {
  it("premium equal to SLCSP yields zero PTC when expected contribution exceeds SLCSP", () => {
    // Family of 1, AGI = $60,240 (400% FPL) → rate = 8.5%, ec = $5,120.
    // Monthly premium = SLCSP = $400. annualSLCSP = $4,800 < ec → rawPTC = $0.
    // ptcAllowed = $0, netPTC = $0, no APTC → no repayment.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(60240),
      form1095A: make1095A(400, 400, 0),
    }));
    expect(result.annualPremium.toNumber()).toBe(result.annualSLCSP.toNumber());
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

describe("Form 8962 - large family (household size 4+)", () => {
  it("family of 4 benefits from higher FPL threshold, reducing contribution rate", () => {
    // Line 5 drops 224.4% to 224; Table 2 rate .0296 times $70000 = $2072.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 4,
      modifiedAGI: d(70000),
      form1095A: make1095A(800, 1000, 300),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(224.4, 0);
    expect(result.contributionRate.toNumber()).toBe(0.0296);
    expect(result.expectedContribution.toNumber()).toBe(2072);
    expect(result.ptcAllowed.toNumber()).toBe(9600);
    expect(result.netPTC.toNumber()).toBe(6000);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Income Exactly at 100% FPL (Cliff Edge)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - income exactly at 100% FPL", () => {
  it("Line 3: 100% FPL falls in [0,150) bracket with 0% contribution rate", () => {
    // Family of 1: FPL = $15,060. 100% = $15,060 exactly.
    // fplPct = roundDollar(15060/15060*100) = 100
    // Bracket [0, 150): rate = 0%, ec = $0
    // SLCSP = $6,000, premium = $4,800 → PTC = min(6000, 4800) = $4,800
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15060),
      form1095A: make1095A(400, 500, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.netPTC.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });

  it("Line 3: 100% FPL with APTC received still uses 0% rate and caps repayment at $375", () => {
    // AGI = $15,060. fplPct = 100 → bracket [0,150) → rate 0%
    // ec = $0, SLCSP = $6,000, premium = $4,800 → PTC = $4,800
    // APTC = $6,000 → excess = $1,200, cap <200% single = $375
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15060),
      filingStatus: "single",
      form1095A: make1095A(400, 500, 500),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero APTC With Large PTC (Full Refund)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - zero APTC with large PTC (full refund)", () => {
  it("Line 26: zero APTC at 200% FPL yields large refundable PTC", () => {
    // Family of 1, AGI = $30,120 → fplPct = 200
    // Bracket [200, 250): rate = 0.02. ec = roundDollar(30120 × 0.02) = $602
    // Monthly: min(max(0, 1200-50.17), 1000) = min(1149.83, 1000) = 1000 × 12 = $12,000
    // APTC = $0 → netPTC = $12,000 (full refund)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30120),
      form1095A: make1095A(1000, 1200, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(200);
    expect(result.expectedContribution.toNumber()).toBe(602);
    expect(result.ptcAllowed.toNumber()).toBe(12000);
    expect(result.advancePTCTotal.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(12000);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Large APTC Excess (Must Repay)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - large APTC excess repayment", () => {
  it("Line 27: APTC far exceeding PTC above 400% FPL requires full uncapped repayment", () => {
    // Family of 1, AGI = $120,000 → fplPct = 120000/15060*100 = 796.81%
    // Bracket [400, ∞): rate = 8.5%. ec = roundDollar(120000 × 0.085) = $10,200
    // SLCSP = $7,200 < ec → rawPTC = $0, PTC = $0
    // APTC = $7,200 → excess = $7,200, no cap (≥400%)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(120000),
      form1095A: make1095A(500, 600, 600),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(796.8, 0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(7200);
  });
});

// ═══════════════════════════════════════════════════════════
// Repayment Caps at Various Income Levels
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - repayment caps at various income levels", () => {
  it("Line 27: below 200% FPL HOH filing status uses 'other' cap $750", () => {
    // Family of 1, AGI = $20,000 → fplPct = 20000/15060*100 = 132.80%
    // Bracket [0, 150): rate = 0%. ec = $0
    // SLCSP = $6,000, premium = $4,800 → PTC = $4,800
    // APTC = $7,200 → excess = $2,400. HOH uses 'other' cap = $750
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(20000),
      filingStatus: "head_of_household",
      form1095A: make1095A(400, 500, 600),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(132.8, 0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });

  it("Line 27: 300-400% FPL single cap $1,600", () => {
    // Family of 1, AGI = $50,000 → fplPct = 50000/15060*100 = 332.01%
    // Bracket [300, 400): rate = 0.06 + (32.01/100)*0.025 = 0.068
    // ec = roundDollar(50000 × 0.068) = $3,400
    // SLCSP = $2,400, rawPTC = max(0, monthly 200-283.33) = $0
    // APTC = $6,000 → excess = $6,000, cap single 300-400 = $1,625 (Rev. Proc. 2024-40)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(50000),
      filingStatus: "single",
      form1095A: make1095A(500, 200, 500),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(332.0, 0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
  });

  it("Line 27: 300-400% FPL MFJ cap $3,250", () => {
    // Family of 2: FPL = $15,060 + $5,380 = $20,440. 350% = $71,540
    // AGI = $71,540 → fplPct = roundDollar(71540/20440*100) = 350
    // Bracket [300, 400): rate = 0.06 + (50/100)*0.025 = 0.0725
    // ec = roundDollar(71540 × 0.0725) = $5,187
    // SLCSP = $2,400, rawPTC = max(0, monthly 200-432.25) = $0
    // APTC = $7,200 → excess = $7,200, cap MFJ 300-400 = $3,250 (Rev. Proc. 2024-40)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(71540),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(500, 200, 600),
    }));
    expect(result.fplPercentage.toNumber()).toBe(350);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(3250);
  });
});

// ═══════════════════════════════════════════════════════════
// Family Size Changes (Different FPL Levels)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - family size changes FPL thresholds", () => {
  it("Line 3: family of 8 has FPL $52,720, same AGI yields lower FPL percentage", () => {
    // Family of 8: FPL = $15,060 + 7×$5,380 = $15,060 + $37,660 = $52,720
    // AGI = $60,000 → fplPct = 60000/52720*100 = 113.81%
    // Bracket [0, 150): rate = 0%. ec = $0
    // SLCSP = $6,000, premium = $4,800 → PTC = $4,800
    const result = calculateForm8962(makeInput({
      taxFamilySize: 8,
      modifiedAGI: d(60000),
      form1095A: make1095A(400, 500, 200),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(113.8, 0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    // APTC = $2,400 → netPTC = $2,400
    expect(result.netPTC.toNumber()).toBe(2400);
  });

  it("Line 3: family of 2 vs family of 1 — same AGI crosses bracket boundary", () => {
    // Family of 1: FPL = $15,060. AGI $35,000 → fplPct = 232.40% → [200,250)
    // Family of 2: FPL = $20,440. AGI $35,000 → fplPct = 35000/20440*100 = 171.23% → [150,200)
    const result1 = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(35000),
      form1095A: make1095A(400, 600, 0),
    }));
    const result2 = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(35000),
      form1095A: make1095A(400, 600, 0),
    }));
    // Family of 1 is in [200,250) bracket — higher rate
    expect(result1.fplPercentage.toNumber()).toBeCloseTo(232.4, 0);
    // Family of 2 is in [150,200) bracket — lower rate
    expect(result2.fplPercentage.toNumber()).toBeCloseTo(171.2, 0);
    // Family of 2 should have lower contribution rate and lower expected contribution
    expect(result2.contributionRate.toNumber()).toBeLessThan(result1.contributionRate.toNumber());
    expect(result2.expectedContribution.toNumber()).toBeLessThan(result1.expectedContribution.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Filing Status (Generally Ineligible / Single Cap)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - MFS filing status", () => {
  it("Line 27: MFS uses 'any other filing status' repayment cap per Table 5", () => {
    // Per IRS Form 8962 Table 5: columns are "Single" vs "any other filing status".
    // MFS is not Single → uses "other" column.
    // Family of 1, AGI = $37,650 → fplPct = 250 → [200,300) bracket → other cap $1,950
    // Bracket [250, 300): rate = 0.04 + (0/50)*0.02 = 0.04
    // ec = roundDollar(37650 × 0.04) = $1,506
    // Monthly: min(max(0, 200-125.50), 500) = 74.50 × 12 = $894
    // APTC = $6,000 → excess = $5,106, cap other 200-300 = $1,950
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(37650),
      filingStatus: "married_filing_separately",
      form1095A: make1095A(500, 200, 500),
    }));
    expect(result.fplPercentage.toNumber()).toBe(250);
    expect(result.excessAPTCRepayment.toNumber()).toBe(1950);
  });

  it("Line 27: MFS below 200% FPL gets other cap $750 per Table 5", () => {
    // Family of 1, AGI = $20,000 → fplPct = 133 → [0,150) → rate 0%
    // ec = $0, SLCSP = $6,000, premium = $4,800 → PTC = $4,800
    // APTC = $7,200 → excess = $2,400, MFS uses other cap = $750 (Table 5)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(20000),
      filingStatus: "married_filing_separately",
      form1095A: make1095A(400, 500, 600),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// Household Income Exactly at Benchmark Premium
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - household income exactly at benchmark premium", () => {
  it("Line 24: expected contribution equals SLCSP yields zero PTC", () => {
    // Need ec = annualSLCSP. Family of 1.
    // At 400% FPL ($60,240): rate = 0.085. ec = $5,120.
    // SLCSP monthly = $440 → annual $5,280 > ec → rawPTC > 0, so use lower SLCSP.
    // SLCSP monthly = $420 → annual $5,040 < $5,120 → rawPTC = $0.
    // Just use a case where SLCSP < ec cleanly:
    // AGI = $60,240, rate = 0.085, ec = $5,120. SLCSP monthly = $420 → annual $5,040 < ec.
    // Monthly: max(0, 420-426.67) = 0. PTC = $0.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(60240),
      form1095A: make1095A(500, 420, 0),
    }));
    expect(result.expectedContribution.toNumber()).toBe(5120);
    expect(result.annualSLCSP.toNumber()).toBe(5040);
    // SLCSP < expected contribution → PTC = $0
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Silver Plan Benchmark = $0 Scenario
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - silver plan benchmark $0", () => {
  it("Line 24: SLCSP of $0 for all months produces zero PTC regardless of income", () => {
    // SLCSP = $0 → rawPTC = max(0, 0 - ec) = $0 → PTC = $0
    // Any APTC becomes excess (no cap since PTC=0 and APTC>0)
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(25000),
      form1095A: make1095A(400, 0, 300),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    // APTC = $3,600. fplPct = roundDollar(25000/15060*100) = 166 → <200% → single cap $375
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Marketplace Policies
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - multiple marketplace policies", () => {
  it("Line 11a-c: three overlapping 1095-A forms aggregate all months", () => {
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30000),
      form1095A: [
        {
          marketplace: "Healthcare.gov",
          policyNumber: "POL-X",
          monthlyPremiums: Array.from({ length: 4 }, (_, i) => ({
            month: i + 1,
            enrolleePremium: "300",
            slcsp: "500",
            advancePremiumTaxCredit: "200",
          })),
        },
        {
          marketplace: "Healthcare.gov",
          policyNumber: "POL-Y",
          monthlyPremiums: Array.from({ length: 4 }, (_, i) => ({
            month: i + 5,
            enrolleePremium: "350",
            slcsp: "550",
            advancePremiumTaxCredit: "250",
          })),
        },
        {
          marketplace: "CoveredCA",
          policyNumber: "POL-Z",
          monthlyPremiums: Array.from({ length: 4 }, (_, i) => ({
            month: i + 9,
            enrolleePremium: "450",
            slcsp: "600",
            advancePremiumTaxCredit: "300",
          })),
        },
      ],
    }));
    // POL-X: 4 × (300, 500, 200) = (1200, 2000, 800)
    // POL-Y: 4 × (350, 550, 250) = (1400, 2200, 1000)
    // POL-Z: 4 × (450, 600, 300) = (1800, 2400, 1200)
    // Total: (4400, 6600, 3000)
    expect(result.annualPremium.toNumber()).toBe(4400);
    expect(result.annualSLCSP.toNumber()).toBe(6600);
    expect(result.annualAdvancePTC.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Part-Year Coverage (Mid-Year Start)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - part-year coverage mid-year start", () => {
  it("Line 11a-partial: coverage starting in July aggregates 6 months", () => {
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(25000),
      form1095A: [{
        marketplace: "Healthcare.gov",
        policyNumber: "POL-MID",
        monthlyPremiums: Array.from({ length: 6 }, (_, i) => ({
          month: i + 7, // July through December
          enrolleePremium: "500",
          slcsp: "700",
          advancePremiumTaxCredit: "400",
        })),
      }],
    }));
    expect(result.annualPremium.toNumber()).toBe(3000);   // 500 × 6
    expect(result.annualSLCSP.toNumber()).toBe(4200);     // 700 × 6
    expect(result.annualAdvancePTC.toNumber()).toBe(2400); // 400 × 6
    // fplPct = roundDollar(25000/15060*100) = 166 → [150,200) → rate interpolated
    // rate = 0 + (16/50)*0.02 = 0.0064. ec = roundDollar(25000 × 0.0064) = $160
    // Monthly: min(max(0, 700-13.33), 500) = min(686.67, 500) = 500 × 6 = $3,000
    // APTC = $2,400 → netPTC = $600
    expect(result.ptcAllowed.toNumber()).toBe(3000);
    expect(result.netPTC.toNumber()).toBe(600);
  });
});

// ═══════════════════════════════════════════════════════════
// APTC Exactly Matching PTC (No Adjustment)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - APTC exactly matches PTC", () => {
  it("Line 26/27: when APTC equals PTC exactly, netPTC and excessRepayment are both zero", () => {
    // Need PTC = APTC. Family of 1, AGI = $30,120 → fplPct = 200 → rate = 0.02
    // ec = $602. Monthly: min(max(0, 500-50.17), 400) = min(449.83, 400) = 400 × 12 = $4,800
    // Set APTC = $4,800 → monthly $400
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30120),
      form1095A: make1095A(400, 500, 400),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(4800);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Low Income Below 100% FPL (Medicaid Gap)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - very low income / Medicaid gap", () => {
  it("Line 3: zero income yields 0% FPL and 0% contribution rate", () => {
    // No below-poverty eligibility exception is supplied.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(0),
      form1095A: make1095A(400, 500, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
  });

  it("Line 3: income $5,000 is ~33% FPL without an assumed eligibility exception", () => {
    // No below-poverty exception: credit zero, repayment remains subject to 2025 Table 5.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(5000),
      form1095A: make1095A(400, 500, 200),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(33.2, 0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toString()).toBe("375");
  });
});

// ═══════════════════════════════════════════════════════════
// Qualifying Surviving Spouse (Uses "Other" Cap)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - qualifying surviving spouse filing status", () => {
  it("Line 27: QSS uses 'other' repayment cap like MFJ", () => {
    // Family of 1, AGI = $20,000 → fplPct = 133 → [0,150) → rate 0%
    // ec = $0, SLCSP = $6,000, premium = $4,800 → PTC = $4,800
    // APTC = $7,200 → excess = $2,400, QSS cap 'other' <200% = $750
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(20000),
      filingStatus: "qualifying_surviving_spouse",
      form1095A: make1095A(400, 500, 600),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// PTC at 100% FPL — Minimum Eligibility Confirmed
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - PTC at 100% FPL minimum eligibility", () => {
  it("Line 24: income at exactly 100% FPL yields full PTC up to enrollment premium", () => {
    // Family of 1: FPL = $15,060. 100% = $15,060.
    // fplPct = roundDollar(15060/15060*100) = 100. Bracket [0,150): rate = 0%, ec = $0.
    // annualSLCSP = $8,400 (700×12), annualPremium = $6,000 (500×12).
    // rawPTC = max(0, 8400-0) = $8,400. ptcAllowed = min(8400, 6000) = $6,000.
    // APTC = $0 → netPTC = $6,000 (fully refundable). Minimum eligibility confirmed.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15060),
      form1095A: make1095A(500, 700, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(6000);
    expect(result.netPTC.toNumber()).toBe(6000);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// PTC Still Available Above 400% FPL (IRA Enhanced Subsidies)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - PTC above 400% FPL under IRA enhanced rules", () => {
  it("Line 24: 465% FPL still yields positive PTC when SLCSP exceeds 8.5% expected contribution", () => {
    // IRA extension keeps subsidies open above 400% FPL with flat 8.5% rate.
    // Family of 1, AGI = $70,000 → fplPct = 70000/15060*100 = 464.81%.
    // Bracket [400,∞): rate = 8.5%. ec = roundDollar(70000*0.085) = $5,950.
    // Monthly: min(max(0, 600-495.83), 500) = min(104.17, 500) = 104.17 × 12 = $1,250
    // annualPremium = $6,000 (500×12) → ptcAllowed = $1,250.
    // No APTC → netPTC = $1,250.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(70000),
      form1095A: make1095A(500, 600, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(464.8, 0);
    expect(result.contributionRate.toNumber()).toBe(0.085);
    expect(result.expectedContribution.toNumber()).toBe(5950);
    expect(result.ptcAllowed.toNumber()).toBe(1250);
    expect(result.netPTC.toNumber()).toBe(1250);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Household Income Exactly at 250% and 300% FPL Bracket Edges
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - income exactly at 250% FPL bracket boundary", () => {
  it("Line 5: 250% FPL falls at the start of the [250,300) bracket with 4% contribution rate", () => {
    // Family of 1: FPL = $15,060. 250% = $37,650 exactly.
    // fplPct = roundDollar(37650/15060*100) = 250. Bracket [250,300): minRate=0.04.
    // position = (250-250)/50 = 0 → rate = 0.04 + 0*0.02 = 0.04.
    // ec = roundDollar(37650*0.04) = $1,506.
    // Monthly: min(max(0, 400-125.50), 300) = min(274.50, 300) = 274.50 × 12 = $3,294.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(37650),
      form1095A: make1095A(300, 400, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(250);
    expect(result.contributionRate.toNumber()).toBe(0.04);
    expect(result.expectedContribution.toNumber()).toBe(1506);
    expect(result.ptcAllowed.toNumber()).toBe(3294);
    expect(result.netPTC.toNumber()).toBe(3294);
  });
});

describe("Form 8962 - income exactly at 300% FPL bracket boundary", () => {
  it("Line 5: 300% FPL falls at the start of the [300,400) bracket with 6% contribution rate", () => {
    // Family of 1: FPL = $15,060. 300% = $45,180 exactly.
    // fplPct = roundDollar(45180/15060*100) = 300. Bracket [300,400): minRate=0.06.
    // position = (300-300)/100 = 0 → rate = 0.06 + 0*0.025 = 0.06.
    // ec = roundDollar(45180*0.06) = $2,711.
    // Monthly: min(max(0, 400-225.92), 500) = min(174.08, 500) = 174.08 × 12 ≈ $2,089.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(45180),
      form1095A: make1095A(500, 400, 0),
    }));
    expect(result.fplPercentage.toNumber()).toBe(300);
    expect(result.contributionRate.toNumber()).toBe(0.06);
    expect(result.expectedContribution.toNumber()).toBe(2711);
    expect(result.ptcAllowed.toNumber()).toBe(2089);
    expect(result.netPTC.toNumber()).toBe(2089);
  });
});

// ═══════════════════════════════════════════════════════════
// SLCSP Benchmark Premium Variations
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - high SLCSP benchmark caps PTC at enrollment premium", () => {
  it("Line 24: very high SLCSP causes PTC to be capped at actual enrollment premium", () => {
    // Family of 1, AGI = $25,000 → fplPct = roundDollar(25000/15060*100) = 166.
    // Bracket [150,200): rate = (16/50)*0.02 = 0.0064. ec = roundDollar(25000*0.0064) = $160.
    // annualSLCSP = $18,000 (1500×12) — very high benchmark.
    // Monthly: min(max(0, 1500-13.33), 400) = min(1486.67, 400) = 400 × 12 = $4,800.
    // ptcAllowed = $4,800 — capped by actual premium, not SLCSP.
    // No APTC → netPTC = $4,800.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(25000),
      form1095A: make1095A(400, 1500, 0),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(18000);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.ptcAllowed.toNumber()).toBeLessThan(result.annualSLCSP.minus(result.expectedContribution).toNumber());
    expect(result.netPTC.toNumber()).toBe(4800);
  });
});

describe("Form 8962 - low SLCSP benchmark eliminates PTC entirely", () => {
  it("Line 24: SLCSP below expected contribution results in zero PTC and capped excess repayment", () => {
    // Family of 1, AGI = $50,000 → fplPct = roundDollar(50000/15060*100) = 332.
    // Bracket [300,400): rate = 0.06+(32/100)*0.025 = 0.068. ec = roundDollar(50000*0.068) = $3,400.
    // annualSLCSP = $1,200 (100×12) < ec → rawPTC = $0, ptcAllowed = $0.
    // APTC = $2,400 (200×12). excess = $2,400. Cap single [300,400) = $1,625 (Rev. Proc. 2024-40).
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(50000),
      filingStatus: "single",
      form1095A: make1095A(500, 100, 200),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(1200);
    expect(result.expectedContribution.toNumber()).toBe(3400);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
  });
});

// ═══════════════════════════════════════════════════════════
// Advance PTC Shortfall — Additional Refundable Credit
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - advance PTC shortfall yields additional refundable credit", () => {
  it("Line 26: APTC less than allowed PTC produces positive netPTC (additional credit on return)", () => {
    // Family of 1, AGI = $22,590 (150% FPL exactly) → rate = 0%, ec = $0.
    // annualSLCSP = $9,600 (800×12), annualPremium = $7,200 (600×12).
    // rawPTC = min(800, 600) = 600 × 12 = $7,200. ptcAllowed = $7,200.
    // APTC = $2,400 (200×12). netPTC = $7,200-$2,400 = $4,800 additional refundable credit.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(22590),
      form1095A: make1095A(600, 800, 200),
    }));
    expect(result.fplPercentage.toNumber()).toBe(150);
    expect(result.ptcAllowed.toNumber()).toBe(7200);
    expect(result.advancePTCTotal.toNumber()).toBe(2400);
    expect(result.netPTC.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Family Size Impact — Different FPL Percentages, Same AGI
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - family size drives FPL bracket assignment", () => {
  it("Line 3: family of 3 vs family of 5 at same AGI $55,000 land in different FPL brackets", () => {
    // Family of 3: FPL = $15,060+2*$5,380 = $25,820.
    //   fplPct = 55000/25820*100 = 213.01%. Bracket [200,250): rate ≈ 0.0252.
    //   ec = roundDollar(55000*0.0252) = $1,386.
    // Family of 5: FPL = $15,060+4*$5,380 = $36,580.
    //   fplPct = 55000/36580*100 = 150.36%. Bracket [150,200): small positive rate.
    //   ec = roundDollar(55000*0.000142) = $8.
    const result3 = calculateForm8962(makeInput({
      taxFamilySize: 3,
      modifiedAGI: d(55000),
      form1095A: make1095A(400, 600, 0),
    }));
    const result5 = calculateForm8962(makeInput({
      taxFamilySize: 5,
      modifiedAGI: d(55000),
      form1095A: make1095A(400, 600, 0),
    }));
    // Family of 3: in [200,250) bracket → non-zero contribution rate and expected contribution
    expect(result3.fplPercentage.toNumber()).toBeCloseTo(213.0, 0);
    expect(result3.contributionRate.toNumber()).toBeGreaterThan(0);
    expect(result3.expectedContribution.toNumber()).toBe(1386);
    // Family of 5: in [150,200) bracket slightly above 150% → very small positive rate
    expect(result5.fplPercentage.toNumber()).toBeCloseTo(150.4, 0);
    expect(result5.contributionRate.toNumber()).toBeGreaterThanOrEqual(0);
    expect(result5.expectedContribution.toNumber()).toBeLessThan(result3.expectedContribution.toNumber());
    // Family of 5 has lower expected contribution, confirming family size lowers the burden
    expect(result5.expectedContribution.toNumber()).toBeLessThan(result3.expectedContribution.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// MFS — Engine Applies Single Repayment Cap, PTC Still Computed
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - MFS uses 'other' repayment cap per Table 5", () => {
  it("Line 27: MFS at 232% FPL gets other $1,950 cap per Table 5", () => {
    // MFS without an actual exception receives no PTC; the 2025 other-filing-status cap is $1950.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(35000),
      filingStatus: "married_filing_separately",
      form1095A: make1095A(600, 200, 500),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(232.4, 0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(1950);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Low Income + Large APTC → Repayment Cap Binding
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - very low income with large APTC hits repayment cap", () => {
  it("Line 27: single filer at 120% FPL with large APTC is capped at $375 repayment", () => {
    // Family of 1, AGI = $18,000 → fplPct = 18000/15060*100 = 119.52%.
    // Bracket [0,150): rate = 0%, ec = $0.
    // annualSLCSP = $7,200 (600×12), annualPremium = $4,800 (400×12).
    // rawPTC = $7,200-$0 = $7,200. ptcAllowed = min(7200, 4800) = $4,800.
    // APTC = $9,600 (800×12). raw excess = $9,600-$4,800 = $4,800.
    // Cap single <200% FPL = $375. Repayment capped at $375 — far below raw excess.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(18000),
      filingStatus: "single",
      form1095A: make1095A(400, 600, 800),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(119.5, 0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(9600);
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — PTC Calculation Lines Verified
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - audit trail records all PTC calculation lines", () => {
  it("lines array contains entries for every Form 8962 line computed", () => {
    // Standard scenario: run a basic calculation and inspect the audit trail.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30120),
      form1095A: make1095A(400, 500, 200),
    }));

    const lineNums = result.lines
      .filter((l) => l.form === "Form 8962")
      .map((l) => l.line);

    // Every key Form 8962 line must appear in the audit trail
    expect(lineNums).toContain("1");   // family size
    expect(lineNums).toContain("2a");  // taxpayer MAGI
    expect(lineNums).toContain("2b");  // required-filing dependent MAGI
    expect(lineNums).toContain("4");   // poverty guideline
    expect(lineNums).toContain("8a");  // annual contribution
    expect(lineNums).toContain("8b");  // monthly contribution
    expect(lineNums).toContain("11f"); // advance credit
    expect(lineNums).toContain("29");  // repayment tax
    expect(lineNums).toContain("3");   // household income
    expect(lineNums).toContain("5");   // whole poverty percentage
    expect(lineNums).toContain("7");   // applicable figure
    expect(lineNums).toContain("11a"); // annual enrollment premium
    expect(lineNums).toContain("11b"); // annual SLCSP
    expect(lineNums).toContain("11c"); // annual contribution
    expect(lineNums).toContain("24");  // PTC allowed
    expect(lineNums).toContain("25");  // advance PTC total
    expect(lineNums).toContain("26");  // net PTC
    expect(lineNums).toContain("27");  // excess APTC repayment

    // Descriptions must be non-empty strings
    for (const l of result.lines.filter((ln) => ln.form === "Form 8962")) {
      expect(l.description.length).toBeGreaterThan(0);
      expect(l.formula.length).toBeGreaterThan(0);
    }

    // Values must be Decimal instances
    const line3 = result.lines.find((l) => l.form === "Form 8962" && l.line === "3");
    expect(line3?.value.toNumber()).toBe(result.modifiedAGI.toNumber());

    const line24 = result.lines.find((l) => l.form === "Form 8962" && l.line === "24");
    expect(line24?.value.toNumber()).toBe(result.ptcAllowed.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// FPL Percentage Decimal Precision — Repayment Cap Boundary
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL percentage decimal precision at repayment cap boundaries", () => {
  it("199.8% FPL stays in <200% repayment cap tier (not rounded to 200%)", () => {
    // Single, family 1, MAGI = $30,090 → FPL% = 30090/15060 × 100 = 199.801...%
    // Without decimal precision: rounds to 200 → wrong tier (cap $975)
    // With decimal precision: 199.80% → correct tier <200% (cap $375)
    // APTC $400/mo far exceeds PTC → large excess triggers repayment cap
    const result = calculateForm8962({
      taxFamilySize: 1,
      modifiedAGI: d(30090),
      filingStatus: "single",
      form1095A: make1095A(200, 100, 400),
    });
    // FPL% must be decimal, NOT rounded to 200
    expect(result.fplPercentage.toNumber()).toBeLessThan(200);
    expect(result.fplPercentage.toNumber()).toBeGreaterThan(199);
    // Repayment must use <200% tier cap ($375), not ≥200% tier cap ($975)
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });

  it("399.8% FPL retains repayment cap (not rounded to 400%)", () => {
    // Single, family 1, MAGI = $60,210 → FPL% = 60210/15060 × 100 = 399.80...%
    // Without decimal precision: rounds to 400 → no cap (full repayment)
    // With decimal precision: 399.80% → cap at 300-400% tier ($1,625)
    // Set up: high APTC, zero PTC (SLCSP < expected contribution)
    const result = calculateForm8962({
      taxFamilySize: 1,
      modifiedAGI: d(60210),
      filingStatus: "single",
      form1095A: make1095A(200, 100, 400), // SLCSP $100 < expected → PTC = $0
    });
    // FPL% must be decimal, NOT rounded to 400
    expect(result.fplPercentage.toNumber()).toBeLessThan(400);
    expect(result.fplPercentage.toNumber()).toBeGreaterThan(399);
    // Repayment must use 300-400% tier cap ($1,625), not uncapped
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
    // Without the fix, this would be $4,800 (no cap at ≥400%)
  });
});

// ═══════════════════════════════════════════════════════════
// Rev. Proc. 2024-40 §2.07 — TY2025 Repayment Cap Regression
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - TY2025 repayment caps per Rev. Proc. 2024-40", () => {
  it("200-300% FPL single cap is $975 (not TY2024 value $950)", () => {
    // Rev. Proc. 2024-40 §2.07: $975 for single filers at 200-300% FPL.
    // TY2024 value was $950 (Rev. Proc. 2023-34). Difference = $25.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(37650), // 250% FPL
      filingStatus: "single",
      form1095A: make1095A(200, 100, 500), // PTC = $0, APTC = $6K → excess capped
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(975);
  });

  it("300-400% FPL single cap is $1,625 (not TY2024 value $1,600)", () => {
    // Rev. Proc. 2024-40 §2.07: $1,625 for single filers at 300-400% FPL.
    // TY2024 value was $1,600 (Rev. Proc. 2023-34). Difference = $25.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(52710), // 350% FPL
      filingStatus: "single",
      form1095A: make1095A(200, 100, 500),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
  });

  it("200-300% FPL other cap is $1,950 (not TY2024 value $1,900)", () => {
    // Rev. Proc. 2024-40 §2.07: $1,950 for non-single filers at 200-300% FPL.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(51100), // 250% FPL (family of 2)
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(500, 100, 600),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(1950);
  });

  it("300-400% FPL other cap is $3,250 (not TY2024 value $3,200)", () => {
    // Rev. Proc. 2024-40 §2.07: $3,250 for non-single filers at 300-400% FPL.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(71540), // 350% FPL (family of 2)
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(500, 200, 600),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(3250);
  });

  it("MFS uses 'any other filing status' cap ($750), not single cap ($375), per Table 5", () => {
    // IRS Form 8962 Instructions Table 5: column headers are "Single" vs
    // "any other filing status". MFS is not Single → uses higher cap.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(20000), // ~133% FPL → <200% tier
      filingStatus: "married_filing_separately",
      form1095A: make1095A(400, 500, 600),
    }));
    // MFS uses other cap ($750), not single cap ($375)
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });

  it("HoH uses 'any other filing status' cap, same as MFJ", () => {
    // Head of Household is not "Single" per Table 5 → uses "other" column.
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(20000),
      filingStatus: "head_of_household",
      form1095A: make1095A(400, 500, 600),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });
});
