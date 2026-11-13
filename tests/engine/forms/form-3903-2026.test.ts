import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm3903 } from "@/engine/forms/form-3903.js";
import { Form3903Schema, TaxYearInputSchema, type Form3903Input } from "@/models/inputs.js";
import { buildForm3903ReferenceSummary } from "@/pdf/mappings/2025/fill-form-3903.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const militaryMove = {
  moveReference: "synthetic-move-1",
  accountHolder: "primary",
  domesticSameYearConfirmed: true,
  date: "2026-06-30",
  eligibility: { kind: "military", activeDuty: true, permanentChangeOfStationOrdered: true },
  lineAmountsConfirmed: true,
  transportationAndStorage: "20.10",
  reimbursementsExcludedFromIncome: "75.97",
  travel: {
    transportationAndLodging: "1.12",
    vehicle: {
      method: "mileage", parkingAndTolls: "1.01",
      entries: [{ date: "2026-06-30", miles: "101.2" }, { date: "2026-07-01", miles: "202.4" }],
    },
  },
};

const intelligenceMove = {
  moveReference: "synthetic-move-2",
  accountHolder: "spouse",
  domesticSameYearConfirmed: true,
  date: "2026-07-02",
  eligibility: {
    kind: "intelligence-community", employmentStatus: "new-appointee", qualifyingElement: true,
    nonMilitary: true, assignmentRequiresRelocation: true,
  },
  lineAmountsConfirmed: true,
  transportationAndStorage: "1.05",
  reimbursementsExcludedFromIncome: "21.35",
  travel: {
    transportationAndLodging: "2.10",
    vehicle: { method: "actual", gasAndOil: "3.22", parkingAndTolls: "4.09" },
  },
};

