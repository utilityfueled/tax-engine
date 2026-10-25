// Spec: spec/federal/form-172-capital-origin.yaml review.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { capitalOriginInput } from "../fixtures/form-172-capital-origin.js";
import { d } from "@/utils/decimal.js";

it("reconciles original capital sources and exact amounts in the redacted NOL review", () => {
  const source = capitalOriginInput(), result = calculateFederalTax(source);
  const redacted = redactReviewIdentifiers(source), rows = buildNetOperatingLossReview(redacted, result);
  expect(rows.join(" ")).toContain("Current regular PartI loss 80000");
  expect(rows.join(" ")).not.toContain("ORIGINAL-ACCOUNT");
  expect(rows.join(" ")).toContain("Nonbusiness capital losses: 100.5");
  const transaction = redacted.form1099B[0]?.transactions[1];
  if (!transaction || !result.scheduleD) throw new Error("Missing actual synthetic capital sources");
  transaction.costBasis = "1000.01";
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/capital|reconcile/);
  transaction.costBasis = "1000";
  result.scheduleD.netCapitalGainLoss = d("0");
  expect(() => buildNetOperatingLossReview(redacted, result)).toThrow(/capital|reconcile/);
});
