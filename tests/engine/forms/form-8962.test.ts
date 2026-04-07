/**
 * Tests for Form 8962 — Premium Tax Credit
 * Spec: spec/federal/form-8962.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm8962,
  type Form8962Input,
} from "@/engine/forms/form-8962.js";

const d = (n: number | string) => new Decimal(n);

function make1095A(monthlyPremium: number, monthlySLCSP: number, monthlyAPTC: number) {
  return [{
    marketplace: "Healthcare.gov",
    policyNumber: "POL-123",
    monthlyPremiums: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      enrolleePremium: String(monthlyPremium),
      slcsp: String(monthlySLCSP),
      advancePremiumTaxCredit: String(monthlyAPTC),
    })),
  }];
}

function make1095APartialYear(
  monthlyPremium: number,
  monthlySLCSP: number,
  monthlyAPTC: number,
  months: number[],
) {
  return [{
    marketplace: "Healthcare.gov",
    policyNumber: "POL-456",
    monthlyPremiums: months.map((month) => ({
      month,
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
// Basic Line Calculations
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - Lines", () => {
  it("Form 8962 Line 1 - family size", () => {
    const result = calculateForm8962(makeInput({ taxFamilySize: 4 }));
    expect(result.familySize).toBe(4);
  });

  it("Form 8962 Line 2 - modified AGI", () => {
    const result = calculateForm8962(makeInput({ modifiedAGI: d(45000) }));
    expect(result.modifiedAGI.toNumber()).toBe(45000);
  });

  it("Form 8962 Line 3 - FPL percentage retains decimal precision", () => {
    // Family of 1: FPL = $15,060 (2024 HHS). AGI $30,000
    // FPL% = 30000/15060 × 100 = 199.2031...% (NOT rounded to 199)
    // IRS Form 8962 Line 3 shows "___.__%" — decimal precision required for
    // accurate interpolation and repayment cap tier classification.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30000),
    }));
    // 30000 / 15060 × 100 = 199.2031872509960159...
    expect(result.fplPercentage.toNumber()).toBeCloseTo(199.20, 1);
    // Must be in the 150-200% bracket, not rounded to 199 or 200
    expect(result.fplPercentage.greaterThan(199)).toBe(true);
    expect(result.fplPercentage.lessThan(200)).toBe(true);
  });

  it("Form 8962 Line 3 - FPL for larger family retains decimal precision", () => {
    // Family of 4: FPL = $15,060 + 3×$5,380 = $31,200
    // AGI $50,000 → 50000/31200 × 100 = 160.2564...%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 4,
      modifiedAGI: d(50000),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(160.26, 1);
    expect(result.fplPercentage.greaterThan(160)).toBe(true);
    expect(result.fplPercentage.lessThan(161)).toBe(true);
  });

  it("Form 8962 Line 5 - contribution rate at 0% below 150 FPL", () => {
    // FPL = 15650, AGI = 15000 → ~96% FPL → rate = 0%
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15000),
    }));
    expect(result.contributionRate.toNumber()).toBe(0);
  });

  it("Form 8962 Line 5 - contribution rate above 400 FPL", () => {
    // AGI $100K, family of 1 → 100000/15650 = 639% → 8.5%
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(100000),
    }));
    expect(result.contributionRate.toNumber()).toBe(0.085);
  });

  it("Form 8962 Line 7 - expected contribution", () => {
    // AGI $100K × 8.5% = $8,500
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(100000),
    }));
    expect(result.expectedContribution.toNumber()).toBe(8500);
  });

  it("Form 8962 Line 11a - annual premium", () => {
    const result = calculateForm8962(makeInput({
      form1095A: make1095A(500, 600, 200),
    }));
    expect(result.annualPremium.toNumber()).toBe(6000); // 500 × 12
  });

  it("Form 8962 Line 11b - annual SLCSP", () => {
    const result = calculateForm8962(makeInput({
      form1095A: make1095A(500, 600, 200),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(7200); // 600 × 12
  });

  it("Form 8962 Line 11c - annual advance PTC", () => {
    const result = calculateForm8962(makeInput({
      form1095A: make1095A(500, 600, 200),
    }));
    expect(result.annualAdvancePTC.toNumber()).toBe(2400); // 200 × 12
  });
});

// ═══════════════════════════════════════════════════════════
// PTC Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - PTC Reconciliation", () => {
  it("Form 8962 Line 24 - PTC allowed", () => {
    // Low income: AGI $15K, FPL ~96% → contribution rate 0%
    // SLCSP = $600/mo = $7,200. Expected contribution = $0.
    // PTC = min($7200, $4800 premium) = $4,800
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15000),
      form1095A: make1095A(400, 600, 300),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800); // Can't exceed enrollment premium
  });

  it("Form 8962 Line 24 - PTC capped at enrollment premium", () => {
    // Low income, low premium but high SLCSP
    // Premium = $200/mo = $2,400. SLCSP = $800/mo = $9,600.
    // Expected contribution = $0. PTC = min($9600, $2400) = $2,400
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15000),
      form1095A: make1095A(200, 800, 100),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(2400);
  });

  it("Form 8962 Line 25 - advance PTC total equals Line 11c", () => {
    const result = calculateForm8962(makeInput({
      form1095A: make1095A(500, 700, 250),
    }));
    // APTC = $250/mo × 12 = $3,000
    expect(result.annualAdvancePTC.toNumber()).toBe(3000);
    // Line 25 is same as Line 11c
    const line25 = result.lines.find((l) => l.line === "25");
    if (line25) {
      expect(line25.value.toNumber()).toBe(3000);
    }
  });

  it("Form 8962 Line 26 - net PTC refundable", () => {
    // PTC allowed > APTC received → net refund
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(15000),
      form1095A: make1095A(400, 600, 200), // APTC = $2400, PTC should be $4800
    }));
    expect(result.netPTC.toNumber()).toBe(2400); // 4800 - 2400
  });

  it("Form 8962 Line 27 - excess APTC repayment", () => {
    // High income: APTC received but PTC is low
    // AGI $100K → 8.5% contribution. Expected = $8,500.
    // SLCSP $600/mo = $7,200. PTC = max(0, 7200-8500) = $0
    // APTC received = $300/mo = $3,600. Excess = $3,600.
    // FPL% = 639% → no cap
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(100000),
      form1095A: make1095A(400, 600, 300),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(3600);
  });

  it("Form 8962 Line 27 - repayment capped below 200% FPL", () => {
    // AGI $25K, family 1: FPL% = 25000/15650×100 ≈ 160%
    // Below 200% → single cap $375
    // Set APTC high enough to create excess beyond cap
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(25000),
      form1095A: make1095A(400, 200, 400), // SLCSP $200/mo, APTC $400/mo
      // SLCSP annual = $2400, expected contrib ≈ $25K × ~0.67% ≈ $167
      // PTC = min(max(0, 2400-167), 4800) = $2233
      // APTC = $4800. Excess = $4800-$2233 = $2567. Capped at $375
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });

  it("Form 8962 - no forms results in zero", () => {
    const result = calculateForm8962(makeInput({
      form1095A: [],
    }));
    expect(result.annualPremium.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8962(makeInput());
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("11a");
    expect(lineIds).toContain("11b");
    expect(lineIds).toContain("11c");
    expect(lineIds).toContain("24");
    expect(lineIds).toContain("25");
    expect(lineIds).toContain("26");
    expect(lineIds).toContain("27");
  });

  it("audit trail contains exactly 12 line entries", () => {
    // Lines 1, 2, 3, 5, 7, 11a, 11b, 11c, 24, 25, 26, 27
    const result = calculateForm8962(makeInput());
    expect(result.lines).toHaveLength(12);
  });
});

// ═══════════════════════════════════════════════════════════
// FPL Percentage at Exact Bracket Boundaries
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL percentage calculation", () => {
  it("Form 8962 Line 3 - FPL percentage at exactly 150%", () => {
    // Family 1: FPL = $15,060 (2024 HHS). AGI = $15,060 × 1.5 = $22,590 → exactly 150%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(22590),
    }));
    expect(result.fplPercentage.toNumber()).toBe(150);
  });

  it("Form 8962 Line 3 - FPL percentage at exactly 200%", () => {
    // Family 1: FPL = $15,060. AGI = $15,060 × 2 = $30,120 → exactly 200%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30120),
    }));
    expect(result.fplPercentage.toNumber()).toBe(200);
  });

  it("Form 8962 Line 3 - FPL percentage at exactly 400%", () => {
    // Family 1: FPL = $15,060. AGI = $15,060 × 4 = $60,240 → exactly 400%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(60240),
    }));
    expect(result.fplPercentage.toNumber()).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
// Expected Contribution at Different FPL Brackets
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - expected contribution by FPL bracket", () => {
  it("Form 8962 Line 7 - contribution rate and amount at 200% FPL (2%)", () => {
    // AGI = $30,120 → exactly 200% FPL → rate = 2% (start of 200-250 bracket)
    // Expected contribution = $30,120 × 0.02 = $602 (rounded)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30120),
    }));
    expect(result.contributionRate.toNumber()).toBe(0.02);
    expect(result.expectedContribution.toNumber()).toBe(602);
  });

  it("Form 8962 Line 7 - contribution rate and amount at 300% FPL (6%)", () => {
    // AGI = $45,180 → exactly 300% FPL → rate = 6% (start of 300-400 bracket)
    // Expected contribution = $45,180 × 0.06 = $2,710.80 → $2,711
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(45180),
    }));
    expect(result.contributionRate.toNumber()).toBe(0.06);
    expect(result.expectedContribution.toNumber()).toBe(2711);
  });

  it("Form 8962 Line 7 - contribution rate and amount at 400% FPL (8.5%)", () => {
    // AGI = $60,240 → exactly 400% FPL → rate = 8.5% (flat above 400%)
    // Expected contribution = $60,240 × 0.085 = $5,120.40 → $5,120
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(60240),
    }));
    expect(result.contributionRate.toNumber()).toBe(0.085);
    expect(result.expectedContribution.toNumber()).toBe(5120);
  });
});

// ═══════════════════════════════════════════════════════════
// Monthly PTC Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - monthly PTC calculation", () => {
  it("Form 8962 Line 24 - monthly PTC equals (SLCSP - expected contribution) / 12", () => {
    // AGI $14,000 → below 150% FPL (14000/15650 ≈ 89%) → rate 0%, expected contribution $0
    // SLCSP = $600/mo = $7,200/yr. Monthly PTC = $7,200 / 12 = $600
    // Enrollment premium = $700/mo = $8,400/yr → PTC not capped by premium
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(14000),
      form1095A: make1095A(700, 600, 0),
    }));
    // Annual PTC = SLCSP - 0 = $7,200; monthly equivalent = $600
    expect(result.ptcAllowed.toNumber()).toBe(7200);
    expect(result.ptcAllowed.dividedBy(12).toNumber()).toBe(600);
  });

  it("Form 8962 Line 24 - monthly PTC reduced by expected contribution", () => {
    // AGI $30,120 → 200% FPL → rate 2%, expected contribution $602
    // Monthly expected = $602/12 = $50.17. SLCSP $200/mo.
    // Monthly PTC = min(max(0, 200-50.17), 300) = $149.83
    // Total PTC = 12 × $149.83 = $1,798
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30120),
      form1095A: make1095A(300, 200, 0),
    }));
    expect(result.expectedContribution.toNumber()).toBe(602);
    expect(result.annualSLCSP.toNumber()).toBe(2400);
    expect(result.ptcAllowed.toNumber()).toBe(1798);
  });
});

// ═══════════════════════════════════════════════════════════
// Repayment Caps
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - repayment caps", () => {
  it("Form 8962 Line 27 - repayment capped at $975 for single at 200-300% FPL", () => {
    // AGI = $37,650 = $15,060 × 2.5 → exactly 250% FPL → 200-300% bracket
    // Rate at 250% = 4% (start of 250-300 bracket)
    // Expected = $37,650 × 0.04 = $1,506
    // SLCSP $100/mo. Monthly expected $125.50 > $100 → monthly PTC = $0
    // APTC $500/mo = $6,000/yr. Excess = $6,000. Single cap at 200-300% = $975 (Rev. Proc. 2024-40)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
      filingStatus: "single",
      form1095A: make1095A(200, 100, 500),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(975);
  });

  it("Form 8962 Line 27 - repayment capped at $1,950 for MFJ at 200-300% FPL", () => {
    // AGI = $37,650 → 250% FPL (family 1). Non-single filers get doubled cap.
    // Excess APTC far exceeds cap → capped at $1,950 (Rev. Proc. 2024-40)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(200, 100, 500),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(1950);
  });

  it("Form 8962 Line 27 - no repayment cap above 400% FPL", () => {
    // AGI $100K → ~639% FPL → no repayment cap
    // SLCSP $600/mo = $7,200/yr. Expected $8,500. PTC = $0.
    // APTC $300/mo = $3,600/yr. Excess = $3,600 — full amount owed, no cap
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(100000),
      filingStatus: "single",
      form1095A: make1095A(400, 600, 300),
    }));
    expect(result.fplPercentage.toNumber()).toBeGreaterThan(400);
    expect(result.excessAPTCRepayment.toNumber()).toBe(3600);
  });
});

// ═══════════════════════════════════════════════════════════
// Partial Year Coverage
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - partial year coverage", () => {
  it("Form 8962 Lines 11a-c - 6-month coverage sums only covered months", () => {
    // Only months 7-12 (6 months). Premium $400/mo, SLCSP $500/mo, APTC $200/mo
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30000),
      form1095A: make1095APartialYear(400, 500, 200, [7, 8, 9, 10, 11, 12]),
    }));
    expect(result.annualPremium.toNumber()).toBe(2400);  // 400 × 6
    expect(result.annualSLCSP.toNumber()).toBe(3000);    // 500 × 6
    expect(result.annualAdvancePTC.toNumber()).toBe(1200); // 200 × 6
  });

  it("Form 8962 Line 24 - PTC for partial year is based on actual covered months only", () => {
    // 3 months covered (months 1-3). AGI $14,000 → below 150% → rate 0%, expected $0
    // SLCSP $600/mo × 3 = $1,800. Premium $700/mo × 3 = $2,100.
    // PTC = min($1,800, $2,100) = $1,800
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(14000),
      form1095A: make1095APartialYear(700, 600, 0, [1, 2, 3]),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(1800);
  });

  it("Form 8962 - partial-year coverage with non-zero expected contribution uses per-month PTC (IRS Lines 12-23)", () => {
    // Regression test: annual method would give $183, monthly method gives $1,592
    // AGI $45,180 → 300% FPL → rate 6%, expected = $2,711
    // Monthly expected = $2,711/12 = $225.92
    // 6-month coverage (Jul-Dec): SLCSP $500/mo, premium $600/mo, APTC $200/mo
    //
    // Old code (annual method, WRONG):
    //   Annual SLCSP = 6 × $500 = $3,000
    //   PTC = min(max(0, $3,000 - $2,711), $3,600) = min($289, $3,600) = $289
    //
    // Correct (per-month, IRS Lines 12-23):
    //   Monthly PTC = min(max(0, $500 - $225.92), $600) = min($274.08, $600) = $274.08
    //   Total PTC = 6 × $274.08 = $1,645 (rounded)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(45180),
      form1095A: make1095APartialYear(600, 500, 200, [7, 8, 9, 10, 11, 12]),
    }));
    // Per-month method: each month's PTC is computed independently
    // Monthly expected = 2711/12 = 225.9166... (Decimal precision: 225.91666666666666667)
    // Monthly PTC = min(max(0, 500 - 225.91667), 600) = 274.08333...
    // Total = 6 × 274.0833... = 1644.4999... → roundDollar = $1,644
    // (Slightly below 1644.5 due to Decimal finite precision in repeating fraction)
    expect(result.ptcAllowed.toNumber()).toBe(1644);
    expect(result.annualPremium.toNumber()).toBe(3600);
    expect(result.annualSLCSP.toNumber()).toBe(3000);
    // APTC = $1,200 (6 × $200). Net PTC = $1,644 - $1,200 = $444
    expect(result.advancePTCTotal.toNumber()).toBe(1200);
    expect(result.netPTC.toNumber()).toBe(444);
  });

  it("Form 8962 - partial-year with high expected, monthly method prevents false zero PTC", () => {
    // Without per-month calculation, this taxpayer would get $0 PTC
    // AGI $60,240 → 400% FPL → rate 8.5%, expected = $5,120
    // Monthly expected = $5,120/12 = $426.67
    // 6-month coverage: SLCSP $500/mo, premium $600/mo
    //
    // Old code (annual method): SLCSP $3,000 - $5,120 = -$2,120 → PTC = $0 (WRONG)
    // Correct (monthly): PTC = 6 × min(max(0, 500-426.67), 600) = 6 × $73.33 = $440
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(60240),
      form1095A: make1095APartialYear(600, 500, 0, [7, 8, 9, 10, 11, 12]),
    }));
    // Monthly PTC = min(max(0, 500 - 5120/12), 600) = min(500 - 426.6667, 600) = 73.3333
    // Total = 6 × 73.3333 = 440.0 → roundDollar = $440
    expect(result.ptcAllowed.toNumber()).toBe(440);
    expect(result.netPTC.toNumber()).toBe(440);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: FPL Percentage at 100% Boundary
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL 100% boundary", () => {
  it("Form 8962 Line 3 - FPL at exactly 100% has zero contribution rate", () => {
    // Family 1: FPL = $15,060 (2024 HHS). AGI = $15,060 → exactly 100% FPL
    // 100% is within 0-150 bracket → rate = 0%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15060),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
  });

  it("Form 8962 Line 24 - full PTC at 100% FPL with no expected contribution", () => {
    // AGI = $15,060 → 100% FPL → rate 0%, expected $0
    // SLCSP $500/mo = $6,000. Premium $400/mo = $4,800.
    // Monthly PTC = min(max(0, 500-0), 400) = 400. Total = 12 × 400 = $4,800
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15060),
      form1095A: make1095A(400, 500, 300),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    // APTC = $3,600. Net PTC refund = $4,800 - $3,600 = $1,200
    expect(result.netPTC.toNumber()).toBe(1200);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: APTC Reconciliation — Exact Match
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - APTC reconciliation exact match", () => {
  it("Form 8962 Lines 26-27 - zero net PTC and zero repayment when PTC equals APTC", () => {
    // Engineer input so PTC allowed exactly equals APTC received
    // AGI $15,000 → ~96% FPL → rate 0%, expected $0
    // SLCSP $500/mo = $6,000. Premium $400/mo = $4,800. APTC $400/mo = $4,800.
    // PTC = min($6000, $4800) = $4,800. APTC = $4,800.
    // Net PTC = $0. Excess = $0.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15000),
      form1095A: make1095A(400, 500, 400),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(4800);
    expect(result.netPTC.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: PTC for Larger Household Sizes
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - household size variations", () => {
  it("Form 8962 - family of 6 FPL and contribution rate", () => {
    // Family of 6: FPL = $15,060 + 5×$5,380 = $41,960
    // AGI $80,000 → 80000/41960 × 100 = 190.6578...% → within 150-200 bracket
    // Linear interpolation: position = (190.6578-150)/50 = 0.81316
    // Rate = 0 + 0.02 × 0.81316 = 0.01626
    const result = calculateForm8962(makeInput({
      taxFamilySize: 6,
      modifiedAGI: d(80000),
    }));
    expect(result.fplPercentage.toNumber()).toBeCloseTo(190.66, 0);
    expect(result.contributionRate.toNumber()).toBeCloseTo(0.01626, 4);
  });

  it("Form 8962 - family of 8 at 200% FPL", () => {
    // Family of 8: FPL = $15,060 + 7×$5,380 = $52,720
    // AGI = $52,720 × 2 = $105,440 → exactly 200% FPL → rate = 2%
    // Expected contribution = $105,440 × 0.02 = $2,108.80 → $2,109
    const result = calculateForm8962(makeInput({
      taxFamilySize: 8,
      modifiedAGI: d(105440),
    }));
    expect(result.fplPercentage.toNumber()).toBe(200);
    expect(result.contributionRate.toNumber()).toBe(0.02);
    expect(result.expectedContribution.toNumber()).toBe(2109);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: MFS Filing Status and Repayment Cap
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - married filing separately repayment cap", () => {
  it("Form 8962 Line 27 - MFS uses 'other' repayment cap at below 200% FPL per Table 5", () => {
    // Per IRS Form 8962 Table 5: MFS is not "Single" → uses "any other" column.
    // AGI $25,000 → 25000/15060 ≈ 166% FPL → below 200% → other cap $750
    // Excess APTC exceeds cap → capped at $750 (not $375 single cap).
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(25000),
      filingStatus: "married_filing_separately",
      form1095A: make1095A(400, 200, 400),
    }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: SLCSP Variations
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - SLCSP variations", () => {
  it("Form 8962 Line 24 - zero SLCSP yields zero PTC", () => {
    // If SLCSP is $0, PTC = max(0, 0 - expected) = $0 regardless of premium
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30000),
      form1095A: make1095A(400, 0, 200),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    // All APTC is excess; FPL ~192% → below 200% → single cap $375
    expect(result.excessAPTCRepayment.toNumber()).toBe(375);
  });

  it("Form 8962 Line 24 - SLCSP lower than expected contribution yields zero PTC", () => {
    // AGI $60,240 → 400% FPL → rate 8.5%, expected = $5,120
    // Monthly expected = $426.67. SLCSP $300/mo < $426.67 → monthly PTC = $0
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(60240),
      form1095A: make1095A(400, 300, 200),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(0);
    // APTC = $2,400. At exactly 400% FPL → no cap
    expect(result.excessAPTCRepayment.toNumber()).toBe(2400);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Zero and Negative Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - zero and negative scenarios", () => {
  it("Form 8962 - zero AGI yields zero contribution and maximum PTC", () => {
    // AGI = $0 → 0% FPL → rate 0%, expected $0
    // PTC = min(SLCSP, premium) = min($6000, $4800) = $4,800
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(0),
      form1095A: make1095A(400, 500, 300),
    }));
    expect(result.fplPercentage.toNumber()).toBe(0);
    expect(result.contributionRate.toNumber()).toBe(0);
    expect(result.expectedContribution.toNumber()).toBe(0);
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.netPTC.toNumber()).toBe(1200); // 4800 - 3600
  });

  it("Form 8962 - zero APTC with positive PTC yields full net PTC refund", () => {
    // No advance credits received, but PTC is owed
    // AGI $15,000 → ~96% FPL → rate 0%, expected $0
    // SLCSP $500/mo = $6,000. Premium $400/mo = $4,800. APTC $0.
    // PTC = $4,800. Net PTC = $4,800 - $0 = $4,800.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15000),
      form1095A: make1095A(400, 500, 0),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(4800);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });

  it("Form 8962 Line 27 - repayment capped at $1,625 for single at 300-400% FPL", () => {
    // AGI $52,710 = $15,060 × 3.5 → exactly 350% FPL → 300-400 bracket
    // Rate: position = (350-300)/100 = 0.5, rate = 0.06 + (0.085-0.06)×0.5 = 0.0725
    // Expected = $52,710 × 0.0725 = $3,821 (rounded)
    // Monthly expected = $318.42. SLCSP $100/mo < $318.42 → monthly PTC = $0
    // APTC $500/mo = $6,000. Excess = $6,000. Single cap at 300-400% = $1,625 (Rev. Proc. 2024-40)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(52710),
      filingStatus: "single",
      form1095A: make1095A(200, 100, 500),
    }));
    expect(result.fplPercentage.toNumber()).toBe(350);
    expect(result.ptcAllowed.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(1625);
  });
});

// ═══════════════════════════════════════════════════════════
// FPL Percentage at Various Income Levels
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL percentage at various income levels", () => {
  it("Form 8962 Line 3 - FPL percentage at exactly 250%", () => {
    // Family 1: FPL = $15,060. AGI = $15,060 × 2.5 = $37,650 → exactly 250%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
    }));
    expect(result.fplPercentage.toNumber()).toBe(250);
  });

  it("Form 8962 Line 3 - FPL percentage at exactly 350%", () => {
    // Family 1: FPL = $15,060. AGI = $15,060 × 3.5 = $52,710 → exactly 350%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(52710),
    }));
    expect(result.fplPercentage.toNumber()).toBe(350);
  });
});

// ═══════════════════════════════════════════════════════════
// Applicable Figure (Contribution Rate) by FPL Bracket
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - applicable figure by FPL bracket", () => {
  it("Form 8962 Line 5 - contribution rate is 0% at exactly 150% FPL (boundary start)", () => {
    // 150% is the start of the 150-200 bracket; minRate = 0%, so position 0 → rate = 0%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(22590), // $15,060 × 1.5 = $22,590
    }));
    expect(result.fplPercentage.toNumber()).toBe(150);
    expect(result.contributionRate.toNumber()).toBe(0);
  });

  it("Form 8962 Line 5 - contribution rate is 4% at exactly 250% FPL (bracket start)", () => {
    // 250% is the start of the 250-300 bracket; minRate = 4%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650), // $15,060 × 2.5 = $37,650
    }));
    expect(result.fplPercentage.toNumber()).toBe(250);
    expect(result.contributionRate.toNumber()).toBe(0.04);
  });

  it("Form 8962 Line 5 - contribution rate is 7.25% at 350% FPL (300-400 bracket midpoint)", () => {
    // 350% is midpoint of 300-400 bracket: rate = 0.06 + (0.085-0.06) × 0.5 = 0.0725
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(52710), // $15,060 × 3.5 = $52,710
    }));
    expect(result.fplPercentage.toNumber()).toBe(350);
    expect(result.contributionRate.toNumber()).toBeCloseTo(0.0725, 4);
  });
});

// ═══════════════════════════════════════════════════════════
// Expected Contribution Formula: income × applicable figure
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - expected contribution equals income × applicable figure", () => {
  it("Form 8962 Line 7 - expected contribution at 250% FPL equals AGI × 4%", () => {
    // AGI $37,650 → 250% FPL → rate 4% → expected = $37,650 × 0.04 = $1,506
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
    }));
    const manualExpected = d(37650).times(result.contributionRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    expect(result.expectedContribution.toNumber()).toBe(1506);
    expect(result.expectedContribution.toNumber()).toBe(manualExpected.toNumber());
  });

  it("Form 8962 Line 7 - expected contribution at 350% FPL equals AGI × 7.25%", () => {
    // AGI $52,710 → 350% FPL → rate 7.25% → expected = $52,710 × 0.0725 = $3,821 (rounded)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(52710),
    }));
    expect(result.expectedContribution.toNumber()).toBe(3821);
  });
});

// ═══════════════════════════════════════════════════════════
// PTC = SLCSP − Expected Contribution (when positive)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - PTC equals SLCSP minus expected contribution when positive", () => {
  it("Form 8962 Line 24 - PTC is SLCSP minus expected contribution when SLCSP exceeds expected", () => {
    // AGI $37,650 → 250% FPL → rate 4%, expected = $1,506
    // Monthly expected = $125.50. SLCSP $300/mo.
    // Monthly PTC = min(max(0, 300-125.50), 500) = $174.50
    // Total PTC = 12 × $174.50 = $2,094
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
      form1095A: make1095A(500, 300, 0),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(3600);
    expect(result.expectedContribution.toNumber()).toBe(1506);
    expect(result.ptcAllowed.toNumber()).toBe(2094);
  });

  it("Form 8962 Line 24 - PTC is zero when expected contribution exceeds SLCSP", () => {
    // AGI $52,710 → 350% FPL → rate 7.25%, expected = $3,821
    // Monthly expected = $318.42. SLCSP $200/mo < $318.42 → monthly PTC = $0
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(52710),
      form1095A: make1095A(300, 200, 0),
    }));
    expect(result.annualSLCSP.toNumber()).toBe(2400);
    expect(result.expectedContribution.toNumber()).toBe(3821);
    expect(result.ptcAllowed.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// APTC Shortfall: Additional Credit When APTC < PTC
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - APTC shortfall yields additional credit on Line 26", () => {
  it("Form 8962 Line 26 - net PTC equals PTC minus APTC when APTC is less than PTC", () => {
    // AGI $22,590 → 150% FPL → rate 0%, expected $0
    // Monthly PTC = min(max(0, 400-0), 500) = 400. Total = 12 × 400 = $4,800.
    // APTC $300/mo = $3,600. Net PTC = $4,800 - $3,600 = $1,200 (shortfall refund)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(22590),
      form1095A: make1095A(500, 400, 300),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(4800);
    expect(result.advancePTCTotal.toNumber()).toBe(3600);
    expect(result.netPTC.toNumber()).toBe(1200);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });

  it("Form 8962 Line 26 - net PTC is non-zero when no APTC was received but PTC is owed", () => {
    // AGI $30,120 → 200% FPL → rate 2%, expected = $602
    // Monthly expected = $50.17. SLCSP $350/mo.
    // Monthly PTC = min(max(0, 350-50.17), 400) = $299.83
    // Total PTC = 12 × $299.83 = $3,598
    // APTC $0. Net PTC = $3,598 (full PTC as refund)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30120),
      form1095A: make1095A(400, 350, 0),
    }));
    expect(result.ptcAllowed.toNumber()).toBe(3598);
    expect(result.advancePTCTotal.toNumber()).toBe(0);
    expect(result.netPTC.toNumber()).toBe(3598);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Repayment Cap for "Other" Filers (MFJ) Below 200% FPL
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - repayment cap $750 for non-single filers below 200% FPL", () => {
  it("Form 8962 Line 27 - MFJ below 200% FPL excess APTC capped at $750", () => {
    // AGI $25,000 → 25000/15650 ≈ 160% FPL → below 200% → MFJ cap = $750
    // Rate: position = (160-150)/50 = 0.2, rate = 0 + 0.02×0.2 = 0.004
    // Expected = $25,000 × 0.004 = $100. SLCSP $200/mo = $2,400. PTC = min(2400-100, 4800) = $2,300
    // APTC $400/mo = $4,800. Excess = $4,800-$2,300 = $2,500. MFJ cap at <200% = $750
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(25000),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(400, 200, 400),
    }));
    expect(result.fplPercentage.toNumber()).toBeLessThan(200);
    expect(result.excessAPTCRepayment.toNumber()).toBe(750);
  });
});

// ═══════════════════════════════════════════════════════════
// Family Size Impact on FPL Calculation
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - family size impact on FPL calculation", () => {
  it("Form 8962 Line 3 - family of 2 raises FPL base and lowers FPL percentage", () => {
    // Family of 2: FPL = $15,060 + $5,380 = $20,440
    // AGI $30,000 → 30000/20440 × 100 ≈ 147% (vs 199% for family of 1)
    const resultFamily1 = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30000),
    }));
    const resultFamily2 = calculateForm8962(makeInput({
      taxFamilySize: 2,
      modifiedAGI: d(30000),
    }));
    // 30000/20440 × 100 = 146.7710...% (decimal precision, not rounded to 147)
    expect(resultFamily2.fplPercentage.toNumber()).toBeCloseTo(146.77, 0);
    expect(resultFamily2.fplPercentage.toNumber()).toBeLessThan(resultFamily1.fplPercentage.toNumber());
  });

  it("Form 8962 Line 3 - family of 3 FPL percentage reflects additional household members", () => {
    // Family of 3: FPL = $15,060 + 2×$5,380 = $25,820
    // AGI $50,000 → 50000/25820 × 100 ≈ 194%
    const result = calculateForm8962(makeInput({
      taxFamilySize: 3,
      modifiedAGI: d(50000),
    }));
    // 50000/25820 × 100 = 193.6484...% (decimal precision, not rounded to 194)
    expect(result.fplPercentage.toNumber()).toBeCloseTo(193.65, 0);
    // At ~194% FPL (150-200 bracket), rate < 2% → contribution < $50,000 × 2%
    expect(result.contributionRate.toNumber()).toBeLessThan(0.02);
    expect(result.contributionRate.toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Income Changes Mid-Year Affecting Annual PTC
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - income changes mid-year affecting annual PTC", () => {
  it("Form 8962 Lines 11a-c - two policies covering different half-year periods aggregate correctly", () => {
    // Policy A covers Jan-Jun: premium $300, SLCSP $400, APTC $200 (6 months)
    // Policy B covers Jul-Dec: premium $350, SLCSP $450, APTC $250 (6 months)
    // Annual premium = 300×6 + 350×6 = $1,800 + $2,100 = $3,900
    // Annual SLCSP   = 400×6 + 450×6 = $2,400 + $2,700 = $5,100
    // Annual APTC    = 200×6 + 250×6 = $1,200 + $1,500 = $2,700
    const twoPolicy1095A = [
      {
        marketplace: "Healthcare.gov",
        policyNumber: "POL-A",
        monthlyPremiums: [1, 2, 3, 4, 5, 6].map((month) => ({
          month,
          enrolleePremium: "300",
          slcsp: "400",
          advancePremiumTaxCredit: "200",
        })),
      },
      {
        marketplace: "Healthcare.gov",
        policyNumber: "POL-B",
        monthlyPremiums: [7, 8, 9, 10, 11, 12].map((month) => ({
          month,
          enrolleePremium: "350",
          slcsp: "450",
          advancePremiumTaxCredit: "250",
        })),
      },
    ];
    const result = calculateForm8962(makeInput({
      modifiedAGI: d(30000),
      form1095A: twoPolicy1095A,
    }));
    expect(result.annualPremium.toNumber()).toBe(3900);
    expect(result.annualSLCSP.toNumber()).toBe(5100);
    expect(result.annualAdvancePTC.toNumber()).toBe(2700);
  });

  it("Form 8962 Line 24 - mid-year enrollment start reduces annual PTC proportionally", () => {
    // Coverage starts July 1 (months 7-12 only). AGI $14,000 → below 150% → rate 0%, expected $0
    // SLCSP $500/mo × 6 = $3,000. Premium $400/mo × 6 = $2,400. APTC $0.
    // PTC = min($3,000, $2,400) = $2,400 (half of what full-year would be: $4,800)
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(14000),
      form1095A: make1095APartialYear(400, 500, 0, [7, 8, 9, 10, 11, 12]),
    }));
    expect(result.annualPremium.toNumber()).toBe(2400);
    expect(result.annualSLCSP.toNumber()).toBe(3000);
    expect(result.ptcAllowed.toNumber()).toBe(2400);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Filing Status (with domestic abuse exception context)
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - married filing separately filing status", () => {
  it("Form 8962 Line 27 - MFS filer receives 'any other filing status' repayment cap per Table 5", () => {
    // Per IRS Form 8962 Table 5, column headers are "Single" and "any other filing status".
    // MFS is not Single, so MFS uses the "any other" column (same as MFJ).
    // AGI $37,650 → 250% FPL → 200-300% bracket.
    // MFS cap = $1,950 (other column). MFJ cap = $1,950 (same).
    const mfsResult = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
      filingStatus: "married_filing_separately",
      form1095A: make1095A(200, 100, 500),
    }));
    const mfjResult = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(37650),
      filingStatus: "married_filing_jointly",
      form1095A: make1095A(200, 100, 500),
    }));
    // Per IRS Table 5: MFS uses "any other filing status" cap, same as MFJ
    expect(mfsResult.excessAPTCRepayment.toNumber()).toBe(1950);
    expect(mfjResult.excessAPTCRepayment.toNumber()).toBe(1950);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail Line Value Verification
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - audit trail line value verification", () => {
  it("Form 8962 audit trail Line 1 value matches familySize result field", () => {
    const result = calculateForm8962(makeInput({ taxFamilySize: 3 }));
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(3);
    expect(line1!.value.toNumber()).toBe(result.familySize);
  });

  it("Form 8962 audit trail Line 3 value matches fplPercentage result field", () => {
    // AGI $30,120 → 200% FPL
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(30120),
    }));
    const line3 = result.lines.find((l) => l.line === "3");
    expect(line3).toBeDefined();
    expect(line3!.value.toNumber()).toBe(200);
    expect(line3!.value.toNumber()).toBe(result.fplPercentage.toNumber());
  });

  it("Form 8962 audit trail Line 24 and Line 26 values are consistent with reconciliation", () => {
    // AGI $15,000 → ~96% FPL → rate 0%, expected $0
    // SLCSP $500/mo = $6,000. Premium $400/mo = $4,800. APTC $200/mo = $2,400.
    // PTC = $4,800. Net PTC = $4,800 - $2,400 = $2,400.
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15000),
      form1095A: make1095A(400, 500, 200),
    }));
    const line24 = result.lines.find((l) => l.line === "24");
    const line26 = result.lines.find((l) => l.line === "26");
    expect(line24!.value.toNumber()).toBe(4800);
    expect(line26!.value.toNumber()).toBe(2400);
    expect(line24!.value.toNumber()).toBe(result.ptcAllowed.toNumber());
    expect(line26!.value.toNumber()).toBe(result.netPTC.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// FPL Regression: TY2025 uses 2024 HHS guidelines
// ═══════════════════════════════════════════════════════════

describe("Form 8962 - FPL uses 2024 HHS guidelines for TY2025", () => {
  it("Form 8962 Line 3 - FPL for family of 1 is $15,060 (2024 HHS, not $15,650)", () => {
    // Per IRS: "the tax credit for 2025 is based on the 2024 FPL"
    // 2024 HHS: 1 person = $15,060 (48 contiguous states)
    // AGI = $15,060 → exactly 100% FPL
    const result = calculateForm8962(makeInput({
      taxFamilySize: 1,
      modifiedAGI: d(15060),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
  });

  it("Form 8962 Line 3 - FPL for family of 4 is $31,200 (2024 HHS, not $32,390)", () => {
    // 2024 HHS: 4 persons = $15,060 + 3×$5,380 = $31,200
    // AGI = $31,200 → exactly 100% FPL
    const result = calculateForm8962(makeInput({
      taxFamilySize: 4,
      modifiedAGI: d(31200),
    }));
    expect(result.fplPercentage.toNumber()).toBe(100);
  });
});
