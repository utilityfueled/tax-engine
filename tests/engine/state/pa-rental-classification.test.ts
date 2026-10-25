/** Spec: spec/state/pa-rental-classification.yaml. */
import { describe, expect, it } from "vitest";
import { RentalPropertySchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

import { actualPAWorksheet } from "../../fixtures/pa-rental-worksheet.js";

const actual = (overrides: Record<string, unknown> = {}) => ({ sourceReference: "Synthetic actual rental activity records", factsConfirmed: true,
  offeredToPublic: true, forProfit: true, regularAndContinuous: true, averageCustomerUseDays: "7",
  availableDuringBusinessHours: false, significantServices: false, significantOperatingExpenses: false,
  incidentalToRealEstateSales: false, relatedPartyRental: false, dealerPropertyHeldForSale: false, ...overrides });
function input(classification: unknown, overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], rentalProperties: [{
    description: "Synthetic activity", accountHolder: "primary", ownershipPercentage: "50", rents: "20000", repairs: "8000",
    paIncomeExpenses: actualPAWorksheet({ grossRents: "20000", advertising: "0", autoTravel: "0", repairs: "8000", depreciation: "0" }),
    rentalDays: 365, sourceFactsConfirmed: true, paClassification: classification, ...overrides }] });
}
describe("PA actual rental activity classification", () => {
  it("classifies year round rentals from actual customer use and business facts", () => {
    const result = calculatePAReturn(input(actual()));
    expect(result.mappedIncome.netBusinessIncome.toString()).toBe("6000");
    expect(result.mappedIncome.netRentalIncome.toString()).toBe("0");
    expect(calculatePAReturn(input(actual({ averageCustomerUseDays: "30" }))).mappedIncome.netBusinessIncome.toString()).toBe("6000");
    const ordinary = calculatePAReturn(input(actual({ averageCustomerUseDays: "30.01" })));
    expect(ordinary.mappedIncome.netBusinessIncome.toString()).toBe("0");
    expect(ordinary.mappedIncome.netRentalIncome.toString()).toBe("6000");
    for (const field of ["availableDuringBusinessHours", "significantServices", "significantOperatingExpenses", "incidentalToRealEstateSales", "dealerPropertyHeldForSale"]) {
      expect(calculatePAReturn(input(actual({ averageCustomerUseDays: "90", [field]: true }))).mappedIncome.netBusinessIncome.toString(), field).toBe("6000");
    }
    for (const facts of [actual({ relatedPartyRental: true }), actual({ offeredToPublic: false }), actual({ regularAndContinuous: false })]) {
      const rental = calculatePAReturn(input(facts));
      expect(rental.mappedIncome.netRentalIncome.toString()).toBe("6000");
      expect(rental.mappedIncome.netBusinessIncome.toString()).toBe("0");
    }
  });
  it("rejects missing current classification facts and preserves legacy preview limits", () => {
    for (const facts of [undefined, actual({ factsConfirmed: false }), actual({ sourceReference: "" }), actual({ offeredToPublic: undefined }), actual({ averageCustomerUseDays: "-1" }), actual({ averageCustomerUseDays: "0" }), actual({ averageCustomerUseDays: "Infinity" }), actual({ averageCustomerUseDays: "NaN" }), actual({ forProfit: false })]) {
      expect(() => calculatePAReturn(input(facts))).toThrow();
    }
    const historical = input(undefined, { sourceFactsConfirmed: undefined, paIncomeExpenses: undefined, rentalDays: 20 });
    expect(calculatePAReturn(historical).mappedIncome.netBusinessIncome.toString()).toBe("6000");
    const untouched = RentalPropertySchema.parse({ description: "Historical", rents: "1" });
    expect(untouched).not.toHaveProperty("paClassification");
    const current = { ...historical, taxpayer: { ...historical.taxpayer, taxYear: 2026 } };
    expect(() => calculatePAReturn(current)).toThrow(/PA.*classification/);
  });
});
