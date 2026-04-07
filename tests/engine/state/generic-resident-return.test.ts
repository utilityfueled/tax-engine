/**
 * Tests for Generic Resident State Income Tax Engine
 * Spec: spec/state/generic-resident-return.yaml
 *
 * Tests each state in the initial batch (AL through HI) with:
 * - Zero income
 * - Mid-bracket income
 * - Top-bracket income
 * - MFJ vs Single comparison
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateGenericStateReturn,
  computeGraduatedTax,
  getAvailableStates,
  getStateConstants,
  type GenericStateReturnInput,
} from "@/engine/state/generic-resident-return.js";
import { calculateGenericStateReturn as calculateGenericStateReturnFromIndex } from "@/index.js";
import type { FilingStatus } from "@/models/constants.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);
const GENERIC_2025_STATE_CODES = [
  "AL", "AR", "AZ", "CO", "CT", "DC", "DE", "GA", "HI", "IA",
  "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI",
  "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NJ", "NM", "NY",
  "OH", "OK", "OR", "PA", "RI", "SC", "UT", "VA", "VT", "WI",
  "WV",
] as const;
const NON_GENERIC_2025_CODES = ["AK", "CA", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"] as const;

/** Helper to create a basic state return input */
function makeInput(overrides: Partial<GenericStateReturnInput> & { stateCode: string }): GenericStateReturnInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    federalAGI: d(50000),
    federalTaxableIncome: d(35000),
    dependentCount: 0,
    hasSpouse: false,
    stateWithholding: ZERO,
    stateEstimatedPayments: ZERO,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════
// Core Engine Tests
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Core Mechanics", () => {
  it("computeGraduatedTax - zero income produces zero tax", () => {
    const brackets = [
      { min: d(0), max: d(10000), rate: d(0.05) },
      { min: d(10000), max: null, rate: d(0.10) },
    ];
    expect(computeGraduatedTax(ZERO, brackets).toNumber()).toBe(0);
  });

  it("computeGraduatedTax - income in first bracket only", () => {
    const brackets = [
      { min: d(0), max: d(10000), rate: d(0.05) },
      { min: d(10000), max: null, rate: d(0.10) },
    ];
    // $5,000 × 5% = $250
    expect(computeGraduatedTax(d(5000), brackets).toNumber()).toBe(250);
  });

  it("computeGraduatedTax - income spanning multiple brackets", () => {
    const brackets = [
      { min: d(0), max: d(10000), rate: d(0.05) },
      { min: d(10000), max: d(50000), rate: d(0.10) },
      { min: d(50000), max: null, rate: d(0.15) },
    ];
    // $75,000: ($10,000 × 5%) + ($40,000 × 10%) + ($25,000 × 15%) = $500 + $4,000 + $3,750 = $8,250
    expect(computeGraduatedTax(d(75000), brackets).toNumber()).toBe(8250);
  });

  it("getAvailableStates returns all populated states for 2025", () => {
    const states = getAvailableStates(2025);
    expect(states).toContain("AL");
    expect(states).toContain("AZ");
    expect(states).toContain("AR");
    expect(states).toContain("CO");
    expect(states).toContain("CT");
    expect(states).toContain("DE");
    expect(states).toContain("GA");
    expect(states).toContain("HI");
    expect(states.length).toBeGreaterThanOrEqual(8);
  });

  it("getAvailableStates returns the full 2025 generic coverage set", () => {
    expect(getAvailableStates(2025)).toEqual([...GENERIC_2025_STATE_CODES]);
  });

  it("getAvailableStates excludes dedicated-engine and no-income-tax jurisdictions", () => {
    const states = getAvailableStates(2025);
    for (const code of NON_GENERIC_2025_CODES) {
      expect(states).not.toContain(code);
    }
  });

  it("getStateConstants throws for unsupported state", () => {
    expect(() => getStateConstants("XX", 2025)).toThrow("not available");
  });

  it("getStateConstants throws for unsupported year", () => {
    expect(() => getStateConstants("AL", 1900)).toThrow("not available");
  });

  it("NJ and PA constants are flagged as non-AGI states", () => {
    expect(getStateConstants("NJ", 2025).useFederalAGI).toBe(false);
    expect(getStateConstants("PA", 2025).useFederalAGI).toBe(false);
  });

  it("result includes confidence tier best-effort", () => {
    const result = calculateGenericStateReturn(makeInput({ stateCode: "AL" }));
    expect(result.confidence).toBe("best-effort");
  });

  it("public API re-exports the generic state engine", () => {
    const result = calculateGenericStateReturnFromIndex(makeInput({ stateCode: "AL" }));
    expect(result.stateCode).toBe("AL");
    expect(result.confidence).toBe("best-effort");
  });

  it("result includes audit trail lines", () => {
    const result = calculateGenericStateReturn(makeInput({ stateCode: "AL" }));
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines[0].form).toBe("AL-Generic");
  });

  it("generic engine audit lines are marked best-effort", () => {
    const result = calculateGenericStateReturn(makeInput({ stateCode: "AL" }));
    expect(result.lines.every((line) => line.confidence === "best-effort")).toBe(true);
  });

  it("zero income produces zero tax for any state", () => {
    const states = getAvailableStates(2025);
    for (const stateCode of states) {
      const result = calculateGenericStateReturn(
        makeInput({ stateCode, federalAGI: ZERO, federalTaxableIncome: ZERO })
      );
      expect(result.stateTax.toNumber()).toBe(0);
      expect(result.balanceDue.toNumber()).toBe(0);
    }
  });

  it("non-AGI states without dedicated income logic use federal AGI as an explicit approximation", () => {
    for (const stateCode of ["NJ", "PA"] as const) {
      const result = calculateGenericStateReturn(
        makeInput({
          stateCode,
          federalAGI: d(50000),
          federalTaxableIncome: d(35000),
        })
      );
      expect(result.startingIncome.toNumber()).toBe(50000);
      expect(result.lines[0]?.formula).toContain("Best-effort approximation");
    }
  });

  it("withholding exceeding tax produces refund", () => {
    const result = calculateGenericStateReturn(
      makeInput({
        stateCode: "AL",
        federalAGI: d(10000),
        stateWithholding: d(5000),
      })
    );
    expect(result.refund.toNumber()).toBeGreaterThan(0);
    expect(result.balanceDue.toNumber()).toBe(0);
  });

  it("itemized deductions only override when lower than the state standard deduction", () => {
    const lowerItemized = calculateGenericStateReturn(
      makeInput({
        stateCode: "AZ",
        federalAGI: d(60000),
        itemizedDeductions: d(12000),
      })
    );
    expect(lowerItemized.deductionUsed).toBe("itemized");
    expect(lowerItemized.deductionAmount.toNumber()).toBe(12000);
    expect(lowerItemized.stateTaxableIncome.toNumber()).toBe(48000);

    const higherItemized = calculateGenericStateReturn(
      makeInput({
        stateCode: "AZ",
        federalAGI: d(60000),
        itemizedDeductions: d(18000),
      })
    );
    expect(higherItemized.deductionUsed).toBe("standard");
    expect(higherItemized.deductionAmount.toNumber()).toBe(15750);
    expect(higherItemized.stateTaxableIncome.toNumber()).toBe(44250);
  });
});

// ════════════════════════════════════════════════════════════════
// Alabama (AL)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Alabama (AL)", () => {
  it("AL Single $50,000 AGI - tax computation", () => {
    // AGI $50,000 - std deduction $2,000 - exemption $1,500 = taxable $46,500
    // Tax: $500 × 2% + $2,500 × 4% + $43,500 × 5% = $10 + $100 + $2,175 = $2,285
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(2000);
    expect(result.personalExemptions.toNumber()).toBe(1500);
    expect(result.stateTaxableIncome.toNumber()).toBe(46500);
    expect(result.stateTax.toNumber()).toBe(2285);
  });

  it("AL MFJ $80,000 AGI with 2 dependents", () => {
    // AGI $80,000 - std deduction $4,000 - exemptions ($3,000 base + 2 × $300) = $72,400
    // Tax: $1,000 × 2% + $5,000 × 4% + $66,400 × 5% = $20 + $200 + $3,320 = $3,540
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      filingStatus: "married_filing_jointly",
      federalAGI: d(80000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(4000);
    expect(result.personalExemptions.toNumber()).toBe(3600);
    expect(result.stateTaxableIncome.toNumber()).toBe(72400);
    expect(result.stateTax.toNumber()).toBe(3540);
  });

  it("AL low income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      federalAGI: d(2000),
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(0);
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("AL standard deduction table steps down at official income breakpoints", () => {
    const lowBand = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      federalAGI: d(20499),
    }));
    const nextBand = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      federalAGI: d(20500),
    }));
    const floorBand = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      federalAGI: d(30000),
    }));

    expect(lowBand.standardDeduction.toNumber()).toBe(2500);
    expect(nextBand.standardDeduction.toNumber()).toBe(2475);
    expect(floorBand.standardDeduction.toNumber()).toBe(2000);
  });

  it("AL Head of Household uses the filing-status base exemption", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      filingStatus: "head_of_household",
      federalAGI: d(25000),
      dependentCount: 1,
    }));

    expect(result.standardDeduction.toNumber()).toBe(3350);
    expect(result.personalExemptions.toNumber()).toBe(3300);
    expect(result.stateTaxableIncome.toNumber()).toBe(18350);
  });
});

