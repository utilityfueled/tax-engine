/**
 * Tests for Illinois Schedule G — Voluntary Charitable Donations
 * Spec: spec/state/il-schedule-g.yaml
 *
 * Source: Illinois Department of Revenue, 2025 Schedule G Instructions
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleG, type ScheduleGInput } from "@/engine/state/il-schedule-g.js";

const d = (value: number | string) => new Decimal(value);
const ZERO = d(0);

function makeInput(overrides: Partial<ScheduleGInput> = {}): ScheduleGInput {
  return {
    taxYear: 2025,
    wildlifePreservationFund: ZERO,
    alzheimersFund: ZERO,
    assistanceToHomelessFund: ZERO,
    diabetesResearchFund: ZERO,
    hungerReliefFund: ZERO,
    ronaldMcDonaldHouseCharitiesFund: ZERO,
    ...overrides,
  };
}

describe("Illinois Schedule G", () => {
  it("Schedule G Line 1a - wildlife preservation fund accepts a whole-dollar donation", () => {
    const result = calculateScheduleG(makeInput({
      wildlifePreservationFund: d(25),
    }));

    expect(result.wildlifePreservationFund.toNumber()).toBe(25);
    expect(result.totalDonations.toNumber()).toBe(25);
  });

  it("Schedule G Line 1b - Alzheimer's fund donation is preserved", () => {
    const result = calculateScheduleG(makeInput({
      alzheimersFund: d(10),
    }));

    expect(result.alzheimersFund.toNumber()).toBe(10);
    expect(result.totalDonations.toNumber()).toBe(10);
  });

  it("Schedule G Line 2 - total donation sums all six supported funds", () => {
    const result = calculateScheduleG(makeInput({
      wildlifePreservationFund: d(5),
      alzheimersFund: d(10),
      assistanceToHomelessFund: d(15),
      diabetesResearchFund: d(20),
      hungerReliefFund: d(25),
      ronaldMcDonaldHouseCharitiesFund: d(30),
    }));

    expect(result.totalDonations.toNumber()).toBe(105);
  });

  it("throws when a donation is negative", () => {
    expect(() => calculateScheduleG(makeInput({
      hungerReliefFund: d(-1),
    }))).toThrow("Schedule G Hunger Relief Fund donation cannot be negative");
  });

  it("throws when a donation is not a whole dollar", () => {
    expect(() => calculateScheduleG(makeInput({
      diabetesResearchFund: d("12.50"),
    }))).toThrow("Schedule G Diabetes Research Fund donation must be a whole-dollar amount");
  });
});
