import type { Form8814ChildInput } from '@/models/inputs.js';

/** Explicit synthetic child/custody facts, never production defaults. */
export function syntheticChildElection(taxYear = 2025, suffix = '01'): NonNullable<Form8814ChildInput['electionFacts']> {
  return {
    taxYear, sourceReference: `Synthetic child election ${suffix}`, sourceFactsConfirmed: true,
    child: { firstName: 'Child', lastName: 'Doe', ssn: `321-54-67${suffix}`, dateOfBirth: '2012-05-10' },
    electionRequested: true, timelyElectionStatus: 'planned_timely',
    childRequiredToFile: true, childFilesJointReturn: false,
    otherGrossIncome: '0', estimatedTaxPayments: '0', priorYearOverpaymentApplied: '0', federalIncomeTaxWithheld: '0',
    electingTaxpayer: 'primary', relationshipToChild: 'parent', parentSituation: 'custodial_unmarried',
    custodialParentConfirmed: true,
  };
}
