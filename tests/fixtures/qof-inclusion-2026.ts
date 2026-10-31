import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { qofFacts, qofInvestment } from './qof-inclusion.js';

/** Fictional 2026 wages with one complete year-end QOF record. */
export function qofInclusion2026Input() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [{ ...simpleW2Fixture.w2s[0], federalWithheld: '40000' }],
    qofDispositionFacts: qofFacts(2026, [qofInvestment({})], false) });
}
