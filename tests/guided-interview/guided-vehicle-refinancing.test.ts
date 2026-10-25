// Spec: spec/federal/guided-vehicle-refinancing.yaml
import { expect, it } from "vitest";
import { buildSchedule1AInput, type Schedule1AData } from "@/lib/guided-schedule-1-a-facts";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a";
import { TaxpayerSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { guidedVehicleRefinancingFixture } from "../fixtures/guided-vehicle-refinancing";
import { simpleW2Fixture } from "../fixtures/simple-w2";

it("hands off actual refinancing sources with exact amounts and return year", () => {
  for (const year of [2025, 2026]) {
    const { state, data } = guidedVehicleRefinancingFixture(year), before = JSON.stringify(data);
    const result = buildSchedule1AInput(data, state);
    expect(result?.vehicleLoans[0]?.refinancingSources?.originalLoan?.downPayment).toBe("0");
    expect(result?.vehicleLoans[0]?.refinancingSources?.sourceTaxYear).toBe(year);
    expect(JSON.stringify(data)).toBe(before);
    if (!result) throw new Error("Missing actual facts");
    expect(calculateSchedule1A({ taxpayer: TaxpayerSchema.parse({ ...simpleW2Fixture.taxpayer, taxYear: year }), agi: d("50000"), foreignExcludedIncome: d("0"), facts: result }).vehicleInterestDeduction.toFixed()).toBe("1000");
  }
  const { state, data } = guidedVehicleRefinancingFixture();
  const loan = data.vehicleLoans[0]; const current = loan?.refinancingSources?.refinancings?.[0]; const original = loan?.refinancingSources?.originalLoan;
  if (!loan || !current || !original) throw new Error("Missing synthetic source");
  loan.interestPaid = "9,007,199,254,740,993.01"; original.interestPaid = "0"; current.interestPaid = "9,007,199,254,740,993.01";
  expect(buildSchedule1AInput(data, state)?.vehicleLoans[0]?.refinancingSources?.refinancings?.[0]?.interestPaid).toBe("9007199254740993.01");
});
it("rejects missing unknown stale and contradictory refinancing facts", () => {
  const base = guidedVehicleRefinancingFixture();
  for (const mutate of [
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]; if (row) row.refinancingSources = undefined; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]?.refinancingSources; if (row) row.sourceFactsConfirmed = null; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]?.refinancingSources; if (row) row.sourceTaxYear = "2026"; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]?.refinancingSources?.originalLoan; if (row) row.downPayment = ""; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]?.refinancingSources?.originalLoan; if (row) row.firstLien = null; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]?.refinancingSources; if (row) row.sameOriginalBorrowerConfirmed = false; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]; if (row) row.refinanced = false; },
    (data: Schedule1AData) => { const row = data.vehicleLoans[0]; if (row) row.interestPaid = "1200.01"; },
  ]) { const { state, data } = structuredClone(base); mutate(data); const before = JSON.stringify(data); expect(() => buildSchedule1AInput(data, state)).toThrow(); expect(JSON.stringify(data)).toBe(before); }
});
