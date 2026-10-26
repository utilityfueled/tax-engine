// Spec: spec/federal/charitable-net-operating-loss.yaml historical-rule.
import { expect, it } from "vitest";
import { calculateCharitableNolCarryover } from "@/engine/forms/charitable-net-operating-loss.js";
import { d } from "@/utils/decimal.js";
import { charitableNolInput } from "../../fixtures/charitable-nol.js";

it("applies the published historical carry difference without importing its rates", () => {
  // Only the comparison rule uses the historical example amounts. No1970 rate
  // or current-year NOL calculation is inferred by this pure adjustment.
  const input = charitableNolInput("50000", "30000");
  for (const [actual, comparison, expected] of [["25000", "0", "5000"], ["25000", "25000", "30000"], ["35000", "0", "0"]]) {
    const result = calculateCharitableNolCarryover({ input, tentativeCarryforward: d("30000"), nolCarryforward: d(actual),
      alternativeTaxNolAvailable: d("0"),
      computeCarryover: limit => { expect(limit.amount.toFixed()).toBe("0"); return d(comparison); } });
    expect(result.carryforward.toFixed()).toBe(expected);
    expect(result.carryforward.plus(result.reduction).toFixed()).toBe("30000");
  }
  expect(() => calculateCharitableNolCarryover({ input, tentativeCarryforward: d("30000"), nolCarryforward: d("25000"),
    alternativeTaxNolAvailable: d("0"),
    computeCarryover: () => d("25001") })).toThrow(/comparison.*carry|counterfactual/i);
});
