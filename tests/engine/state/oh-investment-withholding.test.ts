/** Specs: spec/state/oh-schedule-of-withholding.yaml and oh-input-adapter.yaml. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateOhioScheduleOfWithholding } from "@/engine/state/oh-schedule-of-withholding.js";
import { buildOhioResidentReturnInput, extractOhioWithholding } from "@/engine/state/oh-input-adapter.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

function sources() {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    w2s: [],
    form1099Int: [
      { payer: "Ohio bank", interestIncome: "100", state: "OH", stateWithheld: "0.10" },
      { payer: "Ohio bank 2", interestIncome: "100", state: " oh ", stateWithheld: "0.20" },
      { payer: "PA bank", interestIncome: "100", state: "PA", stateWithheld: "100" },
      { payer: "Actual New York bank", interestIncome: "100", state: "NY", stateWithheld: "100" },
    ],
    form1099Div: [
      { payer: "Ohio fund", ordinaryDividends: "100", state: "OH", stateWithheld: "1.01" },
      { payer: "IL fund", ordinaryDividends: "100", state: "IL", stateWithheld: "100" },
    ],
    form1099B: [
      { broker: "Ohio broker", state: "OH", stateWithheld: "2.02", transactions: [] },
      { broker: "Actual New York broker", state: "NY", stateWithheld: "100", transactions: [] },
    ],
  });
}

describe("Ohio investment source withholding", () => {
  it("Ohio includes only actual Ohio investment withholding in its audit and total", () => {
    const input = sources();
    const result = calculateOhioScheduleOfWithholding({ form1099Ints: input.form1099Int, form1099Divs: input.form1099Div, form1099Bs: input.form1099B });
    expect(result.line6_totalOhioWithholding.toFixed(2)).toBe("3.33");
    for (const [line, value] of [["5c", "0.3"], ["5d", "1.01"], ["5e", "2.02"], ["6", "3.33"]]) {
      expect(result.lines.find(entry => entry.line === line)?.value.toFixed()).toBe(value);
    }
    expect(input.form1099Int[0].stateWithheld).toBe("0.10");
  });

  it("preserves exact large source amounts without Number arithmetic", () => {
    const input = sources();
    input.form1099Int[0].stateWithheld = "9007199254740993.01";
    expect(extractOhioWithholding([], [], [], [], [], [], [], input.form1099Int, input.form1099Div, input.form1099B).toFixed(2)).toBe("9007199254740996.24");
  });

  it("carries source withholding into the Ohio resident adapter and preserves explicit zero override", () => {
    const input = sources();
    const federal = calculateFederalTax(input);
    expect(new Decimal(buildOhioResidentReturnInput(input, federal).ohioWithholding ?? "0").toFixed(2)).toBe("3.33");
    expect(new Decimal(buildOhioResidentReturnInput(input, federal, { ohioWithholdingOverride: "0" }).ohioWithholding ?? "1").toFixed()).toBe("0");
    expect(calculateOhioScheduleOfWithholding({}).line6_totalOhioWithholding.toFixed()).toBe("0");
  });
});
