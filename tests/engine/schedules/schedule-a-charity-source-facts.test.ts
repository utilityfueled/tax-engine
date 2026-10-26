// Spec: spec/federal/charitable-current-sources.yaml
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { charitableCarryoverFixture } from "../../fixtures/charitable-carryover.js";
function fixture(year: number, type: "cash" | "property", qualifiedOrganization: boolean | undefined) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    donations: [{ organization: "Synthetic recipient", type, amount: "20000.49", costBasis: "20000.49", dateOfDonation: `${year}-04-15`,
      qualifiedOrganization, isPrivateFoundation: false, isLongTermCapitalGain: false, supportingOrganization: false, donorAdvisedFund: false }] });
}
it("preserves false and unknown current charity qualification in both years", () => {
  for (const year of [2025, 2026]) for (const type of ["cash", "property"] as const) {
    const input = fixture(year, type, false), original = structuredClone(input);
    const constants = year === 2025 ? getConstants(2025) : FEDERAL_2026_CONSTANTS;
    const result = calculateScheduleA(input, d("100000"), "single", constants);
    expect(result.charitableTotal.toString()).toBe("0");
    expect(result.charitableCarryforward.toString()).toBe("0");
    expect(result.nonitemizerCharitableDeduction.toString()).toBe("0");
    expect(input).toEqual(original);
    expect(() => calculateScheduleA(fixture(year, type, undefined), d("100000"), "single", constants)).toThrow(/qualification.*unknown|unknown.*qualification/i);
    expect(calculateScheduleA(fixture(year, type, true), d("100000"), "single", constants).charitableTotal.gt(0)).toBe(true);
  }
});
it("rejects invalid and wrong-year donations before current deduction", () => {
  for (const year of [2025, 2026]) for (const date of ["", "2025-02-29", `${year-1}-04-15`, `${year+1}-04-15`]) {
    const input = fixture(year, "cash", true); input.donations[0].dateOfDonation = date;
    expect(() => calculateScheduleA(input, d("100000"), "single", year === 2025 ? getConstants(2025) : FEDERAL_2026_CONSTANTS)).toThrow(/year|date/i);
  }
});
it("uses identical current category limits with no history or a confirmed empty history", () => {
  const originalHistory = charitableCarryoverFixture().charitableCarryoverSources;
  for (const history of [undefined, { ...originalHistory, vintages: [] }]) {
    const input = fixture(2025, "cash", true);
    input.charitableCarryoverSources = history;
    input.donations[0].amount = "6000";
    input.donations[0].isPrivateFoundation = true;
    input.donations[0].recipientCategory = "private-nonoperating";
    expect(calculateScheduleA(input, d("10000"), "single", getConstants(2025)).charitableTotal.toString()).toBe("3000");
    input.donations[0].amount = "40000";
    input.donations[0].isPrivateFoundation = false;
    input.donations[0].recipientCategory = "fifty-percent";
    input.donations.push({ ...input.donations[0], type: "appreciated_stock", amount: "30000", costBasis: "10000", isLongTermCapitalGain: true });
    const result = calculateScheduleA(input, d("100000"), "single", getConstants(2025));
    expect(result.cashCharitable.toString()).toBe("40000");
    expect(result.nonCashCharitable.toString()).toBe("10000");
    expect(result.charitableTotal.toString()).toBe("50000");
    expect(result.charitableCarryforward.toString()).toBe("20000");
  }
});
it("uses actual property basis and preserves unknown valuation facts in both years", () => {
  for (const year of [2025, 2026]) {
    const input = fixture(year, "property", true);
    input.donations[0].amount = "5000";
    input.donations[0].costBasis = "1000";
    const constants = year === 2025 ? getConstants(2025) : FEDERAL_2026_CONSTANTS;
    expect(calculateScheduleA(input, d("100000"), "single", constants).charitableTotal.toString()).toBe(year === 2025 ? "1000" : "500");
    input.donations[0].costBasis = undefined;
    expect(() => calculateScheduleA(input, d("100000"), "single", constants)).toThrow(/basis/i);
    input.donations[0].costBasis = "1000";
    input.donations[0].isLongTermCapitalGain = undefined;
    expect(() => calculateScheduleA(input, d("100000"), "single", constants)).toThrow(/holding/i);
  }
});
