// Spec: spec/federal/cod-ordinary-attribute-sources.yaml reference-packet-readiness.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { assessReturnReadiness } from '@/utils/return-readiness.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualCodBasisCapInput } from '../fixtures/cod-ordinary-attributes.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

it('keeps all actual Form982 exclusion routes partial without inferring official qualification', () => {
  const legacy = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    form1099C: [{ creditor: 'Fictional creditor', amountDischarged: '100', interestIncluded: '0', personallyLiable: true, fmvOfProperty: '0' }],
    codExclusion: { bankruptcy: true },
  });
  for (const taxInput of [actualCodBasisCapInput(), actualCodNolInput(), legacy]) {
    const federalResult = calculateFederalTax(taxInput);
    for (const includedForms of [['f1040-filled.pdf', 'f982-reference-filled.pdf'], ['f1040-filled.pdf'], ['f1040-filled.pdf', 'f982-filled.pdf']]) {
      const result = assessReturnReadiness({ taxInput, federalResult, includedForms });
      expect(result.packetCompleteness).toBe('partial'); expect(result.lineCompleteness).toBe('supported');
      expect(result.filingQualified).toBe(false); expect(result.businessRuleValidation).toBe('not-validated');
      expect(result.findings).toContain(includedForms.includes('f982-reference-filled.pdf')
        ? 'Form 982 is included as a reference summary, not an official filed Form 982.'
        : 'Form 982 applies, but no qualified official Form 982 or reference summary was generated.');
    }
  }
});
it('does not add a Form982 requirement for absent or zero excluded debt', () => {
  for (const taxInput of [TaxYearInputSchema.parse(simpleW2Fixture), TaxYearInputSchema.parse({ ...simpleW2Fixture,
    form1099C: [{ creditor: 'Fictional creditor', amountDischarged: '0', interestIncluded: '0', personallyLiable: true, fmvOfProperty: '0' }], codExclusion: { bankruptcy: true },
  })]) {
    const federalResult = calculateFederalTax(taxInput);
    const result = assessReturnReadiness({ taxInput, federalResult, includedForms: ['f1040-filled.pdf'] });
    expect(result.packetCompleteness).toBe('supported'); expect(result.findings.some(value => value.includes('Form 982'))).toBe(false);
  }
});
