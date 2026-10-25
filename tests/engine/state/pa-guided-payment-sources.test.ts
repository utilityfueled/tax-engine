// Spec: spec/state/guided-state-routing.yaml, PA-40 line13 source rules.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";

function input() {
  return TaxYearInputSchema.parse({ taxpayer: { taxYear: 2025, filingStatus: "single",
    primary: { firstName: "Synthetic", lastName: "Resident", ssn: "111-22-3333", dateOfBirth: "1980-01-01" },
    address: { street: "1 Example Street", city: "Harrisburg", state: "PA", zip: "17101" }, dependents: [] },
    form1099B: [{ broker: "PA actual broker", state: "PA", stateWithheld: "0.10", transactions: [] },
      { broker: "OH actual broker", state: "OH", stateWithheld: "1000", transactions: [] }],
  });
}
it("includes actual PA brokerage withholding and rejects an unknown source state", () => {
  const taxInput = input();
  expect(calculatePAReturn(taxInput, { additionalStateWithholding: new Decimal("0.20") }).stateWithholding.toFixed()).toBe("0.3");
  delete taxInput.form1099B[0].state;
  expect(() => calculatePAReturn(taxInput)).toThrow(/actual source state/i);
  taxInput.form1099B[0].stateWithheld = "0";
  expect(calculatePAReturn(taxInput).stateWithholding.toFixed()).toBe("0");
});
it.each(["-1", "NaN", "Infinity"])("rejects invalid additional PA withholding %s", amount => {
  expect(() => calculatePAReturn(input(), { additionalStateWithholding: new Decimal(amount) })).toThrow(/finite nonnegative/);
});
