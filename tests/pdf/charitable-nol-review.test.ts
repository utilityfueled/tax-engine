// Spec: spec/federal/charitable-net-operating-loss.yaml review.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { charitableNolInput } from "../fixtures/charitable-nol.js";

it("retains the source-bound charity adjustment separately from actual NOL carry", () => {
  const input = charitableNolInput(); const result = calculateFederalTax(input);
  const redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result).join(" ");
  expect(text).toContain("tentative 19200; NOL-related reduction 15360; remaining 3840");
  expect(text).toContain("actual 68000; without excess contributions 52640");
  expect(text).toContain("Counterfactual modified regular limit income: 59200");
  expect(text).toContain("absorbed 47360");
  expect(text).not.toContain("6789");
  redacted.donations[0].amount = "60001";
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/charit.*source|source.*charit/i);
  const comparison = result.netOperatingLoss?.charitableCounterfactual?.calculation;
  if (!comparison?.carryforward) throw new Error("Missing synthetic counterfactual");
  const retained = comparison.carryforward;
  comparison.carryforward = retained.plus(1);
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/reconcile/);
  comparison.carryforward = retained;
  result.carryforwards.charitableContributions = result.carryforwards.charitableContributions.plus(1);
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/reconcile/);
});
