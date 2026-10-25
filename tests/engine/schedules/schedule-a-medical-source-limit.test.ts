// Spec: spec/federal/schedule-a.yaml lines4-negative-agi.
import { expect, it } from "vitest";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

it("never deducts more medical expenses than actually paid at negative AGI", () => {
  for (const [agi, paid, expected] of [
    ["-288000", "0", "0"], ["-288000", "5000", "5000"],
    ["0", "5000", "5000"], ["100000", "10000", "2500"],
  ]) {
    const result = calculateScheduleA(simpleW2Fixture, d(agi), "single", getConstants(2025), { medicalExpenses: d(paid) });
    expect(result.medicalDeduction.toFixed()).toBe(expected);
    expect(result.medicalDeduction.lte(d(paid))).toBe(true);
  }
});
