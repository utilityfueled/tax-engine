// Spec: spec/federal/schedule-a-medical-mileage-2026.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const log = {
  taxYear: 2026,
  logReference: "Private synthetic medical mileage ledger",
  taxpayerOwnEssentialQualifiedCareConfirmed: true,
  singleVehicleMileageAndEligibleParkingTollsConfirmed: true,
  allTransportationCostsPaidAndUnreimbursedConfirmed: true,
  noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: true,
  otherEligibleUnreimbursedMedicalExpenses: "1499.25",
  parkingAndTolls: "0.50",
  entries: [
    { date: "2026-06-30", miles: "10.125" },
    { date: "2026-07-01", miles: "20.375" },
  ],
} as const;
const taxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026 };
const scheduleA = { medicalMileage: log };
const fixture = { taxpayer, scheduleA };

describe("2026 Schedule A medical mileage", () => {
  it("applies both rate periods and eligible parking and tolls before the medical floor", () => {
    const input = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(fixture)));
    const result = calculateScheduleA(input, d("20000"), "single", FEDERAL_2026_CONSTANTS, { medicalExpenses: d("0") });
    const line1 = result.lines.filter(line => line.form === "Sched A" && line.line === "1");
    expect(line1).toHaveLength(1);
    expect(line1[0]?.value.toFixed()).toBe("1506.61375");
    expect(line1[0]?.inputs["January through June medical miles"]?.toString()).toBe("10.125");
    expect(line1[0]?.inputs["July through December medical miles"]?.toString()).toBe("20.375");
    expect(result.medicalDeduction.toFixed()).toBe("6.61375");
    expect(result.totalItemized.toFixed()).toBe("6.61375");
    expect(JSON.stringify(result.lines)).not.toContain(log.logReference);
  });

  it.each([
    ["2026-01-01", "0.205"],
    ["2026-06-30", "0.205"],
    ["2026-07-01", "0.235"],
    ["2026-12-31", "0.235"],
  ])("applies the exact rate for a single eligible mile on %s", (date, expected) => {
    const input = TaxYearInputSchema.parse({ ...fixture, scheduleA: {
      medicalMileage: { ...log, otherEligibleUnreimbursedMedicalExpenses: "0", parkingAndTolls: "0", entries: [{ date, miles: "1" }] },
    } });
    expect(calculateScheduleA(input, d("0"), "single", FEDERAL_2026_CONSTANTS).medicalDeduction.toFixed()).toBe(expected);
  });

  it("rejects unknown eligibility contradictory sources and mismatched years", () => {
    for (const change of [
      { taxYear: 2025 }, { logReference: "" }, { taxpayerOwnEssentialQualifiedCareConfirmed: false },
      { singleVehicleMileageAndEligibleParkingTollsConfirmed: false },
      { allTransportationCostsPaidAndUnreimbursedConfirmed: undefined },
      { noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: false },
      { otherEligibleUnreimbursedMedicalExpenses: undefined },
      { otherEligibleUnreimbursedMedicalExpenses: "-0.01" }, { otherEligibleUnreimbursedMedicalExpenses: "1.001" },
      { parkingAndTolls: undefined }, { parkingAndTolls: "-0.01" }, { parkingAndTolls: "1.001" },
      { entries: [log.entries[0], log.entries[0]] }, { entries: [{ date: "2026-02-29", miles: "1" }] },
      { entries: [{ date: "2027-01-01", miles: "1" }] }, { entries: [{ date: "2026-06-30", miles: "0" }] },
      { actualGasAndOil: "1" },
    ]) {
      expect(TaxYearInputSchema.safeParse({ ...fixture, scheduleA: { ...scheduleA, medicalMileage: { ...log, ...change } } }).success).toBe(false);
    }
    const input = TaxYearInputSchema.parse(fixture);
    expect(() => calculateScheduleA(input, d("0"), "single", getConstants(2025))).toThrow(/medical mileage/i);
    expect(() => calculateScheduleA(input, d("0"), "head_of_household", FEDERAL_2026_CONSTANTS)).toThrow(/medical mileage/i);
    expect(() => calculateScheduleA(input, d("0"), "single", FEDERAL_2026_CONSTANTS, { medicalExpenses: d("1499.26") })).toThrow(/medical mileage/i);
    for (const medicalExpenses of ["-0.01", "1.001", "1499.25"]) {
      const changed = TaxYearInputSchema.parse({ ...fixture, scheduleA: { ...scheduleA, medicalExpenses } });
      expect(() => calculateScheduleA(changed, d("0"), "single", FEDERAL_2026_CONSTANTS)).toThrow(/medical mileage/i);
    }
    const wrongYear = TaxYearInputSchema.parse({ ...fixture, taxpayer: { ...taxpayer, taxYear: 2025 } });
    expect(() => calculateScheduleA(wrongYear, d("0"), "single", FEDERAL_2026_CONSTANTS)).toThrow(/medical mileage/i);
  });

  it("keeps known zero distinct and preserves the historical and full year gates", () => {
    const zeroOther = TaxYearInputSchema.parse({ ...fixture, scheduleA: { medicalMileage: { ...log, otherEligibleUnreimbursedMedicalExpenses: "0" } } });
    expect(calculateScheduleA(zeroOther, d("-500"), "single", FEDERAL_2026_CONSTANTS).medicalDeduction.toFixed()).toBe("7.36375");
    expect(calculateScheduleA(zeroOther, d("1000"), "single", FEDERAL_2026_CONSTANTS).medicalDeduction.isZero()).toBe(true);
    expect(() => calculateFederalTax(zeroOther)).toThrow(/2026.*incomplete/i);
    const historical = calculateScheduleA(simpleW2Fixture, d("20000"), "single", getConstants(2025), { medicalExpenses: d("1499.25") });
    expect(historical.medicalDeduction.isZero()).toBe(true);
    expect(historical.lines.find(line => line.form === "Sched A" && line.line === "1")?.value.toFixed()).toBe("1499.25");
  });
});
