// Spec: spec/federal/form-6251.yaml (2025-exemption-threshold-regression)
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm6251 } from "@/engine/forms/form-6251.js";

describe("matches the 2025 IRS exemption worksheet", () => {
  // Independent literals using the published $626,350 threshold and $88,100
  // exemption. These were not generated from engine constants.
  for (const filingStatus of ["single", "head_of_household"] as const) {
    it.each([
      ["626349", "88100"], ["626350", "88100"], ["626351", "88100"],
      ["626352", "88099"], ["700000", "69687"], ["978747", "1"],
      ["978748", "0"], ["978750", "0"],
    ])(`${filingStatus}: AMTI %s gives exemption %s`, (income, expected) => {
      const result = calculateForm6251({
        taxableIncome: new Decimal(income), saltDeduction: new Decimal("0"),
        regularTax: new Decimal("0"), filingStatus, isItemizing: true,
      }, getConstants(2025));
      expect(result.exemption.toString()).toBe(expected);
    });
  }
});
