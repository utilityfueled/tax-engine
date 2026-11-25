// Spec: spec/federal/schedule-1-a-sources.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { Schedule1ASchema, TaxYearInputSchema } from "@/models/inputs.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { calculateSchedule1AReturn } from "@/engine/forms/schedule-1-a-return.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
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

const statement = {
  taxYear: 2026, sourceReference: "Fictional VLI Copy B", factsConfirmed: true, corrected: false,
  payer: "primary", lenderName: "Fictional original lender", loanAccountReference: "Fictional loan",
  vin: "1HGCM82633A004352", originationDate: "2025-01-09", lenderAcquisitionDate: null,
  reportedInterest: "900.25", directThirdPartyInterest: "300.00", reimbursedBorrowerInterest: "0.00",
  priorYearInterestRefund: "0.00", originalUseChecked: true, usAssemblyChecked: true,
} as const;

const vehicleLoan = {
  owner: statement.payer, lenderName: statement.lenderName, loanAccountReference: statement.loanAccountReference,
  sourceTaxYear: 2026, sourceReference: "Fictional payment records", borrowerQualificationConfirmed: true,
  vin: statement.vin, acquiredDate: "2025-01-09", loanOriginationDate: statement.originationDate,
  interestPaid: "600.25", businessInterestDeducted: "50.00", nonqualifyingInterest: "0.00", firstLien: true,
  originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car",
  grossVehicleWeightRating: 4000, relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: false,
  form1098Vli: statement,
} as const;

function vehicleSourceFacts(loan: Record<string, unknown>, taxYear: number) {
  return Schedule1ASchema.parse({ ...facts, sourceFactsConfirmed: true, sourceTaxYear: taxYear,
    sourceReference: "Fictional Schedule 1-A originals", allSourcesIncluded: true, vehicleLoans: [loan], seniorOwners: [] });
}

function calculateVehicleSource(loan: Record<string, unknown>, taxYear = 2026) {
  return calculateSchedule1A({
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    agi: new Decimal("50000"), foreignExcludedIncome: new Decimal(0),
    facts: vehicleSourceFacts(loan, taxYear),
  });
}

it("reconciles current 1098-VLI interest before applying the existing vehicle deduction", () => {
  const result = calculateVehicleSource(vehicleLoan);
  expect(result.vehicleInterestDeduction.toFixed()).toBe("550");
  const reimbursed = calculateVehicleSource({ ...vehicleLoan, interestPaid: "500.25",
    form1098Vli: { ...statement, reimbursedBorrowerInterest: "100.00" } });
  expect(reimbursed.vehicleInterestDeduction.toFixed()).toBe("450");
  // Stress exact source comparison beyond the default arithmetic precision.
  const precisionControl = calculateVehicleSource({ ...vehicleLoan, interestPaid: "100000000000000000000.11",
    form1098Vli: { ...statement, reportedInterest: "100000000000000000000.13",
      directThirdPartyInterest: "0.01", reimbursedBorrowerInterest: "0.01" } });
  expect(precisionControl.vehicleInterestDeduction.toFixed()).toBe("10000");
  expect(JSON.stringify(result.lines)).not.toMatch(/Fictional|1HGCM82633A004352/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, interestPaid: "900.25" })).toThrow(/1098-VLI/u);

  const returnInput = TaxYearInputSchema.parse({
    ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    schedule1A: vehicleSourceFacts(vehicleLoan, 2026),
  });
  const resolve = (input: typeof returnInput) => calculateSchedule1AReturn({
    input, agi: new Decimal("85000"), foreignExcludedIncome: new Decimal(0),
    tipPayroll: calculateUnreportedTipPayroll(input, FEDERAL_2026_CONSTANTS),
    scheduleC: calculateScheduleC(input, input.scheduleC),
    businessSources: [], adjustedBusinessSources: [], businessDeductionsVerified: true,
  });
  expect(resolve(returnInput).schedule1A.vehicleInterestDeduction.toFixed()).toBe("550");
  expect(() => resolve({ ...returnInput,
    schedule1A: vehicleSourceFacts({ ...vehicleLoan, interestPaid: "900.25" }, 2026) })).toThrow(/1098-VLI/u);
  expect(() => calculateFederalTax(returnInput)).toThrow(/rule pack.*incomplete/u);
});

it("holds mismatched or exceptional 1098-VLI facts without disturbing manual payment records", () => {
  for (const changed of [
    { taxYear: 2025 }, { factsConfirmed: false }, { corrected: true }, { payer: "spouse" },
    { lenderName: "Other lender" }, { loanAccountReference: "Other account" }, { vin: "1HGCM82633A004350" },
    { originationDate: "2025-01-10" }, { lenderAcquisitionDate: "2025-06-14" },
    { priorYearInterestRefund: "0.01" }, { directThirdPartyInterest: undefined },
    { directThirdPartyInterest: "900.26" }, { reportedInterest: "900.251" },
    { originalUseChecked: false }, { usAssemblyChecked: false },
  ]) {
    expect(() => calculateVehicleSource({ ...vehicleLoan, form1098Vli: { ...statement, ...changed } })).toThrow();
  }
  expect(() => calculateVehicleSource({ ...vehicleLoan, refinanced: true })).toThrow(/1098-VLI/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, sourceTaxYear: 2025 }, 2025)).toThrow(/1098-VLI/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, nonqualifyingInterest: "100" })).toThrow(/1098-VLI/u);
  const belowThreshold = { ...vehicleLoan, form1098Vli: undefined, interestPaid: "599.25" };
  expect(calculateVehicleSource(belowThreshold).vehicleInterestDeduction.toFixed()).toBe("549");
});
