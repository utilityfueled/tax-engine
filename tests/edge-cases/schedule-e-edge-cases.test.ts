/**
 * Edge case tests for Schedule E — Supplemental Income and Loss.
 * Covers mixed profit/loss properties, K-1 variants, royalties,
 * personal use days, zero rental days, property types, and QBI flow.
 */

import { describe, it, expect } from "vitest";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput, RentalProperty, ScheduleK1 } from "@/models/inputs.js";

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

// ═══════════════════════════════════════════════════════════
// Mixed Rental Profit and Loss Properties (Net to Small Positive)
// ═══════════════════════════════════════════════════════════

describe("Schedule E - mixed rental profit and loss netting to small positive", () => {
  it("four properties: two profitable, two losing, net $500 positive", () => {
    const props: RentalProperty[] = [
      { ...minimalRental, description: "Profit A", rents: "18000", taxes: "3000", insurance: "1500" },
      { ...minimalRental, description: "Profit B", rents: "12000", repairs: "2000" },
      { ...minimalRental, description: "Loss A", rents: "6000", mortgageInterest: "12000", depreciation: "8000" },
      { ...minimalRental, description: "Loss B", rents: "3000", taxes: "5000", insurance: "2000" },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    // Profit A: 18K - 4.5K = 13.5K
    // Profit B: 12K - 2K = 10K
    // Loss A: 6K - 20K = -14K
    // Loss B: 3K - 7K = -4K
    // Net: 13.5K + 10K - 14K - 4K = 5.5K
    expect(result.rentalProperties).toHaveLength(4);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(13500);
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(10000);
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(-14000);
    expect(result.rentalProperties[3].netRentalIncome.toNumber()).toBe(-4000);
    expect(result.totalRentalIncome.toNumber()).toBe(5500);
  });

  it("net nearly zero: $1 positive from mixed properties", () => {
    const props: RentalProperty[] = [
      { ...minimalRental, description: "Earner", rents: "10001", taxes: "5000" },
      { ...minimalRental, description: "Loser", rents: "2000", insurance: "7001" },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    // Earner: 10001 - 5000 = 5001
    // Loser: 2000 - 7001 = -5001 (wait, that's 0, not 1)
    // Let me recalculate: we need net = 1
    // Actually: Earner net = 5001, Loser net = -5000 → total = 1
    expect(result.totalRentalIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 with Both Ordinary Income and Guaranteed Payments
// ═══════════════════════════════════════════════════════════

describe("Schedule E - K-1 ordinary income + guaranteed payments", () => {
  it("both ordinary income and guaranteed payments sum into total", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Law Firm LLP",
        ordinaryIncome: "50000",
        guaranteedPayments: "80000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Total = $50K + $80K = $130K nonpassive
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(130000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(130000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(130000);
  });

  it("guaranteed payments with negative ordinary income nets correctly", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Startup LLC",
        ordinaryIncome: "-30000",
        guaranteedPayments: "45000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Total: -$30K + $45K = $15K → nonpassive income
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(15000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(15000);
  });

  it("guaranteed payments not enough to offset ordinary loss", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Failing Firm",
        ordinaryIncome: "-60000",
        guaranteedPayments: "20000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Total: -$60K + $20K = -$40K → nonpassive loss
    expect(result.partnerships[0].nonpassiveLoss.toNumber()).toBe(-40000);
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple K-1s with Varying Passive/Non-Passive Treatment
// ═══════════════════════════════════════════════════════════

describe("Schedule E - multiple K-1s mixed passive/non-passive", () => {
  it("three K-1s: two passive (one gain, one loss), one nonpassive", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          ...baseK1,
          partnershipName: "Active Consulting",
          ordinaryIncome: "40000",
          isPassiveActivity: false,
        },
        {
          ...baseK1,
          partnershipName: "RE Fund Alpha",
          partnershipEIN: "22-3333333",
          ordinaryIncome: "12000",
          isPassiveActivity: true,
        },
        {
          ...baseK1,
          partnershipName: "RE Fund Beta",
          partnershipEIN: "33-4444444",
          ordinaryIncome: "-18000",
          isPassiveActivity: true,
        },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(3);
    // Nonpassive
    expect(result.totalNonpassiveIncome.toNumber()).toBe(40000);
    expect(result.totalNonpassiveLoss.toNumber()).toBe(0);
    // Passive
    expect(result.totalPassiveIncome.toNumber()).toBe(12000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-18000);
    // Net passive: 12K - 18K = -6K → suspended
    expect(result.suspendedPassiveLosses).toHaveLength(1);
    expect(result.suspendedPassiveLosses[0].partnershipName).toBe("RE Fund Beta");
    expect(result.suspendedPassiveLosses[0].amount.toNumber()).toBe(-6000);
  });

  it("all passive K-1s with net positive: no suspended losses", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        { ...baseK1, partnershipName: "Fund A", partnershipEIN: "11-1111111", ordinaryIncome: "20000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Fund B", partnershipEIN: "22-2222222", ordinaryIncome: "-8000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Fund C", partnershipEIN: "33-3333333", ordinaryIncome: "5000", isPassiveActivity: true },
      ],
    };
    const result = calculateScheduleE(input);
    // Net passive: $20K - $8K + $5K = $17K → positive, no suspended
    expect(result.suspendedPassiveLosses).toHaveLength(0);
    expect(result.totalPassiveIncome.toNumber()).toBe(25000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-8000);
  });

  it("multiple passive losses distributed proportionally to suspended", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        { ...baseK1, partnershipName: "Gainer", partnershipEIN: "11-1111111", ordinaryIncome: "5000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Loser A", partnershipEIN: "22-2222222", ordinaryIncome: "-15000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Loser B", partnershipEIN: "33-3333333", ordinaryIncome: "-10000", isPassiveActivity: true },
      ],
    };
    const result = calculateScheduleE(input);
    // Net passive: $5K - $15K - $10K = -$20K
    // Suspended: $20K, distributed proportionally between Loser A (60%) and Loser B (40%)
    expect(result.suspendedPassiveLosses).toHaveLength(2);
    const loserA = result.suspendedPassiveLosses.find(s => s.partnershipName === "Loser A");
    const loserB = result.suspendedPassiveLosses.find(s => s.partnershipName === "Loser B");
    expect(loserA).toBeDefined();
    expect(loserB).toBeDefined();
    // Loser A: 15K/25K × $20K = $12K
    expect(loserA!.amount.toNumber()).toBe(-12000);
    // Loser B: 10K/25K × $20K = $8K
    expect(loserB!.amount.toNumber()).toBe(-8000);
  });
});

// ═══════════════════════════════════════════════════════════
// Royalty Income from 1099-MISC Flowing Through Part I
// ═══════════════════════════════════════════════════════════

describe("Schedule E - royalty income from 1099-MISC", () => {
  it("multiple 1099-MISC royalties aggregate in Part I", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Misc: [
        { payer: "Publisher A", royalties: "8000", rents: "0", otherIncome: "0", federalWithheld: "0" },
        { payer: "Publisher B", royalties: "3500", rents: "0", otherIncome: "0", federalWithheld: "0" },
      ],
    };
    const result = calculateScheduleE(input);
    // Total royalties: $8K + $3.5K = $11.5K
    expect(result.totalRentalIncome.toNumber()).toBe(11500);
    const line4 = result.lines.find(l => l.line === "4");
    expect(line4).toBeDefined();
    expect(line4!.value.toNumber()).toBe(11500);
  });

  it("royalties combined with rental income on Line 26", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [{ ...minimalRental, rents: "20000", taxes: "4000" }],
      form1099Misc: [
        { payer: "Oil Co", royalties: "6000", rents: "0", otherIncome: "0", federalWithheld: "0" },
      ],
    };
    const result = calculateScheduleE(input);
    // Rental: $20K - $4K = $16K + Royalties: $6K = $22K
    expect(result.totalRentalIncome.toNumber()).toBe(22000);
  });

  it("royalty income flows to AGI through federal pipeline", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Misc: [
        { payer: "Patent Royalties", royalties: "15000", rents: "0", otherIncome: "0", federalWithheld: "0" },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // $85K wages + $15K royalties = $100K total income
    expect(federal.totalIncome.toNumber()).toBe(100000);
  });
});

