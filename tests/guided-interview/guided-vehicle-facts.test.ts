// Spec: spec/federal/guided-input.yaml, vehicle-source-records
import { describe, expect, it } from "vitest";
import { buildVehicleCreditInput, vehicleFactErrors, type VehicleCreditData, type VehicleEntryData } from "@/lib/guided-vehicle-facts";
import { Form8936Schema } from "../../src/models/inputs";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyCreditsData } from "@/lib/guided-interview-flow";
import { startCompleteInterview } from "./complete-facts";

const actualVehicle: VehicleEntryData = {
  kind: "new", owner: "primary", vin: "1HGCM82633A004352", dateAcquired: "2025-09-30", datePlacedInService: "2026-01-02", bindingContractDate: "2025-09-29", paymentDate: "2025-09-30",
  bindingContractConfirmed: true, sellerReportReceived: true, sellerReportCreditAmount: "7500", eligibilityConfirmed: true,
  creditTransferredToDealer: false, creditTransferredAmount: "0", resoldWithin30Days: false, returnedToSellerWithin30Days: false,
  personalUsePercentage: "100", msrp: "50000.10", vehicleType: "other", powertrain: "battery", criticalMineralsRequirementMet: true, batteryComponentsRequirementMet: true,
};
function actual(): VehicleCreditData { return { entries: [{ ...actualVehicle }], agiAdjustmentsConfirmed: true, foreignEarnedIncomeExclusion: "0", foreignHousingDeduction: "0", possessionIncomeExclusion: "0" }; }

describe("guided actual clean vehicle records", () => {
  it("requires individual seller report and actual transition facts", () => {
    const data = actual();
    expect(vehicleFactErrors(data, 2026, "single")).toEqual({});
    const result = Form8936Schema.parse(buildVehicleCreditInput(data, 2026, "single"));
    expect(result.newCleanVehicles[0]).toMatchObject({ sourceFactsComplete: true, datePlacedInService: "2026-01-02", msrp: "50000.10", creditTransferredToDealer: false, creditTransferredAmount: "0" });
    expect(result.priorYearAgi).toBeUndefined();
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: [], stateCode: "OH" });
    const withVehicles = { ...state, taxYear: 2026, sectionData: { ...state.sectionData, credits: { ...emptyCreditsData, vehicles: data } } };
    expect(buildTaxInputFromGuidedData(withVehicles)?.form8936?.newCleanVehicles[0]?.vin).toBe(actualVehicle.vin);
    for (const key of ["owner", "vin", "paymentDate", "bindingContractConfirmed", "sellerReportCreditAmount", "sellerReportReceived", "personalUsePercentage", "msrp", "vehicleType", "criticalMineralsRequirementMet"] as const) {
      const entry = { ...actualVehicle }; delete entry[key];
      expect(() => buildVehicleCreditInput({ ...data, entries: [entry] }, 2026, "single")).toThrow();
    }
    expect(() => buildVehicleCreditInput({ ...data, agiAdjustmentsConfirmed: false }, 2026, "single")).toThrow();
    expect(() => buildVehicleCreditInput({ ...data, foreignHousingDeduction: "" }, 2026, "single")).toThrow();
  });
  it("preserves actual zero prior AGI false qualification and exact cents", () => {
    const data = { ...actual(), priorYearAgi: "0", priorYearFilingStatus: "single" as const, priorYearAgiAdjustmentsConfirmed: true, priorYearForeignEarnedIncomeExclusion: "0", priorYearForeignHousingDeduction: "0", priorYearPossessionIncomeExclusion: "0" };
    data.entries[0] = { ...actualVehicle, eligibilityConfirmed: false, msrp: "9007199254740993.01" };
    const result = buildVehicleCreditInput(data, 2026, "single");
    expect(result).toMatchObject({ priorYearAgi: "0", priorYearFilingStatus: "single", newCleanVehicles: [{ eligibilityConfirmed: false, msrp: "9007199254740993.01" }] });
    expect(() => buildVehicleCreditInput({ ...data, priorYearFilingStatus: "" }, 2026, "single")).toThrow();
    expect(() => buildVehicleCreditInput({ ...data, priorYearAgi: "NaN" }, 2026, "single")).toThrow();
  });
  it("rejects duplicate VIN wrong-year service and conflicting transfer facts", () => {
    for (const entries of [
      [actualVehicle, { ...actualVehicle }],
      [{ ...actualVehicle, datePlacedInService: "2025-12-31" }],
      [{ ...actualVehicle, paymentDate: "2026-02-01" }],
      [{ ...actualVehicle, owner: "spouse" as const }],
      [{ ...actualVehicle, creditTransferredToDealer: true, creditTransferredAmount: "7499" }],
      [{ ...actualVehicle, creditTransferredToDealer: false, creditTransferredAmount: "1" }],
      [{ ...actualVehicle, resoldWithin30Days: true, returnedToSellerWithin30Days: true }],
    ]) expect(() => buildVehicleCreditInput({ ...actual(), entries }, 2026, "single")).toThrow();
  });
  it("forwards used vehicle and owner-specific prior MAGI without inventing a joint history", () => {
    const used: VehicleEntryData = { ...actualVehicle, kind: "used", owner: "spouse", salePrice: "20000.01", creditTransferredToDealer: true, sellerReportCreditAmount: "4000", creditTransferredAmount: "4000", returnedToSellerWithin30Days: true, sellerReportUpdatedForReturn: true, priorYearMagi: "0", priorYearFilingStatus: "single", priorYearMagiConfirmed: true };
    const result = buildVehicleCreditInput({ ...actual(), entries: [used] }, 2026, "mfj");
    expect(result?.newCleanVehicles).toEqual([]);
    expect(result?.previouslyOwnedCleanVehicles[0]).toMatchObject({ salePrice: "20000.01", priorYearMagi: "0", priorYearFilingStatus: "single", sellerReportUpdatedForReturn: true });
    expect(result?.previouslyOwnedCleanVehicles[0]).not.toHaveProperty("msrp");
    expect(() => buildVehicleCreditInput({ ...actual(), entries: [{ ...used, sellerReportUpdatedForReturn: undefined }] }, 2026, "mfj")).toThrow();
  });
});