describe("2026 Form 3903 confirmed source method", () => {
  it("computes exact mileage, travel, deduction and excess per move", () => {
    const input = Form3903Schema.parse({ taxYear: 2026, moves: [militaryMove, intelligenceMove] });
    const result = calculateForm3903(input, 2026);
    expect(result.moveResults.map(move => [move.line1, move.line2, move.line3, move.line4, move.line5]
      .map(amount => amount.toString()))).toEqual([
      ["20.1", "70.44", "90.54", "75.97", "14.57"],
      ["1.05", "9.41", "10.46", "21.35", "0"],
    ]);
    expect(result.totalDeductible.toString()).toBe("14.57");
    expect(result.totalTaxableReimbursement?.toString()).toBe("10.89");
    expect(result.lines.find(line => line.line === "2 (Move 1)")?.inputs).toMatchObject({
      mileageBeforeJuly: new Decimal("20.746"),
      mileageFromJuly: new Decimal("47.564"),
    });
  });

  it("requires each move to establish its own 2026 eligibility", () => {
    const legacy = Form3903Schema.parse({ military: true, moves: [{ transportationAndStorage: "5" }] });
    expect(() => calculateForm3903(legacy, 2026)).toThrow(/2026.*moving.*sources/i);
    const current = Form3903Schema.parse({ taxYear: 2026, moves: [intelligenceMove] });
    expect(() => calculateForm3903(current, 2025)).toThrow(/year/i);
    expect(Form3903Schema.safeParse({
      taxYear: 2026, moves: [militaryMove, { ...militaryMove, date: "2026-07-01", moveReference: " SYNTHETIC-MOVE-1 " }],
    }).success).toBe(false);
    expect(Form3903Schema.safeParse({
      taxYear: 2026, moves: [militaryMove, { ...militaryMove, moveReference: "synthetic-move-3" }],
    }).success).toBe(false);
    for (const eligibility of [
      { ...militaryMove.eligibility, activeDuty: false },
      { ...militaryMove.eligibility, permanentChangeOfStationOrdered: undefined },
      { ...intelligenceMove.eligibility, nonMilitary: false },
      { ...intelligenceMove.eligibility, qualifyingElement: false },
      { ...intelligenceMove.eligibility, employmentStatus: "contractor" },
      { ...intelligenceMove.eligibility, assignmentRequiresRelocation: false },
    ]) {
      expect(Form3903Schema.safeParse({ taxYear: 2026, moves: [{ ...militaryMove, eligibility }] }).success).toBe(false);
    }
  });

  it("validates dates, zeros and the exclusive travel methods", () => {
    const zero = {
      ...militaryMove, transportationAndStorage: "0", reimbursementsExcludedFromIncome: "0",
      travel: { transportationAndLodging: "0", vehicle: { method: "none" } },
    };
    const input = Form3903Schema.parse({ taxYear: 2026, moves: [zero] });
    const noExpense = calculateForm3903(input, 2026);
    expect(noExpense.totalDeductible.toString()).toBe("0");
    expect(noExpense.totalTaxableReimbursement?.toString()).toBe("0");
    const vehicle = militaryMove.travel.vehicle;
    for (const move of [
      { ...zero, date: "2025-12-31" },
      { ...zero, date: "2026-02-29" },
      { ...zero, domesticSameYearConfirmed: undefined },
      { ...zero, domesticSameYearConfirmed: false },
      { ...zero, lineAmountsConfirmed: false },
      { ...zero, transportationAndStorage: undefined },
      { ...zero, reimbursementsExcludedFromIncome: undefined },
      { ...zero, reimbursementsExcludedFromIncome: "-0.01" },
      { ...zero, reimbursementsExcludedFromIncome: "1000000000000.00" },
      { ...zero, transportationAndStorage: "20.001" },
      { ...zero, travel: { ...zero.travel, transportationAndLodging: undefined } },
      { ...militaryMove, travel: { ...militaryMove.travel, vehicle: { ...vehicle, gasAndOil: "9.50" } } },
      { ...militaryMove, travel: { ...militaryMove.travel, vehicle: { ...vehicle, entries: [{ date: "2027-01-01", miles: "1" }] } } },
      { ...militaryMove, travel: { ...militaryMove.travel, vehicle: { ...vehicle, entries: [{ date: "2026-07-01", miles: "-1" }] } } },
      { ...militaryMove, travel: { ...militaryMove.travel, vehicle: { ...vehicle, entries: [{ date: "2026-07-01", miles: "1.0001" }] } } },
      { ...militaryMove, travel: { ...militaryMove.travel, vehicle: { ...vehicle, entries: [vehicle.entries[0], { ...vehicle.entries[0], miles: "200" }] } } },
    ]) {
      expect(Form3903Schema.safeParse({ taxYear: 2026, moves: [move] }).success).toBe(false);
    }
  });

  it("keeps the canonical return and historical reference export closed to 2026 sources", () => {
    const input = Form3903Schema.parse({ taxYear: 2026, moves: [intelligenceMove] });
    expect(() => buildForm3903ReferenceSummary(input)).toThrow(/2025.*reference/i);
    expect(TaxYearInputSchema.safeParse({ ...simpleW2Fixture, form3903: input }).success).toBe(false);
    const currentTaxpayer = { ...simpleW2Fixture.taxpayer, taxYear: 2026 };
    expect(TaxYearInputSchema.safeParse({
      ...simpleW2Fixture, taxpayer: currentTaxpayer, form3903: { military: true, moves: [{}] },
    }).success).toBe(false);
    expect(TaxYearInputSchema.safeParse({
      ...simpleW2Fixture, taxpayer: currentTaxpayer, adjustments: { armedForcesMovingExpenses: "0.01" },
    }).success).toBe(false);
    expect(() => calculateFederalTax({
      ...simpleW2Fixture, taxpayer: currentTaxpayer, form3903: input,
    })).toThrow(/2026.*incomplete.*unavailable/i);
    for (const taxYear of [2025, undefined]) {
      const hybrid = { taxYear, military: true, moves: [intelligenceMove] };
      expect(Form3903Schema.safeParse(hybrid).success).toBe(false);
      expect(TaxYearInputSchema.safeParse({ ...simpleW2Fixture, form3903: hybrid }).success).toBe(false);
      expect(() => calculateForm3903(hybrid as unknown as Form3903Input)).toThrow();
      expect(() => buildForm3903ReferenceSummary(hybrid as unknown as Form3903Input)).toThrow();
    }
    expect(TaxYearInputSchema.safeParse({
      ...simpleW2Fixture, taxpayer: currentTaxpayer, form3903: input,
    }).success).toBe(false);
  });
});
