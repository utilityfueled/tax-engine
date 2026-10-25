import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Fictional actual source facts; no production defaults. */
export function nonitemizedCharityFixture() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, filingStatus: 'married_filing_separately' },
    standardDeductionFacts: { ...simpleW2Fixture.standardDeductionFacts, spouseItemizes: true },
    deductionElection: 'nonitemized',
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '75000' }],
    donations: [{ organization: 'Synthetic public charity', type: 'cash', amount: '1500', dateOfDonation: '2026-05-15',
      qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false }],
  });
}