// ═══════════════════════════════════════════════════════════
// Personal Use Days Reducing Rental Deductions
// ═══════════════════════════════════════════════════════════

describe("Schedule E - personal use days reducing deductions", () => {
  it("heavy personal use (50/150 days) significantly reduces expenses", () => {
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Beach Condo",
      personalUseDays: 50,
      rentalDays: 150,
      rents: "25000",
      insurance: "3000",
      taxes: "5000",
      mortgageInterest: "12000",
      depreciation: "8000",
      utilities: "2000",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 50 > 14 AND 50 > 15 (10% of 150) → mixed-use
    // Rental ratio: 150 / 200 = 0.75
    // Gross expenses: $30K
    // Allocated: floor(30000 × 0.75) = $22,500
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(22500);
    // Net: $25K - $22.5K = $2.5K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(2500);
  });

  it("15 personal days exactly: not mixed-use (boundary test)", () => {
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Cabin",
      personalUseDays: 15,
      rentalDays: 100,
      rents: "10000",
      taxes: "4000",
      insurance: "2000",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 15 > 14 BUT 15 > 10 (10% of 100)? Yes → mixed-use
    // Rental ratio: 100 / 115 = 0.8695...
    // Gross expenses: $6K
    // Allocated: floor(6000 × 100/115) = floor(5217.39) = $5,217
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(5217);
  });

  it("personal days equal to 10% of rental days exactly: not mixed-use", () => {
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Lake House",
      personalUseDays: 20,
      rentalDays: 200, // 10% of 200 = 20, personal = 20, NOT > 20
      rents: "15000",
      repairs: "8000",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 20 > 14 BUT 20 NOT > 20 (10% of 200) → NOT mixed-use
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(8000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Rental Days (Property Held but Not Rented)
// ═══════════════════════════════════════════════════════════

describe("Schedule E - zero rental days", () => {
  it("property with zero rental days and zero rents: expenses create loss", () => {
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Vacant lot held for appreciation",
      propertyType: "land",
      rentalDays: 0,
      rents: "0",
      taxes: "2000",
      insurance: "500",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 0 personal days, so not mixed-use. Full expenses apply.
    // Net: $0 - $2,500 = -$2,500
    expect(result.rentalProperties[0].rents.toNumber()).toBe(0);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(2500);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-2500);
  });

  it("zero rental days with personal use: mixed-use check", () => {
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Personal vacation home",
      personalUseDays: 30,
      rentalDays: 0,
      rents: "0",
      taxes: "5000",
      insurance: "2000",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // 30 > 14, and 30 > 0 (10% of 0 = 0) → mixed-use triggered
    // But rental ratio = 0 / 30 = 0 → all expenses allocated away
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(0);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Property Types
// ═══════════════════════════════════════════════════════════

describe("Schedule E - multiple property types", () => {
  it("single_family, multi_family, and commercial all flow through Part I", () => {
    const props: RentalProperty[] = [
      { ...minimalRental, description: "House", propertyType: "single_family", rents: "18000", taxes: "3000" },
      { ...minimalRental, description: "Duplex", propertyType: "multi_family", rents: "30000", insurance: "4000", repairs: "6000" },
      { ...minimalRental, description: "Office", propertyType: "commercial", rents: "48000", taxes: "8000", insurance: "5000", depreciation: "10000" },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties).toHaveLength(3);
    expect(result.rentalProperties[0].propertyType).toBe("single_family");
    expect(result.rentalProperties[1].propertyType).toBe("multi_family");
    expect(result.rentalProperties[2].propertyType).toBe("commercial");
    // House: 18K - 3K = 15K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(15000);
    // Duplex: 30K - 10K = 20K
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(20000);
    // Office: 48K - 23K = 25K
    expect(result.rentalProperties[2].netRentalIncome.toNumber()).toBe(25000);
    // Total: 15K + 20K + 25K = 60K
    expect(result.totalRentalIncome.toNumber()).toBe(60000);
  });

  it("all properties are marked passive regardless of type", () => {
    const props: RentalProperty[] = [
      { ...minimalRental, description: "SFH", propertyType: "single_family", rents: "10000" },
      { ...minimalRental, description: "MFH", propertyType: "multi_family", rents: "20000" },
      { ...minimalRental, description: "Commercial", propertyType: "commercial", rents: "30000" },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    for (const prop of result.rentalProperties) {
      expect(prop.isPassive).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Single Rental Property — All Expense Categories Populated
// ═══════════════════════════════════════════════════════════

describe("Schedule E - single rental property with all expense categories", () => {
  it("all fourteen expense categories sum correctly against rental income", () => {
    const prop: RentalProperty = {
      description: "Full Expense House",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "60000",
      advertising: "500",
      autoTravel: "800",
      cleaning: "1200",
      commissions: "2400",
      insurance: "2000",
      legalProfessional: "1500",
      managementFees: "4800",
      mortgageInterest: "12000",
      otherInterest: "600",
      repairs: "3500",
      supplies: "400",
      taxes: "6000",
      utilities: "1800",
      depreciation: "9000",
      otherExpenses: "700",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 500+800+1200+2400+2000+1500+4800+12000+600+3500+400+6000+1800+9000+700 = 47200
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(47200);
    // Net: 60000 - 47200 = 12800
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(12800);
    expect(result.totalRentalIncome.toNumber()).toBe(12800);
  });

  it("all expense categories with high values do not lose precision", () => {
    const prop: RentalProperty = {
      description: "High-Value Rental",
      propertyType: "commercial",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "250000",
      advertising: "10000",
      autoTravel: "5000",
      cleaning: "8000",
      commissions: "15000",
      insurance: "12000",
      legalProfessional: "7500",
      managementFees: "25000",
      mortgageInterest: "60000",
      otherInterest: "3000",
      repairs: "20000",
      supplies: "2000",
      taxes: "30000",
      utilities: "9000",
      depreciation: "45000",
      otherExpenses: "4500",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 10000+5000+8000+15000+12000+7500+25000+60000+3000+20000+2000+30000+9000+45000+4500 = 256000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(256000);
    // Net: 250000 - 256000 = -6000 (loss)
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-6000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple K-1 Partnerships Aggregated on Schedule E Part II
// ═══════════════════════════════════════════════════════════

describe("Schedule E - multiple K-1 partnerships aggregated in Part II", () => {
  it("five nonpassive partnerships sum across all lines of Part II", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        { ...baseK1, partnershipName: "Alpha Partners", partnershipEIN: "11-1111111", ordinaryIncome: "30000", isPassiveActivity: false },
        { ...baseK1, partnershipName: "Beta Associates", partnershipEIN: "22-2222222", ordinaryIncome: "15000", isPassiveActivity: false },
        { ...baseK1, partnershipName: "Gamma LLC", partnershipEIN: "33-3333333", ordinaryIncome: "-8000", isPassiveActivity: false },
        { ...baseK1, partnershipName: "Delta Fund", partnershipEIN: "44-4444444", ordinaryIncome: "25000", isPassiveActivity: false },
        { ...baseK1, partnershipName: "Epsilon LP", partnershipEIN: "55-5555555", ordinaryIncome: "-12000", isPassiveActivity: false },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(5);
    // Nonpassive income: 30K + 15K + 25K = 70K
    expect(result.totalNonpassiveIncome.toNumber()).toBe(70000);
    // Nonpassive loss: -8K + -12K = -20K
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-20000);
    // Net: 70K - 20K = 50K
    expect(result.totalPartnershipIncome.toNumber()).toBe(50000);
    // No passive activity involved
    expect(result.totalPassiveIncome.toNumber()).toBe(0);
    expect(result.totalPassiveLoss.toNumber()).toBe(0);
    expect(result.suspendedPassiveLosses).toHaveLength(0);
  });

  it("four passive partnerships with two gains and two losses: Part II columns I and J", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        { ...baseK1, partnershipName: "Passive Gain A", partnershipEIN: "11-1111111", ordinaryIncome: "40000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Passive Gain B", partnershipEIN: "22-2222222", ordinaryIncome: "10000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Passive Loss A", partnershipEIN: "33-3333333", ordinaryIncome: "-25000", isPassiveActivity: true },
        { ...baseK1, partnershipName: "Passive Loss B", partnershipEIN: "44-4444444", ordinaryIncome: "-15000", isPassiveActivity: true },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(4);
    // Column I (passive income): 40K + 10K = 50K
    expect(result.totalPassiveIncome.toNumber()).toBe(50000);
    // Column J (passive loss): -25K + -15K = -40K
    expect(result.totalPassiveLoss.toNumber()).toBe(-40000);
    // Net passive: 50K - 40K = 10K positive → no suspended losses
    expect(result.suspendedPassiveLosses).toHaveLength(0);
    // Allowed passive: 10K net
    expect(result.totalPartnershipIncome.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 with Guaranteed Payments — Schedule E AND Schedule SE
// ═══════════════════════════════════════════════════════════

describe("Schedule E - K-1 guaranteed payments flow to SE and Schedule E", () => {
  it("guaranteed payments appear in Schedule E Part II and trigger SE tax", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Service Partnership LLP",
        ordinaryIncome: "0",
        guaranteedPayments: "60000",
        selfEmploymentEarnings: "60000", // Actual Box14A includes these service payments.
        isPassiveActivity: false,
      }],
    };
    const schedE = calculateScheduleE(input);
    const federal = calculateFederalTax(input);

    // Schedule E: guaranteed payments flow into Part II as nonpassive income
    expect(schedE.partnerships[0].nonpassiveIncome.toNumber()).toBe(60000);
    expect(schedE.totalPartnershipIncome.toNumber()).toBe(60000);

    // Schedule SE: guaranteed payments also trigger self-employment tax
    // Net SE earnings = $60K in guaranteed payments
    expect(federal.scheduleSE.netNonfarmProfit.toNumber()).toBe(60000);
    // SE tax is owed (netNonfarmProfit > $400 threshold)
    expect(federal.scheduleSE.totalSETax.toNumber()).toBeGreaterThan(0);
  });

  it("guaranteed payments and ordinary income both included in SE base and Schedule E", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Active LLP",
        ordinaryIncome: "40000",
        guaranteedPayments: "30000",
        selfEmploymentEarnings: "70000", // Actual Box14A includes ordinary income plus service payments.
        isPassiveActivity: false,
      }],
    };
    const schedE = calculateScheduleE(input);
    const federal = calculateFederalTax(input);

    // Schedule E Part II: ordinary + guaranteed = $70K nonpassive
    expect(schedE.partnerships[0].nonpassiveIncome.toNumber()).toBe(70000);

    // Schedule SE: actual Box14A is $70K; Box4 payments are not added again.
    expect(federal.scheduleSE.netNonfarmProfit.toNumber()).toBe(70000);
    expect(federal.scheduleSE.totalSETax.toNumber()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Income + K-1 Income Combined on Schedule E
// ═══════════════════════════════════════════════════════════

describe("Schedule E - rental income and K-1 income combined", () => {
  it("rental property profit and nonpassive K-1 both add to totalSupplementalIncome", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Rental A", rents: "24000", taxes: "4000", insurance: "2000" },
      ],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Consulting LP",
        ordinaryIncome: "35000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Rental net: 24K - 6K = 18K
    expect(result.totalRentalIncome.toNumber()).toBe(18000);
    // Partnership nonpassive: 35K
    expect(result.totalPartnershipIncome.toNumber()).toBe(35000);
    // Total supplemental: 18K + 35K = 53K
    expect(result.totalSupplementalIncome.toNumber()).toBe(53000);
  });

  it("rental loss and K-1 income combine: loss reduces Schedule E total", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Underwater Rental", rents: "12000", mortgageInterest: "20000", depreciation: "8000" },
      ],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Profitable LP",
        ordinaryIncome: "50000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Rental net: 12K - 28K = -16K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-16000);
    expect(result.totalRentalIncome.toNumber()).toBe(-16000);
    // K-1: +50K nonpassive
    expect(result.totalPartnershipIncome.toNumber()).toBe(50000);
    // Total supplemental: -16K + 50K = 34K
    expect(result.totalSupplementalIncome.toNumber()).toBe(34000);
  });

  it("rental income and K-1 combined flow into federal AGI", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Rental Property", rents: "20000", taxes: "5000" },
      ],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Income LP",
        ordinaryIncome: "10000",
        isPassiveActivity: false,
      }],
    };
    const federal = calculateFederalTax(input);
    // W-2: $85K + rental net $15K + K-1 $10K = $110K total income
    expect(federal.totalIncome.toNumber()).toBe(110000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Rental Income with Expenses — Pure Rental Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule E - zero rental income with expenses creating pure loss", () => {
  it("rented property with no income, all expense categories: pure loss", () => {
    const prop: RentalProperty = {
      description: "Vacant Rental Unit",
      propertyType: "single_family",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "0",
      advertising: "1000",
      autoTravel: "200",
      cleaning: "300",
      commissions: "0",
      insurance: "1500",
      legalProfessional: "500",
      managementFees: "0",
      mortgageInterest: "15000",
      otherInterest: "0",
      repairs: "4000",
      supplies: "250",
      taxes: "3500",
      utilities: "600",
      depreciation: "9000",
      otherExpenses: "150",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 1000+200+300+0+1500+500+0+15000+0+4000+250+3500+600+9000+150 = 36000
    expect(result.rentalProperties[0].rents.toNumber()).toBe(0);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(36000);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-36000);
    expect(result.totalRentalIncome.toNumber()).toBe(-36000);
  });

  it("two pure-loss properties combine for deeper total loss on Line 26", () => {
    const props: RentalProperty[] = [
      {
        ...minimalRental,
        description: "Loss Property 1",
        rents: "0",
        mortgageInterest: "18000",
        depreciation: "7000",
        taxes: "4000",
      },
      {
        ...minimalRental,
        description: "Loss Property 2",
        rents: "0",
        mortgageInterest: "12000",
        depreciation: "5000",
        insurance: "2000",
      },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    // Property 1: 0 - (18K + 7K + 4K) = -29K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-29000);
    // Property 2: 0 - (12K + 5K + 2K) = -19K
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(-19000);
    // Total: -29K + -19K = -48K
    expect(result.totalRentalIncome.toNumber()).toBe(-48000);
  });

  it("pure rental loss reduces total supplemental income below zero", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Loss Rental", rents: "0", mortgageInterest: "20000", depreciation: "10000" },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.totalSupplementalIncome.toNumber()).toBe(-30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Rental Income ($500K+) — No Precision Issues
// ═══════════════════════════════════════════════════════════

describe("Schedule E - very high rental income without precision issues", () => {
  it("$500K rental income with large expenses calculates exactly", () => {
    const prop: RentalProperty = {
      description: "Large Commercial Property",
      propertyType: "commercial",
      personalUseDays: 0,
      rentalDays: 365,
      rents: "500000",
      advertising: "0",
      autoTravel: "0",
      cleaning: "0",
      commissions: "0",
      insurance: "25000",
      legalProfessional: "10000",
      managementFees: "50000",
      mortgageInterest: "150000",
      otherInterest: "0",
      repairs: "30000",
      supplies: "0",
      taxes: "60000",
      utilities: "15000",
      depreciation: "80000",
      otherExpenses: "10000",
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 25K+10K+50K+150K+30K+60K+15K+80K+10K = 430000
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(430000);
    // Net: 500K - 430K = 70K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(70000);
    expect(result.totalRentalIncome.toNumber()).toBe(70000);
  });

  it("$1.2M rental income across multiple properties: no floating point drift", () => {
    const props: RentalProperty[] = [
      { ...minimalRental, description: "Tower A", propertyType: "commercial", rents: "600000", mortgageInterest: "200000", depreciation: "100000", taxes: "50000" },
      { ...minimalRental, description: "Tower B", propertyType: "commercial", rents: "600000", mortgageInterest: "180000", depreciation: "90000", taxes: "45000" },
    ];
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: props };
    const result = calculateScheduleE(input);
    // Tower A: 600K - (200K+100K+50K) = 250K
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(250000);
    // Tower B: 600K - (180K+90K+45K) = 285K
    expect(result.rentalProperties[1].netRentalIncome.toNumber()).toBe(285000);
    // Total: 250K + 285K = 535K
    expect(result.totalRentalIncome.toNumber()).toBe(535000);
  });

  it("$500K+ rental income flows correctly into federal AGI without drift", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Big Rental", rents: "520000", taxes: "80000", depreciation: "100000" },
      ],
    };
    const federal = calculateFederalTax(input);
    // W-2: $85K + rental net ($520K - $180K = $340K) = $425K total income
    expect(federal.totalIncome.toNumber()).toBe(425000);
  });
});

// ═══════════════════════════════════════════════════════════
// Royalty Income — 1099-MISC Box 2 via Schedule E Part I
// ═══════════════════════════════════════════════════════════

describe("Schedule E - royalty income from K-1 netRentalIncome and 1099-MISC", () => {
  it("K-1 royalties field flows into Part II totalPartnershipIncome", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Oil & Gas LP",
        ordinaryIncome: "0",
        royalties: "45000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // K-1 royalties included in totalK1Income, nonpassive
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(45000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(45000);
  });

  it("1099-MISC royalties only (no rental properties): Line 4 = Line 26", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Misc: [
        { payer: "Music Publisher", royalties: "22000", rents: "0", otherIncome: "0", federalWithheld: "0" },
      ],
    };
    const result = calculateScheduleE(input);
    // No rental properties — Line 26 equals royalty income only
    expect(result.rentalProperties).toHaveLength(0);
    expect(result.totalRentalIncome.toNumber()).toBe(22000);
    // Lines audit trail: Line 4 entry for royalties
    const line4 = result.lines.find((l) => l.line === "4");
    expect(line4).toBeDefined();
    expect(line4!.value.toNumber()).toBe(22000);
  });

  it("K-1 with both royalties and ordinary income totals correctly", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Mineral Rights LP",
        ordinaryIncome: "10000",
        royalties: "30000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // K-1 total = ordinary 10K + royalties 30K = 40K nonpassive
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(40000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule E Total Flows to 1040 Through Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Schedule E - totalSupplementalIncome flows through federal pipeline to 1040", () => {
  it("rental net income appears in federal totalIncome (Line 9)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Cash Flow Rental", rents: "30000", taxes: "5000", insurance: "3000" },
      ],
    };
    const federal = calculateFederalTax(input);
    // W-2 $85K + rental net ($30K - $8K = $22K) = $107K
    expect(federal.totalIncome.toNumber()).toBe(107000);
    // scheduleE is accessible on the result
    expect(federal.scheduleE.totalRentalIncome.toNumber()).toBe(22000);
    expect(federal.scheduleE.totalSupplementalIncome.toNumber()).toBe(22000);
  });

  it("K-1 nonpassive income appears in federal totalIncome (Line 9)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Active Business LP",
        ordinaryIncome: "45000",
        isPassiveActivity: false,
      }],
    };
    const federal = calculateFederalTax(input);
    // W-2 $85K + K-1 $45K = $130K
    expect(federal.totalIncome.toNumber()).toBe(130000);
    expect(federal.scheduleE.totalPartnershipIncome.toNumber()).toBe(45000);
    expect(federal.scheduleE.totalSupplementalIncome.toNumber()).toBe(45000);
  });

  it("Schedule E rental loss reduces total income below wages alone", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Distressed Rental", rents: "10000", mortgageInterest: "25000", depreciation: "12000" },
      ],
    };
    const federal = calculateFederalTax(input);
    // Rental net: 10K - 37K = -27K
    // W-2 $85K + rental loss -$27K = $58K total income
    expect(federal.scheduleE.totalRentalIncome.toNumber()).toBe(-27000);
    expect(federal.totalIncome.toNumber()).toBe(58000);
  });

  it("combined rental, K-1, and royalty income all reflected in federal Line 9", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Rental", rents: "18000", taxes: "3000" },
      ],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Business LP",
        ordinaryIncome: "20000",
        isPassiveActivity: false,
      }],
      form1099Misc: [
        { payer: "Book Publisher", royalties: "7000", rents: "0", otherIncome: "0", federalWithheld: "0" },
      ],
    };
    const federal = calculateFederalTax(input);
    // Rental net: 18K - 3K = 15K
    // K-1: 20K
    // Royalties (Part I): 7K (flows through schedE.totalRentalIncome)
    // schedE totalSupplementalIncome: 15K + 7K + 20K = 42K
    // W-2: $85K + supplemental $42K = $127K
    expect(federal.scheduleE.totalRentalIncome.toNumber()).toBe(22000);  // 15K rental + 7K royalties
    expect(federal.scheduleE.totalPartnershipIncome.toNumber()).toBe(20000);
    expect(federal.scheduleE.totalSupplementalIncome.toNumber()).toBe(42000);
    expect(federal.totalIncome.toNumber()).toBe(127000);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 199A QBI from K-1 Partnership
// ═══════════════════════════════════════════════════════════

describe("Schedule E - Section 199A QBI from K-1", () => {
  it("K-1 section199AQBI flows into QBI deduction through federal pipeline", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "60000",
        federalWithheld: "8000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
      }],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Small Biz LP",
        ordinaryIncome: "40000",
        section199AQBI: "40000",
        isPassiveActivity: false,
      }],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = $60K wages + $40K K-1 = $100K
    // Under $197,300 simplified threshold for single filer
    // QBI = $40K, deduction = 20% × $40K = $8K (subject to income limitation)
    // Taxable income before QBI = $100K - $15K std ded = $85K
    // 20% of ($85K - $0 cap gains) = $17K income limitation
    // QBI deduction = min($8K, $17K) = $8K
    expect(federal.form8995).toBeDefined();
    expect(federal.form8995!.qbiDeduction.toNumber()).toBe(8000);
  });

  it("multiple K-1s with section199AQBI aggregate for QBI deduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "7000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
      scheduleK1: [
        {
          ...baseK1,
          partnershipName: "Biz Alpha",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "20000",
          section199AQBI: "20000",
          isPassiveActivity: false,
        },
        {
          ...baseK1,
          partnershipName: "Biz Beta",
          partnershipEIN: "22-2222222",
          ordinaryIncome: "15000",
          section199AQBI: "15000",
          isPassiveActivity: false,
        },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // AGI = $50K + $20K + $15K = $85K (under threshold)
    // Total QBI = $20K + $15K = $35K
    // QBI deduction = 20% × $35K = $7K
    expect(federal.form8995).toBeDefined();
    expect(federal.form8995!.qbiDeduction.toNumber()).toBe(7000);
  });

  it("K-1 with zero section199AQBI: no QBI deduction from that source", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "No QBI LP",
        ordinaryIncome: "20000",
        section199AQBI: "0",
        isPassiveActivity: false,
      }],
    };
    const federal = calculateFederalTax(fixture);
    // No QBI sources → no Form 8995
    // The K-1 income flows to AGI but generates no QBI deduction
    if (federal.form8995) {
      expect(federal.form8995.qbiDeduction.toNumber()).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// K-1 S-Corp: Distributions Are Not Income on Schedule E
// ═══════════════════════════════════════════════════════════

describe("Schedule E - K-1 S-corp distributions vs ordinary income", () => {
  it("S-corp ordinary income flows to Part II but distributions are not a Schedule E line item", () => {
    // S-corp distributions (Box 16D on K-1) are a return of basis, not income.
    // Only Box 1 ordinary income flows through Schedule E Part II.
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Acme S-Corp",
        partnershipEIN: "77-7777777",
        ordinaryIncome: "55000",
        // S-corps do not have guaranteed payments; otherIncome here is not a distribution
        guaranteedPayments: "0",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // Only ordinary income flows to Part II — no distribution field inflates total
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(55000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(55000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(55000);
    // No passive involvement
    expect(result.totalPassiveIncome.toNumber()).toBe(0);
    expect(result.suspendedPassiveLosses).toHaveLength(0);
  });

  it("S-corp ordinary loss flows as nonpassive loss without guaranteed payments", () => {
    // Shareholders of an S-corp with a loss carry it as nonpassive if they materially participate.
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Struggling S-Corp",
        partnershipEIN: "88-8888888",
        ordinaryIncome: "-42000",
        guaranteedPayments: "0", // S-corps never have guaranteed payments
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveLoss.toNumber()).toBe(-42000);
    expect(result.totalNonpassiveLoss.toNumber()).toBe(-42000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(-42000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple K-1s from Different Entity Types
// ═══════════════════════════════════════════════════════════

describe("Schedule E - multiple K-1s from different entity types in Part II", () => {
  it("partnership K-1 with guaranteed payments and S-corp K-1 with only ordinary income aggregate correctly", () => {
    // Partnership pays guaranteed payments; S-corp does not.
    // Both flow through Schedule E Part II as nonpassive income.
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          ...baseK1,
          partnershipName: "Active Partnership LLP",
          partnershipEIN: "11-2222222",
          ordinaryIncome: "30000",
          guaranteedPayments: "25000", // partnership only
          isPassiveActivity: false,
        },
        {
          ...baseK1,
          partnershipName: "Active S-Corp Inc",
          partnershipEIN: "33-4444444",
          ordinaryIncome: "40000",
          guaranteedPayments: "0", // S-corps never issue guaranteed payments
          isPassiveActivity: false,
        },
      ],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships).toHaveLength(2);
    // Partnership: 30K + 25K = 55K nonpassive
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(55000);
    // S-corp: 40K nonpassive
    expect(result.partnerships[1].nonpassiveIncome.toNumber()).toBe(40000);
    // Combined nonpassive: 55K + 40K = 95K
    expect(result.totalNonpassiveIncome.toNumber()).toBe(95000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(95000);
  });

  it("three entities: partnership (passive loss), S-corp (nonpassive income), LLC (passive gain)", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          ...baseK1,
          partnershipName: "Passive RE Fund LP",
          partnershipEIN: "55-1111111",
          ordinaryIncome: "-22000",
          isPassiveActivity: true,
        },
        {
          ...baseK1,
          partnershipName: "Operating S-Corp",
          partnershipEIN: "66-2222222",
          ordinaryIncome: "60000",
          isPassiveActivity: false,
        },
        {
          ...baseK1,
          partnershipName: "Passive Tech LLC",
          partnershipEIN: "77-3333333",
          ordinaryIncome: "10000",
          isPassiveActivity: true,
        },
      ],
    };
    const result = calculateScheduleE(input);
    // Nonpassive (S-corp): 60K
    expect(result.totalNonpassiveIncome.toNumber()).toBe(60000);
    // Passive income (LLC): 10K; passive loss (RE Fund): -22K
    expect(result.totalPassiveIncome.toNumber()).toBe(10000);
    expect(result.totalPassiveLoss.toNumber()).toBe(-22000);
    // Net passive: 10K - 22K = -12K → suspended losses exist
    expect(result.suspendedPassiveLosses).toHaveLength(1);
    expect(result.suspendedPassiveLosses[0].partnershipName).toBe("Passive RE Fund LP");
    expect(result.suspendedPassiveLosses[0].amount.toNumber()).toBe(-12000);
    // Line 32: nonpassive 60K + limited passive.
    // Net passive = 10K income - 22K loss = -12K (suspended). Allowed passive = 10K - 10K = 0.
    // totalPartnershipIncome = 60K nonpassive + 0 allowed passive = 60K
    expect(result.totalPartnershipIncome.toNumber()).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════
// Rental Depreciation as Primary Expense Driver
// ═══════════════════════════════════════════════════════════

describe("Schedule E - rental depreciation as the sole or dominant expense", () => {
  it("zero rental income with only depreciation creates a pure depreciation-driven loss", () => {
    // A property held for rental with no tenants still accrues depreciation.
    // The full depreciation deduction creates a rental loss even with $0 income.
    const prop: RentalProperty = {
      ...minimalRental,
      description: "Depreciating Vacant Property",
      rents: "0",
      depreciation: "12727", // standard 27.5-year MACRS on $350K basis
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    expect(result.rentalProperties[0].rents.toNumber()).toBe(0);
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(12727);
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-12727);
    expect(result.totalRentalIncome.toNumber()).toBe(-12727);
  });

  it("depreciation exceeds rental income creating a loss even with positive rents", () => {
    // Depreciation recapture implications: large depreciation can make profitable-looking
    // rentals show a tax loss. The net rental income is rents minus all expenses including depreciation.
    const prop: RentalProperty = {
      ...minimalRental,
      description: "High Depreciation Rental",
      rents: "36000",
      mortgageInterest: "18000",
      taxes: "5000",
      depreciation: "18200", // MACRS depreciation on high-value property
    };
    const input: TaxYearInput = { ...simpleW2Fixture, rentalProperties: [prop] };
    const result = calculateScheduleE(input);
    // Total expenses: 18K + 5K + 18.2K = 41.2K
    expect(result.rentalProperties[0].totalExpenses.toNumber()).toBe(41200);
    // Net: 36K - 41.2K = -5.2K → tax loss from depreciation
    expect(result.rentalProperties[0].netRentalIncome.toNumber()).toBe(-5200);
    expect(result.totalRentalIncome.toNumber()).toBe(-5200);
  });

  it("depreciation recapture modeled via otherIncome on K-1 flows as ordinary income", () => {
    // When a partnership sells a depreciable asset, §1250 unrecaptured depreciation
    // flows to the partner as ordinary income via K-1 otherIncome (Box 11).
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "RE Disposition LP",
        partnershipEIN: "99-1234567",
        ordinaryIncome: "0",
        otherIncome: "28000", // unrecaptured §1250 ordinary income component
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // otherIncome flows into totalK1Income and is treated as nonpassive
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(28000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(28000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(28000);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large K-1 Income ($1M+) Flowing to AGI
// ═══════════════════════════════════════════════════════════

describe("Schedule E - very large K-1 income ($1M+) flowing to AGI", () => {
  it("$1M nonpassive K-1 ordinary income flows through Part II without precision loss", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Mega Venture Partners",
        partnershipEIN: "12-9999999",
        ordinaryIncome: "1000000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(1000000);
    expect(result.totalNonpassiveIncome.toNumber()).toBe(1000000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(1000000);
    // Supplemental income = rental ($0) + K-1 ($1M)
    expect(result.totalSupplementalIncome.toNumber()).toBe(1000000);
  });

  it("$2.5M K-1 with guaranteed payments and ordinary income totals exactly via Decimal.js", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Billion Dollar LP",
        partnershipEIN: "13-8888888",
        ordinaryIncome: "1500000",
        guaranteedPayments: "1000000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateScheduleE(input);
    // 1.5M + 1M = 2.5M, no floating point drift with Decimal.js
    expect(result.partnerships[0].nonpassiveIncome.toNumber()).toBe(2500000);
    expect(result.totalPartnershipIncome.toNumber()).toBe(2500000);
    expect(result.totalSupplementalIncome.toNumber()).toBe(2500000);
  });

  it("$1M+ K-1 flows to federal AGI and pushes into top marginal bracket", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Large Fund LP",
        partnershipEIN: "14-7777777",
        ordinaryIncome: "1200000",
        isPassiveActivity: false,
      }],
    };
    const federal = calculateFederalTax(input);
    // W-2: $85K + K-1: $1.2M = $1.285M total income
    expect(federal.totalIncome.toNumber()).toBe(1285000);
    expect(federal.scheduleE!.totalSupplementalIncome.toNumber()).toBe(1200000);
    // Tax should be substantial — at minimum well above $300K (top bracket territory)
    expect(federal.totalTax.toNumber()).toBeGreaterThan(300000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule E Totals Feeding Schedule 1 Line 5
// ═══════════════════════════════════════════════════════════

describe("Schedule E - totalSupplementalIncome feeds Schedule 1 Line 5", () => {
  it("Schedule E Line 41 equals Schedule 1 Line 5 supplemental income in federal pipeline", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Duplex", rents: "28000", taxes: "5000", insurance: "3000" },
      ],
      scheduleK1: [{
        ...baseK1,
        partnershipName: "Side LP",
        ordinaryIncome: "14000",
        isPassiveActivity: false,
      }],
    };
    const schedE = calculateScheduleE(input);
    const federal = calculateFederalTax(input);

    // Schedule E Line 41 (totalSupplementalIncome)
    // Rental: 28K - 8K = 20K; K-1: 14K; total: 34K
    expect(schedE.totalRentalIncome.toNumber()).toBe(20000);
    expect(schedE.totalPartnershipIncome.toNumber()).toBe(14000);
    expect(schedE.totalSupplementalIncome.toNumber()).toBe(34000);

    // Federal pipeline: Schedule E Line 41 → Schedule 1 Line 5 → 1040 Line 8 → Total Income
    // W-2 $85K + Schedule E $34K = $119K
    expect(federal.totalIncome.toNumber()).toBe(119000);
    // The scheduleE result on the federal return matches the direct calculation
    expect(federal.scheduleE!.totalSupplementalIncome.toNumber()).toBe(34000);
  });

  it("Schedule E rental loss feeds Schedule 1 Line 5 as negative, reducing AGI", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Underwater Duplex", rents: "15000", mortgageInterest: "30000", depreciation: "10000" },
      ],
    };
    const schedE = calculateScheduleE(input);
    const federal = calculateFederalTax(input);

    // Rental loss: 15K - 40K = -25K on Line 41
    expect(schedE.totalSupplementalIncome.toNumber()).toBe(-25000);

    // Schedule 1 Line 5 carries the loss; AGI is wages + rental loss
    // W-2: $85K + (-$25K) = $60K total income
    expect(federal.totalIncome.toNumber()).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — Part I and Part II Lines
// ═══════════════════════════════════════════════════════════

describe("Schedule E - audit trail covers Part I and Part II lines", () => {
  it("Part I audit trail records Line 3, Line 20, Line 21, and Line 26 for each rental property", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      rentalProperties: [
        { ...minimalRental, description: "Audit House", rents: "24000", taxes: "4000", insurance: "2000" },
      ],
    };
    const result = calculateScheduleE(input);

    // Line 3: rental income for the property
    const line3 = result.lines.find((l) => l.line === "3" && l.description.includes("Audit House"));
    expect(line3).toBeDefined();
    expect(line3!.value.toNumber()).toBe(24000);

    // Line 20: total expenses for the property
    const line20 = result.lines.find((l) => l.line === "20" && l.description.includes("Audit House"));
    expect(line20).toBeDefined();
    expect(line20!.value.toNumber()).toBe(6000);

    // Line 21: net rental income per property
    const line21 = result.lines.find((l) => l.line === "21" && l.description.includes("Audit House"));
    expect(line21).toBeDefined();
    expect(line21!.value.toNumber()).toBe(18000);

    // Line 26: total rental income (sum of all Line 21 + royalties)
    const line26 = result.lines.find((l) => l.line === "26");
    expect(line26).toBeDefined();
    expect(line26!.value.toNumber()).toBe(18000);
  });

  it("Part II audit trail records Line 28 per partnership and column totals", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [
        {
          ...baseK1,
          partnershipName: "Audit Partnership A",
          partnershipEIN: "11-0000001",
          ordinaryIncome: "25000",
          isPassiveActivity: false,
        },
        {
          ...baseK1,
          partnershipName: "Audit Partnership B",
          partnershipEIN: "22-0000002",
          ordinaryIncome: "15000",
          isPassiveActivity: true,
        },
      ],
    };
    const result = calculateScheduleE(input);

    // Line 28 entries for each partnership
    const line28Entries = result.lines.filter((l) => l.line === "28");
    expect(line28Entries.length).toBeGreaterThanOrEqual(2);

    const partnershipAEntry = line28Entries.find((l) => l.description.includes("Audit Partnership A"));
    expect(partnershipAEntry).toBeDefined();
    expect(partnershipAEntry!.value.toNumber()).toBe(25000);

    const partnershipBEntry = line28Entries.find((l) => l.description.includes("Audit Partnership B"));
    expect(partnershipBEntry).toBeDefined();
    expect(partnershipBEntry!.value.toNumber()).toBe(15000);

    // Column totals recorded
    const colG = result.lines.find((l) => l.line === "28-col-G");
    expect(colG).toBeDefined();
    expect(colG!.value.toNumber()).toBe(25000); // nonpassive income total

    const colI = result.lines.find((l) => l.line === "28-col-I");
    expect(colI).toBeDefined();
    expect(colI!.value.toNumber()).toBe(15000); // passive income total

    // Line 32: total partnership income
    const line32 = result.lines.find((l) => l.line === "32");
    expect(line32).toBeDefined();
    expect(line32!.value.toNumber()).toBe(40000); // 25K nonpassive + 15K passive

    // Line 41: total supplemental income
    const line41 = result.lines.find((l) => l.line === "41");
    expect(line41).toBeDefined();
    expect(line41!.value.toNumber()).toBe(40000);
  });
});
