import { describe, expect, it } from "vitest";
import {
  calculatePAScheduleE,
  type PAScheduleEInput,
} from "@/engine/state/pa-schedule-e.js";

function makeInput(overrides: Partial<PAScheduleEInput> = {}): PAScheduleEInput {
  return {
    taxYear: 2025,
    rentalProperties: [],
    form1099Misc: [],
    scheduleK1: [],
    ...overrides,
  };
}

describe("Pennsylvania Schedule E", () => {
  it("PA Schedule E Line 1 - computes property net income from gross rents less allowable expenses", () => {
    const result = calculatePAScheduleE(makeInput({
      rentalProperties: [
        {
          description: "123 Walnut St",
          propertyType: "single_family",
          rents: "18000",
          advertising: "250",
          cleaning: "300",
          insurance: "1200",
          legalProfessional: "450",
          managementFees: "1500",
          mortgageInterest: "3200",
          repairs: "900",
          supplies: "175",
          taxes: "2100",
          utilities: "600",
          depreciation: "2500",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
    }));

    expect(result.propertyGrossRents.toNumber()).toBe(18000);
    expect(result.totalAllowableExpenses.toNumber()).toBe(13175);
    expect(result.propertyNetIncome.toNumber()).toBe(4825);
    expect(result.netRentalRoyaltyIncome.toNumber()).toBe(4825);
  });

  it("PA Schedule E Line 4 - includes Form 1099-MISC rents and royalties at gross plus pass-through income", () => {
    const result = calculatePAScheduleE(makeInput({
      form1099Misc: [
        {
          payer: "ABC Leasing",
          rents: "2500",
          royalties: "700",
        },
      ],
      scheduleK1: [
        {
          partnershipName: "Keystone Holdings LP",
          partnershipEIN: "12-3456789",
          ordinaryIncome: "0",
          netRentalIncome: "1800",
          otherNetRentalIncome: "400",
          royalties: "600",
        },
      ],
    }));

    expect(result.miscRents.toNumber()).toBe(2500);
    expect(result.miscRoyalties.toNumber()).toBe(700);
    expect(result.passThroughNetIncome.toNumber()).toBe(2800);
    expect(result.netRentalRoyaltyIncome.toNumber()).toBe(6000);
  });

  it("PA Schedule E - keeps current-year rental losses instead of deferring them", () => {
    const result = calculatePAScheduleE(makeInput({
      rentalProperties: [
        {
          description: "456 Pine St",
          propertyType: "single_family",
          rents: "6000",
          repairs: "5000",
          taxes: "2500",
          depreciation: "3000",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
    }));

    expect(result.propertyNetIncome.toNumber()).toBe(-4500);
    expect(result.netRentalRoyaltyIncome.toNumber()).toBe(-4500);
  });

  it("PA Schedule E Line 6 - totals Class 6 income before PA-40 class-level loss limitation", () => {
    const result = calculatePAScheduleE(makeInput({
      rentalProperties: [
        {
          description: "789 Spruce St",
          propertyType: "single_family",
          rents: "12000",
          insurance: "800",
          repairs: "700",
          taxes: "1500",
          depreciation: "2000",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
        {
          description: "Patent license",
          propertyType: "other",
          rents: "0",
          otherExpenses: "300",
          personalUseDays: 0,
          rentalDays: 365,
          isActiveParticipant: true,
          qualifiesForQBI: false,
        },
      ],
      form1099Misc: [
        {
          payer: "Royalty Agent",
          royalties: "900",
        },
      ],
      scheduleK1: [
        {
          partnershipName: "Allegheny Royalties LLC",
          partnershipEIN: "98-7654321",
          ordinaryIncome: "0",
          royalties: "1100",
        },
      ],
    }));

    expect(result.propertyNetIncome.toNumber()).toBe(6700);
    expect(result.netRentalRoyaltyIncome.toNumber()).toBe(8700);
  });

  it("PA Schedule E Line 5 - keeps spouse-attributed pass-through rental income separate on joint returns", () => {
    const result = calculatePAScheduleE(makeInput({
      filingStatus: "married_filing_jointly",
      scheduleK1: [
        {
          partnershipName: "Primary Rentals LLC",
          partnershipEIN: "11-1111111",
          accountHolder: "primary",
          ordinaryIncome: "0",
          netRentalIncome: "5000",
        },
        {
          partnershipName: "Spouse Rentals LLC",
          partnershipEIN: "22-2222222",
          accountHolder: "spouse",
          ordinaryIncome: "0",
          netRentalIncome: "-4000",
        },
        {
          partnershipName: "Joint Royalty LLC",
          partnershipEIN: "33-3333333",
          ordinaryIncome: "0",
          royalties: "1000",
        },
      ],
    }));

    expect(result.passThroughNetIncome.toNumber()).toBe(2000);
    expect(result.taxpayerNetRentalRoyaltyIncome.toNumber()).toBe(5500);
    expect(result.spouseNetRentalRoyaltyIncome.toNumber()).toBe(-3500);
    expect(result.reportableNetRentalRoyaltyIncome.toNumber()).toBe(5500);
  });

  it("PA Schedule E Line 6 - married joint filers do not offset one spouse's Class 6 loss against the other's income", () => {
    const result = calculatePAScheduleE(makeInput({
      filingStatus: "married_filing_jointly",
      scheduleK1: [
        {
          partnershipName: "Primary Rentals LLC",
          partnershipEIN: "11-1111111",
          accountHolder: "primary",
          ordinaryIncome: "0",
          netRentalIncome: "5000",
        },
        {
          partnershipName: "Spouse Rentals LLC",
          partnershipEIN: "22-2222222",
          accountHolder: "spouse",
          ordinaryIncome: "0",
          netRentalIncome: "-4000",
        },
      ],
    }));

    expect(result.netRentalRoyaltyIncome.toNumber()).toBe(1000);
    expect(result.reportableNetRentalRoyaltyIncome.toNumber()).toBe(5000);
  });
});
