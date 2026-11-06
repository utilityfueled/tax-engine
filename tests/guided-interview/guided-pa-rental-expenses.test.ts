// Spec: spec/state/pa-schedule-e.yaml, guided-pa-property-worksheet.
import { describe, expect, it } from "vitest";
import { paRentalWorksheetErrors, paRentalAmountFields, type PARentalIncomeExpensesData } from "@/lib/guided-pa-rental-facts";
import { isStartedRental, rentalFactErrors } from "@/lib/guided-rental-facts";
import { buildRentalPropertyInputs } from "@/lib/guided-interview-bridge";
import { emptyRentalPropertyEntry } from "@/lib/guided-interview-flow";
import { completeRentalSource } from "./complete-facts";
import { actualPAWorksheet } from "../fixtures/pa-rental-worksheet";

const source: PARentalIncomeExpensesData = { ...actualPAWorksheet(), taxYear: "2025" };
describe("guided PA rental worksheet", () => {
  it("rejects incomplete wrong-year and unverified source details", () => {
    expect(paRentalWorksheetErrors(source, 2025)).toEqual({});
    for (const patch of [{ taxYear: "2024" }, { taxYear: "20x5" }, { sourceReference: " " }, { factsConfirmed: false },
      { amountsBeforeOwnershipAllocation: false }, { expensesAreRentalUseOnly: false }, { paRulesApplied: false },
      { depreciationSourceReference: "" }, { otherExpenses: "1", otherExpenseDescription: "" }, ...paRentalAmountFields.map(([field]) => ({ [field]: "" }))]) {
      expect(Object.keys(paRentalWorksheetErrors({ ...source, ...patch }, 2025)).length, JSON.stringify(patch)).toBeGreaterThan(0);
    }
    expect(paRentalWorksheetErrors(source, 2025, "1")).toHaveProperty("pa-worksheet-allocation");
    expect(paRentalWorksheetErrors({ ...source, allocationSourceReference: "Actual allocation", otherExpenses: "1", otherExpenseDescription: "Actual itemized expense" }, 2025, "1")).toEqual({});
  });
  it("preserves PA-only partial records and source precision without enabling federal personal use", () => {
    const partial = { ...emptyRentalPropertyEntry, paIncomeExpenses: { grossRents: "0" } };
    expect(isStartedRental(partial)).toBe(true);
    expect(buildRentalPropertyInputs([partial])[0].paIncomeExpenses).toMatchObject({ grossRents: "0", depreciation: undefined, taxYear: undefined });
    const input = { ...completeRentalSource, personalUseDays: "1", paIncomeExpenses: { ...source, allocationSourceReference: "Actual allocation", grossRents: "9,007,199,254,740,993.01" } };
    expect(buildRentalPropertyInputs([input])[0].paIncomeExpenses?.grossRents).toBe("9007199254740993.01");
    expect(rentalFactErrors([input], "single", 2025, "PA")).toHaveProperty("rental-0-personal-allocation");
    expect(rentalFactErrors([{ ...completeRentalSource }], "single", 2025, "OH")).toEqual({});
  });
});
