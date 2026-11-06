// Spec: spec/federal/charitable-carryover-sources.yaml facts-only-validation.
import { expect, it } from "vitest";
import { validateCharitableCarryoverSources } from "@/engine/forms/charitable-carryover-source-validation.js";
import { charitableCarryoverFixture } from "../../fixtures/charitable-carryover.js";

it("validates complete source histories without an income or deduction context", () => {
  const full = charitableCarryoverFixture();
  const { taxYear, filingStatus, primary: { firstName, lastName, ssn } } = full.taxpayer;
  const input = { taxpayer: { taxYear, filingStatus, primary: { firstName, lastName, ssn } }, charitableCarryoverSources: full.charitableCarryoverSources };
  const before = JSON.stringify(input);
  const result = validateCharitableCarryoverSources(input);
  expect(result.map(row => [row.taxYear, row.category, row.medium, row.amount.toString()])).toEqual([[2024, "capital_gain_30", "noncash", "5000"]]);
  expect(JSON.stringify(input)).toBe(before);
  expect(() => validateCharitableCarryoverSources({ ...input, taxpayer: { ...input.taxpayer, primary: { firstName, lastName, ssn: "" } } })).toThrow(/identity/i);
  if (!input.charitableCarryoverSources?.vintages?.[0]) throw new Error("Missing synthetic actual history");
  input.taxpayer.taxYear = 2026; input.charitableCarryoverSources.sourceTaxYear = 2026;
  input.charitableCarryoverSources.vintages[0].adjustedThroughTaxYear = 2025;
  expect(() => validateCharitableCarryoverSources(input)).toThrow(/intervening/i);
  input.charitableCarryoverSources.vintages[0].history = [{ taxYear: 2025, treatedAsPaid: "1000.25", nolReduction: "100.10", sourceReference: "Actual synthetic 2025 worksheet" }];
  input.charitableCarryoverSources.vintages[0].openingCarryforward = "3899.65";
  expect(validateCharitableCarryoverSources(input)[0].amount.toString()).toBe("3899.65");
});
