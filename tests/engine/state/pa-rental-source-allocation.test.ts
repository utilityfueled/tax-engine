/** Specs: spec/state/pa-schedule-e.yaml; pa-orchestrator.yaml. */
import { describe, expect, it } from "vitest";
import { RentalPropertySchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePAScheduleE } from "@/engine/state/pa-schedule-e.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const rental = (overrides: Record<string, unknown> = {}) => RentalPropertySchema.parse({ description: "Synthetic ordinary rental", accountHolder: "primary", ownershipPercentage: "50", sourceFactsConfirmed: true, rents: "20000.02", repairs: "8000.01", ...overrides });

describe("PA actual rental ownership", () => {
  it("PA applies actual property shares once before separate spouse loss limits", () => {
    const records = [rental(), rental({ description: "Spouse property", accountHolder: "spouse", ownershipPercentage: "25", rents: "1000", repairs: "17000" })];
    const result = calculatePAScheduleE({ taxYear: 2025, filingStatus: "married_filing_jointly", rentalProperties: records });
    // Primary50%*(20,000.02-8,000.01)=6,000.005; spouse25%*(1,000-17,000)=-4,000.
    expect(result.propertyGrossRents.toFixed(3)).toBe("10250.010");
    expect(result.totalAllowableExpenses.toFixed(3)).toBe("8250.005");
    expect(result.propertyNetIncome.toFixed(3)).toBe("2000.005");
    expect(result.taxpayerNetRentalRoyaltyIncome.toFixed(3)).toBe("6000.005");
    expect(result.spouseNetRentalRoyaltyIncome.toString()).toBe("-4000");
    expect(result.reportableNetRentalRoyaltyIncome.toFixed(3)).toBe("6000.005");
    expect(records[0].rents).toBe("20000.02");
  });
  it("PA attributes a supported short rental to its actual spouse and share", () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: { ...simpleW2Fixture.taxpayer.primary, ssn: "999-88-7777", firstName: "Spouse" } },
      w2s: [], scheduleC: { accountHolder: "primary", grossReceipts: "100", expenses: { supplies: "10100" } },
      rentalProperties: [rental({ accountHolder: "spouse", rentalDays: 20, rents: "20000", repairs: "8000",
        paClassification: { sourceReference: "Synthetic short-stay bookings", factsConfirmed: true, offeredToPublic: true,
          forProfit: true, regularAndContinuous: true, averageCustomerUseDays: "5", availableDuringBusinessHours: false,
          significantServices: false, significantOperatingExpenses: false, incidentalToRealEstateSales: false,
          relatedPartyRental: false, dealerPropertyHeldForSale: false } })] });
    const result = calculatePAReturn(input);
    expect(result.mappedIncome.netBusinessIncome.toString()).toBe("6000");
    expect(result.pa40.netBusinessIncome.toString()).toBe("6000");
  });
  it("PA refuses unknown or invalid confirmed owner shares", () => {
    for (const overrides of [{ accountHolder: undefined }, { accountHolder: "joint" }, { ownershipPercentage: undefined }, { ownershipPercentage: "0" }, { ownershipPercentage: "100.01" }, { ownershipPercentage: "-1" }, { ownershipPercentage: "NaN" }]) {
      // Exercise the calculation guard directly, including a nonfinite value
      // that the external schema would also reject before calculation.
      expect(() => calculatePAScheduleE({ taxYear: 2025, rentalProperties: [{ ...rental(), ...overrides } as ReturnType<typeof rental>] })).toThrow(/PA.*ownership|PA.*owner/);
    }
    expect(calculatePAScheduleE({ taxYear: 2025, rentalProperties: [rental({ ownershipPercentage: "100", rents: "9007199254740993.01", repairs: "0.01" })] }).propertyNetIncome.toString()).toBe("9007199254740993");
  });
});
