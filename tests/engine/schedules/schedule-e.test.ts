/**
 * Tests for Schedule E — Supplemental Income and Loss
 * Spec: spec/federal/schedule-e.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import type { TaxYearInput, ScheduleK1 } from "@/models/inputs.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";

import type { RentalProperty } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

const baseRental: RentalProperty = {
  description: "123 Main St",
  propertyType: "single_family",
  personalUseDays: 0,
  rentalDays: 365,
  rents: "24000",
  advertising: "0",
  autoTravel: "0",
  cleaning: "500",
  commissions: "0",
  insurance: "1200",
  legalProfessional: "0",
  managementFees: "0",
  mortgageInterest: "8000",
  otherInterest: "0",
  repairs: "2000",
  supplies: "300",
  taxes: "3000",
  utilities: "0",
  depreciation: "5000",
  otherExpenses: "0",
};

const baseK1: ScheduleK1 = {
  partnershipName: "Test LP",
  partnershipEIN: "12-3456789",
  ordinaryIncome: "0",
  guaranteedPayments: "0",
  netShortTermCapitalGain: "0",
  netLongTermCapitalGain: "0",
  interestIncome: "0",
  ordinaryDividends: "0",
  qualifiedDividends: "0",
  selfEmploymentEarnings: "0",
  isPassiveActivity: false,
  atRiskAmount: "50000",
  netRentalIncome: "0",
  otherNetRentalIncome: "0",
  royalties: "0",
  section1231Gain: "0",
  otherIncome: "0",
  section179Deduction: "0",
  otherDeductions: "0",
};

function makeK1Fixture(k1s: ScheduleK1[]): TaxYearInput {
  return { ...simpleW2Fixture, scheduleK1: k1s };
}

// ═══════════════════════════════════════════════════════════
// Partnership Identification
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part II - Partnership Identification", () => {
  it("Schedule E Line 28 - partnership names", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Alpha Fund LP", ordinaryIncome: "5000" },
      { ...baseK1, partnershipName: "Beta Ventures LLC", ordinaryIncome: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(2);
    expect(result.partnerships[0].name).toBe("Alpha Fund LP");
    expect(result.partnerships[1].name).toBe("Beta Ventures LLC");
  });

  it("Schedule E Line 28 - EINs", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipEIN: "11-1111111", ordinaryIncome: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].ein).toBe("11-1111111");
  });

  it("Schedule E Line 28 - passive flag", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Active", isPassiveActivity: false, ordinaryIncome: "5000" },
      { ...baseK1, partnershipName: "Passive", isPassiveActivity: true, ordinaryIncome: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].isPassive).toBe(false);
    expect(result.partnerships[1].isPassive).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Nonpassive Income/Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule E - Nonpassive Activity", () => {
  it("Schedule E nonpassive income", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "10000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(10000);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(10000);
  });

  it("Schedule E nonpassive income includes guaranteed payments", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "5000", guaranteedPayments: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(8000);
  });

  it("Schedule E nonpassive loss", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "-5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-5000);
    expect(result.partnerships[0].nonpassiveLoss.toNumber()).toBe(-5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Passive Income/Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule E - Passive Activity", () => {
  it("Schedule E passive income", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "8000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalPassiveIncome.toNumber()).toBe(8000);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(8000);
  });

  it("Schedule E passive loss", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "-6000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalPassiveLoss.toNumber()).toBe(-6000);
  });

  it("Schedule E passive loss creates suspended losses", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Losing LP", isPassiveActivity: true, ordinaryIncome: "-10000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.suspendedPassiveLosses).toHaveLength(1);
    expect(result.suspendedPassiveLosses[0].partnershipName).toBe("Losing LP");
    expect(result.suspendedPassiveLosses[0].amount.toNumber()).toBe(-10000);
  });

  it("Schedule E passive income offsets passive loss", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Winner LP", isPassiveActivity: true, ordinaryIncome: "5000" },
      { ...baseK1, partnershipName: "Loser LP", isPassiveActivity: true, ordinaryIncome: "-3000" },
    ]);
    const result = calculateScheduleE(input);
    // Net passive: 5000 - 3000 = 2000 (positive, so no suspended losses)
    expect(result.suspendedPassiveLosses).toHaveLength(0);
  });

  it("Schedule E passive loss partially suspended", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Winner LP", isPassiveActivity: true, ordinaryIncome: "3000" },
      { ...baseK1, partnershipName: "Loser LP", isPassiveActivity: true, ordinaryIncome: "-8000" },
    ]);
    const result = calculateScheduleE(input);
    // Net passive: 3000 - 8000 = -5000
    // Suspended: $5,000
    expect(result.suspendedPassiveLosses).toHaveLength(1);
    expect(result.suspendedPassiveLosses[0].amount.toNumber()).toBe(-5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Guaranteed Payments — Always Nonpassive (K-1 Box 4)
// Per IRS K-1 Box 4 instructions: "Guaranteed payments are
// always nonpassive income to the payee."
// ═══════════════════════════════════════════════════════════

describe("Schedule E - guaranteed payments always nonpassive (even for passive K-1)", () => {
  it("passive K-1 with guaranteed payments only → all nonpassive, zero passive", () => {
    // Partner receives only guaranteed payments from a passive activity.
    // Per IRS, guaranteed payments are always nonpassive.
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "0", guaranteedPayments: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(5000);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(0);
    expect(result.partnerships[0].passiveLoss.toNumber()).toBe(0);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(5000);
    expect(result.totalPassiveIncome.toNumber()).toBe(0);
  });

  it("passive K-1 with ordinary income + guaranteed payments → split correctly", () => {
    // $10K ordinary (passive) + $3K guaranteed (nonpassive) = $13K total
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "10000", guaranteedPayments: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(3000);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(10000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(3000);
    expect(result.totalPassiveIncome.toNumber()).toBe(10000);
  });

  it("passive K-1 with ordinary loss + guaranteed payments → guaranteed nonpassive, loss passive", () => {
    // -$20K ordinary (passive loss) + $5K guaranteed (nonpassive) = -$15K total
    // Guaranteed payments: $5K nonpassive. Remaining: -$20K passive loss.
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "-20000", guaranteedPayments: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(5000);
    expect(result.partnerships[0].passiveLoss.toNumber()).toBe(-20000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(5000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-20000);
  });

  it("passive K-1 where guaranteed payments flip passive from income to loss", () => {
    // -$2K ordinary + $5K guaranteed = $3K total income.
    // Old (incorrect): $3K classified as passive income.
    // Correct: $5K nonpassive income, -$2K passive loss.
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "-2000", guaranteedPayments: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(5000);
    expect(result.partnerships[0].passiveLoss.toNumber()).toBe(-2000);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(0);
    // Net amount unchanged: 5000 + (-2000) = 3000
    expect(result.partnerships[0].netAmount.toNumber()).toBe(3000);
  });

  it("nonpassive K-1 with guaranteed payments is unchanged", () => {
    // When activity is NOT passive, all income (including guaranteed) stays nonpassive.
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "10000", guaranteedPayments: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(15000);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Totals
// ═══════════════════════════════════════════════════════════

describe("Schedule E - Totals", () => {
  it("Schedule E Line 32 - total partnership income", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "20000" },
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalPartnershipIncome.toNumber()).toBe(25000);
  });

  it("Schedule E Line 41 - total supplemental", () => {
    const input = makeK1Fixture([
      { ...baseK1, ordinaryIncome: "15000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalSupplementalIncome.toNumber()).toBe(15000);
  });

  it("Schedule E - no K-1s", () => {
    const input = makeK1Fixture([]);
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(0);
    expect(result.totalPartnershipIncome.toNumber()).toBe(0);
  });

  it("Schedule E - complex MFJ fixture", () => {
    const result = calculateScheduleE(complexMFJFixture);
    // Real Estate Fund LP: passive, ordinary income $5,000
    expect(result.partnerships).toHaveLength(1);
    expect(result.partnerships[0].isPassive).toBe(true);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(5000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Part I: Rental Real Estate
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - Rental Income", () => {
  it("Schedule E Line 3 - gross rents for single property", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties).toHaveLength(1);
    expect(result.rentalProperties[0].rents.toNumber()).toBe(24000);
  });

  it("Schedule E Line 20 - total rental expenses", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    // 500 + 1200 + 8000 + 2000 + 300 + 3000 + 5000 = 20000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(20000);
  });

  it("Schedule E Line 21 - net rental income (profit)", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    // 24000 - 20000 = 4000
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(4000);
  });

  it("Schedule E Line 21 - net rental loss", () => {
    const lossRental = { ...baseRental, rents: "10000" };
    const input = { ...simpleW2Fixture, rentalProperties: [lossRental] };
    const result = calculateScheduleE(input);
    // 10000 - 20000 = -10000
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-10000);
  });

  it("Schedule E Line 26 - total from multiple properties", () => {
    const prop1 = { ...baseRental, description: "Property A", rents: "30000" };
    const prop2 = { ...baseRental, description: "Property B", rents: "15000" };
    const input = { ...simpleW2Fixture, rentalProperties: [prop1, prop2] };
    const result = calculateScheduleE(input);
    // prop1: 30000 - 20000 = 10000
    // prop2: 15000 - 20000 = -5000
    // total: 5000
    expect(result.totalRentalIncome.toNumber()).toBe(5000);
  });

  it("Schedule E Line 26 - zero with no rental properties", () => {
    const result = calculateScheduleE(simpleW2Fixture);
    expect(result.totalRentalIncome.toNumber()).toBe(0);
    expect(result.rentalProperties).toHaveLength(0);
  });

  it("Schedule E Line 4 - 1099-MISC royalties flow to Part I", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Misc: [{
        payer: "Publisher Inc",
        royalties: "5000",
        rents: "0",
        otherIncome: "0",
        federalWithheld: "0",
      }],
    };
    const result = calculateScheduleE(input);
    // Royalties should be included in totalRentalIncome (Part I Line 26)
    expect(result.totalRentalIncome.toNumber()).toBe(5000);
    // Audit trail should include Line 4
    const line4 = result.lines.find((l) => l.line === "4");
    expect(line4).toBeDefined();
    expect(line4!.value.toNumber()).toBe(5000);
  });

  it("Schedule E Line 26 - combines rental income and royalties", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [baseRental],
      form1099Misc: [{
        payer: "Publisher",
        royalties: "3000",
        rents: "0",
        otherIncome: "0",
        federalWithheld: "0",
      }],
    };
    const result = calculateScheduleE(input);
    // Rental: $24K - $20K = $4K + Royalties: $3K = $7K
    expect(result.totalRentalIncome.toNumber()).toBe(7000);
  });

  it("Schedule E - rental properties are always passive", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].isPassive).toBe(true);
  });

  it("Schedule E Line 21 - rental entries preserve the validated active-participation flag for Form 8582 routing", () => {
    const input = {
      ...simpleW2Fixture,
      rentalProperties: [{ ...baseRental, isActiveParticipant: false }],
    };
    const result = calculateScheduleE(input);

    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(4000);
    expect(result.rentalProperties[0].isActiveParticipant).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Ownership Percentage
// ═══════════════════════════════════════════════════════════

describe("Schedule E - Ownership Percentage", () => {
  it("Schedule E - 50% ownership halves rents and expenses", () => {
    const halfOwned = { ...baseRental, ownershipPercentage: "50" };
    const input = { ...simpleW2Fixture, rentalProperties: [halfOwned] };
    const result = calculateScheduleE(input);
    // Rents: 24000 × 50% = 12000
    expect(result.rentalProperties[0].rents.toNumber()).toBe(12000);
    // Expenses: 20000 × 50% = 10000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(10000);
    // Net: 12000 - 10000 = 2000
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(2000);
  });

  it("Schedule E - default ownership is 100%", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    // No ownershipPercentage specified — full amounts
    expect(result.rentalProperties[0].rents.toNumber()).toBe(24000);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(20000);
  });

  it("Schedule E - 25% ownership on loss property", () => {
    const quarterOwned = { ...baseRental, rents: "10000", ownershipPercentage: "25" };
    const input = { ...simpleW2Fixture, rentalProperties: [quarterOwned] };
    const result = calculateScheduleE(input);
    // Rents: 10000 × 25% = 2500
    expect(result.rentalProperties[0].rents.toNumber()).toBe(2500);
    // Expenses: 20000 × 25% = 5000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(5000);
    // Net: 2500 - 5000 = -2500
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-2500);
  });

  it("Schedule E Line 19 - ownership percentage scales Form 4562 amortization after it is added to other expenses", () => {
    const halfOwnedWithAmortization = {
      ...baseRental,
      description: "Half-Owned Amortized Rental",
      ownershipPercentage: "50",
      otherExpenses: "700",
      form4562: {
        otherDepreciation: "5000",
        currentYearAmortization: "1200",
        priorYearAmortization: "300",
      },
    };
    const input = { ...simpleW2Fixture, rentalProperties: [halfOwnedWithAmortization] };
    const result = calculateScheduleE(input);
    const line19 = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "19" && line.description === "Other expenses: Half-Owned Amortized Rental"
    );

    expect(line19?.value.toNumber()).toBe(1100);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(11100);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(900);
  });
});

describe("Schedule E - Line 41 includes rental and partnership", () => {
  it("Line 41 combines rental and partnership income", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [baseRental],
      scheduleK1: [
        { ...baseK1, isPassiveActivity: false, ordinaryIncome: "10000" },
      ],
    };
    const result = calculateScheduleE(input);
    // Rental net: 24000 - 20000 = 4000
    // Partnership nonpassive: 10000
    // Total supplemental: 14000
    expect(result.totalSupplementalIncome.toNumber()).toBe(14000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Additional Income Fields
// ═══════════════════════════════════════════════════════════

describe("Schedule E - K-1 additional income fields", () => {
  it("K-1 rental income flows into partnership total", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: true, ordinaryIncome: "0", netRentalIncome: "12000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].passiveIncome.toNumber()).toBe(12000);
  });

  it("K-1 royalties flow into Part I separately from partnership income", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "5000", royalties: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(5000);
    expect(result.totalRentalIncome.toFixed()).toBe("3000");
    expect(result.totalSupplementalIncome.toFixed()).toBe("8000");
  });

  it("K-1 section 1231 amounts stay out of the Schedule E partnership total", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "10000", section1231Gain: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(10000);
  });

  it("K-1 other income flows into partnership total", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "8000", otherIncome: "2000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(10000);
  });

  it("K-1 section 179 deduction reduces partnership total", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "20000", section179Deduction: "5000" },
    ]);
    const result = calculateScheduleE(input);
    // $20K - $5K = $15K
    expect(result.totalNonpassiveIncome.toNumber()).toBe(15000);
  });

  it("K-1 other deductions reduce partnership total", () => {
    const input = makeK1Fixture([
      { ...baseK1, isPassiveActivity: false, ordinaryIncome: "10000", otherDeductions: "3000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(7000);
  });

  it("K-1 combined fields: ordinary + rental + royalties - deductions", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        isPassiveActivity: false,
        ordinaryIncome: "10000",
        netRentalIncome: "5000",
        royalties: "2000",
        section1231Gain: "3000",
        otherIncome: "1000",
        section179Deduction: "4000",
        otherDeductions: "2000",
      },
    ]);
    const result = calculateScheduleE(input);
    // Part II: 10K + 5K + 1K - 4K - 2K = 10K; portfolio royalties stay in Part I.
    expect(result.totalNonpassiveIncome.toNumber()).toBe(10000);
    expect(result.totalRentalIncome.toFixed()).toBe("2000");
    expect(result.totalSupplementalIncome.toFixed()).toBe("12000");
  });

  it("K-1 deductions exceeding income creates loss", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        isPassiveActivity: false,
        ordinaryIncome: "5000",
        section179Deduction: "8000",
        otherDeductions: "2000",
      },
    ]);
    const result = calculateScheduleE(input);
    // 5K - 8K - 2K = -5K
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-5000);
  });

  it("Schedule E Line 28 - K-1 losses are capped by the validated at-risk amount before classification", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        partnershipName: "At-Risk Limited LLC",
        isPassiveActivity: false,
        ordinaryIncome: "-18000",
        atRiskAmount: "7000",
      },
    ]);
    const result = calculateScheduleE(input);
    const atRiskLine = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "28-at-risk"
    );

    expect(result.partnerships[0]?.nonpassiveLoss.toNumber()).toBe(-7000);
    expect(result.partnerships[0]?.netAmount.toNumber()).toBe(-7000);
    expect(result.partnerships[0]?.suspendedAtRiskLoss.toNumber()).toBe(-11000);
    expect(result.suspendedAtRiskLosses).toEqual([
      {
        partnershipName: "At-Risk Limited LLC",
        amount: d(-11000),
      },
    ]);
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-7000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(-7000);
    expect(atRiskLine?.value.toNumber()).toBe(-11000);
  });

  it("Schedule E - Form 6198 computes at-risk amount from inputs instead of manual atRiskAmount", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        partnershipName: "Form 6198 LP",
        isPassiveActivity: false,
        ordinaryIncome: "-30000",
        atRiskAmount: undefined,
        form6198: {
          activityName: "Form 6198 LP",
          ordinaryIncome: "-30000",
          priorYearAmountAtRisk: "50000",
          currentYearIncreases: "5000",
          currentYearDecreases: "35000",
        },
      },
    ]);
    const result = calculateScheduleE(input);
    // At-risk from Form 6198: 50000 + 5000 - 35000 = 20000
    // Loss of 30000 capped at 20000
    expect(result.partnerships[0]?.atRiskAmount?.toNumber()).toBe(20000);
    expect(result.partnerships[0]?.nonpassiveLoss.toNumber()).toBe(-20000);
    expect(result.partnerships[0]?.suspendedAtRiskLoss.toNumber()).toBe(-10000);
    expect(result.suspendedAtRiskLosses).toEqual([
      { partnershipName: "Form 6198 LP", amount: d(-10000) },
    ]);
  });

  it("Schedule E - Form 6198 takes precedence over manual atRiskAmount when both provided", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        partnershipName: "Both Provided LP",
        isPassiveActivity: false,
        ordinaryIncome: "-25000",
        atRiskAmount: "100000", // manual amount — should be ignored
        form6198: {
          activityName: "Both Provided LP",
          ordinaryIncome: "-25000",
          priorYearAmountAtRisk: "10000",
          currentYearIncreases: "0",
          currentYearDecreases: "0",
        },
      },
    ]);
    const result = calculateScheduleE(input);
    // Form 6198 at-risk: 10000 (NOT manual 100000)
    expect(result.partnerships[0]?.atRiskAmount?.toNumber()).toBe(10000);
    expect(result.partnerships[0]?.nonpassiveLoss.toNumber()).toBe(-10000);
    expect(result.partnerships[0]?.suspendedAtRiskLoss.toNumber()).toBe(-15000);
  });

  it("Schedule E - Form 6198 first year uses adjusted basis for at-risk computation", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        partnershipName: "First Year LP",
        isPassiveActivity: false,
        ordinaryIncome: "-15000",
        atRiskAmount: undefined,
        form6198: {
          activityName: "First Year LP",
          ordinaryIncome: "-15000",
          adjustedBasisAtEffectiveDate: "75000",
          currentYearIncreases: "10000",
          currentYearDecreases: "5000",
          priorYearAmountAtRisk: "0",
        },
      },
    ]);
    const result = calculateScheduleE(input);
    // First year: 75000 + 10000 - 5000 = 80000
    expect(result.partnerships[0]?.atRiskAmount?.toNumber()).toBe(80000);
    expect(result.partnerships[0]?.nonpassiveLoss.toNumber()).toBe(-15000);
    expect(result.partnerships[0]?.suspendedAtRiskLoss.toNumber()).toBe(0);
  });

  it("Schedule E - Form 6198 with profit passes through without limitation", () => {
    const input = makeK1Fixture([
      {
        ...baseK1,
        partnershipName: "Profit LP",
        isPassiveActivity: false,
        ordinaryIncome: "20000",
        atRiskAmount: undefined,
        form6198: {
          activityName: "Profit LP",
          ordinaryIncome: "20000",
          priorYearAmountAtRisk: "5000",
        },
      },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0]?.nonpassiveIncome.toNumber()).toBe(20000);
    expect(result.partnerships[0]?.suspendedAtRiskLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Foreign Partnership and Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule E - foreign partnership flag", () => {
  it("Schedule E - foreign partnership indicator", () => {
    // K-1 schema includes isForeignPartnership boolean
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Foreign LP", ordinaryIncome: "5000", isForeignPartnership: true },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].name).toBe("Foreign LP");
    const line28 = result.lines.find(
      (l) => l.line === "28" && l.description.includes("Foreign LP")
    );
    expect(line28).toBeDefined();
  });

  it("Schedule E - domestic partnership defaults isForeignPartnership to false", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Domestic LP", ordinaryIncome: "5000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].name).toBe("Domestic LP");
  });
});

describe("Schedule E - audit trail", () => {
  it("produces audit trail for partnerships", () => {
    const result = calculateScheduleE(complexMFJFixture);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("28");
    expect(lineIds).toContain("32");
    expect(lineIds).toContain("41");
  });

  it("produces audit trail for rental properties", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [baseRental] };
    const result = calculateScheduleE(input);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("20");
    expect(lineIds).toContain("21");
    expect(lineIds).toContain("26");
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Rental Properties Aggregation
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - multiple rental properties aggregation", () => {
  it("Schedule E Line 26 - three properties aggregate net income correctly", () => {
    const prop1 = { ...baseRental, description: "101 Oak Ave", rents: "36000" };
    // net: 36000 - 20000 = 16000
    const prop2 = { ...baseRental, description: "202 Elm St", rents: "24000" };
    // net: 24000 - 20000 = 4000
    const prop3 = { ...baseRental, description: "303 Pine Rd", rents: "18000" };
    // net: 18000 - 20000 = -2000
    const input = { ...simpleW2Fixture, rentalProperties: [prop1, prop2, prop3] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties).toHaveLength(3);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(16000);
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(4000);
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(-2000);
    // Line 26 total: 16000 + 4000 + (-2000) = 18000
    expect(result.totalRentalIncome.toNumber()).toBe(18000);
  });

  it("Schedule E Line 26 - rental totals line in audit trail matches computed total", () => {
    const prop1 = { ...baseRental, description: "Unit A", rents: "30000" };
    // net: 30000 - 20000 = 10000
    const prop2 = { ...baseRental, description: "Unit B", rents: "20000" };
    // net: 20000 - 20000 = 0
    const input = { ...simpleW2Fixture, rentalProperties: [prop1, prop2] };
    const result = calculateScheduleE(input);
    const line26 = result.lines.find((l) => l.line === "26");
    expect(line26).toBeDefined();
    expect(line26!.value.toNumber()).toBe(result.totalRentalIncome.toNumber());
    expect(line26!.value.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Income with Depreciation Expense
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - depreciation expense", () => {
  it("Schedule E Line 18 - depreciation reduces net income correctly", () => {
    // High depreciation turns a gross-profitable property into a net loss
    const highDepreciation = {
      ...baseRental,
      description: "Depreciated Duplex",
      rents: "26000",
      depreciation: "15000",
      // Other expenses sum: 500+1200+8000+2000+300+3000 = 15000
      // Total expenses: 15000 + 15000 = 30000
    };
    const input = { ...simpleW2Fixture, rentalProperties: [highDepreciation] };
    const result = calculateScheduleE(input);
    // 26000 - 30000 = -4000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(30000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-4000);
  });

  it("Schedule E Line 18 - Form 4562 depreciation lines flow through the rental depreciation line while excluding section 179", () => {
    const rentalWithForm4562 = {
      ...baseRental,
      description: "Form 4562 Rental",
      depreciation: "999999",
      form4562: {
        section179ExpenseDeduction: "7000",
        specialDepreciationAllowance: "2000",
        otherDepreciation: "1500",
      },
    };
    const input = { ...simpleW2Fixture, rentalProperties: [rentalWithForm4562] };
    const result = calculateScheduleE(input);
    const line18 = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "18" && line.description === "Depreciation: Form 4562 Rental"
    );

    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(18500);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(5500);
    expect(line18?.value.toNumber()).toBe(3500);
    expect(line18?.inputs["Form 4562 Line 14"]?.toString()).toBe("2000");
    expect(line18?.inputs["Form 4562 Line 16"]?.toString()).toBe("1500");
    expect(line18?.inputs["Form 4562 Line 12"]?.toString()).toBe("7000");
  });

  it("Schedule E Line 19 - Form 4562 amortization flows through rental other expenses", () => {
    const rentalWithAmortization = {
      ...baseRental,
      description: "Amortized Rental",
      otherExpenses: "700",
      form4562: {
        otherDepreciation: "5000",
        currentYearAmortization: "1200",
        priorYearAmortization: "300",
      },
    };
    const input = { ...simpleW2Fixture, rentalProperties: [rentalWithAmortization] };
    const result = calculateScheduleE(input);
    const line19 = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "19" && line.description === "Other expenses: Amortized Rental"
    );
    const line20 = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "20" && line.description === "Total expenses: Amortized Rental"
    );

    expect(line19?.value.toNumber()).toBe(2200);
    expect(String(line19?.inputs["Validated manual rental other expenses"])).toBe("700");
    expect(String(line19?.inputs["Form 4562 Line 44"])).toBe("1500");
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(22200);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(1800);
    expect(line20?.value.toNumber()).toBe(22200);
  });

  it("Schedule E Line 20 - total rental expenses include Form 4562 amortization routed through line 19", () => {
    const rentalWithAmortization = {
      ...baseRental,
      description: "Amortized Rental Total",
      otherExpenses: "700",
      form4562: {
        otherDepreciation: "5000",
        currentYearAmortization: "1200",
        priorYearAmortization: "300",
      },
    };
    const input = { ...simpleW2Fixture, rentalProperties: [rentalWithAmortization] };
    const result = calculateScheduleE(input);
    const line20 = result.lines.find(
      (line) => line.form === "Sched E" && line.line === "20" && line.description === "Total expenses: Amortized Rental Total"
    );

    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(22200);
    expect(line20?.value.toNumber()).toBe(22200);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Loss Limited by Passive Activity Rules
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - rental loss passive activity classification", () => {
  it("Schedule E - rental property with net loss is marked passive", () => {
    const losingRental = { ...baseRental, rents: "8000" };
    // net: 8000 - 20000 = -12000
    const input = { ...simpleW2Fixture, rentalProperties: [losingRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].isPassive).toBe(true);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-12000);
    // The loss flows into totalRentalIncome as a negative number
    expect(result.totalRentalIncome.toNumber()).toBe(-12000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Partnership Income/Loss Flowing to Schedule E Part II
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part II - K-1 partnership income and loss flow", () => {
  it("Schedule E - nonpassive K-1 partnership income flows to Line 32", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Active Partners LP", isPassiveActivity: false, ordinaryIncome: "45000" },
    ]);
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(45000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(45000);
    expect(result.totalSupplementalIncome.toNumber()).toBe(45000);
  });

  it("Schedule E - passive K-1 partnership loss is tracked but not suspended when offset by income", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Income LP", isPassiveActivity: true, ordinaryIncome: "20000" },
      { ...baseK1, partnershipName: "Loss LP", isPassiveActivity: true, ordinaryIncome: "-12000" },
    ]);
    const result = calculateScheduleE(input);
    // Net passive: 20000 - 12000 = 8000 (positive — no suspended losses)
    expect(result.suspendedPassiveLosses).toHaveLength(0);
    expect(result.totalPassiveIncome.toNumber()).toBe(20000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-12000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(8000);
  });

  it("Schedule E - passive K-1 losses use the at-risk-limited amount before passive suspension is computed", () => {
    const input = makeK1Fixture([
      { ...baseK1, partnershipName: "Passive Income LP", isPassiveActivity: true, ordinaryIncome: "3000" },
      {
        ...baseK1,
        partnershipName: "Passive At-Risk LP",
        isPassiveActivity: true,
        ordinaryIncome: "-10000",
        atRiskAmount: "4000",
      },
    ]);
    const result = calculateScheduleE(input);

    expect(result.partnerships[1]?.passiveLoss.toNumber()).toBe(-4000);
    expect(result.suspendedAtRiskLosses).toEqual([
      {
        partnershipName: "Passive At-Risk LP",
        amount: d(-6000),
      },
    ]);
    expect(result.totalPassiveIncome.toNumber()).toBe(3000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-4000);
    expect(result.suspendedPassiveLosses).toEqual([
      {
        partnershipName: "Passive At-Risk LP",
        amount: d(-1000),
      },
    ]);
    expect(result.totalPartnershipIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 S-Corp Income Flowing to Schedule E Part II
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part II - K-1 S-corp income", () => {
  it("Schedule E - S-corp K-1 nonpassive ordinary income flows to Part II totals", () => {
    // S-corp K-1 uses the same ScheduleK1 schema; nonpassive ordinary income
    // from an S-corp is reported identically to a partnership K-1 on Schedule E.
    const sCorporationK1: ScheduleK1 = {
      ...baseK1,
      partnershipName: "Acme S-Corp",
      partnershipEIN: "77-7777777",
      isPassiveActivity: false,
      ordinaryIncome: "60000",
      section179Deduction: "10000",
    };
    const input = makeK1Fixture([sCorporationK1]);
    const result = calculateScheduleE(input);
    // 60000 - 10000 = 50000
    expect(result.partnerships[0].name).toBe("Acme S-Corp");
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(50000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(50000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(50000);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Rental Income and K-1 Income
// ═══════════════════════════════════════════════════════════

describe("Schedule E - mixed rental and K-1 income", () => {
  it("Schedule E Line 41 - rental profit plus K-1 nonpassive income totals correctly", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [baseRental],
      // baseRental net: 24000 - 20000 = 4000
      scheduleK1: [
        { ...baseK1, isPassiveActivity: false, ordinaryIncome: "25000" },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.totalRentalIncome.toNumber()).toBe(4000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(25000);
    expect(result.totalSupplementalIncome.toNumber()).toBe(29000);
  });

  it("Schedule E Line 41 - rental loss offsets K-1 income in supplemental total", () => {
    const losingRental = { ...baseRental, rents: "12000" };
    // net: 12000 - 20000 = -8000
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [losingRental],
      scheduleK1: [
        { ...baseK1, isPassiveActivity: false, ordinaryIncome: "15000" },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.totalRentalIncome.toNumber()).toBe(-8000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(15000);
    // Line 41: -8000 + 15000 = 7000
    expect(result.totalSupplementalIncome.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Property with Zero Income (Expenses Only)
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - rental property with zero income", () => {
  it("Schedule E - zero rent with expenses produces pure expense loss", () => {
    const vacantProperty = { ...baseRental, rents: "0" };
    const input = { ...simpleW2Fixture, rentalProperties: [vacantProperty] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].rents.toNumber()).toBe(0);
    // Expenses: 500+1200+8000+2000+300+3000+5000 = 20000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(20000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-20000);
    expect(result.totalRentalIncome.toNumber()).toBe(-20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Rental Portfolio (5+ Properties)
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - large rental portfolio", () => {
  it("Schedule E Line 26 - five-property portfolio aggregates all net amounts", () => {
    const properties = [
      { ...baseRental, description: "Property 1", rents: "36000" },  // net: 16000
      { ...baseRental, description: "Property 2", rents: "24000" },  // net:  4000
      { ...baseRental, description: "Property 3", rents: "20000" },  // net:     0
      { ...baseRental, description: "Property 4", rents: "14000" },  // net: -6000
      { ...baseRental, description: "Property 5", rents: "30000" },  // net: 10000
    ];
    const input = { ...simpleW2Fixture, rentalProperties: properties };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties).toHaveLength(5);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(16000);
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(4000);
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(0);
    expect(result.rentalProperties[3].netRentalIncome.toNumber()).toBe(-6000);
    expect(result.rentalProperties[4].netRentalIncome.toNumber()).toBe(10000);
    // Total: 16000 + 4000 + 0 + (-6000) + 10000 = 24000
    expect(result.totalRentalIncome.toNumber()).toBe(24000);
  });
});

// ═══════════════════════════════════════════════════════════
// QBI from Schedule E Rental Activities
// ═══════════════════════════════════════════════════════════

describe("Schedule E - QBI field on K-1 does not inflate Schedule E income", () => {
  it("Schedule E - section199AQBI on K-1 is excluded from totalPartnershipIncome computation", () => {
    // The §199A QBI amount (Box 20 Code Z) is a QBI deduction input for Form 8995,
    // not additional income. It must NOT be added to the Schedule E income total.
    const input = makeK1Fixture([
      {
        ...baseK1,
        isPassiveActivity: false,
        ordinaryIncome: "40000",
        section199AQBI: "40000",
      },
    ]);
    const result = calculateScheduleE(input);
    // Income should equal only ordinaryIncome — section199AQBI must not double-count
    expect(result.totalNonpassiveIncome.toNumber()).toBe(40000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Rental Income vs Loss Classification
// ═══════════════════════════════════════════════════════════

describe("Schedule E Part I - net rental income vs loss classification", () => {
  it("Schedule E - property with net income is classified as positive rental income", () => {
    const profitableRental = { ...baseRental, rents: "24000" };
    // net: 24000 - 20000 = 4000
    const input = { ...simpleW2Fixture, rentalProperties: [profitableRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.greaterThan(0)).toBe(true);
    expect(result.totalRentalIncome.greaterThan(0)).toBe(true);
  });

  it("Schedule E - property with net loss is classified as negative rental income", () => {
    const losingRental = { ...baseRental, rents: "15000" };
    // net: 15000 - 20000 = -5000
    const input = { ...simpleW2Fixture, rentalProperties: [losingRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.isNegative()).toBe(true);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-5000);
    expect(result.totalRentalIncome.isNegative()).toBe(true);
  });

  it("Schedule E - breakeven property has net rental income of zero", () => {
    const breakevenRental = { ...baseRental, rents: "20000" };
    // net: 20000 - 20000 = 0
    const input = { ...simpleW2Fixture, rentalProperties: [breakevenRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(0);
    expect(result.totalRentalIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Basis Limitation Integration (IRC §704(d) / §1366(d))
// Three-tier loss limitation: basis → at-risk → passive
// ═══════════════════════════════════════════════════════════

describe("Schedule E Basis Limitation Integration", () => {
  it("Schedule E - basis limitation suspends K-1 losses when beginningBasis is provided", () => {
    // Partnership with $10,000 ordinary loss but only $4,000 basis
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-10000",
      beginningBasis: "4000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Only $4,000 of the $10,000 loss should flow through (basis-limited)
    expect(result.partnerships[0].rawNetAmount.toNumber()).toBe(-10000);
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-4000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(-4000);

    // $6,000 suspended by basis limitation
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].amount.toNumber()).toBe(-6000);

    // Basis result should be available
    expect(result.partnerships[0].basisResult).toBeDefined();
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(0);
    expect(result.partnerships[0].basisResult!.totalSuspendedLosses.toNumber()).toBe(6000);
  });

  it("Schedule E - basis limitation skipped when beginningBasis is not provided (backward compatible)", () => {
    // K-1 with no beginningBasis — at-risk only
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-10000",
      atRiskAmount: "5000",
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // No basis limitation — at-risk limits to $5,000
    expect(result.partnerships[0].basisResult).toBeUndefined();
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-10000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(-5000);
    expect(result.suspendedBasisLosses).toHaveLength(0);
  });

  it("Schedule E - basis allows full loss when basis is sufficient", () => {
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-8000",
      beginningBasis: "50000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Full loss allowed (basis ≥ loss)
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-8000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(-8000);
    expect(result.suspendedBasisLosses).toHaveLength(0);
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(42000);
  });

  it("Schedule E - zero basis suspends all losses", () => {
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-15000",
      beginningBasis: "0",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Zero basis → zero allowed → all suspended
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(0);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(0);
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].amount.toNumber()).toBe(-15000);
  });

  it("Schedule E - basis then at-risk: both tiers limit losses in sequence", () => {
    // $20,000 loss, $12,000 basis, $8,000 at-risk
    // Tier 1 (basis): $20k loss limited to $12k (basis)
    // Tier 2 (at-risk): $12k loss limited to $8k (at-risk)
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-20000",
      beginningBasis: "12000",
      atRiskAmount: "8000",
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    expect(result.partnerships[0].rawNetAmount.toNumber()).toBe(-20000);
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-12000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(-8000);

    // $8,000 suspended by basis
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].amount.toNumber()).toBe(-8000);

    // $4,000 suspended by at-risk
    expect(result.suspendedAtRiskLosses).toHaveLength(1);
    expect(result.suspendedAtRiskLosses[0].amount.toNumber()).toBe(-4000);
  });

  it("Schedule E - basis with at-risk: at-risk not binding when basis already limits", () => {
    // $20,000 loss, $5,000 basis, $15,000 at-risk
    // Basis limits to $5k first, at-risk has room ($15k) so no further cut
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-20000",
      beginningBasis: "5000",
      atRiskAmount: "15000",
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-5000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(-5000);

    // $15,000 suspended by basis
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].amount.toNumber()).toBe(-15000);

    // No at-risk suspension (at-risk allows more than basis-limited amount)
    expect(result.suspendedAtRiskLosses).toHaveLength(0);
  });

  it("Schedule E - excess distributions produce capital gain (IRC §731)", () => {
    // Partnership: $50,000 distributions, $30,000 beginning basis + $10,000 income
    // Basis before distributions = $30,000 + $10,000 = $40,000
    // Excess = $50,000 - $40,000 = $10,000 capital gain
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "10000",
      beginningBasis: "30000",
      distributions: "50000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    expect(result.excessDistributionGains).toHaveLength(1);
    expect(result.excessDistributionGains[0].amount.toNumber()).toBe(10000);
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(0);
  });

  it("Schedule E - no excess distribution gain when distributions within basis", () => {
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "10000",
      beginningBasis: "30000",
      distributions: "20000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    expect(result.excessDistributionGains).toHaveLength(0);
    // Ending basis = 30,000 + 10,000 - 20,000 = 20,000
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(20000);
  });

  it("Schedule E - basis limitation with passive K-1 reduces passive loss", () => {
    // Passive K-1: $10,000 ordinary loss, only $3,000 basis
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-10000",
      isPassiveActivity: true,
      beginningBasis: "3000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Basis limits to $3,000 loss
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-3000);
    // That $3,000 is passive loss
    expect(result.partnerships[0].passiveLoss.toNumber()).toBe(-3000);
    // $7,000 suspended by basis (not passive suspension)
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].amount.toNumber()).toBe(-7000);
  });

  it("Schedule E - S-corp basis with §1367(a)(2)(B) election", () => {
    // S-corp with election: losses before nondeductible expenses
    // $20,000 loss, $5,000 nondeductible, $18,000 basis
    // With election: losses first → allows $18k of loss, $0 basis left for nondeductible
    // Without election: nondeductible first → $13k basis left for losses
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-20000",
      entityType: "s_corporation",
      election1367: true,
      beginningBasis: "18000",
      nondeductibleExpenses: "5000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    const basis = result.partnerships[0].basisResult!;
    expect(basis.entityType).toBe("s_corporation");
    // With election: losses ($18k allowed) → nondeductible ($0 basis left, $5k suspended)
    expect(basis.totalAllowedLosses.toNumber()).toBe(18000);
    expect(basis.totalSuspendedLosses.toNumber()).toBe(2000);
    expect(basis.suspendedNondeductible.toNumber()).toBe(5000);
    expect(basis.endingBasis.toNumber()).toBe(0);
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-18000);
  });

  it("Schedule E - prior-year suspended basis losses participate in current-year computation", () => {
    // $5,000 current ordinary loss + $3,000 prior-year suspended ordinary loss = $8,000 total
    // Only $6,000 basis available → $6,000 allowed (pro-rata), $2,000 suspended
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-5000",
      beginningBasis: "6000",
      priorSuspendedLosses: { ordinary: "3000" },
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    const basis = result.partnerships[0].basisResult!;
    // Total losses = $5,000 current + $3,000 prior = $8,000
    expect(basis.totalLosses.toNumber()).toBe(8000);
    // Allowed = min($8,000, $6,000) = $6,000
    expect(basis.totalAllowedLosses.toNumber()).toBe(6000);
    // Suspended = $2,000
    expect(basis.totalSuspendedLosses.toNumber()).toBe(2000);
    // Basis-adjusted Schedule E amount uses only the ordinary allowed amount
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-6000);
  });

  it("Schedule E - K-1 with income (no losses) passes through unchanged regardless of basis", () => {
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "25000",
      beginningBasis: "10000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Income is unaffected by basis limitation (it increases basis)
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(25000);
    expect(result.partnerships[0].netAmount.toNumber()).toBe(25000);
    expect(result.suspendedBasisLosses).toHaveLength(0);
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(35000);
  });

  it("Schedule E - mixed income and loss categories with basis limitation", () => {
    // K-1 with both ordinary income and §179 deduction
    // Ordinary: $10,000 income, §179: $15,000 deduction
    // Raw net: $10,000 - $15,000 = -$5,000
    // Basis: $30,000 → income increases to $40,000, §179 allowed fully ($15,000 ≤ basis)
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "10000",
      section179Deduction: "15000",
      beginningBasis: "30000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    // Raw net is -$5,000 (income less §179)
    expect(result.partnerships[0].rawNetAmount.toNumber()).toBe(-5000);
    // Basis is sufficient for the §179 deduction
    // Basis: $30,000 + $10,000 income = $40,000 before decreases
    // §179: $15,000 fits within $40,000 basis
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-5000);
    expect(result.partnerships[0].basisResult!.endingBasis.toNumber()).toBe(25000);
  });

  it("Schedule E - multiple K-1s with independent basis limitations", () => {
    const k1a: ScheduleK1 = {
      ...baseK1,
      partnershipName: "Alpha LP",
      ordinaryIncome: "-20000",
      beginningBasis: "5000",
      atRiskAmount: undefined,
    };
    const k1b: ScheduleK1 = {
      ...baseK1,
      partnershipName: "Beta LP",
      ordinaryIncome: "-10000",
      beginningBasis: "10000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1a, k1b]);
    const result = calculateScheduleE(input);

    // Alpha: $20k loss, $5k basis → $5k allowed, $15k suspended
    expect(result.partnerships[0].basisAdjustedNetAmount.toNumber()).toBe(-5000);
    expect(result.partnerships[0].basisResult!.totalSuspendedLosses.toNumber()).toBe(15000);

    // Beta: $10k loss, $10k basis → fully allowed, $0 suspended
    expect(result.partnerships[1].basisAdjustedNetAmount.toNumber()).toBe(-10000);
    expect(result.partnerships[1].basisResult!.totalSuspendedLosses.toNumber()).toBe(0);

    // Two suspended entries (Alpha only)
    expect(result.suspendedBasisLosses).toHaveLength(1);
    expect(result.suspendedBasisLosses[0].partnershipName).toBe("Alpha LP");
  });

  it("Schedule E - basis carryforward data is available for next year", () => {
    const k1: ScheduleK1 = {
      ...baseK1,
      ordinaryIncome: "-10000",
      section179Deduction: "5000",
      beginningBasis: "8000",
      atRiskAmount: undefined,
    };
    const input = makeK1Fixture([k1]);
    const result = calculateScheduleE(input);

    const basis = result.partnerships[0].basisResult!;
    // Total losses: $10,000 ordinary + $5,000 §179 = $15,000
    // Basis: $8,000 → pro-rata allows ~$5,333 ordinary and ~$2,667 §179
    const carryforward = basis.suspendedLossCarryforward;
    expect(carryforward.ordinary.toNumber()).toBeGreaterThan(0);
    expect(carryforward.section179.toNumber()).toBeGreaterThan(0);
    // Total carryforward = $15,000 - $8,000 = $7,000
    const totalCf = carryforward.ordinary.plus(carryforward.section179);
    expect(totalCf.toNumber()).toBe(7000);
  });
});
