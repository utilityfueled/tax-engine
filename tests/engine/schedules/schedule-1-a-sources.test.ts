// Spec: spec/federal/schedule-1-a-sources.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { Schedule1ASchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const facts = Schedule1ASchema.parse({ primarySsnEligible: true, spouseSsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: ["primary"] });
function calculate(death: string | null | undefined, dob = "1960-02-14", year = 2025, verified = false) {
  return calculateSchedule1A({ taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: dob } },
    agi: new Decimal("50000"), foreignExcludedIncome: new Decimal(0), facts: { ...facts, ...(verified ? { sourceFactsConfirmed: true, sourceTaxYear: year, sourceReference: "Actual senior source records", allSourcesIncluded: true } : {}) },
    standardDeductionFacts: { primaryDeathDate: death } });
}
it("uses actual senior death dates and preserves unknown status", () => {
  expect(calculate("2025-02-12").seniorDeduction.toFixed()).toBe("0");
  expect(calculate("2025-02-13").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate(null).seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-12-31", "1961-01-01").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-12-30", "1961-01-01").seniorDeduction.toFixed()).toBe("0");
  expect(() => calculate(undefined, "1960-02-14", 2026)).toThrow(/death|unknown/i);
  expect(calculate(null, "1960-02-29").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-02-27", "1960-02-29").seniorDeduction.toFixed()).toBe("0");
  expect(() => calculate("2025-02-28", "1960-02-29")).toThrow(/leap-day/i);
  for (const date of ["2025-02-30", "2024-12-31", "2026-01-01", "1959-02-14"]) expect(() => calculate(date)).toThrow(/date|death|year/i);
  expect(() => calculate(undefined, "1960-02-14", 2025, true)).toThrow(/death|unknown/i);
  expect(calculate(undefined).seniorDeduction.toFixed()).toBe("6000"); // Unverified historical2025 preview compatibility.
});
it("binds senior eligibility to the canonical household death record", () => {
  const base = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1960-02-14" } }, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", socialSecurityWages: "50000", medicareWages: "50000" }], standardDeductionFacts: { primaryDeathDate: "2025-02-12" }, schedule1A: facts });
  const result = calculateFederalTax(base);
  expect(result.schedule1A?.seniorDeduction.toFixed()).toBe("0");
  const reached65 = calculateFederalTax({ ...base, standardDeductionFacts: { primaryDeathDate: "2025-02-13" } });
  expect(reached65.schedule1A?.seniorDeduction.toFixed()).toBe("6000");
  expect(reached65.agi.toFixed()).toBe(result.agi.toFixed());
});
