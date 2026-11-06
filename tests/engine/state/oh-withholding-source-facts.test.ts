// Spec: spec/state/oh-schedule-of-withholding.yaml; Ohio IT1040 instructions line14.
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculateOhioScheduleOfWithholding, type OhioScheduleOfWithholdingInput } from "@/engine/state/oh-schedule-of-withholding";
import { simpleW2Fixture } from "../../fixtures/simple-w2";

function sources(state: string | undefined, amount: string): OhioScheduleOfWithholdingInput {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], state, stateTaxWithheld: amount }],
    formW2G: [{ payer: "Actual payer", reportableWinnings: "100", typeOfWager: "lottery", state, stateWithheld: amount }],
    form1099G: [{ payer: "Actual payer", unemploymentCompensation: "100", state, stateWithheld: amount }],
    form1099K: [{ pse: "Actual payer", grossAmount: "100", state, stateWithheld: amount }],
    form1099R: [{ payer: "Actual payer", grossDistribution: "100", taxableAmount: "100", distributionCode: "7", state, stateWithheld: amount }],
    form1099Nec: [{ payer: "Actual payer", nonemployeeCompensation: "100", state, stateWithheld: amount }],
    form1099Misc: [{ payer: "Actual payer", otherIncome: "100", state, stateWithheld: amount }],
    form1099Int: [{ payer: "Actual payer", interestIncome: "100", state, stateWithheld: amount }],
    form1099Div: [{ payer: "Actual payer", ordinaryDividends: "100", state, stateWithheld: amount }],
    form1099B: [{ broker: "Actual broker", transactions: [], state, stateWithheld: amount }],
  });
  return { w2s: input.w2s, formW2Gs: input.formW2G, form1099Gs: input.form1099G, form1099Ks: input.form1099K,
    form1099Rs: input.form1099R, form1099Necs: input.form1099Nec, form1099Miscs: input.form1099Misc,
    form1099Ints: input.form1099Int, form1099Divs: input.form1099Div, form1099Bs: input.form1099B };
}

describe("Ohio actual withholding source jurisdiction", () => {
  it("requires actual state for every nonzero source and preserves explicit zero", () => {
    for (const state of [undefined, "", "   ", "Ohio"]) {
      for (const [key, entries] of Object.entries(sources(state, "0.01"))) {
        expect(() => calculateOhioScheduleOfWithholding({ [key]: entries })).toThrow(/actual.*state/i);
      }
    }
    expect(calculateOhioScheduleOfWithholding(sources(undefined, "0")).line6_totalOhioWithholding.toFixed()).toBe("0");
    expect(calculateOhioScheduleOfWithholding(sources("PA", "0.01")).line6_totalOhioWithholding.toFixed()).toBe("0");
    expect(calculateOhioScheduleOfWithholding(sources(" oh ", "0.01")).line6_totalOhioWithholding.toFixed()).toBe("0.1");
  });
  it("rejects malformed or negative source amounts before the jurisdiction filter", () => {
    for (const state of ["OH", "PA", undefined]) {
      for (const amount of ["-0.01", "NaN", "Infinity"]) {
        const rows = sources(state, "0");
        for (const [key, entries] of Object.entries(rows)) {
          const field = key === "w2s" ? "stateTaxWithheld" : "stateWithheld";
          const changed = (entries as Array<Record<string, unknown>>).map(entry => ({ ...entry, [field]: amount }));
          expect(() => calculateOhioScheduleOfWithholding({ [key]: changed })).toThrow(/finite.*nonnegative/i);
        }
      }
    }
  });
});
