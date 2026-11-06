// Spec: spec/federal/schedule-a-2026.yaml
import { describe, it, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
describe("Direct SALT facts retain categories", () => {
  const facts = { realEstateTaxes: "3000", additionalStateLocalIncomeTaxes: "2000", personalPropertyTaxes: "500" };
  it("routes direct tax payments to their proper Schedule A lines", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: facts }));
    const line = (number: string) => result.allLines.find(entry => entry.form === "Sched A" && entry.line === number)?.value.toString();
    expect(line("5a")).toBe("2000");
    expect(line("5b")).toBe("3000");
    expect(line("5c")).toBe("500");
    expect(line("5e")).toBe("5500");
  });
  it("includes additional income taxes when comparing with sales taxes", () => {
    const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: facts, salesTaxDeduction: { state: "WA", method: "actual", actualGeneralSalesTax: "1500", autoCompare: true } }));
    expect(result.allLines.find(entry => entry.form === "Sched A" && entry.line === "5a")?.value.toString()).toBe("2000");
  });
  it.each(["realEstateTaxes", "additionalStateLocalIncomeTaxes"])("rejects negative additional %s", field => {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, scheduleA: { ...facts, [field]: "-1" } }))).toThrow(/nonnegative/i);
  });
});
