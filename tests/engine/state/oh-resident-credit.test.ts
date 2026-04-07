/**
 * Tests for Ohio Resident Credit — Credit for Taxes Paid to Another State.
 * Spec: spec/state/oh-resident-credit.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateOhioResidentCredit } from "@/engine/state/oh-resident-credit.js";

describe("Ohio Resident Credit", () => {
  // -------------------------------------------------------------------------
  // Basic single-state cases
  // -------------------------------------------------------------------------

  it("OH Resident Credit - double-taxed income flows through", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 50000, taxPaid: 2000 },
      ],
    });
    expect(result.stateDetails[0]!.doubleTaxedIncome.toNumber()).toBe(50000);
  });

  it("OH Resident Credit - Ohio AGI from IT 1040", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [],
    });
    expect(result.ohioAgi.toNumber()).toBe(75000);
  });

  it("OH Resident Credit - Ohio tax before credits", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [],
    });
    expect(result.ohioTaxBeforeCredits.toNumber()).toBe(1800);
  });

  it("OH Resident Credit - tax paid to other state", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 50000, taxPaid: 2000 },
      ],
    });
    expect(result.stateDetails[0]!.taxPaidToOtherState.toNumber()).toBe(2000);
  });

  // -------------------------------------------------------------------------
  // Apportionment fraction
  // -------------------------------------------------------------------------

  it("OH Resident Credit - apportionment fraction basic calculation", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 1200 },
      ],
    });
    // 40000 / 100000 = 0.4
    expect(result.stateDetails[0]!.apportionmentFraction.toNumber()).toBe(0.4);
  });

  it("OH Resident Credit - apportionment fraction capped at 1.0", () => {
    // Double-taxed income exceeds Ohio AGI (e.g., due to Ohio deductions)
    const result = calculateOhioResidentCredit({
      ohioAgi: 30000,
      ohioTaxBeforeCredits: 500,
      otherStates: [
        { stateCode: "IN", incomeType: "other", doubleTaxedIncome: 45000, taxPaid: 1500 },
      ],
    });
    expect(result.stateDetails[0]!.apportionmentFraction.toNumber()).toBe(1);
  });

  it("OH Resident Credit - fraction equals 1.0 when all income is double-taxed", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 60000,
      ohioTaxBeforeCredits: 1200,
      otherStates: [
        { stateCode: "WV", incomeType: "other", doubleTaxedIncome: 60000, taxPaid: 3000 },
      ],
    });
    expect(result.stateDetails[0]!.apportionmentFraction.toNumber()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Ohio tax on other-state income (W5)
  // -------------------------------------------------------------------------

  it("OH Resident Credit - Ohio tax on other-state income", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 1200 },
      ],
    });
    // 0.4 × 2000 = 800
    expect(result.stateDetails[0]!.ohioTaxOnOtherStateIncome.toNumber()).toBe(800);
  });

  it("OH Resident Credit - Ohio tax portion rounds to nearest dollar", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 70000,
      ohioTaxBeforeCredits: 1500,
      otherStates: [
        { stateCode: "MI", incomeType: "other", doubleTaxedIncome: 33333, taxPaid: 1400 },
      ],
    });
    // 33333 / 70000 = 0.47618571..., × 1500 = 714.278..., rounds to 714
    expect(result.stateDetails[0]!.ohioTaxOnOtherStateIncome.toNumber()).toBe(714);
  });

  // -------------------------------------------------------------------------
  // Per-state credit (W7) — lesser of Ohio portion and other state tax
  // -------------------------------------------------------------------------

  it("OH Resident Credit - per-state credit is lesser of Ohio portion and other state tax", () => {
    // Other state tax ($1200) > Ohio portion ($800) → credit = $800
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 1200 },
      ],
    });
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(800);
  });

  it("OH Resident Credit - reciprocity-state compensation yields zero credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 65000,
      ohioTaxBeforeCredits: 1354,
      otherStates: [
        {
          stateCode: "KY",
          incomeType: "compensation",
          doubleTaxedIncome: 65000,
          taxPaid: 2600,
        },
      ],
    });

    expect(result.stateDetails[0]!.apportionmentFraction.toNumber()).toBe(0);
    expect(result.stateDetails[0]!.ohioTaxOnOtherStateIncome.toNumber()).toBe(0);
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(0);
    expect(result.totalResidentCredit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - reciprocity-state noncompensation income remains eligible", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 80000,
      ohioTaxBeforeCredits: 1767,
      otherStates: [
        {
          stateCode: "PA",
          incomeType: "other",
          doubleTaxedIncome: 30000,
          taxPaid: 921,
        },
      ],
    });

    expect(result.stateDetails[0]!.credit.toNumber()).toBe(663);
    expect(result.totalResidentCredit.toNumber()).toBe(663);
  });

  it("OH Resident Credit - reciprocity-state entries require income type", () => {
    expect(() =>
      calculateOhioResidentCredit({
        ohioAgi: 65000,
        ohioTaxBeforeCredits: 1354,
        otherStates: [
          { stateCode: "KY", doubleTaxedIncome: 65000, taxPaid: 2600 },
        ],
      })
    ).toThrow(/must specify incomeType/i);
  });

  it("OH Resident Credit - District of Columbia entries are allowed", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 90000,
      ohioTaxBeforeCredits: 2100,
      otherStates: [
        { stateCode: "dc", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 900 },
      ],
    });

    expect(result.stateDetails[0]!.stateCode).toBe("DC");
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(700);
    expect(result.totalResidentCredit.toNumber()).toBe(700);
  });

  it("OH Resident Credit - Ohio state code is rejected", () => {
    expect(() =>
      calculateOhioResidentCredit({
        ohioAgi: 65000,
        ohioTaxBeforeCredits: 1354,
        otherStates: [
          { stateCode: "OH", incomeType: "other", doubleTaxedIncome: 65000, taxPaid: 2600 },
        ],
      })
    ).toThrow(/another U\.S\. state or DC/i);
  });

  it("OH Resident Credit - territory codes are rejected", () => {
    expect(() =>
      calculateOhioResidentCredit({
        ohioAgi: 65000,
        ohioTaxBeforeCredits: 1354,
        otherStates: [
          { stateCode: "PR", incomeType: "other", doubleTaxedIncome: 65000, taxPaid: 2600 },
        ],
      })
    ).toThrow(/another U\.S\. state or DC/i);
  });

  it("OH Resident Credit - credit limited by other state tax when lower", () => {
    // Other state tax ($300) < Ohio portion ($800) → credit = $300
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "IN", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 300 },
      ],
    });
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(300);
  });

  it("OH Resident Credit - credit limited by Ohio tax portion when lower", () => {
    // Ohio portion ($400) < other state tax ($2500) → credit = $400
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 2500 },
      ],
    });
    // 20000/100000 = 0.2, 0.2 × 2000 = 400
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Multiple states
  // -------------------------------------------------------------------------

  it("OH Resident Credit - multiple states computed independently", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 800 },
        { stateCode: "IL", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 300 },
      ],
    });
    expect(result.stateDetails).toHaveLength(2);
    // NY: 30000/100000 = 0.3, 0.3 × 2000 = 600, min(600, 800) = 600
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(600);
    // IL: 20000/100000 = 0.2, 0.2 × 2000 = 400, min(400, 300) = 300
    expect(result.stateDetails[1]!.credit.toNumber()).toBe(300);
    // Total: 600 + 300 = 900
    expect(result.totalResidentCredit.toNumber()).toBe(900);
  });

  it("OH Resident Credit - multiple states preserves state codes", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 80000,
      ohioTaxBeforeCredits: 1500,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 600 },
        { stateCode: "NC", incomeType: "other", doubleTaxedIncome: 10000, taxPaid: 400 },
      ],
    });
    expect(result.stateDetails[0]!.stateCode).toBe("NY");
    expect(result.stateDetails[1]!.stateCode).toBe("NC");
  });

  // -------------------------------------------------------------------------
  // Total credit cap
  // -------------------------------------------------------------------------

  it("OH Resident Credit - total credit capped at Ohio tax before credits", () => {
    // Two states: credits sum to more than Ohio tax
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 1000,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 60000, taxPaid: 3000 },
        { stateCode: "NJ", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 2000 },
      ],
    });
    // NY: 0.6 × 1000 = 600, min(600, 3000) = 600
    // NJ: 0.4 × 1000 = 400, min(400, 2000) = 400
    // Sum = 1000, cap = 1000 → total = 1000
    expect(result.totalResidentCredit.toNumber()).toBe(1000);
  });

  it("OH Resident Credit - total credit below Ohio tax cap", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 3000,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 500 },
      ],
    });
    // 0.2 × 3000 = 600, min(600, 500) = 500
    expect(result.totalResidentCredit.toNumber()).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Zero and edge cases
  // -------------------------------------------------------------------------

  it("OH Resident Credit - no other states yields zero credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [],
    });
    expect(result.totalResidentCredit.toNumber()).toBe(0);
    expect(result.stateDetails).toHaveLength(0);
  });

  it("OH Resident Credit - zero Ohio AGI yields zero credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 0,
      ohioTaxBeforeCredits: 0,
      otherStates: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 1000 },
      ],
    });
    expect(result.totalResidentCredit.toNumber()).toBe(0);
    expect(result.stateDetails).toHaveLength(0);
  });

  it("OH Resident Credit - negative Ohio AGI yields zero credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: -5000,
      ohioTaxBeforeCredits: 0,
      otherStates: [
        { stateCode: "PA", incomeType: "other", doubleTaxedIncome: 10000, taxPaid: 300 },
      ],
    });
    expect(result.totalResidentCredit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - zero Ohio tax before credits yields zero credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 20000,
      ohioTaxBeforeCredits: 0,
      otherStates: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 15000, taxPaid: 500 },
      ],
    });
    expect(result.totalResidentCredit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - zero double-taxed income yields zero per-state credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 0, taxPaid: 500 },
      ],
    });
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(0);
    expect(result.totalResidentCredit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - zero tax paid to other state yields zero per-state credit", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 0 },
      ],
    });
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(0);
    expect(result.totalResidentCredit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - negative double-taxed income treated as zero", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: -5000, taxPaid: 200 },
      ],
    });
    expect(result.stateDetails[0]!.doubleTaxedIncome.toNumber()).toBe(0);
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(0);
  });

  it("OH Resident Credit - negative tax paid treated as zero", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: -100 },
      ],
    });
    expect(result.stateDetails[0]!.taxPaidToOtherState.toNumber()).toBe(0);
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Realistic scenarios — common bordering state commuters
  // -------------------------------------------------------------------------

  it("OH Resident Credit - nonreciprocity wage scenario (tax higher than OH portion)", () => {
    // Ohio resident working in NY.
    // Federal AGI = $65,000, Ohio AGI = $65,000 (no adjustments)
    // Ohio tax = $1,413 (from brackets), NY wages = $65,000, NY tax paid = $2,600
    const result = calculateOhioResidentCredit({
      ohioAgi: 65000,
      ohioTaxBeforeCredits: 1413,
      otherStates: [
        { stateCode: "NY", incomeType: "compensation", doubleTaxedIncome: 65000, taxPaid: 2600 },
      ],
    });
    // Fraction: 65000/65000 = 1.0
    // Ohio portion: 1.0 × 1413 = 1413
    // Credit: min(1413, 2600) = 1413
    expect(result.stateDetails[0]!.apportionmentFraction.toNumber()).toBe(1);
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(1413);
    expect(result.totalResidentCredit.toNumber()).toBe(1413);
  });

  it("OH Resident Credit - nonreciprocity wage scenario (tax lower than OH portion)", () => {
    // Ohio resident working in IL.
    // Ohio AGI = $80,000, IL wages = $60,000, IL tax paid = $1,842
    // Ohio tax = $1,826 (from brackets)
    const result = calculateOhioResidentCredit({
      ohioAgi: 80000,
      ohioTaxBeforeCredits: 1826,
      otherStates: [
        { stateCode: "IL", incomeType: "compensation", doubleTaxedIncome: 60000, taxPaid: 1842 },
      ],
    });
    // Fraction: 60000/80000 = 0.75
    // Ohio portion: 0.75 × 1826 = 1369.50, rounds to 1370
    // Credit: min(1370, 1842) = 1370
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(1370);
  });

  it("OH Resident Credit - partial wage income in nonreciprocity state", () => {
    // Ohio AGI = $90,000, only $30,000 from NY job
    // Ohio tax = $2,159, NY tax paid = $1,278
    const result = calculateOhioResidentCredit({
      ohioAgi: 90000,
      ohioTaxBeforeCredits: 2159,
      otherStates: [
        { stateCode: "NY", incomeType: "compensation", doubleTaxedIncome: 30000, taxPaid: 1278 },
      ],
    });
    // Fraction: 30000/90000 = 0.3333...
    // Ohio portion: 0.3333... × 2159 = 719.67, rounds to 720
    // Credit: min(720, 1278) = 720
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(720);
  });

  it("OH Resident Credit - three-state noncompensation scenario", () => {
    // Consultant with noncompensation income in KY, IN, and WV
    // Ohio AGI = $120,000, Ohio tax = $3,019
    const result = calculateOhioResidentCredit({
      ohioAgi: 120000,
      ohioTaxBeforeCredits: 3019,
      otherStates: [
        { stateCode: "KY", incomeType: "other", doubleTaxedIncome: 40000, taxPaid: 1600 },
        { stateCode: "IN", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 936 },
        { stateCode: "WV", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 1100 },
      ],
    });
    // KY: 40000/120000 = 0.3333, 0.3333 × 3019 = 1006.33 → 1006, min(1006, 1600) = 1006
    // IN: 30000/120000 = 0.25, 0.25 × 3019 = 754.75 → 755, min(755, 936) = 755
    // WV: 20000/120000 = 0.1667, 0.1667 × 3019 = 503.17 → 503, min(503, 1100) = 503
    // Total: 1006 + 755 + 503 = 2264, cap = 3019 → 2264
    expect(result.stateDetails[0]!.credit.toNumber()).toBe(1006);
    expect(result.stateDetails[1]!.credit.toNumber()).toBe(755);
    expect(result.stateDetails[2]!.credit.toNumber()).toBe(503);
    expect(result.totalResidentCredit.toNumber()).toBe(2264);
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it("OH Resident Credit - generates audit trail lines", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 75000,
      ohioTaxBeforeCredits: 1800,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 50000, taxPaid: 2000 },
      ],
    });
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.form === "OH-RESIDENT-CREDIT")).toBe(true);
  });

  it("OH Resident Credit - audit trail includes per-state entries", () => {
    const result = calculateOhioResidentCredit({
      ohioAgi: 100000,
      ohioTaxBeforeCredits: 2000,
      otherStates: [
        { stateCode: "NY", incomeType: "other", doubleTaxedIncome: 30000, taxPaid: 800 },
        { stateCode: "NJ", incomeType: "other", doubleTaxedIncome: 20000, taxPaid: 500 },
      ],
    });
    const nyLines = result.lines.filter((l) => l.line?.startsWith("NY/"));
    const njLines = result.lines.filter((l) => l.line?.startsWith("NJ/"));
    expect(nyLines.length).toBeGreaterThan(0);
    expect(njLines.length).toBeGreaterThan(0);
  });
});
