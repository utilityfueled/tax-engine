/**
 * Edge case tests for Form 8839 — Qualified Adoption Expenses
 * Spec: spec/federal/form-8839.yaml
 *
 * Covers: MFS ineligibility, MAGI phase-out boundaries (threshold, mid-range,
 * complete phase-out), special needs rules, foreign adoption timing, per-child
 * maximum cap, prior year credits, employer-provided exclusion interaction,
 * and multi-child scenarios.
 *
 * 2025 constants: maxCreditPerChild $17,280, phaseOutThreshold $259,190,
 * phaseOutRange $40,000.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm8839 } from "@/engine/forms/form-8839.js";
import type { Form8839Params, Form8839ChildResult } from "@/engine/forms/form-8839.js";
import type { Form8839Child } from "@/models/inputs.js";

const ZERO = new Decimal(0);
const d = (v: string | number) => new Decimal(v);

const CONSTANTS_2025 = {
  maxCreditPerChild: d(17280),
  phaseOutThreshold: d(259190),
  phaseOutRange: d(40000),
};

function makeChild(overrides: Partial<Form8839Child> = {}): Form8839Child {
  return {
    childName: "Test Child",
    isSpecialNeeds: false,
    isForeignAdoption: false,
    adoptionBecameFinal: true,
    qualifiedExpenses: d(15000),
    employerBenefits: d(0),
    priorYearCreditsClaimed: d(0),
    priorYearExclusionsClaimed: d(0),
    ...overrides,
  } as Form8839Child;
}

function makeParams(overrides: Partial<Form8839Params> = {}): Form8839Params {
  return {
    filingStatus: "single",
    agi: d(100000),
    children: [makeChild()],
    foreignEarnedIncomeExclusion: ZERO,
    foreignHousingExclusion: ZERO,
    constants: CONSTANTS_2025,
    ...overrides,
  };
}

// ── MFS ineligibility ──────────────────────────────────────────

describe("Form 8839 MFS ineligibility", () => {
  it("Form 8839 - MFS filers cannot claim adoption credit (IRC §23(f)(1))", () => {
    const result = calculateForm8839(makeParams({
      filingStatus: "married_filing_separately",
      agi: d(100000),
    }));

    expect(result.eligible).toBe(false);
    expect(result.ineligibleReason).toContain("Married filing separately");
    expect(result.adoptionCredit.toNumber()).toBe(0);
    expect(result.allowableExclusion.toNumber()).toBe(0);
  });

  it("Form 8839 - MFS ineligible even with special needs child and low income", () => {
    const result = calculateForm8839(makeParams({
      filingStatus: "married_filing_separately",
      agi: d(50000),
      children: [makeChild({ isSpecialNeeds: true, adoptionBecameFinal: true })],
    }));

    expect(result.eligible).toBe(false);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });
});

// ── MAGI phase-out boundary tests ──────────────────────────────

describe("Form 8839 MAGI phase-out boundaries", () => {
  it("Form 8839 Line 8 - MAGI exactly at phase-out threshold ($259,190) yields zero excess", () => {
    const result = calculateForm8839(makeParams({
      agi: d(259190),
    }));

    expect(result.eligible).toBe(true);
    expect(result.excessMagi.toNumber()).toBe(0);
    expect(result.phaseOutFraction.toNumber()).toBe(0);
    expect(result.phaseOutReduction.toNumber()).toBe(0);
    // Full credit (expenses $15,000 < max $17,280)
    expect(result.adoptionCredit.toNumber()).toBe(15000);
  });

  it("Form 8839 Line 8 - MAGI $1 above threshold ($259,191) triggers minimal phase-out", () => {
    const result = calculateForm8839(makeParams({
      agi: d(259191),
    }));

    expect(result.excessMagi.toNumber()).toBe(1);
    // Phase-out fraction: min(1, 1/40000) = 0.000 rounded to 3 decimal places
    expect(result.phaseOutFraction.toNumber()).toBe(0);
    // With fraction 0.000, reduction is $0, full credit survives
    expect(result.adoptionCredit.toNumber()).toBe(15000);
  });

  it("Form 8839 Line 9 - MAGI at midpoint of phase-out range ($279,190) yields 50% reduction", () => {
    const result = calculateForm8839(makeParams({
      agi: d(279190),
    }));

    expect(result.excessMagi.toNumber()).toBe(20000);
    // Phase-out fraction: 20000/40000 = 0.500
    expect(result.phaseOutFraction.toNumber()).toBe(0.5);
    // Reduction: $15,000 × 0.500 = $7,500
    expect(result.phaseOutReduction.toNumber()).toBe(7500);
    expect(result.adoptionCredit.toNumber()).toBe(7500);
  });

  it("Form 8839 Line 9 - MAGI at top of phase-out range ($299,190) yields 100% phase-out", () => {
    const result = calculateForm8839(makeParams({
      agi: d(299190),
    }));

    expect(result.excessMagi.toNumber()).toBe(40000);
    // Phase-out fraction: min(1, 40000/40000) = 1.000
    expect(result.phaseOutFraction.toNumber()).toBe(1);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });

  it("Form 8839 Line 11 - MAGI well above phase-out range ($350,000) yields zero credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(350000),
    }));

    expect(result.phaseOutFraction.toNumber()).toBe(1);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });

  it("Form 8839 Line 6 - foreign exclusions added to AGI for MAGI computation", () => {
    // AGI alone is below threshold, but foreign exclusions push MAGI into phase-out
    const result = calculateForm8839(makeParams({
      agi: d(250000),
      foreignEarnedIncomeExclusion: d(20000),
      foreignHousingExclusion: d(5000),
    }));

    // MAGI = 250000 + 20000 + 5000 = 275000
    expect(result.magi.toNumber()).toBe(275000);
    expect(result.excessMagi.toNumber()).toBe(15810); // 275000 - 259190
    // Fraction: 15810/40000 = 0.395 (rounded to 3 decimal places)
    expect(result.phaseOutFraction.toNumber()).toBe(0.395);
  });
});

// ── Special needs and foreign adoption rules ───────────────────

describe("Form 8839 special needs and foreign adoption rules", () => {
  it("Form 8839 Line 2 - special needs child with final adoption gets full max credit regardless of expenses", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        isSpecialNeeds: true,
        adoptionBecameFinal: true,
        qualifiedExpenses: d(5000), // Well below the $17,280 max
      })],
    }));

    // Special needs + final = full $17,280 regardless of actual expenses
    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    expect(result.adoptionCredit.toNumber()).toBe(17280);
  });

  it("Form 8839 Line 2 - special needs child without final adoption uses actual expenses", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        isSpecialNeeds: true,
        adoptionBecameFinal: false,
        qualifiedExpenses: d(5000),
      })],
    }));

    // Not final, so even though special needs, it's treated as normal
    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(5000);
  });

  it("Form 8839 Line 2 - foreign adoption not yet final yields zero tentative credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        isForeignAdoption: true,
        adoptionBecameFinal: false,
        qualifiedExpenses: d(15000),
      })],
    }));

    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(0);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });

  it("Form 8839 Line 2 - foreign adoption that became final uses actual expenses", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        isForeignAdoption: true,
        adoptionBecameFinal: true,
        qualifiedExpenses: d(12000),
      })],
    }));

    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(12000);
    expect(result.adoptionCredit.toNumber()).toBe(12000);
  });
});

// ── Per-child maximum and prior year credits ───────────────────

describe("Form 8839 per-child maximum and prior year credits", () => {
  it("Form 8839 Line 2 - expenses exceeding per-child maximum capped at $17,280", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({ qualifiedExpenses: d(25000) })],
    }));

    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    expect(result.adoptionCredit.toNumber()).toBe(17280);
  });

  it("Form 8839 Line 5 - prior year credits reduce current year tentative credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        qualifiedExpenses: d(17280),
        priorYearCreditsClaimed: d(10000),
      })],
    }));

    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    expect(result.childResults[0].netCredit.toNumber()).toBe(7280);
    expect(result.netTentativeCredit.toNumber()).toBe(7280);
    expect(result.adoptionCredit.toNumber()).toBe(7280);
  });

  it("Form 8839 Line 5 - prior year credits exceeding tentative credit yields zero net credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        qualifiedExpenses: d(10000),
        priorYearCreditsClaimed: d(12000),
      })],
    }));

    expect(result.childResults[0].netCredit.toNumber()).toBe(0);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });

  it("Form 8839 Line 1 - zero qualified expenses yields zero credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({ qualifiedExpenses: d(0) })],
    }));

    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(0);
    expect(result.adoptionCredit.toNumber()).toBe(0);
  });
});

// ── Employer-provided adoption benefit exclusion ───────────────

describe("Form 8839 employer-provided adoption benefit exclusion", () => {
  it("Form 8839 Part III - employer benefits within remaining max after credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        qualifiedExpenses: d(10000),
        employerBenefits: d(5000),
      })],
    }));

    // Tentative credit: min(10000, 17280) = 10000
    // Remaining max for exclusion: 17280 - 10000 = 7280
    // Tentative exclusion: min(5000, 7280) = 5000
    expect(result.childResults[0].tentativeExclusion.toNumber()).toBe(5000);
    expect(result.allowableExclusion.toNumber()).toBe(5000);
    expect(result.taxableEmployerBenefits.toNumber()).toBe(0);
  });

  it("Form 8839 Part III - employer benefits capped by remaining max after credit", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [makeChild({
        qualifiedExpenses: d(15000),
        employerBenefits: d(10000),
      })],
    }));

    // Tentative credit: min(15000, 17280) = 15000
    // Remaining for exclusion: 17280 - 15000 = 2280
    // Tentative exclusion: min(10000, 2280) = 2280
    expect(result.childResults[0].tentativeExclusion.toNumber()).toBe(2280);
    expect(result.allowableExclusion.toNumber()).toBe(2280);
    // Taxable: 10000 - 2280 = 7720
    expect(result.taxableEmployerBenefits.toNumber()).toBe(7720);
  });

  it("Form 8839 Part III - employer exclusion also subject to MAGI phase-out", () => {
    const result = calculateForm8839(makeParams({
      agi: d(279190), // Midpoint: 50% phase-out
      children: [makeChild({
        qualifiedExpenses: d(10000),
        employerBenefits: d(5000),
      })],
    }));

    expect(result.phaseOutFraction.toNumber()).toBe(0.5);
    // Net tentative exclusion: 5000 (no prior exclusions)
    // Exclusion phase-out: 5000 × 0.5 = 2500
    expect(result.exclusionPhaseOutReduction.toNumber()).toBe(2500);
    expect(result.allowableExclusion.toNumber()).toBe(2500);
    // Taxable: 5000 - 2500 = 2500
    expect(result.taxableEmployerBenefits.toNumber()).toBe(2500);
  });

  it("Form 8839 Part III - full phase-out makes all employer benefits taxable", () => {
    const result = calculateForm8839(makeParams({
      agi: d(299190), // Top of phase-out range
      children: [makeChild({
        qualifiedExpenses: d(10000),
        employerBenefits: d(5000),
      })],
    }));

    expect(result.phaseOutFraction.toNumber()).toBe(1);
    expect(result.allowableExclusion.toNumber()).toBe(0);
    expect(result.taxableEmployerBenefits.toNumber()).toBe(5000);
  });
});

// ── Multi-child scenarios ──────────────────────────────────────

describe("Form 8839 multi-child scenarios", () => {
  it("Form 8839 Lines 3-5 - multiple children aggregate correctly", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [
        makeChild({ childName: "Child A", qualifiedExpenses: d(10000) }),
        makeChild({ childName: "Child B", qualifiedExpenses: d(8000) }),
        makeChild({ childName: "Child C", qualifiedExpenses: d(17280) }),
      ],
    }));

    expect(result.childResults).toHaveLength(3);
    expect(result.totalTentativeCredit.toNumber()).toBe(35280); // 10000 + 8000 + 17280
    expect(result.adoptionCredit.toNumber()).toBe(35280);
  });

  it("Form 8839 - mixed special needs and regular children", () => {
    const result = calculateForm8839(makeParams({
      agi: d(100000),
      children: [
        makeChild({
          childName: "Special Needs",
          isSpecialNeeds: true,
          adoptionBecameFinal: true,
          qualifiedExpenses: d(3000),
        }),
        makeChild({
          childName: "Regular",
          qualifiedExpenses: d(10000),
        }),
      ],
    }));

    // Special needs: full $17,280 regardless of $3,000 expenses
    expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    // Regular: $10,000 (capped at actual expenses)
    expect(result.childResults[1].tentativeCredit.toNumber()).toBe(10000);
    expect(result.adoptionCredit.toNumber()).toBe(27280);
  });
});

// ── Phase-out fraction rounding ────────────────────────────────

describe("Form 8839 phase-out fraction rounding", () => {
  it("Form 8839 Line 9 - fraction rounds to 3 decimal places (half-up)", () => {
    // MAGI = 259190 + 10001 = 269191 → excess = 10001
    // Fraction = 10001/40000 = 0.250025 → rounds to 0.250
    const result = calculateForm8839(makeParams({
      agi: d(269191),
    }));

    expect(result.phaseOutFraction.toNumber()).toBe(0.25);
  });

  it("Form 8839 Line 9 - fraction at boundary that rounds up", () => {
    // excess = 10020 → fraction = 10020/40000 = 0.2505 → rounds to 0.251
    const result = calculateForm8839(makeParams({
      agi: d(269210), // 259190 + 10020
    }));

    expect(result.phaseOutFraction.toNumber()).toBe(0.251);
  });
});