// ════════════════════════════════════════════════════════════════
// Arizona (AZ)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Arizona (AZ)", () => {
  it("AZ Single $60,000 AGI - flat 2.5% tax", () => {
    // AGI $60,000 - std deduction $15,750 = taxable $44,250
    // Tax: $44,250 × 2.5% = $1,106.25 → $1,106
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AZ",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.stateTaxableIncome.toNumber()).toBe(44250);
    expect(result.stateTax.toNumber()).toBe(1106);
  });

  it("AZ MFJ $120,000 AGI - flat 2.5%", () => {
    // AGI $120,000 - std deduction $31,500 = taxable $88,500
    // Tax: $88,500 × 2.5% = $2,212.50 → $2,213
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AZ",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(88500);
    expect(result.stateTax.toNumber()).toBe(2213);
  });

  it("AZ income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AZ",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Arkansas (AR)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Arkansas (AR)", () => {
  it("AR Single $50,000 AGI - graduated rates with exemption credit", () => {
    // AGI $50,000 - std deduction $2,470 = taxable $47,530
    // AR brackets: 0-5100 (0%), 5100-10300 (2%), 10300-14600 (3%), 14600-24300 (3.4%), 24300+ (3.9%)
    // Tax: $0 + $5,200×2% + $4,300×3% + $9,700×3.4% + $23,230×3.9%
    //     = $0 + $104 + $129 + $329.80 + $905.97 = $1,468.77 → $1,469
    // Minus $29 exemption credit = $1,440
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AR",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(2470);
    expect(result.stateTaxableIncome.toNumber()).toBe(47530);
    expect(result.exemptionCredit.toNumber()).toBe(29);
    expect(result.stateTax.toNumber()).toBe(1440);
  });

  it("AR MFJ uses the 2025 standard deduction amount", () => {
    // AGI $80,000 - std deduction $4,940 = taxable $75,060
    // Tax: $0 + $5,200×2% + $4,300×3% + $9,700×3.4% + $50,760×3.9%
    //     = $0 + $104 + $129 + $329.80 + $1,979.64 = $2,542.44 → $2,542
    // Minus $58 exemption credit = $2,484
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AR",
      filingStatus: "married_filing_jointly",
      federalAGI: d(80000),
      hasSpouse: true,
    }));

    expect(result.standardDeduction.toNumber()).toBe(4940);
    expect(result.stateTaxableIncome.toNumber()).toBe(75060);
    expect(result.exemptionCredit.toNumber()).toBe(58);
    expect(result.stateTax.toNumber()).toBe(2484);
  });

  it("AR income in 0% bracket produces zero tax", () => {
    // AGI $5,000 - std deduction $2,470 = taxable $2,530 (within 0% bracket up to $5,100)
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AR",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("AR surviving spouse keeps the single standard deduction but gets two base credits", () => {
    // Arkansas surviving spouse uses the same $2,470 deduction as single,
    // but line 7A grants an additional $29 base credit, for $58 total before dependents.
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "AR",
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(50000),
    }));

    expect(result.standardDeduction.toNumber()).toBe(2470);
    expect(result.stateTaxableIncome.toNumber()).toBe(47530);
    expect(result.exemptionCredit.toNumber()).toBe(58);
    expect(result.stateTax.toNumber()).toBe(1411);
  });
});

// ════════════════════════════════════════════════════════════════
// Colorado (CO)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Colorado (CO)", () => {
  it("CO Single - uses federal taxable income, flat 4.4%", () => {
    // Federal taxable income $35,000 (no state std deduction, no exemptions)
    // Tax: $35,000 × 4.4% = $1,540
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CO",
      federalTaxableIncome: d(35000),
    }));
    expect(result.startingIncome.toNumber()).toBe(35000);
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(35000);
    expect(result.stateTax.toNumber()).toBe(1540);
  });

  it("CO MFJ $100,000 federal taxable income - flat 4.4%", () => {
    // Tax: $100,000 × 4.4% = $4,400
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CO",
      filingStatus: "married_filing_jointly",
      federalTaxableIncome: d(100000),
      hasSpouse: true,
    }));
    expect(result.stateTax.toNumber()).toBe(4400);
  });

  it("CO zero federal taxable income produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CO",
      federalTaxableIncome: ZERO,
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Connecticut (CT)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Connecticut (CT)", () => {
  it("CT Single $35,000 AGI uses the Table A personal exemption", () => {
    // CT Table A exemption for single at $35,000 AGI = $10,000.
    // Taxable: $35,000 - $10,000 = $25,000
    // Tax: $10,000×2% + $15,000×4.5% = $200 + $675 = $875
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CT",
      federalAGI: d(35000),
    }));
    expect(result.personalExemptions.toNumber()).toBe(10000);
    expect(result.stateTaxableIncome.toNumber()).toBe(25000);
    expect(result.stateTax.toNumber()).toBe(875);
  });

  it("CT Single $75,000 AGI - graduated rates (2%/4.5%/5.5%)", () => {
    // No standard deduction; Table A exemption has fully phased out by this income level.
    // Taxable: $75,000
    // Tax: $10,000×2% + $40,000×4.5% + $25,000×5.5% = $200 + $1,800 + $1,375 = $3,375
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CT",
      federalAGI: d(75000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(75000);
    expect(result.stateTax.toNumber()).toBe(3375);
  });

  it("CT MFJ $200,000 AGI - graduated rates", () => {
    // Taxable: $200,000
    // Tax: $20,000×2% + $80,000×4.5% + $100,000×5.5% = $400 + $3,600 + $5,500 = $9,500
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CT",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(200000);
    expect(result.stateTax.toNumber()).toBe(9500);
  });

  it("CT high income $600,000 Single - hits top 6.99% bracket", () => {
    // Tax: $10K×2% + $40K×4.5% + $50K×5.5% + $100K×6% + $50K×6.5% + $250K×6.9% + $100K×6.99%
    //    = $200 + $1,800 + $2,750 + $6,000 + $3,250 + $17,250 + $6,990 = $38,240
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "CT",
      federalAGI: d(600000),
    }));
    expect(result.stateTax.toNumber()).toBe(38240);
  });
});

// ════════════════════════════════════════════════════════════════
// Delaware (DE)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Delaware (DE)", () => {
  it("DE Single $50,000 AGI - graduated rates with exemption credit", () => {
    // AGI $50,000 - std deduction $3,250 = taxable $46,750
    // Tax: $2,000×0% + $3,000×2.2% + $5,000×3.9% + $10,000×4.8% + $5,000×5.2% + $21,750×5.55%
    //    = $0 + $66 + $195 + $480 + $260 + $1,207.13 → round → $2,208
    // Minus $110 credit = $2,098
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DE",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(3250);
    expect(result.stateTaxableIncome.toNumber()).toBe(46750);
    expect(result.exemptionCredit.toNumber()).toBe(110);
    expect(result.stateTax.toNumber()).toBe(2098);
  });

  it("DE MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $6,500 = taxable $93,500
    // Tax: $2K×0% + $3K×2.2% + $5K×3.9% + $10K×4.8% + $5K×5.2% + $35K×5.55% + $33.5K×6.6%
    //    = $0 + $66 + $195 + $480 + $260 + $1,942.50 + $2,211 → $5,155
    // Minus $440 credit (4 × $110) = $4,715
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DE",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.exemptionCredit.toNumber()).toBe(440); // 2 taxpayers + 2 dependents
    expect(result.stateTax.toNumber()).toBe(4715);
  });

  it("DE low income in 0% bracket produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DE",
      federalAGI: d(3000), // $3,000 - $3,250 std ded < 0
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Georgia (GA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Georgia (GA)", () => {
  it("GA Single $60,000 AGI - flat 5.19%", () => {
    // AGI $60,000 - std deduction $12,000 = taxable $48,000
    // Tax: $48,000 × 5.19% = $2,491.20 → $2,491
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(12000);
    expect(result.stateTaxableIncome.toNumber()).toBe(48000);
    expect(result.stateTax.toNumber()).toBe(2491);
  });

  it("GA MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $24,000 - dep exemption $8,000 = taxable $68,000
    // Tax: $68,000 × 5.19% = $3,529.20 → $3,529
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(8000); // 0 + 0 + 2×4000
    expect(result.stateTaxableIncome.toNumber()).toBe(68000);
    expect(result.stateTax.toNumber()).toBe(3529);
  });

  it("GA income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("GA qualifying surviving spouse uses the explicit state standard deduction", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(60000),
    }));

    expect(result.standardDeduction.toNumber()).toBe(12000);
    expect(result.stateTaxableIncome.toNumber()).toBe(48000);
    expect(result.stateTax.toNumber()).toBe(2491);
  });
});

