// Spec: spec/federal/charitable-carryover-sources.yaml
import { expect, it } from "vitest";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { charitableCarryoverFixture } from "../../fixtures/charitable-carryover.js";
it("uses actual prior property history without relabeling it as current cash", () => {
  const input = charitableCarryoverFixture(), original = structuredClone(input);
  const result = calculateScheduleA(input, d("24000"), "single", getConstants(2025));
  expect(result.charitableCurrentCash.toString()).toBe("7000");
  expect(result.charitableCurrentNoncash.toString()).toBe("0");
  expect(result.charitablePriorYearUsed.toString()).toBe("5000");
  expect(result.charitableTotal.toString()).toBe("12000");
  expect(result.cashCharitable.toString()).toBe("7000");
  expect(result.nonCashCharitable.toString()).toBe("5000");
  expect(result.charitableCarryforward.toString()).toBe("2000");
  expect(result.charitableCarryforwardByYear).toEqual([{ sourceId: "current-other_30-cash", taxYear: 2025, category: "other_30", medium: "cash", amount: d("2000") }]);
  expect(input).toEqual(original);
});
it("rejects unclassified legacy prior balances without mutating them", () => {
  for (const priorYear of [{ charitableCarryforward: "2000.10" }, { charitableCarryforwardByYear: [{ taxYear: 2024, amount: "2000.10" }] }]) {
    const input = TaxYearInputSchema.parse({ ...charitableCarryoverFixture(), charitableCarryoverSources: undefined, priorYear });
    const original = structuredClone(input);
    expect(() => calculateScheduleA(input, d("24000"), "single", getConstants(2025))).toThrow(/actual.*history|source.*history/i);
    expect(input).toEqual(original);
  }
});
it("retains actual standard-year absorption after the final deduction choice", () => {
  const input = charitableCarryoverFixture();
  input.w2s[0].wages = "24000"; input.w2s[0].federalWithheld = "5000";
  const standard = calculateFederalTax(input);
  expect(standard.deductionUsed).toBe("standard");
  expect(standard.scheduleA.charitableTreatment?.deduction.toString()).toBe("0");
  expect(standard.scheduleA.charitableTreatment?.priorTreatedAsPaid.toString()).toBe("5000");
  expect(standard.scheduleA.charitableTreatment?.priorDeduction.toString()).toBe("0");
  expect(standard.scheduleA.charitableTreatment?.detail[0].amountUsed.toString()).toBe("0");
  expect(standard.carryforwards.charitableContributions.toString()).toBe("2000");
  const itemized = calculateFederalTax({ ...input, deductionElection: "itemized" });
  expect(itemized.scheduleA.charitableTreatment?.deduction.toString()).toBe("12000");
  expect(itemized.scheduleA.charitableTreatment?.priorDeduction.toString()).toBe("5000");
  expect(itemized.carryforwards.charitableContributions.toString()).toBe("2000");
});
