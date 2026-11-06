// Spec: alternative-charitable-net-operating-loss.yaml conservation.
import { expect, it } from "vitest";
import { calculateAlternativeCharitableNolCarryover } from "@/engine/forms/alternative-charitable-net-operating-loss.js";
import { d } from "@/utils/decimal.js";
import { alternativeCharitableNolInput } from "../../fixtures/alternative-charitable-nol.js";

it("conserves the separate alternative carry and rejects invalid comparison amounts", () => {
  const input = alternativeCharitableNolInput(); input.donations[0].amount = "60000.49";
  const params = { input, tentativeCarryforward: d("1800"), alternativeTaxNolAvailable: d("100000"), nolCarryforward: d("64000") };
  const result = calculateAlternativeCharitableNolCarryover({ ...params, computeCarryover: value => {
    expect(value.amount.toFixed()).toBe("58200"); return d("62380");
  } });
  expect(result.sourceContributions.toFixed()).toBe("60000.49");
  expect([result.reduction, result.carryforward, result.reduction.plus(result.carryforward)].map(value => value.toFixed()))
    .toEqual(["1620", "180", "1800"]);
  for (const invalid of ["NaN", "Infinity", "-1", "64000.01", "62380.01", "64001"]) {
    expect(() => calculateAlternativeCharitableNolCarryover({ ...params, computeCarryover: () => d(invalid) })).toThrow(/comparison/);
  }
  for (const patch of [{ tentativeCarryforward: d("60001") }, { tentativeCarryforward: d("-1") },
    { tentativeCarryforward: d("NaN") }, { alternativeTaxNolAvailable: d("0") }, { nolCarryforward: d("100001") }]) {
    expect(() => calculateAlternativeCharitableNolCarryover({ ...params, ...patch, computeCarryover: () => d("0") })).toThrow();
  }
  const sourceCents = calculateAlternativeCharitableNolCarryover({ ...params, tentativeCarryforward: d("1800.1"), computeCarryover: () => d("62380") });
  expect([sourceCents.tentativeCarryforward, sourceCents.carryforward].map(value => value.toFixed())).toEqual(["1800", "180"]);
  const noIncrease = calculateAlternativeCharitableNolCarryover({ ...params, computeCarryover: () => d("64000") });
  expect(noIncrease.carryforward.toFixed()).toBe("1800");
  const cap = calculateAlternativeCharitableNolCarryover({ ...params, computeCarryover: () => d("60000") });
  expect(cap.carryforward.toFixed()).toBe("0");
  const unknown = alternativeCharitableNolInput(); unknown.donations[0].qualifiedOrganization = undefined;
  expect(() => calculateAlternativeCharitableNolCarryover({ ...params, input: unknown, computeCarryover: () => d("62380") })).toThrow(/qualification/);
});