// ════════════════════════════════════════════════════════════════
// Hawaii (HI)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Hawaii (HI)", () => {
  it("HI Single $60,000 AGI - graduated 12-bracket system (Act 45 widened thresholds)", () => {
    // AGI $60,000 - std deduction $4,400 - exemption $1,144 = taxable $54,456
    // 2025 brackets: 0-9600 (1.4%), 9600-14400 (3.2%), 14400-19200 (5.5%),
    //   19200-24000 (6.4%), 24000-36000 (6.8%), 36000-48000 (7.2%), 48000-125000 (7.6%)
    // Tax: $9,600×1.4% + $4,800×3.2% + $4,800×5.5% + $4,800×6.4%
    //   + $12,000×6.8% + $12,000×7.2% + $6,456×7.6%
    // = $134.40 + $153.60 + $264 + $307.20 + $816 + $864 + $490.656
    // = $3,029.856 → $3,030
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "HI",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(4400);
    expect(result.personalExemptions.toNumber()).toBe(1144);
    expect(result.stateTaxableIncome.toNumber()).toBe(54456);
    expect(result.stateTax.toNumber()).toBe(3030);
  });

  it("HI MFJ $120,000 AGI - widened MFJ bracket thresholds", () => {
    // AGI $120,000 - std deduction $8,800 - exemptions $2,288 = taxable $108,912
    // MFJ brackets: 0-19200 (1.4%), 19200-28800 (3.2%), 28800-38400 (5.5%),
    //   38400-48000 (6.4%), 48000-72000 (6.8%), 72000-96000 (7.2%), 96000-250000 (7.6%)
    // Tax: $19,200×1.4% + $9,600×3.2% + $9,600×5.5% + $9,600×6.4%
    //   + $24,000×6.8% + $24,000×7.2% + $12,912×7.6%
    // = $268.80 + $307.20 + $528 + $614.40 + $1,632 + $1,728 + $981.312
    // = $6,059.712 → $6,060
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "HI",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(2288); // 1144 + 1144
    expect(result.stateTaxableIncome.toNumber()).toBe(108912);
    expect(result.stateTax.toNumber()).toBe(6060);
  });

  it("HI high income $300,000 Single - hits 10% bracket", () => {
    // AGI $300,000 - std deduction $4,400 - exemption $1,144 = taxable $294,456
    // Tax through 11 brackets:
    // $9,600×1.4% + $4,800×3.2% + $4,800×5.5% + $4,800×6.4% + $12,000×6.8%
    // + $12,000×7.2% + $77,000×7.6% + $50,000×7.9% + $50,000×8.25%
    // + $50,000×9% + $19,456×10%
    // = $134.40 + $153.60 + $264 + $307.20 + $816 + $864 + $5,852
    //   + $3,950 + $4,125 + $4,500 + $1,945.60 = $22,911.80 → $22,912
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "HI",
      federalAGI: d(300000),
    }));
    expect(result.stateTax.toNumber()).toBe(22912);
  });

  it("HI low income below deduction + exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "HI",
      federalAGI: d(3000), // $3,000 - $4,400 < 0
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Filing Status Fallback Tests
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Filing Status Fallback", () => {
  it("Qualifying surviving spouse falls back to MFJ brackets", () => {
    const resultQSS = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(50000),
      hasSpouse: false,
    }));
    const resultMFJ = calculateGenericStateReturn(makeInput({
      stateCode: "AL",
      filingStatus: "married_filing_jointly",
      federalAGI: d(50000),
      hasSpouse: true,
    }));
    // QSS falls back to the MFJ schedule for both deduction and base exemption handling.
    expect(resultQSS.standardDeduction.toNumber()).toBe(4000);
    expect(resultQSS.personalExemptions.toNumber()).toBe(3000);
    expect(resultQSS.taxBeforeCredits.toNumber()).toBe(
      resultMFJ.taxBeforeCredits.toNumber()
    );
  });
});

// ════════════════════════════════════════════════════════════════
// Payment / Refund Tests
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Payments and Refunds", () => {
  it("estimated payments reduce balance due", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      federalAGI: d(60000),
      stateEstimatedPayments: d(1000),
    }));
    // Tax = $2,491 (5.19% × $48,000), payments = $1,000 → balance due = $1,491
    expect(result.stateTax.toNumber()).toBe(2491);
    expect(result.totalPayments.toNumber()).toBe(1000);
    expect(result.balanceDue.toNumber()).toBe(1491);
    expect(result.refund.toNumber()).toBe(0);
  });

  it("withholding + estimated exceeding tax produces refund", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "GA",
      federalAGI: d(60000),
      stateWithholding: d(2000),
      stateEstimatedPayments: d(1000),
    }));
    // Tax = $2,491, payments = $3,000 → refund = $509
    expect(result.totalPayments.toNumber()).toBe(3000);
    expect(result.refund.toNumber()).toBe(509);
    expect(result.balanceDue.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Idaho (ID)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Idaho (ID)", () => {
  it("ID Single $60,000 AGI - 5.3% with zero bracket", () => {
    // AGI $60,000 - std deduction $15,750 = taxable $44,250
    // Tax: $4,811×0% + $39,439×5.3% = $0 + $2,090.267 → $2,090
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ID",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.stateTaxableIncome.toNumber()).toBe(44250);
    expect(result.stateTax.toNumber()).toBe(2090);
  });

  it("ID MFJ $120,000 AGI - 5.3% with zero bracket", () => {
    // AGI $120,000 - std deduction $31,500 = taxable $88,500
    // Tax: $9,622×0% + $78,878×5.3% = $0 + $4,180.534 → $4,181
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ID",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(88500);
    expect(result.stateTax.toNumber()).toBe(4181);
  });

  it("ID income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ID",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Illinois (IL)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Illinois (IL)", () => {
  it("IL Single $60,000 AGI - flat 4.95% with personal exemption deduction", () => {
    // AGI $60,000 - no std deduction - exemption $2,850 = taxable $57,150
    // Tax: $57,150 × 4.95% = $2,828.925 → $2,829
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IL",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(2850);
    expect(result.stateTaxableIncome.toNumber()).toBe(57150);
    expect(result.stateTax.toNumber()).toBe(2829);
  });

  it("IL MFJ $120,000 AGI with 2 dependents", () => {
    // AGI $120,000 - exemptions ($2,850 × 4) = $120,000 - $11,400 = $108,600
    // Tax: $108,600 × 4.95% = $5,375.70 → $5,376
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IL",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(11400);
    expect(result.stateTaxableIncome.toNumber()).toBe(108600);
    expect(result.stateTax.toNumber()).toBe(5376);
  });

  it("IL low income below exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IL",
      federalAGI: d(2000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Indiana (IN)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Indiana (IN)", () => {
  it("IN Single $50,000 AGI - flat 3.0% with personal exemption", () => {
    // AGI $50,000 - no std deduction - exemption $1,000 = taxable $49,000
    // Tax: $49,000 × 3.0% = $1,470
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IN",
      federalAGI: d(50000),
    }));
    expect(result.personalExemptions.toNumber()).toBe(1000);
    expect(result.stateTaxableIncome.toNumber()).toBe(49000);
    expect(result.stateTax.toNumber()).toBe(1470);
  });

  it("IN MFJ $80,000 AGI with 3 dependents", () => {
    // AGI $80,000 - exemptions ($1,000 + $1,000 + $4,500) = $73,500
    // Tax: $73,500 × 3.0% = $2,205
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IN",
      filingStatus: "married_filing_jointly",
      federalAGI: d(80000),
      dependentCount: 3,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(6500); // 1000+1000+3×1500
    expect(result.stateTaxableIncome.toNumber()).toBe(73500);
    expect(result.stateTax.toNumber()).toBe(2205);
  });
});

