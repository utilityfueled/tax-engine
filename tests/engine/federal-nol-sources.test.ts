// Spec: spec/federal/net-operating-loss.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const source = () => ({ ...simpleW2Fixture,
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "15000" }],
});

it("preserves absent and actual zero general NOL sources through parsing", () => {
  const omitted = TaxYearInputSchema.parse({ ...source(), priorYear: { excessBusinessLossNOL: "20000" } });
  expect(omitted.priorYear?.nolCarryforward).toBeUndefined();
  expect(calculateFederalTax(omitted).nolDeduction.toFixed()).toBe("20000");
  const zero = TaxYearInputSchema.parse({ ...source(), priorYear: { excessBusinessLossNOL: "20000", nolCarryforward: "0" } });
  expect(zero.priorYear?.nolCarryforward).toBe("0");
  expect(calculateFederalTax(zero).nolDeduction.toFixed()).toBe("0");
});

it("preserves the unused general carry and estate carry once", () => {
  const general = calculateFederalTax(TaxYearInputSchema.parse({ ...source(), priorYear: { nolCarryforward: "50000" } }));
  expect(general.nolDeduction.toFixed()).toBe("27400");
  expect(general.carryforwards.nolCarryforward.toFixed()).toBe("22600");
  const estate = calculateFederalTax(TaxYearInputSchema.parse({ ...source(), priorYear: { nolCarryforward: "40000" },
    scheduleK1Form1041: [{ estateTrustName: "Actual final estate", estateTrustEIN: "12-3456789", isFinalK1: true, finalYearNOLCarryover: "10000" }],
  }));
  expect(estate.nolDeduction.toFixed()).toBe("27400");
  expect(estate.carryforwards.nolCarryforward.toFixed()).toBe("22600");
});

it("adds current EBL without dropping or duplicating the prior general source", () => {
  const result = calculateFederalTax(TaxYearInputSchema.parse({ ...source(),
    scheduleC: { businessName: "Actual business", grossReceipts: "0", expenses: { otherExpenses: "500000" } }, priorYear: { nolCarryforward: "50000" },
  }));
  expect(result.nolDeduction.toFixed()).toBe("0");
  expect(result.form461?.line16ExcessBusinessLoss.toFixed()).toBe("187000");
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe("237000");
});
