// Spec: spec/federal/charitable-current-sources.yaml
import { expect, it, vi } from "vitest";

// Supply the indexed constants for this focused calculation test without opening the release gate.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

import { calculateFederalTax } from "@/index.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { charitableCarryoverFixture } from "../../fixtures/charitable-carryover.js";
function fixture(year: number, type: "cash" | "property", qualifiedOrganization: boolean | undefined, organization = "Synthetic recipient") {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    donations: [{ organization, type, amount: "20000.49", costBasis: "20000.49", dateOfDonation: `${year}-04-15`,
      qualifiedOrganization, isPrivateFoundation: false, isLongTermCapitalGain: false, supportingOrganization: false, donorAdvisedFund: false }] });
}
const recipientReturns = [
  { year: 2025, election: "itemized", itemizedGift: "20000", standardGift: "0" },
  { year: 2026, election: "itemized", itemizedGift: "19575", standardGift: "0" },
  { year: 2026, election: "standard", itemizedGift: "19575", standardGift: "1000" },
] as const;
it.each(recipientReturns.flatMap(result => [
  { ...result, missingName: "blank", organization: "" },
  { ...result, missingName: "whitespace-only", organization: " \t\n " },
]))("requires the actual current charitable recipient for a $year $election return with a $missingName name", ({
  year, election, itemizedGift, standardGift, organization,
}) => {
  const named = fixture(year, "cash", true, " Actual Synthetic Recipient ");
  named.deductionElection = election;
  const original = structuredClone(named);
  const result = calculateFederalTax(named);
  expect(result.deductionUsed).toBe(election);
  expect(result.scheduleA?.charitableTotal.toFixed()).toBe(itemizedGift);
  expect(result.nonitemizerCharitableDeduction.toFixed()).toBe(standardGift);
  expect(named).toEqual(original);
  const unnamed = fixture(year, "cash", true, organization);
  unnamed.deductionElection = election;
  expect(() => calculateFederalTax(unnamed)).toThrow(/actual.*recipient name/i);
});
it("preserves false and unknown current charity qualification in both years", () => {
  for (const year of [2025, 2026]) for (const type of ["cash", "property"] as const) {
    const input = fixture(year, type, false, " \t "), original = structuredClone(input);
    const constants = year === 2025 ? getConstants(2025) : FEDERAL_2026_CONSTANTS;
    const result = calculateScheduleA(input, d("100000"), "single", constants);
    expect(result.charitableTotal.toString()).toBe("0");
    expect(result.charitableCarryforward.toString()).toBe("0");
    expect(result.nonitemizerCharitableDeduction.toString()).toBe("0");
    expect(input).toEqual(original);
    expect(() => calculateScheduleA(fixture(year, type, undefined, ""), d("100000"), "single", constants)).toThrow(/qualification.*unknown|unknown.*qualification/i);
    const zero = fixture(year, type, undefined, "");
    zero.donations[0].amount = "0";
    expect(calculateScheduleA(zero, d("100000"), "single", constants).charitableTotal.isZero()).toBe(true);
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
