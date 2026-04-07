/**
 * Tests for Schedule R — Credit for the Elderly or the Disabled
 * Spec: spec/federal/schedule-r.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleR, type ScheduleRParams } from "@/engine/forms/schedule-r.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025).elderlyOrDisabledCredit;

function makeParams(overrides: Partial<ScheduleRParams> & {
  filingStatus?: ScheduleRParams["filingStatus"];
  agi?: string | number;
  nontaxableSocialSecurity?: string | number;
}): ScheduleRParams {
  return {
    filingStatus: overrides.filingStatus ?? "single",
    agi: new Decimal(overrides.agi ?? 0),
    nontaxableSocialSecurity: new Decimal(overrides.nontaxableSocialSecurity ?? 0),
    scheduleRInput: overrides.scheduleRInput ?? {
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      primaryDisabilityIncome: "0",
      nontaxablePensionsAnnuities: "0",
    },
    livedWithSpouse: overrides.livedWithSpouse,
    constants,
  };
}

describe("Schedule R — Credit for the Elderly or the Disabled", () => {
  // ── Part I: Eligibility Box Determination ──────────────────

  describe("Part I — eligibility", () => {
    it("Box 1: single filer, age 65+", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(1);
    });

    it("Box 2: single filer, under 65, permanently disabled", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "4000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(2);
    });

    it("Box 3: MFJ, both spouses age 65+", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(3);
    });

    it("Box 4: MFJ, both under 65, one disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "3000",
          spouseQualifies: false,
          spouseAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(4);
    });

    it("Box 5: MFJ, both under 65, both disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "2000",
          spouseQualifies: true,
          spouseAge65OrOlder: false,
          spouseDisabilityIncome: "1500",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(5);
    });

    it("Box 6: MFJ, one 65+, other under 65 and not disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: false,
          spouseAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(6);
    });

    it("Box 7: MFJ, one 65+, other under 65 and disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: false,
          spouseDisabilityIncome: "6000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(7);
    });

    it("Box 7 reversed: MFJ, spouse 65+, primary under 65 and disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "4000",
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(7);
    });

    it("Box 8: MFS, age 65+, lived apart all year", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        livedWithSpouse: false,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(8);
    });

    it("Box 9: MFS, under 65, disabled, lived apart all year", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        livedWithSpouse: false,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "3000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(9);
    });

    it("MFS filer who lived with spouse is ineligible", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        livedWithSpouse: true,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(false);
      expect(result.credit.isZero()).toBe(true);
    });

    it("Single filer under 65 who is not disabled is ineligible", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: false,
          primaryAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(false);
      expect(result.credit.isZero()).toBe(true);
    });

    it("MFJ neither spouse qualifies is ineligible", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: false,
          primaryAge65OrOlder: false,
          spouseQualifies: false,
          spouseAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(false);
    });

    it("HoH filer, age 65+ gets Box 1", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "head_of_household",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(1);
    });

    it("QSS filer, under 65, disabled gets Box 2", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "qualifying_surviving_spouse",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "5000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.eligible).toBe(true);
      expect(result.box).toBe(2);
    });
  });

  // ── Line 10: Initial Amount ────────────────────────────────

  describe("Line 10 — initial amount", () => {
    it("Single/HoH/QSS gets $5,000", () => {
      const result = calculateScheduleR(makeParams({}));
      expect(result.initialAmount.toNumber()).toBe(5000);
    });

    it("MFJ both qualifying gets $7,500", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.initialAmount.toNumber()).toBe(7500);
    });

    it("MFJ one qualifying gets $5,000", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: false,
          spouseAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.initialAmount.toNumber()).toBe(5000);
    });

    it("MFS gets $3,750", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        livedWithSpouse: false,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.initialAmount.toNumber()).toBe(3750);
    });
  });

  // ── Lines 11-12: Disability Income Cap ─────────────────────

  describe("Line 11-12 — disability income cap", () => {
    it("Age 65+ filer has no disability cap (Line 12 = Line 10)", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.adjustedInitialAmount.toNumber()).toBe(5000);
    });

    it("Disabled filer with disability income less than initial amount is capped", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "3000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.box).toBe(2);
      expect(result.adjustedInitialAmount.toNumber()).toBe(3000);
    });

    it("Disabled filer with disability income exceeding initial amount uses initial amount", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "8000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.adjustedInitialAmount.toNumber()).toBe(5000);
    });

    it("Disabled filer with zero disability income gets zero adjusted amount", () => {
      const result = calculateScheduleR(makeParams({
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "0",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.adjustedInitialAmount.toNumber()).toBe(0);
      expect(result.credit.isZero()).toBe(true);
    });

    it("MFJ Box 5 (both disabled) sums both spouses' disability income", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "2000",
          spouseQualifies: true,
          spouseAge65OrOlder: false,
          spouseDisabilityIncome: "1500",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.box).toBe(5);
      // min(7500, 2000+1500) = min(7500, 3500) = 3500
      expect(result.adjustedInitialAmount.toNumber()).toBe(3500);
    });

    it("MFJ Box 7 uses disabled spouse's disability income (primary 65+, spouse disabled)", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: false,
          spouseDisabilityIncome: "4000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.box).toBe(7);
      // min(7500, 4000) = 4000... wait, for Box 7, the disability cap applies
      // only to the disabled spouse's portion. But the IRS form says:
      // "If you checked Box 7: Enter the smaller of Line 10 or Line 11"
      // Line 11 for Box 7 is the younger disabled spouse's disability income.
      // But both qualify, so initial amount = $7,500.
      // Hmm, actually looking at the IRS instructions more carefully:
      // For Box 7, the disability income cap only applies to the disabled spouse.
      // The 65+ spouse's $5,000 is not capped. But the form says
      // "smaller of line 10 or line 11" where line 10 is $7,500 total.
      // Actually the IRS form treats Box 7 differently. Let me check again.
      //
      // Per IRS Schedule R instructions for Line 11:
      // If you checked Box 7: "Enter your [disabled] spouse's taxable disability income"
      // Line 12: "Smaller of line 10 or line 11"
      //
      // So the ENTIRE $7,500 is capped by the disabled spouse's disability income.
      // This means if the disabled spouse has $4,000 in disability income,
      // the adjusted amount is min($7,500, $4,000) = $4,000.
      expect(result.adjustedInitialAmount.toNumber()).toBe(4000);
    });
  });

  // ── Lines 13-14: Nontaxable Benefits ───────────────────────

  describe("Lines 13-14 — nontaxable benefits reduction", () => {
    it("Nontaxable Social Security reduces the credit base", () => {
      const result = calculateScheduleR(makeParams({
        nontaxableSocialSecurity: 2000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // Line 12: $5,000, Line 13c: $2,000, Line 14: $3,000
      expect(result.netInitialAmount.toNumber()).toBe(3000);
    });

    it("Nontaxable pensions reduce the credit base", () => {
      const result = calculateScheduleR(makeParams({
        nontaxableSocialSecurity: 0,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "1500",
        },
      }));
      expect(result.netInitialAmount.toNumber()).toBe(3500);
    });

    it("Combined nontaxable benefits reduce the credit base", () => {
      const result = calculateScheduleR(makeParams({
        nontaxableSocialSecurity: 1000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "1500",
        },
      }));
      // Line 13c: 1000 + 1500 = 2500
      // Line 14: max(0, 5000 - 2500) = 2500
      expect(result.nontaxableBenefits.toNumber()).toBe(2500);
      expect(result.netInitialAmount.toNumber()).toBe(2500);
    });

    it("Nontaxable benefits exceeding adjusted amount zeroes out the credit", () => {
      const result = calculateScheduleR(makeParams({
        nontaxableSocialSecurity: 6000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.netInitialAmount.toNumber()).toBe(0);
      expect(result.credit.isZero()).toBe(true);
    });
  });

  // ── Lines 15-18: AGI Reduction ─────────────────────────────

  describe("Lines 16-18 — AGI reduction", () => {
    it("Single filer at or below $7,500 AGI threshold gets no AGI reduction", () => {
      const result = calculateScheduleR(makeParams({
        agi: 7500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.agiReduction.toNumber()).toBe(0);
      // Full credit: 15% × $5,000 = $750
      expect(result.credit.toNumber()).toBe(750);
    });

    it("Single filer AGI $12,500 gets $2,500 AGI reduction", () => {
      const result = calculateScheduleR(makeParams({
        agi: 12500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // excess = $12,500 - $7,500 = $5,000
      // reduction = $5,000 × 0.5 = $2,500
      expect(result.agiReduction.toNumber()).toBe(2500);
      // credit base = $5,000 - $2,500 = $2,500
      // credit = $2,500 × 0.15 = $375
      expect(result.credit.toNumber()).toBe(375);
    });

    it("Single filer, 65+, AGI $17,500 phases out completely", () => {
      const result = calculateScheduleR(makeParams({
        agi: 17500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // excess = $17,500 - $7,500 = $10,000
      // reduction = $10,000 × 0.5 = $5,000
      // credit base = max(0, $5,000 - $5,000) = $0
      expect(result.creditBase.toNumber()).toBe(0);
      expect(result.credit.isZero()).toBe(true);
    });

    it("MFJ AGI threshold is $10,000", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        agi: 10000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.agiReduction.toNumber()).toBe(0);
      // Full credit: 15% × $7,500 = $1,125
      expect(result.credit.toNumber()).toBe(1125);
    });

    it("MFJ both 65+, AGI $25,000 phases out completely", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        agi: 25000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // excess = $25,000 - $10,000 = $15,000
      // reduction = $15,000 × 0.5 = $7,500
      // credit base = max(0, $7,500 - $7,500) = $0
      expect(result.credit.isZero()).toBe(true);
    });

    it("MFS AGI threshold is $5,000", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        agi: 5000,
        livedWithSpouse: false,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.agiReduction.toNumber()).toBe(0);
      // Full MFS credit: 15% × $3,750 = $562.50 → $563 rounded
      expect(result.credit.toNumber()).toBe(563);
    });

    it("MFS AGI $12,500 phases out completely", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_separately",
        agi: 12500,
        livedWithSpouse: false,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // excess = $12,500 - $5,000 = $7,500
      // reduction = $7,500 × 0.5 = $3,750
      // credit base = max(0, $3,750 - $3,750) = $0
      expect(result.credit.isZero()).toBe(true);
    });
  });

  // ── Line 20: Full Credit Calculation ───────────────────────

  describe("Line 20 — credit calculation", () => {
    it("Single filer, 65+, AGI $0, no nontaxable benefits → maximum $750 credit", () => {
      const result = calculateScheduleR(makeParams({
        agi: 0,
        nontaxableSocialSecurity: 0,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // creditBase = $5,000
      // credit = $5,000 × 0.15 = $750
      expect(result.credit.toNumber()).toBe(750);
    });

    it("MFJ, both 65+, AGI $0, no benefits → maximum $1,125 credit", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        agi: 0,
        nontaxableSocialSecurity: 0,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: true,
          spouseAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // creditBase = $7,500
      // credit = $7,500 × 0.15 = $1,125
      expect(result.credit.toNumber()).toBe(1125);
    });

    it("Single, 65+, AGI $10,000, $1,000 nontaxable SS → combined reduction", () => {
      const result = calculateScheduleR(makeParams({
        agi: 10000,
        nontaxableSocialSecurity: 1000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // Line 12: $5,000
      // Line 13c: $1,000 (nontaxable SS)
      // Line 14: $5,000 - $1,000 = $4,000
      // Line 17: $10,000 - $7,500 = $2,500
      // Line 18: $2,500 × 0.5 = $1,250
      // Line 19: $4,000 - $1,250 = $2,750
      // Line 20: $2,750 × 0.15 = $412.50 → $413
      expect(result.credit.toNumber()).toBe(413);
    });

    it("Single, disabled, AGI $5,000, disability income $3,500 → capped credit", () => {
      const result = calculateScheduleR(makeParams({
        agi: 5000,
        nontaxableSocialSecurity: 0,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: false,
          primaryDisabilityIncome: "3500",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // Line 10: $5,000
      // Line 11: $3,500 (disability income)
      // Line 12: min($5,000, $3,500) = $3,500
      // Line 14: $3,500 - $0 = $3,500
      // Line 17: max(0, $5,000 - $7,500) = $0
      // Line 18: $0
      // Line 19: $3,500
      // Line 20: $3,500 × 0.15 = $525
      expect(result.credit.toNumber()).toBe(525);
    });

    it("HoH, 65+, AGI $15,000, $2,000 nontaxable SS, $500 nontaxable pension", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "head_of_household",
        agi: 15000,
        nontaxableSocialSecurity: 2000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "500",
        },
      }));
      // Line 12: $5,000
      // Line 13c: $2,000 + $500 = $2,500
      // Line 14: $5,000 - $2,500 = $2,500
      // Line 17: $15,000 - $7,500 = $7,500
      // Line 18: $7,500 × 0.5 = $3,750
      // Line 19: max(0, $2,500 - $3,750) = $0
      expect(result.credit.isZero()).toBe(true);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────

  describe("Edge cases", () => {
    it("AGI exactly at threshold produces no AGI reduction", () => {
      const result = calculateScheduleR(makeParams({
        agi: 7500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.agiReduction.isZero()).toBe(true);
      expect(result.credit.toNumber()).toBe(750);
    });

    it("AGI $1 over threshold produces $1 AGI reduction (rounding)", () => {
      const result = calculateScheduleR(makeParams({
        agi: 7501,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      // excess = $1, reduction = $0.50 → rounded to $1
      expect(result.agiReduction.toNumber()).toBe(1);
      // credit base = $5,000 - $1 = $4,999
      // credit = $4,999 × 0.15 = $749.85 → $750
      expect(result.credit.toNumber()).toBe(750);
    });

    it("MFJ one 65+ spouse only gets $5,000 (not $7,500)", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        agi: 0,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          spouseQualifies: false,
          spouseAge65OrOlder: false,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.initialAmount.toNumber()).toBe(5000);
      expect(result.credit.toNumber()).toBe(750);
    });

    it("Nontaxable benefits exactly equal adjusted amount → zero credit", () => {
      const result = calculateScheduleR(makeParams({
        nontaxableSocialSecurity: 5000,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.netInitialAmount.isZero()).toBe(true);
      expect(result.credit.isZero()).toBe(true);
    });

    it("Audit trail records all line values", () => {
      const result = calculateScheduleR(makeParams({
        agi: 10000,
        nontaxableSocialSecurity: 500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "200",
        },
      }));
      expect(result.lines.length).toBeGreaterThan(0);
      const lineNumbers = result.lines.map((l) => l.line);
      expect(lineNumbers).toContain("10");
      expect(lineNumbers).toContain("12");
      expect(lineNumbers).toContain("13a");
      expect(lineNumbers).toContain("13b");
      expect(lineNumbers).toContain("13c");
      expect(lineNumbers).toContain("14");
      expect(lineNumbers).toContain("15");
      expect(lineNumbers).toContain("20");
    });

    it("QSS filer uses single/HoH AGI threshold of $7,500", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "qualifying_surviving_spouse",
        agi: 7500,
        scheduleRInput: {
          primaryQualifies: true,
          primaryAge65OrOlder: true,
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.agiReduction.isZero()).toBe(true);
      expect(result.credit.toNumber()).toBe(750);
    });

    it("MFJ Box 4 uses disabled spouse's income when only spouse is disabled", () => {
      const result = calculateScheduleR(makeParams({
        filingStatus: "married_filing_jointly",
        agi: 0,
        scheduleRInput: {
          primaryQualifies: false,
          primaryAge65OrOlder: false,
          spouseQualifies: true,
          spouseAge65OrOlder: false,
          spouseDisabilityIncome: "2000",
          nontaxablePensionsAnnuities: "0",
        },
      }));
      expect(result.box).toBe(4);
      // min($5,000, $2,000) = $2,000
      expect(result.adjustedInitialAmount.toNumber()).toBe(2000);
      // credit = $2,000 × 0.15 = $300
      expect(result.credit.toNumber()).toBe(300);
    });
  });
});
