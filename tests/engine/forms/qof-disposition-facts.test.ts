// Spec: spec/federal/qof-disposition-facts.yaml.
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { validateQofDispositionFacts } from "@/engine/forms/qof-disposition-facts.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const source = { sourceTaxYear: 2025, sourceReference: "Original investment records reviewed", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false };
it("preserves actual QOF answers without inventing an omitted No", () => {
  expect(validateQofDispositionFacts(undefined, 2025)).toBeUndefined();
  expect(validateQofDispositionFacts(source, 2025)).toBe(false);
  const unknown = TaxYearInputSchema.parse({ ...simpleW2Fixture, qofDispositionFacts: {} });
  expect(unknown.qofDispositionFacts?.disposedOfQofInvestment).toBeUndefined();
  for (const patch of [{ sourceTaxYear: 2024 }, { sourceReference: "" }, { sourceFactsConfirmed: false }, { allInvestmentsReviewed: undefined }, { disposedOfQofInvestment: undefined }]) {
    expect(() => validateQofDispositionFacts({ ...source, ...patch }, 2025)).toThrow(/actual|confirm|year|review|unknown/i);
  }
  expect(validateQofDispositionFacts({ ...source, sourceTaxYear: 2026 }, 2026)).toBe(false);
});
it("keeps positive QOF history outside the ordinary return calculation", () => {
  const base = calculateFederalTax(simpleW2Fixture);
  const no = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, qofDispositionFacts: source }));
  expect(no.agi.toFixed()).toBe(base.agi.toFixed()); expect(no.totalTax.toFixed()).toBe(base.totalTax.toFixed());
  const yes = TaxYearInputSchema.parse({ ...simpleW2Fixture, qofDispositionFacts: { ...source, disposedOfQofInvestment: true } });
  expect(yes.qofDispositionFacts?.disposedOfQofInvestment).toBe(true);
  expect(() => calculateFederalTax(yes)).toThrow(/QOF.*8997|8997.*QOF/i);
});
