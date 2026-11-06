// Spec: spec/federal/form-172-itemized-origin.yaml review-binding.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildNetOperatingLossReview } from "@/pdf/fill-net-operating-loss.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { currentOriginInput } from "../fixtures/form-172-origin.js";
import { d } from "@/utils/decimal.js";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing synthetic itemized source");
  return value;
}

it("revalidates itemized sources even when their changes leave the current loss unchanged", () => {
  const input = currentOriginInput("100000", { scheduleA: { medicalExpenses: "50000" } });
  const result = calculateFederalTax(input), redacted = redactReviewIdentifiers(input);
  const text = buildNetOperatingLossReview(redacted, result).join(" ");
  expect(text).toContain("Current alternative PartI loss 80000");
  expect(text).toContain("Alternative nonbusiness itemized deductions: 50000");
  required(input.scheduleA).medicalExpenses = "50001";
  expect(calculateFederalTax(input).form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/Form172.*itemized.*reconcile/i);
  required(input.scheduleA).medicalExpenses = "50000";
  required(result.scheduleA).medicalDeduction = d("49999");
  expect(() => buildNetOperatingLossReview(input, result)).toThrow(/Form172.*itemized.*reconcile/i);
  const capped = currentOriginInput("100000", { scheduleA: { realEstateTaxes: "50000" } });
  const saved = calculateFederalTax(capped);
  expect(saved.scheduleA?.saltDeduction.toFixed()).toBe("40000");
  required(capped.scheduleA).realEstateTaxes = "50001";
  expect(calculateFederalTax(capped).form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(() => buildNetOperatingLossReview(capped, saved)).toThrow(/Form172.*itemized.*reconcile/i);
});
