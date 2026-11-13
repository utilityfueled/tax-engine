// Spec: spec/federal/schedule-c-standard-mileage-2026.yaml
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { calculateOhioCanonicalBusinessSource } from "@/engine/state/oh-business-source.js";
import { calculatePAScheduleCNetIncome } from "@/engine/state/pa-orchestrator.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { canonicalOhioBusinessFixture } from "../../fixtures/oh-canonical-business-sources.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const log = {
  taxYear: 2026,
  logReference: "Private synthetic vehicle log",
  placedInService: "2026-01-01",
  ownedVehicleFirstBusinessYearAndElectionConfirmed: true,
  writtenCompleteMileageLogConfirmed: true,
  eligibleBusinessParkingAndTollsConfirmed: true,
  noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: true,
  noDispositionInServiceYearConfirmed: true,
  commutingMiles: "0",
  otherPersonalMiles: "4.01",
  totalMiles: "7.039",
  parkingAndTolls: "1.10",
  entries: [
    { date: "2026-06-30", miles: "1.011" },
    { date: "2026-07-01", miles: "2.018" },
  ],
} as const;
const taxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026 };
const scheduleC = { accountHolder: "primary", accountingMethod: "cash", grossReceipts: "10000", standardMileage: log };
const fixture = { taxpayer, scheduleC };

describe("2026 Schedule C standard mileage", () => {
  it("uses both rates across June 30 and July 1 and adds confirmed parking and tolls once", () => {
    const input = TaxYearInputSchema.parse(fixture);
    const result = calculateScheduleC(input, input.scheduleC);
    expect(result.totalExpenses.toFixed()).toBe("3.366655");
    expect(result.netProfit.toFixed()).toBe("9996.633345");
    expect(result.expenseBreakdown["Car and truck"]?.toFixed()).toBe("3.366655");
    const row = result.lines.filter(line => line.form === "Sched C" && line.line === "9");
    expect(row).toHaveLength(1);
    expect(row[0]?.inputs["January through June business miles"]?.toString()).toBe("1.011");
    expect(row[0]?.inputs["July through December business miles"]?.toString()).toBe("2.018");
    expect(row[0]?.inputs["Business parking and tolls"]?.toString()).toBe("1.1");
    expect(JSON.stringify(result.lines)).not.toContain(log.logReference);
  });

  it.each([
    ["2026-01-01", "0.725"],
    ["2026-06-30", "0.725"],
    ["2026-07-01", "0.76"],
    ["2026-12-31", "0.76"],
  ])("uses the exact rate for a single mile on %s", (date, expected) => {
    const input = TaxYearInputSchema.parse({ ...fixture, scheduleC: { ...scheduleC, standardMileage: {
      ...log, placedInService: date, totalMiles: "1", otherPersonalMiles: "0", parkingAndTolls: "0",
      entries: [{ date, miles: "1" }],
    } } });
    expect(calculateScheduleC(input).totalExpenses.toFixed()).toBe(expected);
  });

  it("rejects incomplete conflicting and out of scope vehicle evidence", () => {
    for (const change of [
      { taxYear: 2025 }, { logReference: " " }, { commutingMiles: undefined }, { otherPersonalMiles: "-1" },
      { writtenCompleteMileageLogConfirmed: false }, { ownedVehicleFirstBusinessYearAndElectionConfirmed: false },
      { noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: false },
      { noDispositionInServiceYearConfirmed: false },
      { eligibleBusinessParkingAndTollsConfirmed: undefined }, { parkingAndTolls: undefined },
      { totalMiles: "7.0390" }, { parkingAndTolls: "1.101" }, { entries: [] },
      { entries: [log.entries[0], log.entries[0]] }, { entries: [{ date: "2026-02-29", miles: "1" }] },
      { entries: [{ date: "2025-12-31", miles: "1" }] }, { entries: [{ date: "2026-06-30", miles: "0" }] },
      { entries: [{ date: "2026-06-30", miles: "1e3" }] }, { leased: false },
    ]) {
      expect(TaxYearInputSchema.safeParse({ ...fixture, scheduleC: { ...scheduleC, standardMileage: { ...log, ...change } } }).success).toBe(false);
    }
    for (const change of [
      { taxpayer: { ...taxpayer, taxYear: 2025 } }, { taxpayer: { ...taxpayer, filingStatus: "married_filing_jointly" } },
      { scheduleC: { ...scheduleC, accountHolder: "spouse" } }, { scheduleC: { ...scheduleC, accountingMethod: "accrual" } },
      { scheduleC: { ...scheduleC, expenses: { carAndTruck: "0" } } },
      { scheduleC: { ...scheduleC, expenses: { depreciation: "1" } } },
      { scheduleC: { ...scheduleC, expenses: { businessInterest: "1" } } },
      { scheduleC: { ...scheduleC, standardMileage: { ...log, placedInService: "2026-07-01" } } },
      { scheduleC: { ...scheduleC, standardMileage: { ...log, totalMiles: "7.038" } } },
      { scheduleC: { ...scheduleC, standardMileage: { ...log, totalMiles: "7.040" } } },
    ]) {
      const input = TaxYearInputSchema.parse({ ...fixture, ...change });
      expect(() => calculateScheduleC(input, input.scheduleC)).toThrow(/standard mileage/i);
    }
    const input = TaxYearInputSchema.parse(fixture);
    const retainedBusiness = input.scheduleC;
    const retainedMileage = retainedBusiness?.standardMileage;
    if (!retainedMileage) throw new Error("Fixture must retain its standard mileage log");
    expect(() => calculateScheduleC(input, { ...retainedBusiness, standardMileage: undefined })).toThrow(/standard mileage/i);
    expect(() => calculateScheduleC(input, { ...retainedBusiness, standardMileage: { ...retainedMileage, parkingAndTolls: "1.11" } }))
      .toThrow(/retained log/i);
    expect(() => calculateScheduleC({ ...input, form4562: {} } as typeof input)).toThrow(/standard mileage/i);
    expect(() => calculatePAScheduleCNetIncome(input)).toThrow(/separate state source method/i);
    const ohio = canonicalOhioBusinessFixture(2026);
    if (!ohio.input.scheduleC) throw new Error("Fixture must retain its Schedule C");
    ohio.input.scheduleC.standardMileage = retainedMileage;
    ohio.facts.originalFederalSources = structuredClone(ohio.input);
    expect(() => calculateOhioCanonicalBusinessSource({
      taxInput: ohio.input, residencyFacts: ohio.facts, draft2026: true,
    })).toThrow(/separate Ohio business source method/i);
  });

  it("routes the deduction through Schedule SE and preserves historical and full year gates", () => {
    const input = TaxYearInputSchema.parse(JSON.parse(JSON.stringify(fixture)));
    const se = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS);
    expect(se.lines.find(line => line.form === "Sched SE" && line.line === "2")?.value.toFixed()).toBe("9996.633345");
    expect(se.totalSETax.toFixed()).toBe("1413");
    expect(() => calculateFederalTax(input)).toThrow(/2026/);
    const old = TaxYearInputSchema.parse({ taxpayer: { ...taxpayer, taxYear: 2025 }, scheduleC: {
      grossReceipts: "10000", expenses: { carAndTruck: "700.01" },
    } });
    expect(calculateScheduleC(old, old.scheduleC).netProfit.toFixed()).toBe("9299.99");
  });
});