// ════════════════════════════════════════════════════════════════
// Iowa (IA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Iowa (IA)", () => {
  it("IA Single $50,000 AGI - flat 3.8% with federal standard deduction", () => {
    // AGI $50,000 - std deduction $15,750 = taxable $34,250
    // Tax: $34,250 × 3.8% = $1,301.50 → $1,302
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IA",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.stateTaxableIncome.toNumber()).toBe(34250);
    expect(result.stateTax.toNumber()).toBe(1302);
  });

  it("IA MFJ $100,000 AGI - flat 3.8%", () => {
    // AGI $100,000 - std deduction $31,500 = taxable $68,500
    // Tax: $68,500 × 3.8% = $2,603
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(68500);
    expect(result.stateTax.toNumber()).toBe(2603);
  });

  it("IA income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "IA",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Kansas (KS)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Kansas (KS)", () => {
  it("KS Single $50,000 AGI - graduated 2-bracket system", () => {
    // AGI $50,000 - std deduction $3,605 - exemption $9,160 = taxable $37,235
    // Tax: $23,000×5.2% + $14,235×5.58%
    //    = $1,196 + $794.313 = $1,990.313 → $1,990
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KS",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(3605);
    expect(result.personalExemptions.toNumber()).toBe(9160);
    expect(result.stateTaxableIncome.toNumber()).toBe(37235);
    expect(result.stateTax.toNumber()).toBe(1990);
  });

  it("KS MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $8,240 - exemptions ($9,160+$9,160+$4,640) = $68,800
    // Tax: $46,000×5.2% + $22,800×5.58%
    //    = $2,392 + $1,272.24 = $3,664.24 → $3,664
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KS",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(22960); // 9160+9160+2×2320
    expect(result.stateTaxableIncome.toNumber()).toBe(68800);
    expect(result.stateTax.toNumber()).toBe(3664);
  });

  it("KS low income produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KS",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Kentucky (KY)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Kentucky (KY)", () => {
  it("KY Single $50,000 AGI - flat 4.0%", () => {
    // AGI $50,000 - std deduction $3,270 = taxable $46,730
    // Tax: $46,730 × 4.0% = $1,869.20 → $1,869
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KY",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(3270);
    expect(result.stateTaxableIncome.toNumber()).toBe(46730);
    expect(result.stateTax.toNumber()).toBe(1869);
  });

  it("KY MFJ $100,000 AGI", () => {
    // AGI $100,000 - std deduction $3,270 = taxable $96,730
    // Tax: $96,730 × 4.0% = $3,869.20 → $3,869
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KY",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(96730);
    expect(result.stateTax.toNumber()).toBe(3869);
  });

  it("KY income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "KY",
      federalAGI: d(2000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Louisiana (LA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Louisiana (LA)", () => {
  it("LA Single $60,000 AGI - flat 3% with standard deduction", () => {
    // AGI $60,000 - std deduction $12,500 = taxable $47,500
    // Tax: $47,500 × 3% = $1,425
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "LA",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(12500);
    expect(result.stateTaxableIncome.toNumber()).toBe(47500);
    expect(result.stateTax.toNumber()).toBe(1425);
  });

  it("LA MFJ $120,000 AGI", () => {
    // AGI $120,000 - std deduction $25,000 = taxable $95,000
    // Tax: $95,000 × 3% = $2,850
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "LA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(25000);
    expect(result.stateTaxableIncome.toNumber()).toBe(95000);
    expect(result.stateTax.toNumber()).toBe(2850);
  });

  it("LA income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "LA",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Maine (ME)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Maine (ME)", () => {
  it("ME Single $60,000 AGI - graduated 3-bracket system", () => {
    // AGI $60,000 - std deduction $15,000 - exemption $5,150 = taxable $39,850
    // Tax: $26,800×5.8% + $13,050×6.75%
    //    = $1,554.40 + $880.88 = $2,435.28 → $2,435
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ME",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15000);
    expect(result.personalExemptions.toNumber()).toBe(5150);
    expect(result.stateTaxableIncome.toNumber()).toBe(39850);
    expect(result.stateTax.toNumber()).toBe(2435);
  });

  it("ME MFJ $140,000 AGI with 1 dependent", () => {
    // AGI $140,000 - std deduction $30,000 - exemptions $15,450 (3×$5,150) = taxable $94,550
    // Tax: $53,600×5.8% + $40,950×6.75%
    //    = $3,108.80 + $2,764.13 = $5,872.93 → $5,873
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ME",
      filingStatus: "married_filing_jointly",
      federalAGI: d(140000),
      dependentCount: 1,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(15450); // 5150×3
    expect(result.stateTaxableIncome.toNumber()).toBe(94550);
    expect(result.stateTax.toNumber()).toBe(5873);
  });

  it("ME high income $200,000 Single - hits top 7.15% bracket", () => {
    // AGI $200,000 - std deduction $15,000 - exemption $5,150 = taxable $179,850
    // Tax: $26,800×5.8% + $36,650×6.75% + $116,400×7.15%
    //    = $1,554.40 + $2,473.88 + $8,322.60 = $12,350.88 → $12,351
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ME",
      federalAGI: d(200000),
    }));
    expect(result.stateTax.toNumber()).toBe(12351);
  });

  it("ME income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ME",
      federalAGI: d(15000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("ME HOH $90,000 AGI uses the explicit head-of-household bracket schedule", () => {
    // AGI $90,000 - std deduction $22,500 - exemption $5,150 = taxable $62,350
    // Tax: $40,200×5.8% + $22,150×6.75%
    //    = $2,331.60 + $1,495.13 = $3,826.73 → $3,827
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ME",
      filingStatus: "head_of_household",
      federalAGI: d(90000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(22500);
    expect(result.stateTaxableIncome.toNumber()).toBe(62350);
    expect(result.stateTax.toNumber()).toBe(3827);
  });
});

// ════════════════════════════════════════════════════════════════
// Maryland (MD)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Maryland (MD)", () => {
  it("MD Single $60,000 AGI - 8-bracket graduated system", () => {
    // AGI $60,000 - std deduction $3,350 - exemption $3,200 = taxable $53,450
    // Tax: $1,000×2% + $1,000×3% + $1,000×4% + $50,450×4.75%
    //    = $20 + $30 + $40 + $2,396.375 = $2,486.375 → $2,486
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MD",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(3350);
    expect(result.personalExemptions.toNumber()).toBe(3200);
    expect(result.stateTaxableIncome.toNumber()).toBe(53450);
    expect(result.stateTax.toNumber()).toBe(2486);
  });

  it("MD MFJ $120,000 AGI with 2 dependents", () => {
    // AGI $120,000 - std deduction $6,700 - exemptions ($3,200×4) = $100,500
    // Tax: $1,000×2% + $1,000×3% + $1,000×4% + $97,500×4.75%
    //    = $20 + $30 + $40 + $4,631.25 = $4,721.25 → $4,721
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MD",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(6700);
    expect(result.personalExemptions.toNumber()).toBe(12800); // 3200×4
    expect(result.stateTaxableIncome.toNumber()).toBe(100500);
    expect(result.stateTax.toNumber()).toBe(4721);
  });

  it("MD high income $300,000 Single - hits top 5.75% bracket", () => {
    // AGI $300,000 - std deduction $3,350 - exemption $3,200 = taxable $293,450
    // Tax: $1K×2% + $1K×3% + $1K×4% + $97K×4.75% + $25K×5% + $25K×5.25%
    //   + $100K×5.5% + $43,450×5.75%
    // = $20 + $30 + $40 + $4,607.50 + $1,250 + $1,312.50 + $5,500 + $2,498.375
    // = $15,258.375 → $15,258
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MD",
      federalAGI: d(300000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(3350);
    expect(result.stateTax.toNumber()).toBe(15258);
  });

  it("MD income below deduction + exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MD",
      federalAGI: d(4000), // $4,000 - $3,350 - $3,200 < 0
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Massachusetts (MA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Massachusetts (MA)", () => {
  it("MA Single $60,000 AGI - flat 5% with personal exemption", () => {
    // AGI $60,000 - no std deduction - exemption $4,400 = taxable $55,600
    // Tax: $55,600 × 5% = $2,780
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MA",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(4400);
    expect(result.stateTaxableIncome.toNumber()).toBe(55600);
    expect(result.stateTax.toNumber()).toBe(2780);
  });

  it("MA MFJ $120,000 AGI with 2 dependents", () => {
    // AGI $120,000 - exemptions ($4,400 + $4,400 + $2,000) = $109,200
    // Tax: $109,200 × 5% = $5,460
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(10800); // 4400+4400+2×1000
    expect(result.stateTaxableIncome.toNumber()).toBe(109200);
    expect(result.stateTax.toNumber()).toBe(5460);
  });

  it("MA low income below exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MA",
      federalAGI: d(3000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Michigan (MI)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Michigan (MI)", () => {
  it("MI Single $50,000 AGI - flat 4.25% with personal exemption", () => {
    // AGI $50,000 - no std deduction - exemption $5,800 = taxable $44,200
    // Tax: $44,200 × 4.25% = $1,878.50 → $1,879
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MI",
      federalAGI: d(50000),
    }));
    expect(result.personalExemptions.toNumber()).toBe(5800);
    expect(result.stateTaxableIncome.toNumber()).toBe(44200);
    expect(result.stateTax.toNumber()).toBe(1879);
  });

  it("MI MFJ $100,000 AGI with 3 dependents", () => {
    // AGI $100,000 - exemptions ($5,800×5) = $71,000
    // Tax: $71,000 × 4.25% = $3,017.50 → $3,018
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MI",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 3,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(29000); // 5800×5
    expect(result.stateTaxableIncome.toNumber()).toBe(71000);
    expect(result.stateTax.toNumber()).toBe(3018);
  });

  it("MI low income below exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MI",
      federalAGI: d(4000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Minnesota (MN)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Minnesota (MN)", () => {
  it("MN Single $60,000 AGI - 4-bracket graduated system", () => {
    // AGI $60,000 - std deduction $14,950 = taxable $45,050
    // Tax: $32,570×5.35% + $12,480×6.8%
    //    = $1,742.495 + $848.64 = $2,591.135 → $2,591
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MN",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(14950);
    expect(result.stateTaxableIncome.toNumber()).toBe(45050);
    expect(result.stateTax.toNumber()).toBe(2591);
  });

  it("MN MFJ $200,000 AGI with 2 dependents", () => {
    // AGI $200,000 - std deduction $29,900 - dependent exemption $10,400 = taxable $159,700
    // Tax: $47,620×5.35% + $112,080×6.8%
    //    = $2,547.67 + $7,621.44 = $10,169.11 → $10,169
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MN",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(29900);
    expect(result.personalExemptions.toNumber()).toBe(10400);
    expect(result.stateTaxableIncome.toNumber()).toBe(159700);
    expect(result.stateTax.toNumber()).toBe(10169);
  });

  it("MN high income $400,000 Single - hits top 9.85% bracket", () => {
    // AGI $400,000 - std deduction $14,950 = taxable $385,050
    // Tax: $32,570×5.35% + $74,420×6.8% + $91,640×7.85% + $186,420×9.85%
    //    = $1,742.495 + $5,060.56 + $7,193.74 + $18,362.37
    //    = $32,359.165 → $32,359
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MN",
      federalAGI: d(400000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(14950);
    expect(result.stateTax.toNumber()).toBe(32359);
  });

  it("MN income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MN",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Mississippi (MS)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Mississippi (MS)", () => {
  it("MS Single $50,000 AGI - 0% bracket + 4.4% above $10,000", () => {
    // AGI $50,000 - std deduction $2,300 - exemption $6,000 = taxable $41,700
    // Tax: $10,000×0% + $31,700×4.4% = $0 + $1,394.80 → $1,395
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MS",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(2300);
    expect(result.personalExemptions.toNumber()).toBe(6000);
    expect(result.stateTaxableIncome.toNumber()).toBe(41700);
    expect(result.stateTax.toNumber()).toBe(1395);
  });

  it("MS MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $4,600 - exemptions ($6,000+$6,000+$3,000) = $80,400
    // Tax: $10,000×0% + $70,400×4.4% = $3,097.60 → $3,098
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MS",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(15000); // 6000+6000+2×1500
    expect(result.stateTaxableIncome.toNumber()).toBe(80400);
    expect(result.stateTax.toNumber()).toBe(3098);
  });

  it("MS income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MS",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Missouri (MO)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Missouri (MO)", () => {
  it("MO Single $60,000 AGI - graduated with 4.7% top rate", () => {
    // AGI $60,000 - std deduction $15,750 = taxable $44,250
    // Tax: $1,313×0% + $1,313×2% + $1,313×2.5% + $1,313×3% + $1,313×3.5%
    //   + $1,313×4% + $1,313×4.5% + $35,059×4.7%
    // = $0 + $26.26 + $32.825 + $39.39 + $45.955 + $52.52 + $59.085 + $1,647.773
    // = $1,903.808 → $1,904
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MO",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.stateTaxableIncome.toNumber()).toBe(44250);
    expect(result.stateTax.toNumber()).toBe(1904);
  });

  it("MO MFJ $120,000 AGI", () => {
    // AGI $120,000 - std deduction $31,500 = taxable $88,500
    // Tax: same bracket structure. First $9,191 spans low brackets, rest at 4.7%
    // Low brackets: $0+$26.26+$32.825+$39.39+$45.955+$52.52+$59.085 = $256.035
    // Top: ($88,500-$9,191)×4.7% = $79,309×4.7% = $3,727.523
    // Total = $3,983.558 → $3,984
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MO",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(88500);
    expect(result.stateTax.toNumber()).toBe(3984);
  });

  it("MO income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MO",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Montana (MT)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Montana (MT)", () => {
  it("MT Single - uses federal taxable income, 2-bracket system (SB 399/SB 121)", () => {
    // Federal taxable income $35,000 (no state std deduction, no exemptions)
    // Tax: $21,100×4.7% + $13,900×5.9%
    //    = $991.70 + $820.10 = $1,811.80 → $1,812
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MT",
      federalTaxableIncome: d(35000),
    }));
    expect(result.startingIncome.toNumber()).toBe(35000);
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(35000);
    expect(result.stateTax.toNumber()).toBe(1812);
  });

  it("MT MFJ $80,000 federal taxable income", () => {
    // Tax: $42,200×4.7% + $37,800×5.9%
    //    = $1,983.40 + $2,230.20 = $4,213.60 → $4,214
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MT",
      filingStatus: "married_filing_jointly",
      federalTaxableIncome: d(80000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(80000);
    expect(result.stateTax.toNumber()).toBe(4214);
  });

  it("MT zero federal taxable income produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "MT",
      federalTaxableIncome: ZERO,
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Nebraska (NE)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Nebraska (NE)", () => {
  it("NE Single $50,000 AGI - graduated 4-bracket with exemption credit", () => {
    // AGI $50,000 - std deduction $8,600 = taxable $41,400 (exemptions are credits)
    // Tax: $4,030×2.46% + $20,090×3.51% + $14,750×5.01% + $2,530×5.2%
    //    = $99.138 + $705.159 + $738.975 + $131.56 = $1,674.832 → $1,675
    // Minus $171 exemption credit = $1,504
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NE",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(8600);
    expect(result.stateTaxableIncome.toNumber()).toBe(41400);
    expect(result.exemptionCredit.toNumber()).toBe(171);
    expect(result.stateTax.toNumber()).toBe(1504);
  });

  it("NE MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $17,200 = taxable $82,800 (exemptions are credits)
    // Tax: $8,040×2.46% + $40,210×3.51% + $29,480×5.01% + $5,070×5.2%
    //    = $197.784 + $1,411.371 + $1,476.948 + $263.64 = $3,349.743 → $3,350
    // Minus $684 exemption credit (4×$171) = $2,666
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NE",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.exemptionCredit.toNumber()).toBe(684); // 4×171
    expect(result.stateTax.toNumber()).toBe(2666);
  });

  it("NE income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NE",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// New Jersey (NJ)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - New Jersey (NJ)", () => {
  it("NJ Single $75,000 AGI - graduated 7-bracket system", () => {
    // AGI $75,000 - no std deduction - exemption $1,000 = taxable $74,000
    // Tax: $20,000×1.4% + $15,000×1.75% + $5,000×3.5% + $34,000×5.525%
    //    = $280 + $262.50 + $175 + $1,878.50 = $2,596
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NJ",
      federalAGI: d(75000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(1000);
    expect(result.stateTaxableIncome.toNumber()).toBe(74000);
    expect(result.stateTax.toNumber()).toBe(2596);
  });

  it("NJ MFJ $120,000 AGI with 2 dependents", () => {
    // AGI $120,000 - no std deduction - exemptions ($1,000+$1,000+$3,000) = $115,000
    // Tax: $20,000×1.4% + $15,000×1.75% + $5,000×3.5% + $35,000×5.525% + $40,000×6.37%
    //    = $280 + $262.50 + $175 + $1,933.75 + $2,548 = $5,199.25 → $5,199
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NJ",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(5000); // 1000+1000+2×1500
    expect(result.stateTaxableIncome.toNumber()).toBe(115000);
    expect(result.stateTax.toNumber()).toBe(5199);
  });

  it("NJ low income below exemption produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NJ",
      federalAGI: d(500),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// New Mexico (NM)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - New Mexico (NM)", () => {
  it("NM Single $50,000 AGI - 2025 restructured brackets", () => {
    // AGI $50,000 - std deduction $15,750 = taxable $34,250
    // Tax: $5,500×1.5% + $11,000×3.2% + $17,000×4.3% + $750×4.7%
    //    = $82.50 + $352 + $731 + $35.25 = $1,200.75 → $1,201
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NM",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15750);
    expect(result.stateTaxableIncome.toNumber()).toBe(34250);
    expect(result.stateTax.toNumber()).toBe(1201);
  });

  it("NM MFJ $100,000 AGI - 2025 restructured brackets", () => {
    // AGI $100,000 - std deduction $31,500 = taxable $68,500
    // Tax: $8,000×1.5% + $17,000×3.2% + $25,000×4.3% + $18,500×4.7%
    //    = $120 + $544 + $1,075 + $869.50 = $2,608.50 → $2,609
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NM",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(68500);
    expect(result.stateTax.toNumber()).toBe(2609);
  });

  it("NM head of household uses explicit joint-style bracket schedule", () => {
    // AGI $100,000 - std deduction $23,625 = taxable $76,375
    // Tax: $8,000×1.5% + $17,000×3.2% + $25,000×4.3% + $26,375×4.7%
    //    = $120 + $544 + $1,075 + $1,239.625 = $2,978.625 → $2,979
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NM",
      filingStatus: "head_of_household",
      federalAGI: d(100000),
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(76375);
    expect(result.stateTax.toNumber()).toBe(2979);
  });

  it("NM married filing separately uses the explicit MFS schedule", () => {
    // AGI $50,000 - std deduction $15,750 = taxable $34,250
    // Tax: $4,000×1.5% + $8,500×3.2% + $12,500×4.3% + $9,250×4.7%
    //    = $60 + $272 + $537.50 + $434.75 = $1,304.25 → $1,304
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NM",
      filingStatus: "married_filing_separately",
      federalAGI: d(50000),
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(34250);
    expect(result.stateTax.toNumber()).toBe(1304);
  });

  it("NM income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NM",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// New York (NY)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - New York (NY)", () => {
  it("NY Single $100,000 AGI - graduated 9-bracket system", () => {
    // AGI $100,000 - std deduction $8,000 = taxable $92,000
    // Tax: $8,500×4% + $3,200×4.5% + $2,200×5.25% + $66,750×5.5% + $11,350×6%
    //    = $340 + $144 + $115.50 + $3,671.25 + $681 = $4,951.75 → $4,952
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NY",
      federalAGI: d(100000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(8000);
    expect(result.stateTaxableIncome.toNumber()).toBe(92000);
    expect(result.stateTax.toNumber()).toBe(4952);
  });

  it("NY MFJ $200,000 AGI", () => {
    // AGI $200,000 - std deduction $16,050 = taxable $183,950
    // Tax: $17,150×4% + $6,450×4.5% + $4,300×5.25% + $133,650×5.5% + $22,400×6%
    //    = $686 + $290.25 + $225.75 + $7,350.75 + $1,344 = $9,896.75 → $9,897
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NY",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(16050);
    expect(result.stateTaxableIncome.toNumber()).toBe(183950);
    expect(result.stateTax.toNumber()).toBe(9897);
  });

  it("NY MFJ $200,000 AGI with 2 dependents reduces taxable income", () => {
    // AGI $200,000 - std deduction $16,050 - dep exemption $2,000 = taxable $181,950
    // Tax: $17,150×4% + $6,450×4.5% + $4,300×5.25% + $133,650×5.5% + $20,400×6%
    //    = $686 + $290.25 + $225.75 + $7,350.75 + $1,224 = $9,776.75 → $9,777
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NY",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(2000); // 0+0+2×1000
    expect(result.stateTaxableIncome.toNumber()).toBe(181950);
    expect(result.stateTax.toNumber()).toBe(9777);
  });

  it("NY income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NY",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// North Carolina (NC)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - North Carolina (NC)", () => {
  it("NC Single $60,000 AGI - flat 4.25%", () => {
    // AGI $60,000 - std deduction $12,750 = taxable $47,250
    // Tax: $47,250 × 4.25% = $2,008.125 → $2,008
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NC",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(12750);
    expect(result.stateTaxableIncome.toNumber()).toBe(47250);
    expect(result.stateTax.toNumber()).toBe(2008);
  });

  it("NC MFJ $120,000 AGI - flat 4.25%", () => {
    // AGI $120,000 - std deduction $25,500 = taxable $94,500
    // Tax: $94,500 × 4.25% = $4,016.25 → $4,016
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NC",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(94500);
    expect(result.stateTax.toNumber()).toBe(4016);
  });

  it("NC income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "NC",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// North Dakota (ND)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - North Dakota (ND)", () => {
  it("ND Single $80,000 AGI - 0% bracket + 1.95%", () => {
    // AGI $80,000 - std deduction $15,000 = taxable $65,000
    // Tax: $47,150×0% + $17,850×1.95% = $0 + $348.075 → $348
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ND",
      federalAGI: d(80000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15000);
    expect(result.stateTaxableIncome.toNumber()).toBe(65000);
    expect(result.stateTax.toNumber()).toBe(348);
  });

  it("ND MFJ $200,000 AGI", () => {
    // AGI $200,000 - std deduction $30,000 = taxable $170,000
    // Tax: $78,775×0% + $91,225×1.95% = $0 + $1,778.8875 → $1,779
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ND",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(170000);
    expect(result.stateTax.toNumber()).toBe(1779);
  });

  it("ND income in 0% bracket produces zero tax", () => {
    // AGI $50,000 - std deduction $15,000 = taxable $35,000 (within 0% bracket up to $47,150)
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "ND",
      federalAGI: d(50000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Ohio (OH)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Ohio (OH)", () => {
  it("OH Single $60,000 AGI - 0% bracket + 2.75%", () => {
    // AGI $60,000 - no std deduction - exemption $2,350 = taxable $57,650
    // Tax: $26,050×0% + $31,600×2.75% = $0 + $869 = $869
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OH",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(2350);
    expect(result.stateTaxableIncome.toNumber()).toBe(57650);
    expect(result.stateTax.toNumber()).toBe(869);
  });

  it("OH MFJ $120,000 AGI with 2 dependents", () => {
    // AGI $120,000 - exemptions ($2,350×4) = $110,600
    // Tax: $26,050×0% + $73,950×2.75% + $10,600×3.125%
    //    = $0 + $2,033.625 + $331.25 = $2,364.875 → $2,365
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OH",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(9400); // 2350×4
    expect(result.stateTaxableIncome.toNumber()).toBe(110600);
    expect(result.stateTax.toNumber()).toBe(2365);
  });

  it("OH low income in 0% bracket produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OH",
      federalAGI: d(20000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Oklahoma (OK)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Oklahoma (OK)", () => {
  it("OK Single $50,000 AGI - graduated 6-bracket system", () => {
    // AGI $50,000 - std deduction $6,350 - exemption $1,000 = taxable $42,650
    // Tax: $1,000×0.25% + $1,500×0.75% + $1,250×1.75% + $1,150×2.75%
    //   + $2,300×3.75% + $35,450×4.75%
    // = $2.50 + $11.25 + $21.875 + $31.625 + $86.25 + $1,683.875
    // = $1,837.375 → $1,837
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OK",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(6350);
    expect(result.personalExemptions.toNumber()).toBe(1000);
    expect(result.stateTaxableIncome.toNumber()).toBe(42650);
    expect(result.stateTax.toNumber()).toBe(1837);
  });

  it("OK MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $12,700 - exemptions ($1,000+$1,000+$2,000) = $83,300
    // Tax: $2,000×0.25% + $3,000×0.75% + $2,500×1.75% + $2,300×2.75%
    //   + $4,600×3.75% + $68,900×4.75%
    // = $5 + $22.50 + $43.75 + $63.25 + $172.50 + $3,272.75
    // = $3,579.75 → $3,580
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OK",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(4000); // 1000+1000+2×1000
    expect(result.stateTaxableIncome.toNumber()).toBe(83300);
    expect(result.stateTax.toNumber()).toBe(3580);
  });

  it("OK income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OK",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Oregon (OR)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Oregon (OR)", () => {
  it("OR Single $60,000 AGI - graduated 4-bracket system", () => {
    // AGI $60,000 - std deduction $2,835 = taxable $57,165
    // Tax: $4,400×4.75% + $6,650×6.75% + $46,115×8.75%
    //    = $209 + $448.875 + $4,035.0625 = $4,692.9375 → $4,693
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OR",
      federalAGI: d(60000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(2835);
    expect(result.stateTaxableIncome.toNumber()).toBe(57165);
    expect(result.stateTax.toNumber()).toBe(4693);
  });

  it("OR MFJ $120,000 AGI", () => {
    // AGI $120,000 - std deduction $5,670 = taxable $114,330
    // Tax: $8,800×4.75% + $13,300×6.75% + $92,230×8.75%
    //    = $418 + $897.75 + $8,070.125 = $9,385.875 → $9,386
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OR",
      filingStatus: "married_filing_jointly",
      federalAGI: d(120000),
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(5670);
    expect(result.stateTaxableIncome.toNumber()).toBe(114330);
    expect(result.stateTax.toNumber()).toBe(9386);
  });

  it("OR high income $300,000 Single - hits top 9.9% bracket", () => {
    // AGI $300,000 - std deduction $2,835 = taxable $297,165
    // Tax: $4,400×4.75% + $6,650×6.75% + $113,950×8.75% + $172,165×9.9%
    //    = $209 + $448.875 + $9,970.625 + $17,044.335 = $27,672.835 → $27,673
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OR",
      federalAGI: d(300000),
    }));
    expect(result.stateTax.toNumber()).toBe(27673);
  });

  it("OR income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "OR",
      federalAGI: d(2000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Fifth Batch: PA, RI, SC, UT, VT, VA, WV, WI, DC
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// Pennsylvania (PA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Pennsylvania (PA)", () => {
  it("PA Single $50,000 AGI - flat 3.07%", () => {
    // AGI $50,000 - no deductions - no exemptions = taxable $50,000
    // Tax: $50,000 × 3.07% = $1,535
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "PA",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(50000);
    expect(result.stateTax.toNumber()).toBe(1535);
  });

  it("PA MFJ $100,000 AGI", () => {
    // Tax: $100,000 × 3.07% = $3,070
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "PA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      hasSpouse: true,
    }));
    expect(result.stateTax.toNumber()).toBe(3070);
  });

  it("PA zero income produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "PA",
      federalAGI: ZERO,
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Rhode Island (RI)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Rhode Island (RI)", () => {
  it("RI Single $50,000 AGI - first bracket only", () => {
    // AGI $50,000 - std deduction $10,900 - exemption $5,100 = taxable $34,000
    // Tax: $34,000 × 3.75% = $1,275
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "RI",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(10900);
    expect(result.personalExemptions.toNumber()).toBe(5100);
    expect(result.stateTaxableIncome.toNumber()).toBe(34000);
    expect(result.stateTax.toNumber()).toBe(1275);
  });

  it("RI MFJ $200,000 AGI with 2 dependents - spans 2 brackets", () => {
    // AGI $200,000 - std deduction $21,800 - exemptions $5,100×4 = $20,400
    // Taxable: $200,000 - $21,800 - $20,400 = $157,800
    // Tax: $79,900 × 3.75% + ($157,800 - $79,900) × 4.75%
    //    = $2,996.25 + $77,900 × 4.75%
    //    = $2,996.25 + $3,700.25 = $6,696.50 → $6,697
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "RI",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(20400);
    expect(result.stateTaxableIncome.toNumber()).toBe(157800);
    expect(result.stateTax.toNumber()).toBe(6697);
  });

  it("RI income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "RI",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// South Carolina (SC)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - South Carolina (SC)", () => {
  it("SC Single federal TI $50,000 - graduated with 0% bracket", () => {
    // SC starts from federal taxable income (not AGI)
    // Federal TI $50,000, no SC standard deduction, no personal exemption (single)
    // Taxable: $50,000
    // Tax: $3,560 × 0% + ($17,830 - $3,560) × 3% + ($50,000 - $17,830) × 6.0%
    //    = 0 + $14,270 × 3% + $32,170 × 6.0%
    //    = $428.10 + $1,930.20 = $2,358.30 → $2,358
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "SC",
      federalAGI: d(65000),
      federalTaxableIncome: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(50000);
    expect(result.stateTax.toNumber()).toBe(2358);
  });

  it("SC MFJ federal TI $70,000 with 2 dependents", () => {
    // SC starts from federal TI $70,000
    // Dependent deduction: 2 × $4,930 = $9,860
    // Taxable: $70,000 - $9,860 = $60,140
    // Tax: $3,560 × 0% + $14,270 × 3% + ($60,140 - $17,830) × 6.0%
    //    = 0 + $428.10 + $42,310 × 6.0%
    //    = $428.10 + $2,538.60 = $2,966.70 → $2,967
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "SC",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      federalTaxableIncome: d(70000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(9860);
    expect(result.stateTaxableIncome.toNumber()).toBe(60140);
    expect(result.stateTax.toNumber()).toBe(2967);
  });

  it("SC income in 0% bracket produces zero tax", () => {
    // Federal TI $3,000 → all within SC's 0% bracket ($0-$3,560)
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "SC",
      federalAGI: d(10000),
      federalTaxableIncome: d(3000),
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(3000);
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Utah (UT)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Utah (UT)", () => {
  it("UT Single $50,000 AGI - flat 4.5% with phased taxpayer credit", () => {
    // AGI $50,000 - no Utah deduction = taxable $50,000
    // Tax before credits: $50,000 × 4.5% = $2,250
    // Credit base: federal standard deduction $15,750 × 6% = $945
    // Phase-out: ($50,000 - $18,213) × 1.3% = $413.231 → $413
    // Credit: $945 - $413 = $532
    // State tax: $2,250 - $532 = $1,718
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "UT",
      federalAGI: d(50000),
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(50000);
    expect(result.taxBeforeCredits.toNumber()).toBe(2250);
    expect(result.exemptionCredit.toNumber()).toBe(532);
    expect(result.stateTax.toNumber()).toBe(1718);
  });

  it("UT MFJ $100,000 AGI with 2 dependents", () => {
    // Taxable: $100,000
    // Tax before credits: $100,000 × 4.5% = $4,500
    // Credit base: (federal standard deduction $31,500 + dependent exemption $4,222) × 6%
    //   = $35,722 × 6% = $2,143.32 → $2,143
    // Phase-out: ($100,000 - $36,426) × 1.3% = $826.462 → $826
    // Credit: $2,143 - $826 = $1,317
    // State tax: $4,500 - $1,317 = $3,183
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "UT",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.taxBeforeCredits.toNumber()).toBe(4500);
    expect(result.exemptionCredit.toNumber()).toBe(1317);
    expect(result.stateTax.toNumber()).toBe(3183);
  });

  it("UT zero income produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "UT",
      federalAGI: ZERO,
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Vermont (VT)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Vermont (VT)", () => {
  it("VT Single $50,000 AGI - first bracket only", () => {
    // AGI $50,000 - std deduction $15,000 - exemption $4,700 = taxable $30,300
    // Tax: $30,300 × 3.35% = $1,015.05 → $1,015
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VT",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15000);
    expect(result.personalExemptions.toNumber()).toBe(4700);
    expect(result.stateTaxableIncome.toNumber()).toBe(30300);
    expect(result.stateTax.toNumber()).toBe(1015);
  });

  it("VT MFJ $200,000 AGI with 2 dependents - spans 2 brackets", () => {
    // AGI $200,000 - std deduction $30,000 - exemptions $4,700×4 = $18,800
    // Taxable: $200,000 - $30,000 - $18,800 = $151,200
    // Tax: $76,000 × 3.35% + ($151,200 - $76,000) × 6.60%
    //    = $2,546 + $75,200 × 6.60%
    //    = $2,546 + $4,963.20 = $7,509.20 → $7,509
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VT",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.stateTaxableIncome.toNumber()).toBe(151200);
    expect(result.stateTax.toNumber()).toBe(7509);
  });

  it("VT income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VT",
      federalAGI: d(15000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Virginia (VA)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Virginia (VA)", () => {
  it("VA Single $50,000 AGI - graduated 4-bracket system", () => {
    // AGI $50,000 - std deduction $8,750 - exemption $930 = taxable $40,320
    // Tax: $3,000 × 2% + $2,000 × 3% + $12,000 × 5% + $23,320 × 5.75%
    //    = $60 + $60 + $600 + $1,340.90 = $2,060.90 → $2,061
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VA",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(8750);
    expect(result.personalExemptions.toNumber()).toBe(930);
    expect(result.stateTaxableIncome.toNumber()).toBe(40320);
    expect(result.stateTax.toNumber()).toBe(2061);
  });

  it("VA MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - std deduction $17,500 - exemptions $930×4 = $3,720
    // Taxable: $100,000 - $17,500 - $3,720 = $78,780
    // Tax: $3,000 × 2% + $2,000 × 3% + $12,000 × 5% + $61,780 × 5.75%
    //    = $60 + $60 + $600 + $3,552.35 = $4,272.35 → $4,272
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VA",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(17500);
    expect(result.personalExemptions.toNumber()).toBe(3720);
    expect(result.stateTaxableIncome.toNumber()).toBe(78780);
    expect(result.stateTax.toNumber()).toBe(4272);
  });

  it("VA income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "VA",
      federalAGI: d(5000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// West Virginia (WV)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - West Virginia (WV)", () => {
  it("WV Single $50,000 AGI - graduated 5-bracket system", () => {
    // AGI $50,000 - no standard deduction - exemption $2,000 = taxable $48,000
    // Tax: $10,000 × 2.22% + $15,000 × 2.96% + $15,000 × 3.33% + $8,000 × 4.44%
    //    = $222 + $444 + $499.50 + $355.20 = $1,520.70 → $1,521
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WV",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(2000);
    expect(result.stateTaxableIncome.toNumber()).toBe(48000);
    expect(result.stateTax.toNumber()).toBe(1521);
  });

  it("WV MFJ $100,000 AGI with 2 dependents", () => {
    // AGI $100,000 - no standard deduction - exemptions $2,000×4 = $8,000
    // Taxable: $100,000 - $8,000 = $92,000
    // Tax: $10,000 × 2.22% + $15,000 × 2.96% + $15,000 × 3.33%
    //    + $20,000 × 4.44% + $32,000 × 4.82%
    //    = $222 + $444 + $499.50 + $888 + $1,542.40 = $3,595.90 → $3,596
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WV",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(0);
    expect(result.personalExemptions.toNumber()).toBe(8000);
    expect(result.stateTaxableIncome.toNumber()).toBe(92000);
    expect(result.stateTax.toNumber()).toBe(3596);
  });

  it("WV income below exemptions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WV",
      federalAGI: d(2000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("WV married filing separately uses the explicit schedule II thresholds", () => {
    // AGI $50,000 - exemption $2,000 = taxable $48,000
    // Tax: $5,000 × 2.22% + $7,500 × 2.96% + $7,500 × 3.33%
    //    + $10,000 × 4.44% + $18,000 × 4.82%
    //    = $111 + $222 + $249.75 + $444 + $867.60 = $1,894.35 → $1,894
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WV",
      filingStatus: "married_filing_separately",
      federalAGI: d(50000),
    }));
    expect(result.personalExemptions.toNumber()).toBe(2000);
    expect(result.stateTaxableIncome.toNumber()).toBe(48000);
    expect(result.stateTax.toNumber()).toBe(1894);
  });
});

// ════════════════════════════════════════════════════════════════
// Wisconsin (WI)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - Wisconsin (WI)", () => {
  it("WI Single $50,000 AGI - graduated 4-bracket system", () => {
    // WI 2025 Form 1 standard deduction table uses "at least / but less than" bands.
    // $50,000 AGI falls in the $50,000-$50,500 band, so the deduction is $9,876.
    // Taxable: $50,000 - $9,876 - $700 = $39,424
    // Tax: $14,680 × 3.5% + ($39,424 - $14,680) × 4.4%
    //    = $513.80 + $24,744 × 4.4%
    //    = $513.80 + $1,088.74 = $1,602.54 → $1,603
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(9876);
    expect(result.personalExemptions.toNumber()).toBe(700);
    expect(result.stateTaxableIncome.toNumber()).toBe(39424);
    expect(result.stateTax.toNumber()).toBe(1603);
  });

  it("WI MFJ $100,000 AGI with 2 dependents", () => {
    // $100,000 AGI falls in the $100,000-$100,500 MFJ band, deduction $10,862.
    // Taxable: $100,000 - $10,862 - $2,800 = $86,338
    // Tax: $19,580 × 3.5% + $47,720 × 4.4% + ($86,338 - $67,300) × 5.3%
    //    = $685.30 + $2,099.68 + $19,038 × 5.3%
    //    = $685.30 + $2,099.68 + $1,009.01 = $3,793.99 → $3,794
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      filingStatus: "married_filing_jointly",
      federalAGI: d(100000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.standardDeduction.toNumber()).toBe(10862);
    expect(result.personalExemptions.toNumber()).toBe(2800);
    expect(result.stateTaxableIncome.toNumber()).toBe(86338);
    expect(result.stateTax.toNumber()).toBe(3794);
  });

  it("WI income below standard deduction produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      federalAGI: d(10000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("WI married filing separately uses the explicit 2025 Schedule C brackets", () => {
    // $50,000 AGI falls in the $50,000-$50,500 MFS band, deduction $4,640.
    // Taxable: $50,000 - $4,640 - $700 = $44,660
    // Tax: $9,790 × 3.5% + $23,860 × 4.4% + ($44,660 - $33,650) × 5.3%
    //    = $342.65 + $1,049.84 + $11,010 × 5.3%
    //    = $342.65 + $1,049.84 + $583.53 = $1,976.02 → $1,976
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      filingStatus: "married_filing_separately",
      federalAGI: d(50000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(4640);
    expect(result.personalExemptions.toNumber()).toBe(700);
    expect(result.stateTaxableIncome.toNumber()).toBe(44660);
    expect(result.stateTax.toNumber()).toBe(1976);
  });

  it("WI exact income breakpoints use the next published deduction band", () => {
    const justBelow = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      federalAGI: d(49999),
    }));
    const atBoundary = calculateGenericStateReturn(makeInput({
      stateCode: "WI",
      federalAGI: d(50000),
    }));

    expect(justBelow.standardDeduction.toNumber()).toBe(9936);
    expect(atBoundary.standardDeduction.toNumber()).toBe(9876);
  });
});

// ════════════════════════════════════════════════════════════════
// District of Columbia (DC)
// ════════════════════════════════════════════════════════════════

describe("Generic State Engine - District of Columbia (DC)", () => {
  it("DC Single $75,000 AGI - spans 4 brackets", () => {
    // DC 2025 uses its own basic standard deduction amounts.
    // AGI $75,000 - DC standard deduction $15,000 = taxable $60,000
    // Tax: $10,000 × 4% + $30,000 × 6% + $20,000 × 6.5%
    //    = $400 + $1,800 + $1,300 = $3,500
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DC",
      federalAGI: d(75000),
    }));
    expect(result.standardDeduction.toNumber()).toBe(15000);
    expect(result.personalExemptions.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(60000);
    expect(result.stateTax.toNumber()).toBe(3500);
  });

  it("DC MFJ $200,000 AGI with 2 dependents - hits 8.5% bracket", () => {
    // AGI $200,000 - DC standard deduction $30,000 = taxable $170,000
    // Tax: $10,000 × 4% + $30,000 × 6% + $20,000 × 6.5% + $110,000 × 8.5%
    //    = $400 + $1,800 + $1,300 + $9,350 = $12,850
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DC",
      filingStatus: "married_filing_jointly",
      federalAGI: d(200000),
      dependentCount: 2,
      hasSpouse: true,
    }));
    expect(result.personalExemptions.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(170000);
    expect(result.stateTax.toNumber()).toBe(12850);
  });

  it("DC income below deductions produces zero tax", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DC",
      federalAGI: d(15000),
    }));
    expect(result.stateTax.toNumber()).toBe(0);
  });

  it("DC qualifying surviving spouse uses the explicit 2025 $30,000 basic deduction", () => {
    const result = calculateGenericStateReturn(makeInput({
      stateCode: "DC",
      filingStatus: "qualifying_surviving_spouse",
      federalAGI: d(60000),
      dependentCount: 1,
    }));
    expect(result.standardDeduction.toNumber()).toBe(30000);
    expect(result.personalExemptions.toNumber()).toBe(0);
    expect(result.stateTaxableIncome.toNumber()).toBe(30000);
    expect(result.stateTax.toNumber()).toBe(1600);
  });
});
