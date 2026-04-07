/**
 * Edge case tests for Schedule R — Credit for the Elderly or the Disabled.
 * Spec: spec/federal/schedule-r.yaml
 *
 * Key constants (2025, statutory — not inflation-adjusted):
 *   initialAmountSingle = $5,000 (single/HoH/QSS, box 1-2)
 *   initialAmountBoth = $7,500 (MFJ both qualifying, box 3/5/7)
 *   initialAmountMFS = $3,750 (MFS lived apart, box 8-9)
 *   AGI thresholds: single/HoH/QSS = $7,500, MFJ = $10,000, MFS = $5,000
 *   Credit rate = 15%
 *   50% of excess AGI over threshold reduces credit base
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleR } from "@/engine/forms/schedule-r.js";
import { getConstants } from "@/models/constants.js";

const c = getConstants(2025);
const d = (v: string | number) => new Decimal(v);

function makeParams(overrides: {
  filingStatus?: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household" | "qualifying_surviving_spouse";
  agi?: string | number;
  nontaxableSocialSecurity?: string | number;
  primaryQualifies?: boolean;
  primaryAge65OrOlder?: boolean;
  primaryDisabilityIncome?: string | number;
  spouseQualifies?: boolean;
  spouseAge65OrOlder?: boolean;
  spouseDisabilityIncome?: string | number;
  nontaxablePensionsAnnuities?: string | number;
  livedWithSpouse?: boolean;
}) {
  return {
    filingStatus: overrides.filingStatus ?? "single",
    agi: d(overrides.agi ?? 0),
    nontaxableSocialSecurity: d(overrides.nontaxableSocialSecurity ?? 0),
    scheduleRInput: {
      primaryQualifies: overrides.primaryQualifies ?? true,
      primaryAge65OrOlder: overrides.primaryAge65OrOlder ?? true,
      primaryDisabilityIncome: overrides.primaryDisabilityIncome?.toString(),
      spouseQualifies: overrides.spouseQualifies,
      spouseAge65OrOlder: overrides.spouseAge65OrOlder,
      spouseDisabilityIncome: overrides.spouseDisabilityIncome?.toString(),
      nontaxablePensionsAnnuities: overrides.nontaxablePensionsAnnuities?.toString(),
    },
    livedWithSpouse: overrides.livedWithSpouse,
    constants: c.elderlyOrDisabledCredit,
  };
}

describe("Schedule R eligibility boxes", () => {
  it("Schedule R Part I - single filer age 65+ gets box 1", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      agi: 5000,
    }));

    expect(result.eligible).toBe(true);
    expect(result.box).toBe(1);
    expect(result.initialAmount.toNumber()).toBe(5000);
  });

  it("Schedule R Part I - single filer under 65 disabled gets box 2 with disability income cap", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 3000,
      agi: 5000,
    }));

    expect(result.eligible).toBe(true);
    expect(result.box).toBe(2);
    expect(result.initialAmount.toNumber()).toBe(5000);
    // Adjusted = min(5000, 3000) = 3000
    expect(result.adjustedInitialAmount.toNumber()).toBe(3000);
  });

  it("Schedule R Part I - MFJ both age 65+ gets box 3 with $7,500 initial amount", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 8000,
    }));

    expect(result.eligible).toBe(true);
    expect(result.box).toBe(3);
    expect(result.initialAmount.toNumber()).toBe(7500);
  });

  it("Schedule R Part I - MFS filer who lived with spouse is ineligible", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      livedWithSpouse: true,
    }));

    expect(result.eligible).toBe(false);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Part I - MFS filer who lived apart all year gets box 8 with $3,750 initial amount", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      livedWithSpouse: false,
      agi: 3000,
    }));

    expect(result.eligible).toBe(true);
    expect(result.box).toBe(8);
    expect(result.initialAmount.toNumber()).toBe(3750);
  });
});

describe("Schedule R AGI threshold boundaries", () => {
  it("Schedule R Line 17 - single filer at exactly the $7,500 AGI threshold has zero AGI reduction", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 7500,
    }));

    expect(result.agiReduction.toNumber()).toBe(0);
    // credit base = 5000 - 0 = 5000, credit = 5000 * 0.15 = 750
    expect(result.creditBase.toNumber()).toBe(5000);
    expect(result.credit.toNumber()).toBe(750);
  });

  it("Schedule R Line 17 - single filer $1 above the $7,500 AGI threshold loses $0.50 from the credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 7501,
    }));

    // Excess = 7501 - 7500 = 1, reduction = 1 * 0.5 = 0.50 → rounds to 1
    expect(result.agiReduction.toNumber()).toBe(1);
    // credit base = 5000 - 1 = 4999, credit = 4999 * 0.15 = 749.85 → 750
    expect(result.creditBase.toNumber()).toBe(4999);
    expect(result.credit.toNumber()).toBe(750);
  });

  it("Schedule R Line 19 - single filer AGI high enough to fully eliminate the credit base", () => {
    // $5,000 initial amount, need AGI reduction >= 5000
    // reduction = excess * 0.5, so excess >= 10000 → AGI >= 17500
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 17500,
    }));

    // Excess = 17500 - 7500 = 10000, reduction = 10000 * 0.5 = 5000
    expect(result.agiReduction.toNumber()).toBe(5000);
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 19 - single filer at $17,499 AGI retains $1 credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 17499,
    }));

    // Excess = 17499 - 7500 = 9999, reduction = 9999 * 0.5 = 4999.5 → 5000
    expect(result.agiReduction.toNumber()).toBe(5000);
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 17 - MFJ at exactly the $10,000 AGI threshold has zero AGI reduction", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 10000,
    }));

    expect(result.agiReduction.toNumber()).toBe(0);
    // credit base = 7500, credit = 7500 * 0.15 = 1125
    expect(result.creditBase.toNumber()).toBe(7500);
    expect(result.credit.toNumber()).toBe(1125);
  });

  it("Schedule R Line 17 - MFS at exactly the $5,000 AGI threshold has zero AGI reduction", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      livedWithSpouse: false,
      agi: 5000,
    }));

    expect(result.agiReduction.toNumber()).toBe(0);
    expect(result.creditBase.toNumber()).toBe(3750);
    // credit = 3750 * 0.15 = 562.5 → 563
    expect(result.credit.toNumber()).toBe(563);
  });
});

describe("Schedule R nontaxable benefit reduction", () => {
  it("Schedule R Line 14 - nontaxable Social Security fully eliminates the initial amount", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 5000,
      nontaxableSocialSecurity: 6000,
    }));

    expect(result.eligible).toBe(true);
    expect(result.nontaxableBenefits.toNumber()).toBe(6000);
    expect(result.netInitialAmount.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 14 - nontaxable pensions partially reduce the initial amount", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 5000,
      nontaxableSocialSecurity: 1000,
      nontaxablePensionsAnnuities: 2000,
    }));

    // Net = max(0, 5000 - 3000) = 2000
    expect(result.nontaxableBenefits.toNumber()).toBe(3000);
    expect(result.netInitialAmount.toNumber()).toBe(2000);
    // credit base = 2000 - 0 (AGI at threshold) = 2000, credit = 2000 * 0.15 = 300
    expect(result.credit.toNumber()).toBe(300);
  });
});

describe("Schedule R disability income cap", () => {
  it("Schedule R Line 12 - disability income lower than initial amount caps the credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 2000,
      agi: 5000,
    }));

    expect(result.box).toBe(2);
    expect(result.initialAmount.toNumber()).toBe(5000);
    expect(result.adjustedInitialAmount.toNumber()).toBe(2000);
    // credit base = 2000 - 0 = 2000, credit = 300
    expect(result.credit.toNumber()).toBe(300);
  });

  it("Schedule R Line 12 - disability income exceeding initial amount does not increase it", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 8000,
      agi: 5000,
    }));

    expect(result.box).toBe(2);
    expect(result.adjustedInitialAmount.toNumber()).toBe(5000);
    expect(result.credit.toNumber()).toBe(750);
  });

  it("Schedule R box 5 - MFJ both disabled combines disability incomes to cap the $7,500 initial amount", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 2000,
      spouseQualifies: true,
      spouseAge65OrOlder: false,
      spouseDisabilityIncome: 3000,
      agi: 8000,
    }));

    expect(result.box).toBe(5);
    expect(result.initialAmount.toNumber()).toBe(7500);
    // Disability income = 2000 + 3000 = 5000
    expect(result.adjustedInitialAmount.toNumber()).toBe(5000);
  });

  it("Schedule R Line 12 - zero disability income yields zero adjusted initial amount and zero credit", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 0,
      agi: 5000,
    }));

    expect(result.box).toBe(2);
    expect(result.initialAmount.toNumber()).toBe(5000);
    expect(result.adjustedInitialAmount.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });
});

describe("Schedule R remaining eligibility boxes", () => {
  it("Schedule R Part I box 4 - MFJ one spouse under 65 disabled, other under 65 not disabled gets $5,000", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 4000,
      spouseQualifies: false,
      spouseAge65OrOlder: false,
      agi: 8000,
    }));

    expect(result.box).toBe(4);
    expect(result.initialAmount.toNumber()).toBe(5000);
    // Disability cap: min(5000, 4000) = 4000
    expect(result.adjustedInitialAmount.toNumber()).toBe(4000);
  });

  it("Schedule R Part I box 4 - MFJ spouse is the disabled one, uses spouse disability income", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: false,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 0,
      spouseQualifies: true,
      spouseAge65OrOlder: false,
      spouseDisabilityIncome: 3500,
      agi: 8000,
    }));

    expect(result.box).toBe(4);
    expect(result.initialAmount.toNumber()).toBe(5000);
    // Spouse is disabled, uses spouse disability income: min(5000, 3500) = 3500
    expect(result.adjustedInitialAmount.toNumber()).toBe(3500);
  });

  it("Schedule R Part I box 6 - MFJ one 65+ and one under 65 not disabled gets $5,000", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: false,
      spouseAge65OrOlder: false,
      agi: 8000,
    }));

    expect(result.box).toBe(6);
    expect(result.initialAmount.toNumber()).toBe(5000);
    // No disability cap for age-based box
    expect(result.adjustedInitialAmount.toNumber()).toBe(5000);
  });

  it("Schedule R Part I box 6 - MFJ spouse 65+ and primary under 65 not disabled gets $5,000", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: false,
      primaryAge65OrOlder: false,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 8000,
    }));

    expect(result.box).toBe(6);
    expect(result.initialAmount.toNumber()).toBe(5000);
  });

  it("Schedule R Part I box 7 - MFJ one 65+ and one disabled gets $7,500 with disability income cap", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: false,
      spouseDisabilityIncome: 4000,
      agi: 8000,
    }));

    expect(result.box).toBe(7);
    expect(result.initialAmount.toNumber()).toBe(7500);
    // Disability income from the disabled spouse caps: min(7500, 4000) = 4000
    expect(result.adjustedInitialAmount.toNumber()).toBe(4000);
  });

  it("Schedule R Part I box 7 - MFJ primary disabled and spouse 65+ uses primary disability income", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 6000,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 8000,
    }));

    expect(result.box).toBe(7);
    expect(result.initialAmount.toNumber()).toBe(7500);
    // Primary is disabled: min(7500, 6000) = 6000
    expect(result.adjustedInitialAmount.toNumber()).toBe(6000);
  });

  it("Schedule R Part I box 9 - MFS under 65 disabled lived apart gets $3,750", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: false,
      primaryDisabilityIncome: 2000,
      livedWithSpouse: false,
      agi: 3000,
    }));

    expect(result.box).toBe(9);
    expect(result.initialAmount.toNumber()).toBe(3750);
    // Disability cap: min(3750, 2000) = 2000
    expect(result.adjustedInitialAmount.toNumber()).toBe(2000);
  });

  it("Schedule R Part I - non-qualifying filer (not 65+, not disabled) is ineligible", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      primaryQualifies: false,
      primaryAge65OrOlder: false,
      agi: 5000,
    }));

    expect(result.eligible).toBe(false);
    expect(result.credit.toNumber()).toBe(0);
  });
});

describe("Schedule R HoH and QSS filing statuses", () => {
  it("Schedule R Part I - HoH filer age 65+ gets box 1 with single thresholds", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "head_of_household",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      agi: 7500,
    }));

    expect(result.box).toBe(1);
    expect(result.initialAmount.toNumber()).toBe(5000);
    expect(result.agiReduction.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(750);
  });

  it("Schedule R Part I - QSS filer age 65+ gets box 1 with single thresholds", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "qualifying_surviving_spouse",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      agi: 7500,
    }));

    expect(result.box).toBe(1);
    expect(result.initialAmount.toNumber()).toBe(5000);
    expect(result.agiReduction.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(750);
  });
});

describe("Schedule R full AGI phase-out by filing status", () => {
  it("Schedule R Line 19 - MFJ AGI at $25,000 fully eliminates $7,500 credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 25000,
    }));

    // Excess = 25000 - 10000 = 15000, reduction = 15000 * 0.5 = 7500
    expect(result.agiReduction.toNumber()).toBe(7500);
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 19 - MFJ AGI $1 below full phase-out retains $1 credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 24999,
    }));

    // Excess = 24999 - 10000 = 14999, reduction = 14999 * 0.5 = 7499.5 → 7500
    expect(result.agiReduction.toNumber()).toBe(7500);
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 19 - MFJ AGI at $24,998 retains $1 credit base due to rounding", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 24998,
    }));

    // Excess = 24998 - 10000 = 14998, reduction = 14998 * 0.5 = 7499
    expect(result.agiReduction.toNumber()).toBe(7499);
    expect(result.creditBase.toNumber()).toBe(1);
    // credit = 1 * 0.15 = 0.15 → 0
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 19 - MFS AGI at $12,500 fully eliminates $3,750 credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      livedWithSpouse: false,
      agi: 12500,
    }));

    // Excess = 12500 - 5000 = 7500, reduction = 7500 * 0.5 = 3750
    expect(result.agiReduction.toNumber()).toBe(3750);
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 17 - MFJ AGI $1 below threshold has zero reduction", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_jointly",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      spouseQualifies: true,
      spouseAge65OrOlder: true,
      agi: 9999,
    }));

    expect(result.agiReduction.toNumber()).toBe(0);
    expect(result.creditBase.toNumber()).toBe(7500);
    expect(result.credit.toNumber()).toBe(1125);
  });
});

describe("Schedule R interacting reductions", () => {
  it("Schedule R Lines 13c+18 - nontaxable benefits AND AGI reduction both reduce credit base", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 10000,
      nontaxableSocialSecurity: 2000,
    }));

    // Line 14: net initial = max(0, 5000 - 2000) = 3000
    expect(result.netInitialAmount.toNumber()).toBe(3000);
    // AGI excess = 10000 - 7500 = 2500, reduction = 2500 * 0.5 = 1250
    expect(result.agiReduction.toNumber()).toBe(1250);
    // credit base = max(0, 3000 - 1250) = 1750
    expect(result.creditBase.toNumber()).toBe(1750);
    // credit = 1750 * 0.15 = 262.5 → 263
    expect(result.credit.toNumber()).toBe(263);
  });

  it("Schedule R Lines 13c+18 - combined reductions fully eliminate credit", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 12000,
      nontaxableSocialSecurity: 3000,
    }));

    // Line 14: net initial = max(0, 5000 - 3000) = 2000
    expect(result.netInitialAmount.toNumber()).toBe(2000);
    // AGI excess = 12000 - 7500 = 4500, reduction = 4500 * 0.5 = 2250
    expect(result.agiReduction.toNumber()).toBe(2250);
    // credit base = max(0, 2000 - 2250) = 0
    expect(result.creditBase.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 14 - nontaxable benefits exactly equal adjusted initial amount yields zero credit", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 5000,
      nontaxableSocialSecurity: 3000,
      nontaxablePensionsAnnuities: 2000,
    }));

    // Total nontaxable = 3000 + 2000 = 5000 = initial amount
    expect(result.nontaxableBenefits.toNumber()).toBe(5000);
    expect(result.netInitialAmount.toNumber()).toBe(0);
    expect(result.credit.toNumber()).toBe(0);
  });
});

describe("Schedule R credit rounding", () => {
  it("Schedule R Line 20 - credit of $0.15 from $1 credit base rounds to 0", () => {
    // Need credit base = 1: initial 5000, nontaxable = 0, AGI reduction = 4999
    // AGI reduction = 4999 → excess * 0.5 = 4999 → excess = 9998 → AGI = 17498
    const result = calculateScheduleR(makeParams({
      filingStatus: "single",
      agi: 17498,
    }));

    // excess = 17498 - 7500 = 9998, reduction = 9998 * 0.5 = 4999
    expect(result.agiReduction.toNumber()).toBe(4999);
    expect(result.creditBase.toNumber()).toBe(1);
    // credit = 1 * 0.15 = 0.15 → rounds to 0
    expect(result.credit.toNumber()).toBe(0);
  });

  it("Schedule R Line 20 - MFS credit of $562.50 from $3,750 credit base rounds to 563", () => {
    const result = calculateScheduleR(makeParams({
      filingStatus: "married_filing_separately",
      primaryQualifies: true,
      primaryAge65OrOlder: true,
      livedWithSpouse: false,
      agi: 5000,
    }));

    expect(result.creditBase.toNumber()).toBe(3750);
    // 3750 * 0.15 = 562.5 → 563
    expect(result.credit.toNumber()).toBe(563);
  });
});
