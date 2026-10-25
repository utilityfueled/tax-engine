// Spec: spec/federal/charitable-private-media.yaml source.
import { expect, it } from "vitest";
import { buildGuidedCharitableCarryover, updateCharitableCarryoverSources } from "@/lib/guided-charitable-carryover";
import { actualGuidedCharitableCarryover } from "../fixtures/guided-charitable-carryover";
import { completePersonalInfo } from "./complete-facts";
it("retains complete separate private media without inventing an allowance", () => {
  const data = actualGuidedCharitableCarryover();
  data.vintages = (["cash", "noncash"] as const).map((medium, index) => ({ sourceId: `actual-${medium}`,
    contributionYear: "2024", sourceReference: `Filed ${medium} worksheet`, category: "other_30", medium,
    originalExcess: index === 0 ? "1,000.49" : "2,000.51", originNolReduction: "0",
    openingCarryforward: index === 0 ? "1,000.49" : "2,000.51", adjustedThroughTaxYear: "2024",
    allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true, history: [],
  }));
  const before = JSON.stringify(data), result = buildGuidedCharitableCarryover(data, 2025, "single", completePersonalInfo);
  expect(result?.vintages?.map(row => [row.medium, row.openingCarryforward])).toEqual([["cash", "1000.49"], ["noncash", "2000.51"]]);
  expect(result).not.toHaveProperty("contributionBase"); expect(result).not.toHaveProperty("deduction");
  expect(JSON.stringify(data)).toBe(before);
  const changed = updateCharitableCarryoverSources(data, { vintages: data.vintages.map(row => ({ ...row, medium: "cash" })) });
  expect(changed.sourceFactsConfirmed).toBeNull();
  expect(() => buildGuidedCharitableCarryover({ ...changed, sourceFactsConfirmed: true }, 2025, "single", completePersonalInfo)).toThrow(/duplicate.*medium/i);
  data.vintages[0].medium = undefined;
  expect(() => buildGuidedCharitableCarryover(data, 2025, "single", completePersonalInfo)).toThrow(/medium/i);
});
