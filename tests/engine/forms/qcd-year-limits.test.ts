// Specs: spec/federal/form-1099-r.yaml and spec/federal/form-8606.yaml
import { describe, expect, it } from "vitest";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { calculateForm1099R } from "@/engine/forms/form-1099-r.js";
import { Form1099RSchema } from "@/models/inputs.js";
describe("Published QCD annual limits", () => {
  it.each([[2025, "108000", "2000"], [2026, "111000", "0"]] as const)("uses the independently published %s limit", (year, limit, taxable) => {
    const constants = year === 2025 ? getConstants(year) : FEDERAL_2026_CONSTANTS;
    expect(constants.qcd.annualLimit.toString()).toBe(limit);
    const result = calculateForm1099R([Form1099RSchema.parse({ payer: "Synthetic custodian", grossDistribution: "110000", federalWithheld: "0", distributionCode: "Y7", iraSepSimple: true, accountHolder: "primary" })], { qcdAnnualLimit: constants.qcd.annualLimit });
    expect(result.iraTaxable.toString()).toBe(taxable);
  });
});
