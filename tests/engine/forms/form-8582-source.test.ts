import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8582, type PassiveActivity } from "@/engine/forms/form-8582.js";

// Spec: spec/federal/form-8582.yaml; final 2025 Form8582 Parts I-VIII.
const d = (value: Decimal.Value) => new Decimal(value);
const activity = (name: string, income: Decimal.Value, loss: Decimal.Value, rental = true): PassiveActivity => ({
  name, income: d(income), loss: d(loss), isRentalRealEstate: rental, isActiveParticipant: rental,
});
const calculate = (activities: PassiveActivity[], agi: Decimal.Value = 120000) => calculateForm8582({ activities, agi: d(agi), filingStatus: "single" });
const line = (result: ReturnType<typeof calculate>, id: string) => result.lines.find(entry => entry.form === "Form 8582" && entry.line === id)?.value.toString();

describe("Form8582 official worksheet sources", () => {
  it("phases out the allowance capacity before limiting the actual rental loss", () => {
    const result = calculate([activity("Rental", 0, -10000)]);
    expect(result.rentalAllowance.toString()).toBe("10000");
    expect(["4", "5", "6", "7", "8", "9", "10", "11"].map(id => line(result, id)))
      .toEqual(["10000", "150000", "120000", "30000", "15000", "10000", "0", "10000"]);
    expect(line(calculate([activity("Rental", 0, -10000)], 149999), "8")).toBe("1");
    const expired = calculate([activity("Rental", 0, -10000)], 150000);
    expect(line(expired, "7")).toBeUndefined();
    expect(line(expired, "8")).toBeUndefined();
    expect(line(expired, "9")).toBe("0");
  });

  it("caps the special allowance at the combined loss in the IRS line 4 example", () => {
    const result = calculate([activity("Rental", 0, -3000), activity("Other", 100, 0, false)], 80000);
    expect(["1d", "2d", "3", "4", "9", "11"].map(id => line(result, id)))
      .toEqual(["-3000", "100", "-2900", "2900", "2900", "3000"]);
  });

  it("keeps actual current and prior loss columns on the official lines", () => {
    const result = calculateForm8582({ activities: [activity("Rental", 1000, -4500), activity("Fund", 0, -2000, false)],
      agi: d(120000), filingStatus: "single", priorYearSuspendedLosses: [{ name: "Rental", amount: d(1500) }, { name: "Fund", amount: d(3000) }] });
    expect(["1a", "1b", "1c", "1d", "2a", "2b", "2c", "2d", "3"].map(id => line(result, id)))
      .toEqual(["1000", "-4500", "-1500", "-5000", "0", "-2000", "-3000", "-5000", "-10000"]);
    expect(result.activityRows[0]).toMatchObject({ sourceIndex: 0, name: "Rental", isActiveRental: true });
    expect(result.activityRows[0].priorYearSuspendedLoss.toString()).toBe("1500");
  });

  it("retains fully allowed prior losses when combined activities have a gain", () => {
    const result = calculateForm8582({ activities: [activity("Fund", 10000, 0, false)], agi: d(120000), filingStatus: "single",
      priorYearSuspendedLosses: [{ name: "Fund", amount: d(3000) }] });
    expect(result.allowedLoss.toString()).toBe("3000");
    expect(result.activityAllocations[0].allowedLoss.toString()).toBe("3000");
    expect(line(result, "3")).toBe("7000");
    expect(line(result, "11")).toBeUndefined();
    expect(result.requiresForm8582).toBe(true);
  });

  it("allocates unallowed loss by overall activity loss after the special allowance", () => {
    const result = calculateForm8582({ activities: [activity("Profitable", 10000, 0, false), activity("Loss", 0, -10000, false)],
      agi: d(200000), filingStatus: "single", priorYearSuspendedLosses: [{ name: "Profitable", amount: d(4000) }] });
    expect(result.allowedLoss.toString()).toBe("10000");
    expect(result.activityAllocations.map(row => [row.sourceIndex, row.allowedLoss.toString(), row.suspendedLoss.toString()]))
      .toEqual([[0, "4000", "0"], [1, "6000", "4000"]]);
    const mixed = calculate([activity("First", 9000, -10000), activity("Second", 0, -9000)], 140000);
    expect(mixed.rentalAllowance.toString()).toBe("5000");
    expect(mixed.activityAllocations.map(row => row.suspendedLoss.toString())).toEqual(["500", "4500"]);
  });

  it("uses the MFS capacity before limiting the actual loss and skips Part II when ineligible", () => {
    const facts = { activities: [activity("Rental", 0, -5000)], agi: d(60000), filingStatus: "married_filing_separately" as const };
    const apart = calculateForm8582({ ...facts, mfsLivedApartFromSpouseAllYear: true });
    expect(["5", "8", "9"].map(id => line(apart, id))).toEqual(["75000", "7500", "5000"]);
    const together = calculateForm8582({ ...facts, mfsLivedApartFromSpouseAllYear: false });
    expect(line(together, "1b")).toBe("0");
    expect(line(together, "2b")).toBe("-5000");
    expect(line(together, "4")).toBeUndefined();
    expect(together.rentalAllowance.toString()).toBe("0");
  });

  it("keeps PTP net gains outside the regular passive loss pool", () => {
    const result = calculate([activity("Other loss", 0, -10000, false), { ...activity("PTP", 8000, 0, false), isPubliclyTradedPartnership: true }], 200000);
    expect(result.ptpNetIncome.toString()).toBe("8000");
    expect(line(result, "2a")).toBe("0");
    expect(result.allowedLoss.toString()).toBe("0");
    expect(result.suspendedLoss.toString()).toBe("10000");
  });

  it("reconciles proportional dollar rounding while preserving original source cents", () => {
    const result = calculate([activity("A", 0, -1), activity("B", 0, -1), activity("C", 0, -1)], 149998);
    expect(result.activityAllocations.map(row => row.specialAllowance.toString())).toEqual(["1", "0", "0"]);
    expect(result.activityAllocations.reduce((total, row) => total.plus(row.suspendedLoss), d(0)).toString()).toBe("2");
    for (const row of result.activityAllocations) expect(row.allowedLoss.plus(row.suspendedLoss).eq(row.totalLoss.abs())).toBe(true);
    const cents = calculate([activity("Cents", 0, "-100.49")], 80000);
    expect(cents.activityRows[0].sourceCurrentLoss.toString()).toBe("-100.49");
    expect(cents.activityRows[0].currentLoss.toString()).toBe("-100");
  });
});

it("rejects invalid or ambiguous PTP prior-loss sources", () => {
  const ptp = { name: "Actual PTP", income: d("20000"), loss: d("0"), isRentalRealEstate: false,
    isActiveParticipant: false, isPubliclyTradedPartnership: true };
  const input = { activities: [ptp], agi: d("120000"), filingStatus: "single" as const };
  expect(() => calculateForm8582({ ...input, priorYearPTPSuspendedLosses: [{ name: ptp.name, amount: d("-1") }] })).toThrow(/prior.*loss/i);
  expect(() => calculateForm8582({ ...input, priorYearPTPSuspendedLosses: [{ name: ptp.name, amount: d("NaN") }] })).toThrow(/prior.*loss/i);
  expect(() => calculateForm8582({ ...input, activities: [ptp, ptp], priorYearPTPSuspendedLosses: [{ name: ptp.name, amount: d("15000") }] })).toThrow(/identity/i);
  // @ts-expect-error Raw callers can bypass the validated source model.
  expect(() => calculateForm8582({ ...input, activities: [{ ...ptp, name: undefined }] })).toThrow(/actual.*names/i);
});
