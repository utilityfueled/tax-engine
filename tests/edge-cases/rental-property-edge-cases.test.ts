/**
 * Edge case tests for rental property income (Schedule E Part I).
 * Tests passive loss rules, multiple properties, and boundary scenarios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8582 } from "@/engine/forms/form-8582.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput, RentalProperty } from "@/models/inputs.js";

const minimalRental: RentalProperty = {
  description: "Test Property",
  propertyType: "single_family",
  personalUseDays: 0,
  rentalDays: 365,
  rents: "0",
  advertising: "0",
  autoTravel: "0",
  cleaning: "0",
  commissions: "0",
  insurance: "0",
  legalProfessional: "0",
  managementFees: "0",
  mortgageInterest: "0",
  otherInterest: "0",
  repairs: "0",
  supplies: "0",
  taxes: "0",
  utilities: "0",
  depreciation: "0",
  otherExpenses: "0",
};

// ═══════════════════════════════════════════════════════════
// Zero and Breakeven Scenarios
// ═══════════════════════════════════════════════════════════

describe("Rental - zero and breakeven", () => {
  it("zero rents and zero expenses = zero net income", () => {
    const input = { ...simpleW2Fixture, rentalProperties: [minimalRental] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(0);
    expect(result.totalRentalIncome.toNumber()).toBe(0);
  });

  it("exactly breakeven: rents equal expenses", () => {
    const prop = { ...minimalRental, rents: "12000", insurance: "4000", taxes: "4000", repairs: "4000" };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(0);
  });

  it("$1 profit over breakeven", () => {
    const prop = { ...minimalRental, rents: "12001", insurance: "4000", taxes: "4000", repairs: "4000" };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Properties
// ═══════════════════════════════════════════════════════════

describe("Rental - multiple properties", () => {
  it("profits from one offset losses from another", () => {
    const profit = { ...minimalRental, description: "Profit prop", rents: "30000", taxes: "5000" };
    const loss = { ...minimalRental, description: "Loss prop", rents: "5000", mortgageInterest: "15000", depreciation: "8000" };
    const input = { ...simpleW2Fixture, rentalProperties: [profit, loss] };
    const result = calculateScheduleE(input);
    // Profit: 30K - 5K = 25K
    // Loss: 5K - 23K = -18K
    // Total: 25K - 18K = 7K
    expect(result.totalRentalIncome.toNumber()).toBe(7000);
  });

  it("three properties with mixed results", () => {
    const p1 = { ...minimalRental, description: "P1", rents: "20000", taxes: "3000" };
    const p2 = { ...minimalRental, description: "P2", rents: "0", insurance: "2000" };
    const p3 = { ...minimalRental, description: "P3", rents: "10000", depreciation: "10000" };
    const input = { ...simpleW2Fixture, rentalProperties: [p1, p2, p3] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties).toHaveLength(3);
    // P1: 17K, P2: -2K, P3: 0
    expect(result.totalRentalIncome.toNumber()).toBe(15000);
  });
});

// ═══════════════════════════════════════════════════════════
// Large Depreciation
// ═══════════════════════════════════════════════════════════

describe("Rental - depreciation scenarios", () => {
  it("depreciation creates rental loss", () => {
    const prop = {
      ...minimalRental,
      rents: "24000",
      insurance: "2000",
      taxes: "4000",
      mortgageInterest: "10000",
      depreciation: "15000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 24K - (2K + 4K + 10K + 15K) = 24K - 31K = -7K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Passive Loss Limitation via Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Rental - passive loss flows through federal Form 8582", () => {
  it("$25K rental allowance for active participant under $100K AGI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "70000",
        federalWithheld: "10000",
      }],
      rentalProperties: [{
        ...minimalRental,
        rents: "12000",
        mortgageInterest: "20000",
        depreciation: "10000",
        taxes: "5000",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental loss: 12K - 35K = -23K
    // AGI = $70K (under $100K), active participant → full $25K allowance
    // $23K < $25K → all allowed, no suspended loss
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });

  it("partial rental allowance between $100K-$150K AGI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "120000",
        federalWithheld: "20000",
      }],
      rentalProperties: [{
        ...minimalRental,
        rents: "6000",
        mortgageInterest: "20000",
        depreciation: "10000",
        taxes: "6000",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental loss: 6K - 36K = -30K
    // AGI = $120K wages - $30K rental = $90K
    // But Form 8582 uses MAGI (IRS Form 8582 Instructions):
    //   MAGI = $90K + $30K (rental loss add-back) = $120K
    // Phase-out = ($120K - $100K) × 50% = $10K → allowance = $15K
    // $30K loss - $15K allowed = $15K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(15000);
  });

  it("no rental allowance above $150K AGI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
      rentalProperties: [{
        ...minimalRental,
        rents: "10000",
        mortgageInterest: "25000",
        depreciation: "15000",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Rental loss: 10K - 40K = -30K
    // AGI = $200K (over $150K) → no rental allowance
    // All $30K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental + Partnership Combined
// ═══════════════════════════════════════════════════════════

describe("Rental - combined with K-1 partnership", () => {
  it("rental and K-1 income both flow to Schedule E Line 41", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{ ...minimalRental, rents: "18000", taxes: "3000" }],
      scheduleK1: [{
        partnershipName: "Active LP",
        partnershipEIN: "12-3456789",
        ordinaryIncome: "10000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleE(fixture);
    // Rental: 18K - 3K = 15K
    // Partnership: 10K nonpassive
    // Line 41: 25K
    expect(result.totalSupplementalIncome.toNumber()).toBe(25000);
  });
});

// ═══════════════════════════════════════════════════════════
// Complex: Rental Loss + Passive K-1 Loss + Passive K-1 Income
// ═══════════════════════════════════════════════════════════

describe("Rental + K-1 passive combined through Form 8582", () => {
  it("rental loss + passive K-1 loss partially allowed, passive income offsets", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "80000",
        federalWithheld: "12000",
      }],
      rentalProperties: [{
        ...minimalRental,
        description: "Main rental",
        rents: "12000",
        mortgageInterest: "15000",
        depreciation: "8000",
        taxes: "4000",
        // Net: $12K - $27K = -$15K loss
      }],
      scheduleK1: [
        {
          partnershipName: "Passive LP",
          partnershipEIN: "22-3344556",
          ordinaryIncome: "-10000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
        {
          partnershipName: "Income LP",
          partnershipEIN: "33-4455667",
          ordinaryIncome: "8000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // Passive activities:
    // - Main rental: -$15K loss (rental real estate, active participant)
    // - Passive LP: -$10K loss
    // - Income LP: +$8K income
    // Net passive: -$15K - $10K + $8K = -$17K
    // AGI ~$80K → full $25K rental allowance (under $100K)
    // Rental loss $15K qualifies for rental allowance
    // But total passive loss = $17K (only rental portion gets allowance)
    // Some losses should be suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBeGreaterThan(0);
  });

  it("all passive losses suspended when AGI > $150K", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "35000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
      rentalProperties: [{
        ...minimalRental,
        description: "High AGI rental",
        rents: "10000",
        mortgageInterest: "20000",
        depreciation: "10000",
      }],
      scheduleK1: [{
        partnershipName: "Passive Fund",
        partnershipEIN: "44-5566778",
        ordinaryIncome: "-5000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI > $150K → no rental allowance
    // Rental: $10K - $30K = -$20K loss (all suspended)
    // K-1: -$5K loss (all suspended)
    // Both activities should have suspended losses
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(2);
    const totalSuspended = federal.carryforwards.suspendedPassiveLosses
      .reduce((acc, s) => acc.plus(s.amount), new Decimal(0));
    expect(totalSuspended.toNumber()).toBe(25000);
  });
});

// ═══════════════════════════════════════════════════════════
// IRC §280A: Vacation Home / Mixed-Use Property
// ═══════════════════════════════════════════════════════════

describe("Rental - vacation home mixed-use (IRC §280A)", () => {
  it("pure rental (0 personal days) — full expenses allowed", () => {
    const prop = {
      ...minimalRental,
      personalUseDays: 0,
      rentalDays: 365,
      rents: "24000",
      insurance: "3000",
      taxes: "4000",
      depreciation: "8000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Full expenses: $15K
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(15000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(9000);
  });

  it("mixed-use: 30 personal days + 200 rental days — expenses prorated", () => {
    const prop = {
      ...minimalRental,
      personalUseDays: 30,
      rentalDays: 200,
      rents: "20000",
      insurance: "3000",
      taxes: "4000",
      mortgageInterest: "12000",
      depreciation: "8000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 30 personal days > 14 AND > 10% of 200 rental days (20) → mixed-use
    // Rental ratio: 200 / 230 = 0.8695...
    // Gross expenses: $27K
    // Allocated: floor(27000 × 200/230) = floor(23478.26) = $23,478
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(23478);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-3478);
  });

  it("under 14 personal days — not mixed-use even with few rental days", () => {
    const prop = {
      ...minimalRental,
      personalUseDays: 14, // Exactly 14, not > 14
      rentalDays: 100,
      rents: "10000",
      insurance: "2000",
      taxes: "3000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 14 days NOT > 14 → pure rental, full expenses
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(5000);
  });

  it("personal use > 14 days but <= 10% of rental days — not mixed-use", () => {
    const prop = {
      ...minimalRental,
      personalUseDays: 20,
      rentalDays: 300, // 10% of 300 = 30, personal 20 < 30
      rents: "30000",
      insurance: "4000",
      taxes: "5000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 20 > 14 BUT 20 ≤ 30 (10% of 300) → NOT mixed-use
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(9000);
  });

  it("vacation home: 60 personal + 120 rental — 2/3 allocation", () => {
    const prop = {
      ...minimalRental,
      description: "Beach House",
      propertyType: "vacation" as const,
      personalUseDays: 60,
      rentalDays: 120,
      rents: "36000",
      insurance: "6000",
      taxes: "9000",
      mortgageInterest: "18000",
      depreciation: "12000",
      utilities: "6000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 60 > 14 AND 60 > 12 (10% of 120) → mixed-use
    // Rental ratio: 120 / 180 = 2/3
    // Gross expenses: $51K
    // Allocated: floor(51000 × 120/180) = floor(34000) = $34,000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(34000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(2000);
  });

  it("mixed-use audit trail records allocation", () => {
    const prop = {
      ...minimalRental,
      personalUseDays: 30,
      rentalDays: 200,
      rents: "20000",
      taxes: "10000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    const allocLine = result.lines.find((l) => l.line === "280A");
    expect(allocLine).toBeDefined();
    expect(allocLine!.description).toContain("Mixed-use allocation");
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Properties: One Profitable, One Losing — Net Offset
// ═══════════════════════════════════════════════════════════

describe("Rental - multiple properties net offset via Form 8582", () => {
  it("profitable property offsets losing property: net income = combined result", () => {
    // Property A profits $10K, Property B loses $6K
    // Net rental income = +$4K → no Form 8582 limitation needed
    const profitProp = { ...minimalRental, description: "Profit Unit", rents: "20000", taxes: "10000" };
    const lossProp = {
      ...minimalRental,
      description: "Loss Unit",
      rents: "8000",
      mortgageInterest: "10000",
      depreciation: "4000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [profitProp, lossProp] };
    const schedE = calculateScheduleE(input);
    // Profit Unit: 20K - 10K = +10K
    // Loss Unit: 8K - 14K = -6K
    // Net: +4K → no suspension
    expect(schedE.rentalProperties[0].netRentalIncome.toNumber()).toBe(10000);
    expect(schedE.rentalProperties[1].netRentalIncome.toNumber()).toBe(-6000);
    expect(schedE.totalRentalIncome.toNumber()).toBe(4000);

    const federal = calculateFederalTax(input);
    // Net positive → Form 8582 has no suspended losses
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI Exactly at $100K — Full $25K Allowance
// ═══════════════════════════════════════════════════════════

describe("Rental - AGI exactly $100K boundary: full $25K allowance", () => {
  it("AGI = $100K yields zero phase-out reduction, full $25K allowance", () => {
    // AGI exactly $100K → excess over $100K = $0 → phase-out = $0 → full allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at 100K AGI",
          income: new Decimal(0),
          loss: new Decimal(-20000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(100000),
      filingStatus: "single",
    });
    // Phase-out: (100K - 100K) × 0.5 = $0 → full $25K allowance
    // Rental loss $20K < $25K allowance → all allowed
    expect(result.rentalAllowance.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI $150K+ — Zero Allowance, All Losses Suspended
// ═══════════════════════════════════════════════════════════

describe("Rental - AGI at and above $150K: zero allowance", () => {
  it("AGI = $150K exactly yields zero rental allowance (phase-out fully eliminates it)", () => {
    // (150K - 100K) × 0.5 = $25K reduction → $25K - $25K = $0 allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at 150K AGI",
          income: new Decimal(0),
          loss: new Decimal(-18000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(150000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(18000);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("AGI = $200K yields zero rental allowance and all losses suspended via federal pipeline", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
      rentalProperties: [{
        ...minimalRental,
        rents: "12000",
        mortgageInterest: "20000",
        depreciation: "8000",
        // Net: 12K - 28K = -16K, all suspended (AGI >> $150K)
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(16000);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI Between $100K-$150K — Partial Phase-Out
// ═══════════════════════════════════════════════════════════

describe("Rental - AGI between $100K-$150K: partial allowance phase-out", () => {
  it("AGI = $110K yields $20K allowance (50% of $10K excess reduces $25K by $5K)", () => {
    // Phase-out: (110K - 100K) × 0.5 = $5K reduction → $25K - $5K = $20K allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at 110K AGI",
          income: new Decimal(0),
          loss: new Decimal(-25000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(110000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(20000);
    // $25K loss - $20K allowed = $5K suspended
    expect(result.suspendedLoss.toNumber()).toBe(5000);
    expect(result.allowedLoss.toNumber()).toBe(20000);
  });

  it("AGI = $130K yields $10K allowance (50% of $30K excess reduces $25K by $15K)", () => {
    // $30K loss; phase-out: (130K - 100K) × 0.5 = $15K reduction → $25K - $15K = $10K allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at 130K AGI",
          income: new Decimal(0),
          loss: new Decimal(-30000), // Loss larger than $25K so base allowance is capped at $25K
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(130000),
      filingStatus: "single",
    });
    // min($25K, $30K) = $25K base; phase-out (130K-100K)×0.5 = $15K; allowance = $25K - $15K = $10K
    expect(result.rentalAllowance.toNumber()).toBe(10000);
    // $30K loss - $10K allowed = $20K suspended
    expect(result.suspendedLoss.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Non-Active Participant — Zero Allowance Regardless of AGI
// ═══════════════════════════════════════════════════════════

describe("Rental - non-active participant: zero allowance regardless of AGI", () => {
  it("non-active participant with AGI $60K still gets $0 rental allowance", () => {
    // Non-active participant: activity is treated as pure passive, no $25K special allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Non-active rental",
          income: new Decimal(0),
          loss: new Decimal(-15000),
          isRentalRealEstate: true,
          isActiveParticipant: false, // Not active participant → no $25K allowance
        },
      ],
      agi: new Decimal(60000), // Low AGI that would normally grant full allowance
      filingStatus: "single",
    });
    // Non-active → classified under non-rental passive activities (no rental allowance)
    expect(result.rentalAllowance.toNumber()).toBe(0);
    // No passive income to offset → all $15K suspended
    expect(result.suspendedLoss.toNumber()).toBe(15000);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("non-active participant with AGI $80K and passive income still suspends net loss", () => {
    // Non-active rental loss partially offset by passive income, remainder suspended
    const result = calculateForm8582({
      activities: [
        {
          name: "Non-active rental loss",
          income: new Decimal(0),
          loss: new Decimal(-20000),
          isRentalRealEstate: true,
          isActiveParticipant: false,
        },
        {
          name: "Other passive income",
          income: new Decimal(8000),
          loss: new Decimal(0),
          isRentalRealEstate: false,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(80000),
      filingStatus: "single",
    });
    // $8K passive income offsets $20K passive loss → $12K net loss suspended
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(8000);
    expect(result.suspendedLoss.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Profit — Fully Included in Income, No Limitation
// ═══════════════════════════════════════════════════════════

describe("Rental - rental profit fully included in income, no Form 8582 limitation", () => {
  it("rental profit is included in AGI with zero suspended losses", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "70000", federalWithheld: "10000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "24000",
        taxes: "4000",
        insurance: "2000",
        // Net: 24K - 6K = +18K profit
      }],
    };
    const schedE = calculateScheduleE(fixture);
    expect(schedE.totalRentalIncome.toNumber()).toBe(18000);

    const federal = calculateFederalTax(fixture);
    // Profitable rental → Form 8582 returns early with no suspension
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });

  it("Form 8582 with only rental income (no loss) returns zero allowed/suspended", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "Profitable rental",
          income: new Decimal(15000),
          loss: new Decimal(0),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(80000),
      filingStatus: "single",
    });
    // No net loss → no limitation, no suspension
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Rental Loss — Capped at $25K Allowance
// ═══════════════════════════════════════════════════════════

describe("Rental - very large loss capped at $25K allowance", () => {
  it("$100K rental loss with low AGI: only $25K allowed, $75K suspended", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "Large loss rental",
          income: new Decimal(0),
          loss: new Decimal(-100000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(60000), // Well under $100K → full $25K allowance
      filingStatus: "single",
    });
    // Allowance capped at min($25K, $100K loss) = $25K
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(75000);
  });

  it("$100K+ rental loss via federal pipeline: $25K allowed, remainder suspended", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "8000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "5000",
        mortgageInterest: "50000",
        depreciation: "40000",
        taxes: "20000",
        // Net: 5K - 110K = -105K loss
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI < $100K → $25K allowance applies, $80K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(80000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Loss + Other Passive Income: Passive Income Offsets Loss First
// ═══════════════════════════════════════════════════════════

describe("Rental - passive income offsets passive loss before $25K allowance applies", () => {
  it("passive K-1 income reduces net passive loss before rental allowance needed", () => {
    // Rental loss: -$30K, Passive K-1 income: +$12K
    // Passive income offsets loss first → net loss remaining = $18K
    // $18K < $25K allowance → all allowed, nothing suspended
    const result = calculateForm8582({
      activities: [
        {
          name: "Main rental",
          income: new Decimal(0),
          loss: new Decimal(-30000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "Passive income LP",
          income: new Decimal(12000),
          loss: new Decimal(0),
          isRentalRealEstate: false,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(70000),
      filingStatus: "single",
    });
    // Passive income $12K + rental allowance min($25K, $30K) = $25K → total $37K allowed
    // But gross loss is only $30K → all $30K allowed, $0 suspended
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(30000);
  });

  it("passive income partially offsets rental loss, remainder covered by $25K allowance", () => {
    // Rental loss: -$40K, Passive income: +$5K
    // Passive income: $5K offsets, then $25K allowance covers more
    // Allowed = $5K + $25K = $30K (but gross loss $40K → $10K suspended)
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental property",
          income: new Decimal(0),
          loss: new Decimal(-40000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "Passive income partnership",
          income: new Decimal(5000),
          loss: new Decimal(0),
          isRentalRealEstate: false,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(75000), // Under $100K → full $25K allowance
      filingStatus: "single",
    });
    // Total allowed = passive income ($5K) + rental allowance ($25K) = $30K
    // Total gross loss = $40K → suspended = $40K - $30K = $10K
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(30000);
    expect(result.suspendedLoss.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// $25K Rental Allowance Phase-Out: Precise Boundary Tests
// ═══════════════════════════════════════════════════════════

describe("Rental - $25K allowance phase-out precise boundaries ($100K-$150K)", () => {
  it("AGI = $100,001 rounds the printed allowance capacity to $25,000", () => {
    // Official lines7-8: (150000 - 100001) × 0.5 = 24999.50 → 25000.
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at boundary",
          income: new Decimal(0),
          loss: new Decimal(-25000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(100001),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });

  it("AGI = $125K yields $12,500 allowance (midpoint of phase-out range)", () => {
    // Phase-out: ($125K - $100K) × 0.5 = $12,500
    // Allowance: $25,000 - $12,500 = $12,500
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental at midpoint",
          income: new Decimal(0),
          loss: new Decimal(-30000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(125000),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(12500);
    expect(result.suspendedLoss.toNumber()).toBe(17500);
    expect(result.allowedLoss.toNumber()).toBe(12500);
  });

  it("AGI = $149,999 yields $1 allowance (just below full phase-out)", () => {
    // Official lines7-8: (150000 - 149999) × 0.5 = 0.50 → 1.
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental near ceiling",
          income: new Decimal(0),
          loss: new Decimal(-10000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(149999),
      filingStatus: "single",
    });
    expect(result.rentalAllowance.toNumber()).toBe(1);
    expect(result.suspendedLoss.toNumber()).toBe(9999);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Zero Allowance — Married Filing Separately Gets $0
// ═══════════════════════════════════════════════════════════

describe("Rental - MFS zero allowance regardless of AGI", () => {
  it("MFS with low AGI ($50K) gets $0 rental allowance — all losses suspended", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "MFS rental",
          income: new Decimal(0),
          loss: new Decimal(-20000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(50000),
      filingStatus: "married_filing_separately",
    });
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(20000);
    expect(result.allowedLoss.toNumber()).toBe(0);
  });

  it("MFS with passive income offsets rental loss but gets no $25K allowance", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "MFS rental loss",
          income: new Decimal(0),
          loss: new Decimal(-15000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "MFS passive income K-1",
          income: new Decimal(6000),
          loss: new Decimal(0),
          isRentalRealEstate: false,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(40000),
      filingStatus: "married_filing_separately",
    });
    // Passive income $6K offsets, but no $25K rental allowance for MFS
    // Net loss: -$15K + $6K = -$9K combined
    // Rental allowance = $0 (MFS)
    // Allowed = passive income ($6K) + rental allowance ($0) = $6K
    // Suspended = $15K - $6K = $9K
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(6000);
    expect(result.suspendedLoss.toNumber()).toBe(9000);
  });
});

// ═══════════════════════════════════════════════════════════
// Suspended Passive Losses: Per-Activity Allocation
// ═══════════════════════════════════════════════════════════

describe("Rental - suspended passive loss allocation across activities", () => {
  it("suspended losses allocated proportionally across two rental properties", () => {
    // Two rentals both losing; AGI > $150K → zero allowance
    // Losses allocated proportionally to each activity
    const result = calculateForm8582({
      activities: [
        {
          name: "Property A",
          income: new Decimal(0),
          loss: new Decimal(-30000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "Property B",
          income: new Decimal(0),
          loss: new Decimal(-10000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(200000),
      filingStatus: "single",
    });
    // AGI > $150K → $0 allowance; no passive income → all $40K suspended
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(40000);
    expect(result.activityAllocations).toHaveLength(2);
    // Property A: 30K/40K = 75% of suspended; Property B: 10K/40K = 25%
    const allocA = result.activityAllocations.find((a) => a.name === "Property A")!;
    const allocB = result.activityAllocations.find((a) => a.name === "Property B")!;
    expect(allocA.suspendedLoss.toNumber()).toBe(30000);
    expect(allocB.suspendedLoss.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Properties: Net Across Properties on Schedule E
// ═══════════════════════════════════════════════════════════

describe("Rental - four properties with mixed results aggregate correctly", () => {
  it("four properties: two profitable, two losing — correct per-property and total", () => {
    const p1 = { ...minimalRental, description: "P1 Profit", rents: "36000", taxes: "6000", insurance: "4000" };
    const p2 = { ...minimalRental, description: "P2 Loss", rents: "8000", mortgageInterest: "18000", depreciation: "5000" };
    const p3 = { ...minimalRental, description: "P3 Profit", rents: "15000", repairs: "3000" };
    const p4 = { ...minimalRental, description: "P4 Loss", rents: "0", taxes: "2000", insurance: "1500" };
    const input = { ...simpleW2Fixture, rentalProperties: [p1, p2, p3, p4] };
    const result = calculateScheduleE(input);

    expect(result.rentalProperties).toHaveLength(4);
    // P1: 36K - 10K = +26K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(26000);
    // P2: 8K - 23K = -15K
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(-15000);
    // P3: 15K - 3K = +12K
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(12000);
    // P4: 0 - 3.5K = -3.5K
    expect(result.rentalProperties[3].netRentalIncome.toNumber()).toBe(-3500);
    // Total: 26K - 15K + 12K - 3.5K = 19.5K
    expect(result.totalRentalIncome.toNumber()).toBe(19500);
  });
});

// ═══════════════════════════════════════════════════════════
// Active Participation: Mixed Active and Non-Active Rentals
// ═══════════════════════════════════════════════════════════

describe("Rental - active vs non-active participation in Form 8582", () => {
  it("active rental gets $25K allowance while non-active rental in same return does not", () => {
    // Active rental loss: qualifies for $25K allowance
    // Non-active rental loss: treated as pure passive, no allowance
    const result = calculateForm8582({
      activities: [
        {
          name: "Active rental",
          income: new Decimal(0),
          loss: new Decimal(-20000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "Non-active rental",
          income: new Decimal(0),
          loss: new Decimal(-10000),
          isRentalRealEstate: true,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(80000),
      filingStatus: "single",
    });
    // Active rental: -$20K → qualifies for allowance (line 3b)
    // Non-active rental: -$10K → classified as non-rental passive (line 1b)
    // Rental allowance = min($25K, $20K) = $20K
    // Total gross loss = $30K; allowed = $0 passive income + $20K allowance = $20K
    // Suspended = $30K - $20K = $10K
    expect(result.rentalAllowance.toNumber()).toBe(20000);
    expect(result.allowedLoss.toNumber()).toBe(20000);
    expect(result.suspendedLoss.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// High-AGI Passive Loss Disallowance via Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Rental - high-AGI ($300K+) passive loss fully disallowed via federal", () => {
  it("$300K AGI with rental and K-1 passive losses: all losses suspended", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        federalWithheld: "60000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "4350",
      }],
      rentalProperties: [{
        ...minimalRental,
        rents: "15000",
        mortgageInterest: "25000",
        depreciation: "12000",
        taxes: "8000",
        // Net: 15K - 45K = -30K
      }],
      scheduleK1: [{
        partnershipName: "Passive Fund II",
        partnershipEIN: "77-8899001",
        ordinaryIncome: "-12000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI $300K >> $150K → $0 rental allowance
    // No passive income → all passive losses suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(2);
    const totalSuspended = federal.carryforwards.suspendedPassiveLosses
      .reduce((acc, s) => acc.plus(s.amount), new Decimal(0));
    expect(totalSuspended.toNumber()).toBe(42000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 Passive Income Fully Absorbs Rental Loss
// ═══════════════════════════════════════════════════════════

describe("Rental - K-1 passive income fully absorbs rental loss", () => {
  it("passive K-1 income exceeds rental loss: no suspended losses, no allowance needed", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "Rental with loss",
          income: new Decimal(0),
          loss: new Decimal(-18000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
        {
          name: "K-1 passive income",
          income: new Decimal(25000),
          loss: new Decimal(0),
          isRentalRealEstate: false,
          isActiveParticipant: false,
        },
      ],
      agi: new Decimal(200000), // High AGI — but passive income covers loss
      filingStatus: "single",
    });
    // Net passive: $25K income - $18K loss = +$7K net positive → no limitation
    expect(result.combinedLoss.toNumber()).toBe(0);
    expect(result.rentalAllowance.toNumber()).toBe(0);
    expect(result.suspendedLoss.toNumber()).toBe(0);
    expect(result.allowedLoss.toNumber()).toBe(18000); // Line3 allows the full actual loss.
  });

  it("K-1 passive income partially absorbs rental + K-1 passive losses via federal pipeline", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "90000",
        federalWithheld: "14000",
      }],
      rentalProperties: [{
        ...minimalRental,
        description: "Rental prop",
        rents: "10000",
        mortgageInterest: "18000",
        depreciation: "7000",
        // Net: 10K - 25K = -15K
      }],
      scheduleK1: [
        {
          partnershipName: "Income K-1",
          partnershipEIN: "88-9900112",
          ordinaryIncome: "10000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
        {
          partnershipName: "Loss K-1",
          partnershipEIN: "99-0011223",
          ordinaryIncome: "-8000",
          guaranteedPayments: "0",
          netShortTermCapitalGain: "0",
          netLongTermCapitalGain: "0",
          interestIncome: "0",
          ordinaryDividends: "0",
          qualifiedDividends: "0",
          selfEmploymentEarnings: "0",
          isPassiveActivity: true,
          netRentalIncome: "0",
          otherNetRentalIncome: "0",
          royalties: "0",
          section1231Gain: "0",
          otherIncome: "0",
          section179Deduction: "0",
          otherDeductions: "0",
        },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // Passive K-1 income $10K partially offsets passive losses
    // Rental: -$15K loss, K-1 loss: -$8K, K-1 income: +$10K
    // Net passive (K-1 only): 10K - 8K = +2K
    // That $2K passive income offsets $2K of rental loss
    // Remaining rental loss: $13K; AGI ~$90K < $100K → full $25K allowance
    // $13K < $25K → some losses should be suspended from the K-1 loss activity
    // But the exact allocation depends on federal pipeline
    // At minimum, total suspended should be less than total gross losses
    const totalSuspended = federal.carryforwards.suspendedPassiveLosses
      .reduce((acc, s) => acc.plus(s.amount), new Decimal(0));
    // With $10K passive income and $25K rental allowance available,
    // total available = $35K vs total losses = $23K → all should be allowed
    expect(totalSuspended.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// High Depreciation Turning Cash-Positive Rental Into a Loss
// ═══════════════════════════════════════════════════════════

describe("Rental - high depreciation converts cash-positive rental to a taxable loss", () => {
  it("rental with strong cash flow but very large depreciation produces net loss", () => {
    // Property generates positive cash flow (rents > cash expenses)
    // but depreciation — a non-cash deduction — pushes net below zero
    const prop = {
      ...minimalRental,
      description: "High-Depreciation Duplex",
      rents: "36000",
      mortgageInterest: "14000",
      taxes: "5000",
      insurance: "2000",
      repairs: "1500",
      depreciation: "22000", // large non-cash deduction
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Cash expenses: 14K + 5K + 2K + 1.5K = 22.5K; cash flow = 36K - 22.5K = +13.5K
    // With depreciation: total expenses = 22.5K + 22K = 44.5K; net = 36K - 44.5K = -8.5K
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(44500);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-8500);
    expect(result.totalRentalIncome.toNumber()).toBe(-8500);
  });

  it("zero-down cash flow rental still produces tax loss via depreciation", () => {
    // Rents exactly cover all cash costs; depreciation creates the full tax loss
    const prop = {
      ...minimalRental,
      description: "Breakeven Cash-Flow Rental",
      rents: "18000",
      mortgageInterest: "10000",
      taxes: "4000",
      insurance: "2000",
      repairs: "2000",       // cash expenses sum = 18K → breakeven cash
      depreciation: "9500",  // depreciation pushes into loss
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Cash expenses: 10K + 4K + 2K + 2K = 18K; net before depreciation = $0
    // Net after depreciation: 0 - 9.5K = -9.5K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-9500);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Properties: Mix of Profitable and Loss Properties
// ═══════════════════════════════════════════════════════════

describe("Rental - portfolio with profitable and loss properties, per-property breakdown correct", () => {
  it("three properties: one highly profitable, two losing — correct per-property net and total", () => {
    const profitable = {
      ...minimalRental,
      description: "High-Yield Condo",
      rents: "42000",
      taxes: "5000",
      insurance: "1500",
      managementFees: "3000",
      depreciation: "8000",
      // Net: 42K - 17.5K = +24.5K
    };
    const lossA = {
      ...minimalRental,
      description: "Underwater SFH",
      rents: "9600",
      mortgageInterest: "16000",
      taxes: "4000",
      depreciation: "7000",
      // Net: 9.6K - 27K = -17.4K
    };
    const lossB = {
      ...minimalRental,
      description: "Vacant Land",
      propertyType: "land" as const,
      rents: "0",
      taxes: "2400",
      insurance: "600",
      // Net: 0 - 3K = -3K
    };
    const input = { ...simpleW2Fixture, rentalProperties: [profitable, lossA, lossB] };
    const result = calculateScheduleE(input);

    expect(result.rentalProperties).toHaveLength(3);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(24500);
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(-17400);
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(-3000);
    // Total: 24.5K - 17.4K - 3K = +4.1K
    expect(result.totalRentalIncome.toNumber()).toBe(4100);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Loss Exactly Equal to $25K Allowance
// ═══════════════════════════════════════════════════════════

describe("Rental - loss exactly equals $25K special allowance: zero suspended, zero remaining", () => {
  it("rental loss of exactly $25K with low AGI: all loss allowed, suspended = $0", () => {
    const result = calculateForm8582({
      activities: [
        {
          name: "Exact boundary rental",
          income: new Decimal(0),
          loss: new Decimal(-25000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(80000), // well under $100K → full $25K allowance
      filingStatus: "single",
    });
    // Allowance: min($25K, $25K) = $25K; phase-out: (80K-100K) floored at 0 → $0
    expect(result.rentalAllowance.toNumber()).toBe(25000);
    expect(result.allowedLoss.toNumber()).toBe(25000);
    expect(result.suspendedLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI at $100K, $125K, $150K via Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Rental - AGI phase-out points tested through full federal pipeline", () => {
  it("AGI at $100K but MAGI at $120K: $20K rental loss partially suspended", () => {
    // Wages $120K - rental loss $20K = AGI $100K
    // But MAGI = $100K + $20K (rental loss add-back) = $120K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000", federalWithheld: "24000" }],
      rentalProperties: [{
        ...minimalRental,
        description: "AGI 100K test rental",
        rents: "12000",
        mortgageInterest: "18000",
        depreciation: "8000",
        taxes: "6000",
        // Net: 12K - 32K = -20K rental loss; AGI = 120K - 20K = 100K
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Official line8 capacity = (150000 - 120000) × 50% = 15000.
    // Line9 = min(20000 actual loss, 15000 capacity), leaving 5000 suspended.
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(5000);
    expect(federal.agi.toNumber()).toBe(105000);
  });

  it("AGI at $125K but MAGI at $150K: $25K rental loss fully suspended", () => {
    // Wages $150K - rental loss $25K = preliminary AGI $125K
    // But MAGI = $125K + $25K (rental loss add-back) = $150K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", federalWithheld: "30000" }],
      rentalProperties: [{
        ...minimalRental,
        description: "AGI 125K test rental",
        rents: "10000",
        mortgageInterest: "20000",
        depreciation: "10000",
        taxes: "5000",
        // Net: 10K - 35K = -25K rental loss; preliminary AGI = 150K - 25K = 125K
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MAGI = $150K → phase-out: ($150K - $100K) × 50% = $25K → allowance = $0
    // $25K loss fully suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(25000);
    // AGI corrected: preliminary $125K + $25K suspended = $150K (all rental loss removed)
    expect(federal.agi.toNumber()).toBe(150000);
  });

  it("AGI at $150K (zero allowance): $18K rental loss entirely suspended", () => {
    // Wages $168K - rental loss $18K = preliminary AGI $150K
    // MAGI = $150K + $18K = $168K → fully phased out (same result as before)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "168000", federalWithheld: "33600" }],
      rentalProperties: [{
        ...minimalRental,
        description: "AGI 150K test rental",
        rents: "8000",
        mortgageInterest: "15000",
        depreciation: "7000",
        taxes: "4000",
        // Net: 8K - 26K = -18K rental loss; preliminary AGI = 168K - 18K = 150K
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MAGI = $168K → phase-out: ($168K - $100K) × 0.5 = $34K → allowance = $0
    // All $18K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(18000);
    // AGI corrected: preliminary $150K + $18K suspended = $168K (all rental loss removed)
    expect(federal.agi.toNumber()).toBe(168000);
  });
});

// ═══════════════════════════════════════════════════════════
// MAGI vs AGI Regression Tests (Form 8582 rental allowance)
// ═══════════════════════════════════════════════════════════

describe("Rental - MAGI regression: rental loss excluded from phase-out AGI", () => {
  it("MAGI under $100K: wages $80K + rental -$20K → AGI $60K, MAGI $80K → full allowance", () => {
    // Wages $80K, rental loss -$20K → AGI $60K
    // MAGI = $60K + $20K (add back rental loss) = $80K → under $100K → full allowance
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "12000" }],
      rentalProperties: [{
        ...minimalRental,
        description: "MAGI test rental",
        rents: "5000",
        mortgageInterest: "15000",
        depreciation: "5000",
        taxes: "5000",
        // Net: 5K - 25K = -20K rental loss
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MAGI = $80K → under $100K → full $25K allowance → min($25K, $20K) = $20K
    // $20K loss fully allowed, no suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
    expect(federal.agi.toNumber()).toBe(60000);
  });

  it("MAGI crosses $100K: wages $110K + rental -$30K → AGI $80K, MAGI $110K → partial allowance", () => {
    // Without MAGI fix: AGI $80K → under $100K → full $25K → $5K suspended
    // With MAGI fix: MAGI $110K → phase-out $5K → allowance min($25K,$30K)-$5K = $20K → $10K suspended
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "110000", federalWithheld: "18000" }],
      rentalProperties: [{
        ...minimalRental,
        description: "MAGI crossover rental",
        rents: "5000",
        mortgageInterest: "20000",
        depreciation: "10000",
        taxes: "5000",
        // Net: 5K - 35K = -30K rental loss
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = $80K, MAGI = $80K + $30K = $110K
    // Phase-out = ($110K - $100K) × 50% = $5K → base = min($25K, $30K) = $25K → allowance = $20K
    // $30K loss - $20K allowed = $10K suspended
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(10000);
    // AGI corrected: preliminary $80K + $10K suspended = $90K
    // Only $20K of the $30K rental loss is allowed in AGI
    expect(federal.agi.toNumber()).toBe(90000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Income Offset by Passive K-1 Losses in Schedule E
// ═══════════════════════════════════════════════════════════

describe("Rental - rental profit reduced by passive K-1 losses on Schedule E Line 41", () => {
  it("profitable rental income reduced by passive K-1 loss in Schedule E supplemental total", () => {
    // Rental profit +$15K, passive K-1 loss -$8K → Schedule E Line 41 = $7K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{
        ...minimalRental,
        description: "Profitable rental",
        rents: "24000",
        taxes: "4000",
        insurance: "2000",
        depreciation: "3000",
        // Net: 24K - 9K = +15K
      }],
      scheduleK1: [{
        partnershipName: "Passive Loss LP",
        partnershipEIN: "55-1122334",
        ordinaryIncome: "-8000",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "0",
        isPassiveActivity: true,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const schedE = calculateScheduleE(fixture);
    // Rental income contributes +15K
    expect(schedE.totalRentalIncome.toNumber()).toBe(15000);
    // Passive K-1 loss is -8K; net passive = -8K (no passive income to offset)
    // Passive loss allowed up to passive income ($0) → K-1 loss is fully suspended in Line 32
    // Line 32 = 0 (passive loss suspended by partnership logic); Line 41 = 15K + 0 = 15K
    expect(schedE.totalSupplementalIncome.toNumber()).toBe(15000);
    // Confirm K-1 passive loss is identified as suspended
    expect(schedE.suspendedPassiveLosses.length).toBe(1);
    expect(schedE.suspendedPassiveLosses[0].amount.toNumber()).toBe(-8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental With All Four Common Expense Categories
// ═══════════════════════════════════════════════════════════

describe("Rental - mortgage interest, property tax, insurance, and repairs all deducted correctly", () => {
  it("all four primary expense categories sum correctly to reduce rental income", () => {
    const prop = {
      ...minimalRental,
      description: "Fully Expensed SFH",
      rents: "24000",
      mortgageInterest: "9600",  // 12 months × $800/mo
      taxes: "4800",             // property tax
      insurance: "1800",         // hazard insurance
      repairs: "2400",           // maintenance and repairs
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 9600 + 4800 + 1800 + 2400 = 18600
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(18600);
    // Net: 24000 - 18600 = 5400
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(5400);
    // Income and expense amounts from input preserved
    expect(result.rentalProperties[0].rents.toNumber()).toBe(24000);
  });

  it("mortgage interest + taxes + insurance + repairs exceed rents, creating a small loss", () => {
    const prop = {
      ...minimalRental,
      description: "Tight Margin Rental",
      rents: "18000",
      mortgageInterest: "12000",
      taxes: "4200",
      insurance: "1400",
      repairs: "800",
      // Total expenses: 18400; net: -400
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(18400);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-400);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Rental Income Contributing to AGI
// ═══════════════════════════════════════════════════════════

describe("Rental - net rental profit increases AGI through Schedule E Line 41", () => {
  it("rental profit flows into AGI: AGI = wages + rental net income", () => {
    // Wages: $50K, rental net profit: $12K → AGI should be $62K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "7500" }],
      rentalProperties: [{
        ...minimalRental,
        description: "Profit rental contributing to AGI",
        rents: "18000",
        taxes: "3000",
        insurance: "1500",
        repairs: "1500",
        // Net: 18K - 6K = +12K
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = $50K wages + $12K rental income = $62K
    expect(federal.agi.toNumber()).toBe(62000);
    // No suspended losses since rental is profitable
    expect(federal.carryforwards.suspendedPassiveLosses.length).toBe(0);
  });

  it("multiple rental profits all flow into AGI", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "40000", federalWithheld: "6000" }],
      rentalProperties: [
        { ...minimalRental, description: "Unit 1", rents: "12000", taxes: "2000" },  // +10K
        { ...minimalRental, description: "Unit 2", rents: "9000", insurance: "1000" }, // +8K
      ],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = 40K wages + 10K + 8K rental = 58K
    expect(federal.agi.toNumber()).toBe(58000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Loss Suspended and Carried Forward (Prior Year)
// ═══════════════════════════════════════════════════════════

describe("Rental - suspended losses recorded in carryforwards for future year use", () => {
  it("rental loss above AGI-limited allowance is captured in carryforwards", () => {
    // AGI >> $150K; rental loss of $30K → all suspended, captured in carryforwards
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "220000",
        federalWithheld: "44000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "220000",
        medicareWithheld: "3190",
      }],
      rentalProperties: [{
        ...minimalRental,
        description: "Suspended Loss Rental",
        rents: "14000",
        mortgageInterest: "22000",
        depreciation: "12000",
        taxes: "6000",
        insurance: "4000",
        // Net: 14K - 44K = -30K
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI > $150K → $0 rental allowance → entire $30K suspended
    expect(federal.carryforwards.suspendedPassiveLosses).toHaveLength(1);
    expect(federal.carryforwards.suspendedPassiveLosses[0].partnershipName).toBe("Suspended Loss Rental");
    expect(federal.carryforwards.suspendedPassiveLosses[0].amount.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Rental Portfolio (5 Properties)
// ═══════════════════════════════════════════════════════════

describe("Rental - very large portfolio of five properties aggregates correctly", () => {
  it("five-property portfolio: mixed results aggregate to correct total on Schedule E", () => {
    const p1 = {
      ...minimalRental, description: "P1 High-Yield Apartment",
      rents: "48000", taxes: "6000", insurance: "2400", depreciation: "10000", managementFees: "4800",
      // Net: 48K - 23.2K = +24.8K
    };
    const p2 = {
      ...minimalRental, description: "P2 Underwater Mortgage",
      rents: "12000", mortgageInterest: "18000", depreciation: "9000", taxes: "3000",
      // Net: 12K - 30K = -18K
    };
    const p3 = {
      ...minimalRental, description: "P3 Profitable Duplex",
      rents: "30000", mortgageInterest: "12000", taxes: "5000", repairs: "2000", depreciation: "7500",
      // Net: 30K - 26.5K = +3.5K
    };
    const p4 = {
      ...minimalRental, description: "P4 Vacant Unit",
      propertyType: "multi_family" as const,
      rents: "0", taxes: "3000", insurance: "1200", utilities: "600",
      // Net: 0 - 4.8K = -4.8K
    };
    const p5 = {
      ...minimalRental, description: "P5 Commercial Space",
      propertyType: "commercial" as const,
      rents: "36000", taxes: "8000", repairs: "3000", insurance: "2000", depreciation: "11000",
      // Net: 36K - 24K = +12K
    };
    const input = { ...simpleW2Fixture, rentalProperties: [p1, p2, p3, p4, p5] };
    const result = calculateScheduleE(input);

    expect(result.rentalProperties).toHaveLength(5);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(24800);
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(-18000);
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(3500);
    expect(result.rentalProperties[3].netRentalIncome.toNumber()).toBe(-4800);
    expect(result.rentalProperties[4].netRentalIncome.toNumber()).toBe(12000);
    // Total: 24.8K - 18K + 3.5K - 4.8K + 12K = 17.5K
    expect(result.totalRentalIncome.toNumber()).toBe(17500);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail for Rental Calculations
// ═══════════════════════════════════════════════════════════

describe("Rental - audit trail records all Schedule E Part I lines for each property", () => {
  it("audit trail contains income, expense, and net entries for a single rental property", () => {
    const prop = {
      ...minimalRental,
      description: "Audit Test Property",
      rents: "20000",
      mortgageInterest: "8000",
      taxes: "3000",
      insurance: "1500",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);

    // Line 3: rental income recorded
    const incomeLine = result.lines.find(
      (l) => l.form === "Sched E" && l.line === "3" && l.description.includes("Audit Test Property")
    );
    expect(incomeLine).toBeDefined();
    expect(incomeLine!.value.toNumber()).toBe(20000);

    // Line 20: total expenses recorded
    const expenseLine = result.lines.find(
      (l) => l.form === "Sched E" && l.line === "20" && l.description.includes("Audit Test Property")
    );
    expect(expenseLine).toBeDefined();
    expect(expenseLine!.value.toNumber()).toBe(12500);

    // Line 21: net rental income recorded
    const netLine = result.lines.find(
      (l) => l.form === "Sched E" && l.line === "21" && l.description.includes("Audit Test Property")
    );
    expect(netLine).toBeDefined();
    expect(netLine!.value.toNumber()).toBe(7500);
  });

  it("audit trail records Schedule E Line 26 (total rental income) and Line 41 (supplemental total)", () => {
    const prop = {
      ...minimalRental,
      description: "Line 26 Test",
      rents: "15000",
      depreciation: "5000",
    };
    const input = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);

    const line26 = result.lines.find((l) => l.form === "Sched E" && l.line === "26");
    expect(line26).toBeDefined();
    expect(line26!.value.toNumber()).toBe(10000); // 15K - 5K

    const line41 = result.lines.find((l) => l.form === "Sched E" && l.line === "41");
    expect(line41).toBeDefined();
    expect(line41!.value.toNumber()).toBe(10000);
  });

  it("Form 8582 audit trail records official Line 9 and separate suspended loss", () => {
    // Line8 capacity20000, line4 loss20000: line9 allows20000; no suspended loss.
    const result = calculateForm8582({
      activities: [
        {
          name: "Audit Trail Rental",
          income: new Decimal(0),
          loss: new Decimal(-20000),
          isRentalRealEstate: true,
          isActiveParticipant: true,
        },
      ],
      agi: new Decimal(110000),
      filingStatus: "single",
    });
    const line9 = result.lines.find((l) => l.form === "Form 8582" && l.line === "9");
    expect(line9?.value.toNumber()).toBe(20000);
    const suspended = result.lines.find((l) => l.form === "Form 8582" && l.line === "suspended");
    expect(suspended?.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// AGI correction for Form 8582 suspended Part I rental losses
// Per IRS Form 1040 flow: Schedule E reports ALLOWED rental loss
// (after Form 8582), not the full loss. AGI should reflect only
// the allowed portion. Suspended losses must be removed from AGI
// so downstream computations (deductions, credits) use correct AGI.
// ═══════════════════════════════════════════════════════════

describe("AGI corrected for Form 8582 suspended rental losses", () => {
  it("$100K wages, -$30K rental loss, MAGI $100K → AGI = $75K (not $70K) — $5K suspended removed", () => {
    // Single, $100K wages, one rental property with -$30K loss
    // Form 8582 MAGI = $70K + $30K = $100K → no phase-out → $25K allowance
    // Allowed = $25K, suspended = $5K
    // Correct AGI = $100K - $25K = $75K (only allowed loss in AGI)
    // Old AGI = $100K - $30K = $70K (full loss, wrong)
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "100000", federalWithheld: "12000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "10000",
        depreciation: "25000",
        insurance: "5000",
        taxes: "5000",
        repairs: "5000",
        // net = $10K - $40K = -$30K
      }],
    };
    const result = calculateFederalTax(input);
    // AGI should be $75K (wages $100K minus allowed $25K rental loss)
    expect(result.agi.toNumber()).toBe(75000);
    // Taxable income = $75K - $15,750 std ded = $59,250
    expect(result.taxableIncome.toNumber()).toBe(59250);
  });

  it("$80K wages, -$20K rental loss, MAGI $80K → full $20K allowed → AGI unchanged at $60K", () => {
    // MAGI = $60K + $20K = $80K < $100K → full allowance
    // All $20K allowed → no suspended loss → no AGI correction needed
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "10000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "5000",
        depreciation: "15000",
        taxes: "5000",
        repairs: "5000",
        // net = $5K - $25K = -$20K
      }],
    };
    const result = calculateFederalTax(input);
    // No suspended losses → AGI includes full loss: $80K - $20K = $60K
    expect(result.agi.toNumber()).toBe(60000);
  });

  it("$150K wages, -$30K rental loss, MAGI $150K → $0 allowance → AGI = $150K (all $30K suspended)", () => {
    // MAGI = $120K + $30K = $150K → fully phased out → $0 allowance
    // All $30K suspended → AGI corrected from $120K to $150K
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", federalWithheld: "20000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "10000",
        depreciation: "25000",
        insurance: "5000",
        taxes: "5000",
        repairs: "5000",
        // net = $10K - $40K = -$30K
      }],
    };
    const result = calculateFederalTax(input);
    // All $30K suspended → AGI = wages only = $150K
    expect(result.agi.toNumber()).toBe(150000);
  });

  it("rental gain — no suspended losses, AGI includes full gain", () => {
    // Rental gain: no Form 8582 limitation on gains
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "80000", federalWithheld: "10000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "20000",
        taxes: "3000",
        insurance: "2000",
        // net = $20K - $5K = $15K gain
      }],
    };
    const result = calculateFederalTax(input);
    // No suspended losses on gains → AGI = $80K + $15K = $95K
    expect(result.agi.toNumber()).toBe(95000);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Lived Apart — $12,500 Rental Allowance (IRC §469(i)(4)(B))
// ═══════════════════════════════════════════════════════════

describe("MFS lived apart from spouse — $12,500 rental allowance through federal orchestrator", () => {
  it("MFS lived apart — $12,500 rental loss allowed, remainder suspended, AGI corrected", () => {
    // MFS lived apart all year: $12,500 max allowance, $50K-$75K phase-out
    // Wages: $40K, Rental loss: $20K
    // MAGI for Form 8582 = $40K - $20K rental loss in AGI + $20K add-back = $40K
    // $40K MAGI < $50K → full $12,500 allowance
    // Allowed: $12,500, Suspended: $7,500
    // AGI = $40K - $20K + $7,500 add-back = $27,500
    // Wait: AGI flow: wages $40K + rental loss -$20K = $20K preliminary
    // Then 8582 suspends $7,500 → add back $7,500 → corrected AGI = $27,500
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: false,
      },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "40000", federalWithheld: "5000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "10000",
        mortgageInterest: "15000",
        taxes: "8000",
        insurance: "4000",
        depreciation: "3000",
        // net = $10K - $30K = -$20K loss
      }],
    };
    const result = calculateFederalTax(input);
    // With $12,500 allowed out of $20K loss, $7,500 is suspended
    // AGI = wages $40K + allowed rental loss -$12,500 = $27,500
    expect(result.agi.toNumber()).toBe(27500);
  });

  it("MFS who lived with spouse — full $20K rental loss suspended, AGI equals wages only", () => {
    // Same scenario but MFS lived together → $0 allowance → all $20K suspended
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: true,
      },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "40000", federalWithheld: "5000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "10000",
        mortgageInterest: "15000",
        taxes: "8000",
        insurance: "4000",
        depreciation: "3000",
        // net = $10K - $30K = -$20K loss
      }],
    };
    const result = calculateFederalTax(input);
    // $0 allowance → all $20K suspended → AGI = wages only = $40K
    expect(result.agi.toNumber()).toBe(40000);
  });

  it("MFS lived apart — $60K MAGI partially phases out the $12,500 allowance", () => {
    // Wages: $60K, Rental loss: $15K
    // MAGI for Form 8582: preliminary AGI + rental loss add-back + other adjustments
    // Preliminary AGI = $60K - $15K = $45K, but MAGI adds back the $15K rental = $60K
    // Phase-out: 50% × ($60K - $50K) = $5,000 reduction → $7,500 allowance
    // Allowed: $7,500, Suspended: $7,500
    // AGI = $60K - $15K + $7,500 = $52,500
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        livedWithSpouseAtAnyTimeDuringYear: false,
      },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "60000", federalWithheld: "8000" }],
      rentalProperties: [{
        ...minimalRental,
        rents: "5000",
        mortgageInterest: "10000",
        taxes: "5000",
        insurance: "3000",
        depreciation: "2000",
        // net = $5K - $20K = -$15K loss
      }],
    };
    const result = calculateFederalTax(input);
    // With $7,500 allowed, $7,500 suspended
    // AGI = $60K - $15K + $7,500 = $52,500
    expect(result.agi.toNumber()).toBe(52500);
  });
});
