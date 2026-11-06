// Spec: spec/federal/guided-hsa-distributions.yaml#taxable-exception-allocation
import { expect, it } from "vitest";
import { getConstants } from "@/models/constants";
import { Form1099SASchema, Form8889Schema } from "@/models/inputs";
import { calculateForm8889 } from "@/engine/forms/form-8889";
import { calculateForm1099SA, mergeForm1099SAIntoForm8889Input } from "@/engine/forms/form-1099-sa";
import { simpleW2Fixture } from "../../fixtures/simple-w2";
const taxpayer = { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1990-02-15" } };
const forms = ["3", "1"].map(distributionCode => Form1099SASchema.parse({ payer: "Actual HSA source", grossDistribution: "1000", earningsOnExcessContributions: "0", accountType: "hsa", accountHolder: "primary", distributionCode }));

it("does not use gross disability distributions to shelter other taxable HSA income", () => {
  const input = Form8889Schema.parse({ accountOwner: "primary", coverageByMonth: Array(12).fill("none"), qualifiedMedicalExpenses: "1000", disabilityExceptionTaxableDistributions: "0" });
  const merged = mergeForm1099SAIntoForm8889Input(input, calculateForm1099SA(forms), taxpayer)!;
  expect(merged.disabilityExceptionTaxableDistributions).toBe("0");
  const result = calculateForm8889(taxpayer, merged, getConstants(2025));
  expect(result.line16.toString()).toBe("1000"); expect(result.line17b.toString()).toBe("200");
  const partial = calculateForm8889(taxpayer, { ...merged, qualifiedMedicalExpenses: "800.05", disabilityExceptionTaxableDistributions: "199.95" }, getConstants(2025));
  expect(partial.line16.toString()).toBe("1199.95"); expect(partial.line17b.toString()).toBe("200");
});

it("rejects unknown mixed-year exception allocations and amounts outside actual support", () => {
  const current = { ...taxpayer, taxYear: 2026 };
  const unknown = mergeForm1099SAIntoForm8889Input(Form8889Schema.parse({ accountOwner: "primary", coverageByMonth: Array(12).fill("none"), useLastMonthRule: false, qualifiedMedicalExpenses: "1000" }), calculateForm1099SA(forms), current)!;
  expect(() => calculateForm8889(current, unknown, getConstants(2025))).toThrow(/taxable.*disability.*allocation/i);
  for (const amount of ["-0.01", "1000.01"]) expect(() => calculateForm8889(taxpayer, { ...unknown, disabilityExceptionTaxableDistributions: amount }, getConstants(2025))).toThrow(/disability.*amount/i);
  expect(() => calculateForm8889(taxpayer, { ...unknown, qualifiedMedicalExpenses: "1900", disabilityExceptionTaxableDistributions: "101" }, getConstants(2025))).toThrow(/disability.*amount/i);
  const known = calculateForm8889(current, { ...unknown, distributionsNotSubjectToAdditionalTax: "0", disabilityExceptionTaxableDistributions: "0" }, getConstants(2025));
  expect(known.line17b.toString()).toBe("200");
});
