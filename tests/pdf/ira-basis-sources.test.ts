// Spec: spec/federal/ira-basis-sources.yaml review-copy.
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm8606, FORM_8606_FIELDS as fields } from '@/pdf/fill-form-8606.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';
import { ordinaryIraBasisFixture } from '../fixtures/ira-basis.js';

it('reopens separate owner review forms with literal tax and carry values and no identifiers', async () => {
  const input = TaxYearInputSchema.parse(ordinaryIraBasisFixture());
  const original = structuredClone(input);
  const result = calculateFederalTax(input), review = redactReviewIdentifiers(input);
  for (const [owner, name, basis, yearEnd, gross, ratio, carry, taxable] of [
    ['primary', 'Jane Doe', '1000', '2002', '1001', '333', '667', '668'],
    ['spouse', 'John Doe', '2000', '8000', '2000', '200', '1600', '1600'],
  ] as const) {
    const document = await fillForm8606(review, result, 'forms/blank/2025/f8606.pdf', owner);
    const reopened = await PDFDocument.load(await document.save());
    const field = (key: keyof typeof fields) => reopened.getForm().getTextField(fields[key]).getText();
    expect(field('name')).toBe(name); expect(field('ssn') ?? '').toBe('');
    expect(field('line2')).toBe(basis); expect(field('line6')).toBe(yearEnd); expect(field('line7')).toBe(gross);
    expect(field('line10dec')).toBe(ratio); expect(field('line14')).toBe(carry); expect(field('line15c')).toBe(taxable);
    expect(reopened.getSubject()).toContain('FOR REVIEW ONLY');
  }
  expect(input).toEqual(original);
  expect(() => assertPdfExportAllowed(2025, 2025, 'filing')).toThrow(/Filing/);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/2026/);
});

it('redacts partial owner identifiers and account identity from the source render copy', () => {
  const input = TaxYearInputSchema.parse(ordinaryIraBasisFixture()), before = structuredClone(input);
  const review = redactReviewIdentifiers(input);
  expect(review.iraBasisSources?.owners[0].identity.ssnLast4).toBe('');
  expect(review.iraBasisSources?.owners[1].identity.ssnLast4).toBe('');
  expect(review.iraBasisSources?.owners[0].accounts[0].custodianTin).toBe('');
  expect(review.iraBasisSources?.owners[0].accounts[0].accountReference).toBe('');
  expect(review.iraBasisSources?.owners[0].basisHistory).toEqual(input.iraBasisSources?.owners[0].basisHistory);
  expect(review.iraBasisSources?.owners[0].accounts[0].yearEndValue).toBe('2002.49');
  expect(input).toEqual(before);
});
