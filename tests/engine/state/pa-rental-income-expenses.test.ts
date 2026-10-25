/** Spec: spec/state/pa-schedule-e.yaml, actual-pa-property-income-expenses. */
import { describe, expect, it } from "vitest";
import { RentalPropertySchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePAScheduleE } from "@/engine/state/pa-schedule-e.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { calculatePARentalIncomeExpenses } from "@/engine/state/pa-rental-income-expenses.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

import { actualPAWorksheet } from "../../fixtures/pa-rental-worksheet.js";

const property = (overrides: Record<string, unknown> = {}) => RentalPropertySchema.parse({
  description: "Synthetic PA rental", accountHolder: "primary", ownershipPercentage: "50", sourceFactsConfirmed: true,
  rents: "90000", autoTravel: "600", repairs: "30000", depreciation: "10000", paIncomeExpenses: actualPAWorksheet(), ...overrides,
});

describe("PA property income and expense sources", () => {
  it("uses independent PA amounts and rounds each allocated printed line", () => {
    const source = property();
    const result = calculatePAScheduleE({ taxYear: 2025, rentalProperties: [source] });
    // Owner gross10000.50->10001; ad.50->1, travel600.50->601,
    // repairs4000.50->4001, PA depreciation1000.50->1001; expenses5604; net4397.
    expect(result.propertyGrossRents.toString()).toBe("10001");
    expect(result.totalAllowableExpenses.toString()).toBe("5604");
    expect(result.propertyNetIncome.toString()).toBe("4397");
    expect(result.properties[0]).toMatchObject({ sourceFactsVerified: true });
    const printed = result.properties[0].lines;
    expect(printed.find(line => line.line === "16")?.value.toString()).toBe("1001");
    expect(printed.find(line => line.line === "19")?.value.toString()).toBe("5604");
    expect(printed.find(line => line.line === "20")?.value.toString()).toBe("4397");
    expect(printed.find(line => line.line === "21")?.value.toString()).toBe("0");
    expect(source.depreciation).toBe("10000");
  });
  it("refuses missing and inconsistent PA worksheet sources", () => {
    for (const worksheet of [undefined, actualPAWorksheet({ taxYear: 2024 }), actualPAWorksheet({ factsConfirmed: false }),
      actualPAWorksheet({ sourceReference: " " }), actualPAWorksheet({ repairs: undefined }), actualPAWorksheet({ repairs: "-1" }),
      actualPAWorksheet({ repairs: "NaN" }), actualPAWorksheet({ repairs: "Infinity" }), actualPAWorksheet({ amountsBeforeOwnershipAllocation: false }),
      actualPAWorksheet({ expensesAreRentalUseOnly: false }), actualPAWorksheet({ paRulesApplied: false }),
      actualPAWorksheet({ depreciationSourceReference: "" }), actualPAWorksheet({ otherExpenses: "1" })]) {
      expect(() => calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ paIncomeExpenses: worksheet })] }), JSON.stringify(worksheet)).toThrow();
    }
    expect(() => calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ personalUseDays: 1 })] })).toThrow(/allocation/);
    const allocated = calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ personalUseDays: 1, paIncomeExpenses: actualPAWorksheet({ allocationSourceReference: "Synthetic actual rental-use allocation", otherExpenses: "1", otherExpenseDescription: "Actual separate expense" }) })] });
    expect(allocated.propertyNetIncome.toString()).toBe("4396");
  });
  it("retains actual zero loss and large precise source amounts", () => {
    const zero = actualPAWorksheet({ grossRents: "0", advertising: "0", autoTravel: "0", repairs: "0.98", depreciation: "0", depreciationSourceReference: undefined });
    expect(calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ paIncomeExpenses: zero })] }).propertyNetIncome.toString()).toBe("0");
    const loss = calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ paIncomeExpenses: { ...zero, repairs: "1" } })] });
    expect(loss.propertyNetIncome.toString()).toBe("-1");
    expect(loss.properties[0].lines.find(line => line.line === "21")?.value.toString()).toBe("1");
    const huge = calculatePAScheduleE({ taxYear: 2025, rentalProperties: [property({ ownershipPercentage: "100", paIncomeExpenses: { ...zero, repairs: "0.49", grossRents: "9007199254740993.50" } })] });
    expect(huge.propertyNetIncome.toString()).toBe("9007199254740994");
  });
  it("guards raw worksheet boundaries and does not turn absent sources into zero", () => {
    const valid = property();
    for (const value of [undefined, "", "-1", "Infinity", "NaN"]) {
      const incomplete = { ...valid, paIncomeExpenses: { ...valid.paIncomeExpenses, repairs: value } } as typeof valid;
      expect(() => calculatePARentalIncomeExpenses(incomplete, 2025)).toThrow(/actual finite nonnegative/);
    }
    expect(() => calculatePARentalIncomeExpenses(valid, 2024)).toThrow(/year/);
    const absentOwner = { ...valid, sourceFactsConfirmed: undefined, accountHolder: undefined };
    expect(() => calculatePARentalIncomeExpenses(absentOwner, 2025)).toThrow(/ownership/);
    expect(RentalPropertySchema.parse({ description: "Historical", rents: "0" })).not.toHaveProperty("paIncomeExpenses");
  });
  it("uses the PA worksheet for both income classes and preserves historical preview", () => {
    const base = property({ paClassification: { sourceReference: "Synthetic actual bookings", factsConfirmed: true, offeredToPublic: true, forProfit: true,
      regularAndContinuous: true, averageCustomerUseDays: "7", availableDuringBusinessHours: false, significantServices: false,
      significantOperatingExpenses: false, incidentalToRealEstateSales: false, relatedPartyRental: false, dealerPropertyHeldForSale: false } });
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], rentalProperties: [base] });
    expect(calculatePAReturn(input).mappedIncome.netBusinessIncome.toString()).toBe("4397");
    const classification = input.rentalProperties[0].paClassification;
    if (!classification) throw new Error("Synthetic classification fixture missing");
    classification.averageCustomerUseDays = "90";
    expect(calculatePAReturn(input).mappedIncome.netRentalIncome.toString()).toBe("4397");
    const historical = property({ paIncomeExpenses: undefined, sourceFactsConfirmed: undefined });
    const legacy = calculatePAScheduleE({ taxYear: 2025, rentalProperties: [historical] });
    expect(legacy.propertyNetIncome.toString()).toBe("24700");
    expect(legacy.properties[0]).toMatchObject({ sourceFactsVerified: false });
    expect(() => calculatePAScheduleE({ taxYear: 2026, rentalProperties: [historical] })).toThrow(/PA.*worksheet/);
    const current = property({ paIncomeExpenses: actualPAWorksheet({ taxYear: 2026 }) });
    expect(calculatePAScheduleE({ taxYear: 2026, rentalProperties: [current] }).propertyNetIncome.toString()).toBe("4397");
  });
});
