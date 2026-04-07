/**
 * Edge case tests for Form 4137 — Social Security and Medicare Tax on Unreported Tip Income.
 * Spec: spec/federal/form-4137.yaml
 *
 * Key constants (2025):
 *   Social Security wage base: $176,100
 *   Employee SS rate: 6.2% (half of 12.4%)
 *   Employee Medicare rate: 1.45% (half of 2.9%)
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4137 } from "@/engine/forms/form-4137.js";
import { getConstants } from "@/models/constants.js";

const d = (v: string | number) => new Decimal(v);
const c = getConstants(2025);
const WAGE_BASE = c.selfEmploymentTax.socialSecurityWageBase; // 176100

// ═══════════════════════════════════════════════════════
// Social Security wage base boundary tests
// ═══════════════════════════════════════════════════════

describe("Form 4137 Social Security wage base boundaries", () => {
  it("Form 4137 Line 9 - zero wage-base room when prior wages exactly equal wage base ($176,100)", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: WAGE_BASE,
    }, c);

    expect(result.line8.toNumber()).toBe(176100);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare still applies on full tip amount
    expect(result.line12.toNumber()).toBe(73); // round(5000 * 0.0145)
    expect(result.line13.toNumber()).toBe(73);
  });

  it("Form 4137 Line 9 - zero wage-base room when prior wages exceed wage base", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(3000),
      socialSecurityWagesAndTipsAlreadyReported: d(200000),
    }, c);

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(44); // round(3000 * 0.0145)
    expect(result.line13.toNumber()).toBe(44);
  });

  it("Form 4137 Line 9 - full wage-base room when no prior wages reported", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(10000),
      socialSecurityWagesAndTipsAlreadyReported: d(0),
    }, c);

    expect(result.line9.toNumber()).toBe(176100);
    expect(result.line10.toNumber()).toBe(10000);
    expect(result.line11.toNumber()).toBe(620); // round(10000 * 0.062)
    expect(result.line12.toNumber()).toBe(145); // round(10000 * 0.0145)
    expect(result.line13.toNumber()).toBe(765);
  });

  it("Form 4137 Line 10 - tips exactly fill remaining wage-base room", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(6100),
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
    }, c);

    expect(result.line9.toNumber()).toBe(6100);
    expect(result.line10.toNumber()).toBe(6100);
    expect(result.line11.toNumber()).toBe(378); // round(6100 * 0.062)
    expect(result.line12.toNumber()).toBe(88); // round(6100 * 0.0145)
    expect(result.line13.toNumber()).toBe(466);
  });

  it("Form 4137 Line 10 - tips exceed remaining wage-base room by $1", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(6101),
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
    }, c);

    // Only 6100 of wage-base room, but 6101 in tips
    expect(result.line9.toNumber()).toBe(6100);
    expect(result.line10.toNumber()).toBe(6100); // Capped at remaining room
    expect(result.line11.toNumber()).toBe(378);
    // Medicare applies to full 6101
    expect(result.line12.toNumber()).toBe(88); // round(6101 * 0.0145)
    expect(result.line13.toNumber()).toBe(466);
  });

  it("Form 4137 Line 9 - $1 below wage base leaves $1 of room", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(500),
      socialSecurityWagesAndTipsAlreadyReported: d(176099),
    }, c);

    expect(result.line9.toNumber()).toBe(1);
    expect(result.line10.toNumber()).toBe(1);
    // 1 * 0.062 = 0.062 → rounds to 0
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(7); // round(500 * 0.0145)
    expect(result.line13.toNumber()).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════
// Medicare-only government employee tips
// ═══════════════════════════════════════════════════════

describe("Form 4137 Medicare-only government employee tips", () => {
  it("Form 4137 Line 10 - all tips are Medicare-only government tips, SS taxable tips = 0", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
      medicareOnlyGovernmentEmployeeTips: d(5000),
    }, c);

    // socialSecurityComparableTips = 5000 - 5000 = 0
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare still applies on full amount
    expect(result.line12.toNumber()).toBe(73); // round(5000 * 0.0145)
    expect(result.line13.toNumber()).toBe(73);
  });

  it("Form 4137 Line 10 - partial Medicare-only tips reduce SS taxable portion", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(8000),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
      medicareOnlyGovernmentEmployeeTips: d(3000),
    }, c);

    // socialSecurityComparableTips = 8000 - 3000 = 5000
    // line9 = 176100 - 100000 = 76100
    // line10 = min(5000, 76100) = 5000
    expect(result.line10.toNumber()).toBe(5000);
    expect(result.line11.toNumber()).toBe(310); // round(5000 * 0.062)
    // Medicare on full 8000
    expect(result.line12.toNumber()).toBe(116); // round(8000 * 0.0145)
    expect(result.line13.toNumber()).toBe(426);
  });

  it("Form 4137 Line 10 - Medicare-only tips exceed total tips (floored at 0)", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
      medicareOnlyGovernmentEmployeeTips: d(6000), // more than total tips
    }, c);

    // socialSecurityComparableTips = zeroFloor(5000 - 6000) = 0
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(73); // Medicare still on 5000
  });
});

// ═══════════════════════════════════════════════════════
// Zero and edge value inputs
// ═══════════════════════════════════════════════════════

describe("Form 4137 zero and edge value inputs", () => {
  it("Form 4137 - zero unreported tips produces zero tax", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(0),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
    }, c);

    expect(result.line6.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 4137 - negative unreported tips floored at zero", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(-500),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
    }, c);

    expect(result.unreportedTipIncome.toNumber()).toBe(0);
    expect(result.line6.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 4137 - very large unreported tips capped by wage base, Medicare uncapped", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(200000),
      socialSecurityWagesAndTipsAlreadyReported: d(0),
    }, c);

    // SS capped at wage base: min(200000, 176100) = 176100
    expect(result.line10.toNumber()).toBe(176100);
    expect(result.line11.toNumber()).toBe(10918); // round(176100 * 0.062)
    // Medicare on full 200000
    expect(result.line12.toNumber()).toBe(2900); // round(200000 * 0.0145)
    expect(result.line13.toNumber()).toBe(13818);
  });
});

// ═══════════════════════════════════════════════════════
// Line 8 default vs override
// ═══════════════════════════════════════════════════════

describe("Form 4137 Line 8 default vs override", () => {
  it("Form 4137 Line 8 - explicit override takes precedence over W-2 defaults", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(160000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(150000),
      socialSecurityTipsAlreadyReported: d(2000),
    });

    // Override value (160000) should be used, not default sum (150000 + 2000 = 152000)
    expect(result.line8.toNumber()).toBe(160000);
    expect(result.line9.toNumber()).toBe(16100);
  });

  it("Form 4137 Line 8 - defaults sum W-2 Box 3 and Box 7 when no override", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(150000),
      socialSecurityTipsAlreadyReported: d(2000),
    });

    // Default: 150000 + 2000 = 152000
    expect(result.line8.toNumber()).toBe(152000);
    expect(result.line9.toNumber()).toBe(24100);
  });
});

// ═══════════════════════════════════════════════════════
// Rounding boundary tests (spec edge cases)
// ═══════════════════════════════════════════════════════

describe("Form 4137 rounding at SS tax boundary", () => {
  it("Form 4137 Line 11 - $8 of wage-base room: SS tax rounds to $0", () => {
    // 8 * 0.062 = 0.496, rounds to $0
    const result = calculateForm4137({
      unreportedTipIncome: d(500),
      socialSecurityWagesAndTipsAlreadyReported: d(176092),
    }, c);

    expect(result.line10.toNumber()).toBe(8);
    expect(result.line11.toNumber()).toBe(0);
  });

  it("Form 4137 Line 11 - $9 of wage-base room: SS tax rounds to $1", () => {
    // 9 * 0.062 = 0.558, rounds to $1
    const result = calculateForm4137({
      unreportedTipIncome: d(500),
      socialSecurityWagesAndTipsAlreadyReported: d(176091),
    }, c);

    expect(result.line10.toNumber()).toBe(9);
    expect(result.line11.toNumber()).toBe(1);
  });

  it("Form 4137 Line 12 - $34 unreported tips: Medicare tax rounds to $0", () => {
    // 34 * 0.0145 = 0.493, rounds to $0
    const result = calculateForm4137({
      unreportedTipIncome: d(34),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
    }, c);

    expect(result.line12.toNumber()).toBe(0);
  });

  it("Form 4137 Line 12 - $35 unreported tips: Medicare tax rounds to $1", () => {
    // 35 * 0.0145 = 0.5075, rounds to $1
    const result = calculateForm4137({
      unreportedTipIncome: d(35),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
    }, c);

    expect(result.line12.toNumber()).toBe(1);
  });
});
