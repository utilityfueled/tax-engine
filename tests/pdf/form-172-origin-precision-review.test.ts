// Spec: spec/federal/form-172-origin-precision.yaml review-precision.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { currentOriginInput } from "../fixtures/form-172-origin.js";
import { d } from "@/utils/decimal.js";

it("rejects altered exact origin amounts hidden by identical printed totals", () => {
  const input = currentOriginInput(), sourceLine = calculateFederalTax(input);
  if (!sourceLine.form172) throw new Error("Missing synthetic current origin");
  sourceLine.form172.regular.sourcePartI[2] = d("0.49");
  expect(sourceLine.form172.regular.partI[2].toFixed()).toBe("0");
  expect(() => buildNetOperatingLossReview(input, sourceLine)).toThrow(/reconcile/);
  const signed = calculateFederalTax(input);
  if (!signed.form172) throw new Error("Missing synthetic current origin");
  signed.form172.alternativeTax.sourceSignedComputation = d("-75000.49");
  expect(signed.form172.alternativeTax.signedComputation.toFixed()).toBe("-75000");
  expect(() => buildNetOperatingLossReview(input, signed)).toThrow(/reconcile/);
});
