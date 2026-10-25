// Spec: spec/state/pa-orchestrator.yaml, map-withholding-source-validation.
// PA-40 instructions (2025), printed page 21, line 13: include actual PA tax withheld.
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

const sourceKeys = ["w2s", "formW2G", "form1099G", "form1099K", "form1099R",
  "form1099Int", "form1099Div", "form1099Misc", "form1099Nec", "form1099B"] as const;
type SourceKey = typeof sourceKeys[number];

function sources(state: string | undefined, amount: string): TaxYearInput {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], state, stateTaxWithheld: amount }],
    formW2G: [{ payer: "Synthetic payer", reportableWinnings: "0", typeOfWager: "lottery", state, stateWithheld: amount }],
    form1099G: [{ payer: "Synthetic payer", unemploymentCompensation: "0", state, stateWithheld: amount }],
    form1099K: [{ pse: "Synthetic payer", grossAmount: "0", state, stateWithheld: amount }],
    form1099R: [{ payer: "Synthetic payer", grossDistribution: "0", taxableAmount: "0", distributionCode: "7", state, stateWithheld: amount }],
    form1099Nec: [{ payer: "Synthetic payer", nonemployeeCompensation: "0", state, stateWithheld: amount }],
    form1099Misc: [{ payer: "Synthetic payer", otherIncome: "0", state, stateWithheld: amount }],
    form1099Int: [{ payer: "Synthetic payer", interestIncome: "0", state, stateWithheld: amount }],
    form1099Div: [{ payer: "Synthetic payer", ordinaryDividends: "0", state, stateWithheld: amount }],
    form1099B: [{ broker: "Synthetic broker", transactions: [], state, stateWithheld: amount }],
  });
}

function onlySource(key: SourceKey, state: string | undefined, amount: string): TaxYearInput {
  const all = sources(state, amount);
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], [key]: all[key] });
}

describe("Pennsylvania actual withholding source jurisdiction", () => {
  it.each(sourceKeys)("requires actual state for every nonzero %s amount", key => {
    for (const state of [undefined, "", "   ", "Pennsylvania"]) {
      expect(() => calculatePAReturn(onlySource(key, state, "0.01"))).toThrow(/actual.*state/i);
    }
  });

  it("preserves explicit zero and sums PA cents while excluding actual other-state amounts", () => {
    expect(calculatePAReturn(sources(undefined, "0")).stateWithholding.toFixed()).toBe("0");
    expect(calculatePAReturn(sources("OH", "0.01")).stateWithholding.toFixed()).toBe("0");
    // Ten independently reported one-cent amounts total ten cents, without binary floats.
    expect(calculatePAReturn(sources(" pa ", "0.01")).stateWithholding.toFixed()).toBe("0.1");
  });

  it.each(sourceKeys)("rejects invalid %s amounts before filtering by state", key => {
    for (const state of ["PA", "OH", undefined]) {
      for (const amount of ["-0.01", "NaN", "Infinity"]) {
        const input = onlySource(key, state, "0");
        // Exercise public calculation validation even when a caller bypasses the schema.
        const row = input[key][0];
        if ("stateTaxWithheld" in row) row.stateTaxWithheld = amount;
        else Object.assign(row, { stateWithheld: amount });
        expect(() => calculatePAReturn(input)).toThrow(/finite.*nonnegative/i);
      }
    }
  });
});
