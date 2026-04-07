/**
 * Tests for Illinois Schedule IL-E/EIC — Exemption and Earned Income Credit
 * Spec: spec/state/il-schedule-e-eic.yaml
 *
 * 2025: IL EITC = 20% of federal EIC, IL CTC = 40% of IL EITC (child under 12)
 * Source: Illinois Department of Revenue, 2025 Schedule IL-E/EIC Instructions
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateScheduleEEIC,
  IL_SCHEDULE_E_EIC_CONSTANTS,
  type ScheduleEEICInput,
  type ILDependent,
} from "@/engine/state/il-schedule-e-eic.js";

const d = (n: number | string) => new Decimal(n);
const ZERO = d(0);

function makeDep(overrides: Partial<ILDependent> = {}): ILDependent {
  return {
    relationship: "child",
    isUnder12: false,
    monthsInHome: 12,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScheduleEEICInput> = {}): ScheduleEEICInput {
  return {
    taxYear: 2025,
    dependents: [],
    federalEIC: ZERO,
    ...overrides,
  };
}

describe("Illinois Schedule IL-E/EIC", () => {
  // ==================== Constants ====================

  it("2025 constants are correct", () => {
    const c = IL_SCHEDULE_E_EIC_CONSTANTS[2025];
    expect(c.eitcRate.toNumber()).toBe(0.20);
    expect(c.childTaxCreditRate.toNumber()).toBe(0.40);
  });

  it("throws for unsupported tax year", () => {
    expect(() => calculateScheduleEEIC(makeInput({ taxYear: 2020 })))
      .toThrow("IL Schedule IL-E/EIC constants not available for tax year 2020");
  });

  // ==================== Step 2: Dependent Information ====================

  describe("Step 2 - Dependent Listing", () => {
    it("Schedule IL-E/EIC Line 1 - dependent exemption allowance is zero with no dependents", () => {
      const result = calculateScheduleEEIC(makeInput({ dependents: [] }));
      expect(result.dependentCount).toBe(0);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(0);
      expect(result.hasChildUnder12).toBe(false);
    });

    it("Schedule IL-E/EIC Line 1 - dependent exemption allowance equals $2,850 per dependent", () => {
      const result = calculateScheduleEEIC(makeInput({
        dependents: [makeDep(), makeDep(), makeDep({ relationship: "parent" })],
      }));
      expect(result.dependentCount).toBe(3);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(8550);
    });

    it("Schedule IL-E/EIC Step 2 - identifies child under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.hasChildUnder12).toBe(true);
    });

    it("Schedule IL-E/EIC Step 2 - no child under 12 when all dependents are older", () => {
      const result = calculateScheduleEEIC(makeInput({
        dependents: [makeDep({ isUnder12: false }), makeDep({ isUnder12: false })],
      }));
      expect(result.hasChildUnder12).toBe(false);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(5700);
    });

    it("Schedule IL-E/EIC Step 2 - mixed ages, at least one child under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        dependents: [
          makeDep({ isUnder12: false }),
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: false }),
        ],
      }));
      expect(result.hasChildUnder12).toBe(true);
      expect(result.dependentCount).toBe(3);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(8550);
    });

    it("Schedule IL-E/EIC Step 2 - dependent listing preserves relationship info", () => {
      const deps: ILDependent[] = [
        makeDep({ relationship: "child", isUnder12: true, monthsInHome: 12 }),
        makeDep({ relationship: "stepchild", isUnder12: false, monthsInHome: 6 }),
      ];
      const result = calculateScheduleEEIC(makeInput({ dependents: deps }));
      expect(result.dependentCount).toBe(2);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(5700);
      expect(result.hasChildUnder12).toBe(true);
    });

    it("Schedule IL-E/EIC Step 2 - rejects dependent months lived in home above 12", () => {
      expect(() => calculateScheduleEEIC(makeInput({
        dependents: [makeDep({ monthsInHome: 13 })],
      }))).toThrow("Schedule IL-E/EIC dependent 1 months in home must be a whole number from 0 through 12");
    });

    it("Schedule IL-E/EIC Step 3 - rejects qualifying child months lived in home above 12", () => {
      expect(() => calculateScheduleEEIC(makeInput({
        qualifyingChildren: [makeDep({ monthsInHome: 13 })],
      }))).toThrow("Schedule IL-E/EIC qualifying child 1 months in home must be a whole number from 0 through 12");
    });

    it("Schedule IL-E/EIC Step 3 - qualifying child under 12 does not trigger CTC without a dependent exemption", () => {
      const result = calculateScheduleEEIC(makeInput({
        dependents: [],
        qualifyingChildren: [makeDep({ isUnder12: true })],
        federalEIC: d(3000),
      }));

      expect(result.dependentCount).toBe(0);
      expect(result.dependentExemptionAllowance.toNumber()).toBe(0);
      expect(result.hasChildUnder12).toBe(false);
      expect(result.ilEITC.toNumber()).toBe(600);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });
  });

  // ==================== Step 3: Illinois EITC ====================

  describe("Step 3 - Illinois Earned Income Credit", () => {
    it("Schedule IL-E/EIC Line 2 - federal EIC input flows through", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(5000) }));
      expect(result.federalEIC.toNumber()).toBe(5000);
    });

    it("Schedule IL-E/EIC Line 3a - IL EITC rate is 20% for 2025", () => {
      const c = IL_SCHEDULE_E_EIC_CONSTANTS[2025];
      expect(c.eitcRate.toString()).toBe("0.2");
    });

    it("Schedule IL-E/EIC Line 3 - IL EITC is 20% of federal EIC", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(3000) }));
      // IL EITC = 3000 × 20% = 600
      expect(result.ilEITC.toNumber()).toBe(600);
    });

    it("Schedule IL-E/EIC Line 3 - IL EITC with $1 federal EIC", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(1) }));
      // IL EITC = 1 × 0.20 = 0.20 → rounds to 0
      expect(result.ilEITC.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 3 - IL EITC rounds to nearest dollar", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(3333) }));
      // IL EITC = 3333 × 0.20 = 666.60 → rounds to 667
      expect(result.ilEITC.toNumber()).toBe(667);
    });

    it("Schedule IL-E/EIC Line 3 - IL EITC with large federal EIC", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(7430) }));
      // IL EITC = 7430 × 0.20 = 1486
      expect(result.ilEITC.toNumber()).toBe(1486);
    });

    it("Schedule IL-E/EIC Line 3 - zero federal EIC means zero IL EITC", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: ZERO }));
      expect(result.ilEITC.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 6 - expanded worksheet amount overrides federal EIC when provided", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: ZERO,
        expandedEITCWorksheetCredit: d(1520),
      }));
      // IL EITC = 1520 × 0.20 = 304
      expect(result.federalEIC.toNumber()).toBe(0);
      expect(result.ilEITC.toNumber()).toBe(304);
    });

    it("Schedule IL-E/EIC Line 6 - calculated expanded worksheet amount overrides federal EIC when provided", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: ZERO,
        expandedEITCWorksheet: {
          taxYear: 2025,
          filingStatus: "single",
          qualifyingChildCount: 0,
          form1040Line1z: d(8490),
          excludedMedicaidWaiverPayments: ZERO,
          electedNontaxableCombatPay: ZERO,
          scheduleSELine3: ZERO,
          scheduleSELine4bAnd5a: ZERO,
          scheduleSELine13: ZERO,
          part3NetFarmProfitOrLoss: ZERO,
          part3NetBusinessProfitOrLoss: ZERO,
          statutoryEmployeeIncome: ZERO,
          agi: d(8490),
          investmentIncome: ZERO,
          filedForm2555: false,
          taxpayerOrSpouseUsResidentHalfYear: true,
          mainHomeInUSMoreThanHalfYear: true,
          canBeClaimedAsDependent: false,
          canBeQualifyingChildOfAnother: false,
          separatedSpouseEitcEligible: false,
          hasComplexInvestmentIncome: false,
          primaryAge: 18,
        },
      }));

      expect(result.federalEIC.toNumber()).toBe(0);
      expect(result.eitcBaseCredit.toNumber()).toBe(649);
      expect(result.ilEITC.toNumber()).toBe(130);
    });

    it("Schedule IL-E/EIC Line 6 - manual worksheet override takes precedence over calculated worksheet result", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: ZERO,
        expandedEITCWorksheetCredit: d(500),
        expandedEITCWorksheet: {
          taxYear: 2025,
          filingStatus: "single",
          qualifyingChildCount: 0,
          form1040Line1z: d(8490),
          excludedMedicaidWaiverPayments: ZERO,
          electedNontaxableCombatPay: ZERO,
          scheduleSELine3: ZERO,
          scheduleSELine4bAnd5a: ZERO,
          scheduleSELine13: ZERO,
          part3NetFarmProfitOrLoss: ZERO,
          part3NetBusinessProfitOrLoss: ZERO,
          statutoryEmployeeIncome: ZERO,
          agi: d(8490),
          investmentIncome: ZERO,
          filedForm2555: false,
          taxpayerOrSpouseUsResidentHalfYear: true,
          mainHomeInUSMoreThanHalfYear: true,
          canBeClaimedAsDependent: false,
          canBeQualifyingChildOfAnother: false,
          separatedSpouseEitcEligible: false,
          hasComplexInvestmentIncome: false,
          primaryAge: 18,
        },
      }));

      expect(result.eitcBaseCredit.toNumber()).toBe(500);
      expect(result.ilEITC.toNumber()).toBe(100);
    });

    it("Schedule IL-E/EIC Line 3 - NR allocation reduces IL EITC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        allocationDecimal: d("0.500"),
      }));
      // IL EITC = 5000 × 0.20 × 0.500 = 500
      expect(result.ilEITC.toNumber()).toBe(500);
    });

    it("Schedule IL-E/EIC Line 3 - NR allocation decimal of 1.000 is same as full resident", () => {
      const full = calculateScheduleEEIC(makeInput({ federalEIC: d(4000) }));
      const withDecimal = calculateScheduleEEIC(makeInput({
        federalEIC: d(4000),
        allocationDecimal: d("1.000"),
      }));
      expect(withDecimal.ilEITC.toNumber()).toBe(full.ilEITC.toNumber());
    });

    it("Schedule IL-E/EIC Line 3 - NR allocation decimal of zero produces zero EITC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        allocationDecimal: d(0),
      }));
      expect(result.ilEITC.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 3 - NR allocation decimal rounds EITC correctly", () => {
      // 3333 × 0.20 × 0.750 = 499.95 → rounds to 500
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3333),
        allocationDecimal: d("0.750"),
      }));
      expect(result.ilEITC.toNumber()).toBe(500);
    });

    it("Schedule IL-E/EIC Line 3 - small NR allocation decimal", () => {
      // 1000 × 0.20 × 0.100 = 20
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(1000),
        allocationDecimal: d("0.100"),
      }));
      expect(result.ilEITC.toNumber()).toBe(20);
    });

    it("Schedule IL-E/EIC Line 3 - rejects allocation decimals above 1", () => {
      expect(() => calculateScheduleEEIC(makeInput({
        federalEIC: d(1000),
        allocationDecimal: d("1.001"),
      }))).toThrow("Schedule IL-E/EIC allocation decimal must be between 0 and 1 inclusive");
    });

    it("Schedule IL-E/EIC Line 3 - rejects negative allocation decimals", () => {
      expect(() => calculateScheduleEEIC(makeInput({
        federalEIC: d(1000),
        allocationDecimal: d("-0.001"),
      }))).toThrow("Schedule IL-E/EIC allocation decimal must be between 0 and 1 inclusive");
    });
  });

  // ==================== Step 4: Illinois Child Tax Credit ====================

  describe("Step 4 - Illinois Child Tax Credit", () => {
    it("Schedule IL-E/EIC Line 5a - IL CTC rate is 40% for 2025", () => {
      const c = IL_SCHEDULE_E_EIC_CONSTANTS[2025];
      expect(c.childTaxCreditRate.toString()).toBe("0.4");
    });

    it("Schedule IL-E/EIC Line 4 - carries IL EITC from Line 3", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3000),
        dependents: [makeDep({ isUnder12: true })],
      }));
      // Verify Line 4 = Line 3 (IL EITC) by checking CTC = EITC × 40%
      // IL EITC = 600, CTC = 600 × 40% = 240
      expect(result.ilEITC.toNumber()).toBe(600);
      expect(result.ilChildTaxCredit.toNumber()).toBe(240);
    });

    it("Schedule IL-E/EIC Line 5 - IL CTC is 40% of IL EITC with child under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        dependents: [makeDep({ isUnder12: true })],
      }));
      // IL EITC = 5000 × 0.20 = 1000, CTC = 1000 × 0.40 = 400
      expect(result.ilChildTaxCredit.toNumber()).toBe(400);
    });

    it("Schedule IL-E/EIC Line 5 - no CTC without child under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        dependents: [makeDep({ isUnder12: false })],
      }));
      // IL EITC = 1000, but no qualifying child under 12
      expect(result.ilEITC.toNumber()).toBe(1000);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 5 - no CTC with zero IL EITC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: ZERO,
        dependents: [makeDep({ isUnder12: true })],
      }));
      // Has child under 12 but no EITC → no CTC
      expect(result.ilEITC.toNumber()).toBe(0);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 5 - expanded worksheet amount also drives CTC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: ZERO,
        expandedEITCWorksheetCredit: d(1520),
        dependents: [makeDep({ isUnder12: true })],
      }));
      // IL EITC = 304, CTC = 304 × 0.40 = 121.6 → 122
      expect(result.ilEITC.toNumber()).toBe(304);
      expect(result.ilChildTaxCredit.toNumber()).toBe(122);
    });

    it("Schedule IL-E/EIC Line 5 - additional ITIN child can increase Illinois EITC and CTC above the federal amount", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3400),
        dependents: [
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: false }),
        ],
        expandedEITCWorksheet: {
          taxYear: 2025,
          filingStatus: "single",
          qualifyingChildCount: 2,
          form1040Line1z: d(10000),
          excludedMedicaidWaiverPayments: ZERO,
          electedNontaxableCombatPay: ZERO,
          scheduleSELine3: ZERO,
          scheduleSELine4bAnd5a: ZERO,
          scheduleSELine13: ZERO,
          part3NetFarmProfitOrLoss: ZERO,
          part3NetBusinessProfitOrLoss: ZERO,
          statutoryEmployeeIncome: ZERO,
          agi: d(10000),
          investmentIncome: ZERO,
          filedForm2555: false,
          taxpayerOrSpouseUsResidentHalfYear: true,
          canBeClaimedAsDependent: false,
          canBeQualifyingChildOfAnother: false,
          separatedSpouseEitcEligible: false,
          hasComplexInvestmentIncome: false,
          primaryAge: 30,
        },
      }));

      expect(result.eitcBaseCredit.toNumber()).toBe(4000);
      expect(result.ilEITC.toNumber()).toBe(800);
      expect(result.ilChildTaxCredit.toNumber()).toBe(320);
    });

    it("Schedule IL-E/EIC Line 5 - no CTC with no dependents at all", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3000),
        dependents: [],
      }));
      expect(result.ilEITC.toNumber()).toBe(600);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 5 - Step 3 qualifying child age 12 or older does not trigger CTC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3000),
        dependents: [],
        qualifyingChildren: [makeDep({ isUnder12: false })],
      }));
      expect(result.dependentCount).toBe(0);
      expect(result.hasChildUnder12).toBe(false);
      expect(result.ilEITC.toNumber()).toBe(600);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 5 - CTC rounds to nearest dollar", () => {
      // federal EIC = 3333, IL EITC = 666.60 → 667
      // CTC = 667 × 0.40 = 266.80 → 267
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3333),
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.ilEITC.toNumber()).toBe(667);
      expect(result.ilChildTaxCredit.toNumber()).toBe(267);
    });

    it("Schedule IL-E/EIC Line 5 - NR allocation reduces CTC through EITC", () => {
      // federal EIC = 5000, allocation = 0.500
      // IL EITC = 5000 × 0.20 × 0.500 = 500
      // IL CTC = 500 × 0.40 = 200
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        allocationDecimal: d("0.500"),
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.ilEITC.toNumber()).toBe(500);
      expect(result.ilChildTaxCredit.toNumber()).toBe(200);
    });

    it("Schedule IL-E/EIC Line 5 - NR zero allocation means zero CTC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(5000),
        allocationDecimal: d(0),
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.ilEITC.toNumber()).toBe(0);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Schedule IL-E/EIC Line 5 - multiple children, only one under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(4000),
        dependents: [
          makeDep({ isUnder12: false }),
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: false }),
        ],
      }));
      // IL EITC = 800, CTC = 320
      expect(result.ilEITC.toNumber()).toBe(800);
      expect(result.ilChildTaxCredit.toNumber()).toBe(320);
    });

    it("Schedule IL-E/EIC Line 5 - all children under 12", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(4000),
        dependents: [
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: true }),
        ],
      }));
      // IL EITC = 800, CTC = 320
      expect(result.ilEITC.toNumber()).toBe(800);
      expect(result.ilChildTaxCredit.toNumber()).toBe(320);
    });
  });

  // ==================== Summary / Integration ====================

  describe("Summary and Output Flows", () => {
    it("Schedule IL-E/EIC summary - all outputs flow to IL-1040", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3000),
        dependents: [
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: false }),
        ],
      }));
      // Dependent count → IL-1040 Line 10d (× $2,850 = $5,700)
      expect(result.dependentCount).toBe(2);
      // IL EITC → IL-1040 Line 29
      expect(result.ilEITC.toNumber()).toBe(600);
      // IL CTC → IL-1040 Line 30
      expect(result.ilChildTaxCredit.toNumber()).toBe(240);
    });

    it("Audit trail includes all computed lines", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(2000),
        dependents: [makeDep({ isUnder12: true })],
      }));
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("1");   // dependent count
      expect(lineNumbers).toContain("2");   // federal EIC
      expect(lineNumbers).toContain("3a");  // EITC rate
      expect(lineNumbers).toContain("3");   // IL EITC
      expect(lineNumbers).toContain("4");   // EITC carry
      expect(lineNumbers).toContain("5a");  // CTC rate
      expect(lineNumbers).toContain("5");   // IL CTC
    });

    it("Audit trail records correct form name", () => {
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(1000) }));
      expect(result.lines.every((l) => l.form === "Schedule IL-E/EIC")).toBe(true);
    });
  });

  // ==================== Edge Cases ====================

  describe("Edge Cases", () => {
    it("Maximum federal EIC (3+ children) produces correct IL credits", () => {
      // 2025 max federal EIC for 3+ children ≈ $7,830 (approximate)
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(7830),
        dependents: [
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: true }),
          makeDep({ isUnder12: true }),
        ],
      }));
      // IL EITC = 7830 × 0.20 = 1566
      expect(result.ilEITC.toNumber()).toBe(1566);
      // IL CTC = 1566 × 0.40 = 626.40 → 626
      expect(result.ilChildTaxCredit.toNumber()).toBe(626);
    });

    it("Very small federal EIC produces zero IL EITC due to rounding", () => {
      // $2 × 0.20 = 0.40 → rounds to 0
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(2) }));
      expect(result.ilEITC.toNumber()).toBe(0);
    });

    it("Federal EIC of $3 produces IL EITC of $1", () => {
      // $3 × 0.20 = 0.60 → rounds to 1
      const result = calculateScheduleEEIC(makeInput({ federalEIC: d(3) }));
      expect(result.ilEITC.toNumber()).toBe(1);
    });

    it("EITC of $1 with child under 12 produces zero CTC due to rounding", () => {
      // IL EITC = $1, CTC = 1 × 0.40 = 0.40 → rounds to 0
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(3),
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.ilEITC.toNumber()).toBe(1);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });

    it("Part-year resident with low allocation still gets proportional credits", () => {
      // federal EIC = 6000, allocation = 0.250
      // IL EITC = 6000 × 0.20 × 0.250 = 300
      // IL CTC = 300 × 0.40 = 120
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(6000),
        allocationDecimal: d("0.250"),
        dependents: [makeDep({ isUnder12: true })],
      }));
      expect(result.ilEITC.toNumber()).toBe(300);
      expect(result.ilChildTaxCredit.toNumber()).toBe(120);
    });

    it("Dependent with only partial year in home still counts", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(2000),
        dependents: [makeDep({ isUnder12: true, monthsInHome: 3 })],
      }));
      // Still counts as a dependent and under-12 child
      expect(result.dependentCount).toBe(1);
      expect(result.hasChildUnder12).toBe(true);
      expect(result.ilEITC.toNumber()).toBe(400);
      expect(result.ilChildTaxCredit.toNumber()).toBe(160);
    });

    it("Foster child relationship qualifies", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(2000),
        dependents: [makeDep({ relationship: "foster child", isUnder12: true })],
      }));
      expect(result.dependentCount).toBe(1);
      expect(result.hasChildUnder12).toBe(true);
    });

    it("Parent as dependent does not trigger child-under-12 CTC", () => {
      const result = calculateScheduleEEIC(makeInput({
        federalEIC: d(2000),
        dependents: [makeDep({ relationship: "parent", isUnder12: false })],
      }));
      expect(result.dependentCount).toBe(1);
      expect(result.hasChildUnder12).toBe(false);
      expect(result.ilEITC.toNumber()).toBe(400);
      expect(result.ilChildTaxCredit.toNumber()).toBe(0);
    });
  });
});
