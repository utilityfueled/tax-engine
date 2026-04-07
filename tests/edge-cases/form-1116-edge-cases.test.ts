/**
 * Edge case tests for Form 1116 — Foreign Tax Credit.
 * Spec: spec/federal/form-1116.yaml
 *
 * Key thresholds:
 *   Simplified method: $300 (single/HoH/MFS), $600 (MFJ/QSS)
 *   Limitation ratio: foreign source / worldwide taxable income, capped at 1.0
 *   Carryforward: 10-year expiration, FIFO ordering
 *   Credit allowed: min(taxes paid + carryforward, limitation)
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm1116,
  type Form1116Input,
} from "@/engine/forms/form-1116.js";
import type { FilingStatus } from "@/models/constants.js";

const d = (v: string | number) => new Decimal(v);

function makeInput(overrides: Partial<Form1116Input> = {}): Form1116Input {
  return {
    foreignSourceIncome: d(10000),
    totalTaxableIncome: d(100000),
    taxBeforeCredits: d(15000),
    foreignTaxesPaid: d(1500),
    filingStatus: "single" as FilingStatus,
    ...overrides,
  };
}

describe("Form 1116 simplified method threshold boundaries", () => {
  it("Form 1116 simplified_eligible - single filer at exactly $300 foreign tax is eligible", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(300),
      filingStatus: "single",
    }));
    expect(result.simplifiedEligible).toBe(true);
  });

  it("Form 1116 simplified_eligible - single filer at $301 foreign tax is not eligible", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(301),
      filingStatus: "single",
    }));
    expect(result.simplifiedEligible).toBe(false);
  });

  it("Form 1116 simplified_eligible - MFJ filer at exactly $600 foreign tax is eligible", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(600),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.simplifiedEligible).toBe(true);
  });

  it("Form 1116 simplified_eligible - MFJ filer at $601 foreign tax is not eligible", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(601),
      filingStatus: "married_filing_jointly",
    }));
    expect(result.simplifiedEligible).toBe(false);
  });

  it("Form 1116 simplified_eligible - QSS uses $600 MFJ threshold", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(600),
      filingStatus: "qualifying_surviving_spouse",
    }));
    expect(result.simplifiedEligible).toBe(true);
  });

  it("Form 1116 simplified_eligible - disqualifying sources make ineligible even under threshold", () => {
    const result = calculateForm1116(makeInput({
      foreignTaxesPaid: d(100),
      filingStatus: "single",
      hasDisqualifyingForeignTaxSources: true,
    }));
    expect(result.simplifiedEligible).toBe(false);
  });
});

describe("Form 1116 Line 20 - limitation ratio edge cases", () => {
  it("Form 1116 Line 20 - zero taxable income yields zero limitation", () => {
    const result = calculateForm1116(makeInput({
      totalTaxableIncome: d(0),
      taxBeforeCredits: d(0),
    }));
    expect(result.limitation.toNumber()).toBe(0);
  });

  it("Form 1116 Line 20 - zero foreign source income yields zero limitation", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(0),
    }));
    expect(result.limitation.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(0);
  });

  it("Form 1116 Line 20 - foreign income equals worldwide income caps ratio at 1.0", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(100000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(20000),
    }));
    // Ratio: 100000 / 100000 = 1.0
    // Limitation = 15000 * 1.0 = 15000
    expect(result.limitation.toNumber()).toBe(15000);
  });

  it("Form 1116 Line 20 - foreign income exceeds worldwide income still caps ratio at 1.0", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(150000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(25000),
    }));
    // Ratio capped at 1.0
    expect(result.limitation.toNumber()).toBe(15000);
  });

  it("Form 1116 Line 20 - very small foreign income produces proportionally small limitation", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(1),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1),
    }));
    // Ratio: 1/100000 = 0.00001
    // Limitation: round(15000 * 0.00001) = 0
    expect(result.limitation.toNumber()).toBe(0);
  });
});

describe("Form 1116 Line 21 - credit allowed equals min(taxes, limitation)", () => {
  it("Form 1116 Line 21 - taxes paid less than limitation gives full credit", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(3000),
    }));
    // Limitation: round(15000 * 0.5) = 7500
    // Credit: min(3000, 7500) = 3000
    expect(result.limitation.toNumber()).toBe(7500);
    expect(result.creditAllowed.toNumber()).toBe(3000);
  });

  it("Form 1116 Line 21 - taxes paid exceed limitation caps credit at limitation", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(5000),
    }));
    // Limitation: round(15000 * 0.1) = 1500
    // Credit: min(5000, 1500) = 1500
    expect(result.limitation.toNumber()).toBe(1500);
    expect(result.creditAllowed.toNumber()).toBe(1500);
  });

  it("Form 1116 Line 21 - taxes paid exactly equal limitation", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(7500),
    }));
    expect(result.limitation.toNumber()).toBe(7500);
    expect(result.creditAllowed.toNumber()).toBe(7500);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

describe("Form 1116 Line 3e - apportioned deductions", () => {
  it("Form 1116 Line 3e - deductions apportioned by foreign/AGI ratio", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(20000),
      totalTaxableIncome: d(80000),
      taxBeforeCredits: d(12000),
      foreignTaxesPaid: d(2000),
      deductionAmount: d(15000),
      agi: d(100000),
    }));
    // Ratio: 20000/100000 = 0.2
    // Apportioned: round(15000 * 0.2) = 3000
    expect(result.apportionedDeductions.toNumber()).toBe(3000);
    // Net foreign: 20000 - 3000 = 17000
    expect(result.netForeignSourceIncome.toNumber()).toBe(17000);
  });

  it("Form 1116 Line 3e - zero AGI yields zero apportioned deductions", () => {
    const result = calculateForm1116(makeInput({
      deductionAmount: d(15000),
      agi: d(0),
    }));
    expect(result.apportionedDeductions.toNumber()).toBe(0);
  });

  it("Form 1116 Line 3e - foreign income exceeding AGI caps ratio at 1.0", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(120000),
      deductionAmount: d(15000),
      agi: d(100000),
    }));
    // Ratio capped at 1.0 → apportioned = 15000
    expect(result.apportionedDeductions.toNumber()).toBe(15000);
  });
});

describe("Form 1116 carryforward generation and usage", () => {
  it("Form 1116 carryforward - excess credit generates carryforward", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(5000),
      currentTaxYear: 2025,
    }));
    // Limitation: 1500, credit used: 1500, excess: 3500
    expect(result.creditAllowed.toNumber()).toBe(1500);
    expect(result.carryforward.toNumber()).toBe(3500);
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2025);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(3500);
  });

  it("Form 1116 carryforward - prior year carryforward used when limitation allows", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1000),
      priorYearCarryforward: d(3000),
      currentTaxYear: 2025,
    }));
    // Limitation: 7500
    // Current-year taxes used: 1000
    // Excess limitation: 7500 - 1000 = 6500
    // Carryforward used: min(3000, 6500) = 3000
    // Total credit: 1000 + 3000 = 4000
    expect(result.creditAllowed.toNumber()).toBe(4000);
    expect(result.carryforward.toNumber()).toBe(0);
  });

  it("Form 1116 carryforward - zero current-year tax with carryforward still uses it", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(0),
      priorYearCarryforward: d(5000),
      currentTaxYear: 2025,
    }));
    // Limitation: 7500
    // Current: 0, excess limitation: 7500
    // Carryforward used: min(5000, 7500) = 5000
    expect(result.creditAllowed.toNumber()).toBe(5000);
    expect(result.carryforward.toNumber()).toBe(0);
  });
});

describe("Form 1116 Schedule B - FIFO and 10-year expiration", () => {
  it("Form 1116 Schedule B - credits from exactly 10 years ago are still usable", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(0),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2015, amount: d(2000) }, // exactly 10 years ago
      ],
    }));
    // 2025 - 2015 = 10, ≤ 10 → not expired
    expect(result.carryforwardExpired.toNumber()).toBe(0);
    expect(result.creditAllowed.toNumber()).toBe(2000);
  });

  it("Form 1116 Schedule B - credits from 11 years ago expire", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(0),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2014, amount: d(2000) }, // 11 years ago
      ],
    }));
    // 2025 - 2014 = 11, > 10 → expired
    expect(result.carryforwardExpired.toNumber()).toBe(2000);
    expect(result.creditAllowed.toNumber()).toBe(0);
  });

  it("Form 1116 Schedule B - FIFO uses oldest credits first", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1000),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2020, amount: d(3000) },
        { taxYear: 2022, amount: d(4000) },
      ],
    }));
    // Limitation: 7500, current used: 1000, excess: 6500
    // FIFO: 2020 → 3000 used (remainder 0), 2022 → 3500 used (remainder 500)
    expect(result.creditAllowed.toNumber()).toBe(7500);
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2022);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(500);
  });

  it("Form 1116 Schedule B - mixed expired and valid entries", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(50000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(0),
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2013, amount: d(1000) }, // 12 years → expired
        { taxYear: 2016, amount: d(2000) }, // 9 years → valid
      ],
    }));
    expect(result.carryforwardExpired.toNumber()).toBe(1000);
    expect(result.creditAllowed.toNumber()).toBe(2000);
  });

  it("Form 1116 Schedule B - no excess limitation leaves carryforward unchanged", () => {
    const result = calculateForm1116(makeInput({
      foreignSourceIncome: d(10000),
      totalTaxableIncome: d(100000),
      taxBeforeCredits: d(15000),
      foreignTaxesPaid: d(1500), // exactly equals limitation
      currentTaxYear: 2025,
      priorYearCarryforwardByYear: [
        { taxYear: 2023, amount: d(500) },
      ],
    }));
    // Limitation: 1500, current used: 1500, excess: 0
    // No room for carryforward usage
    expect(result.creditAllowed.toNumber()).toBe(1500);
    expect(result.carryforwardByYear).toHaveLength(1);
    expect(result.carryforwardByYear[0].taxYear).toBe(2023);
    expect(result.carryforwardByYear[0].amount.toNumber()).toBe(500);
  });
});
