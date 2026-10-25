import type { ChildElectionData } from '../../apps/web/src/lib/guided-child-election-facts';
export const actualGuidedChild: ChildElectionData = {
  taxYear: '2025', sourceReference: 'Actual child statements and election worksheet', sourceFactsConfirmed: true,
  firstName: 'Casey', lastName: 'Example', ssn: '321-54-6701', dateOfBirth: '2012-05-10',
  taxableInterest: '4000.25', taxExemptInterest: '500.25', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0',
  otherGrossIncome: '0', estimatedTaxPayments: '0', priorYearOverpaymentApplied: '0', federalIncomeTaxWithheld: '0',
  electionRequested: true, timelyElectionStatus: 'planned_timely', childRequiredToFile: true, childFilesJointReturn: false,
  electingTaxpayer: 'primary', relationshipToChild: 'parent', parentSituation: 'custodial_unmarried', custodialParentConfirmed: true,
  alaskaDividendPresent: false, specialCapitalDistributionPresent: false, foreignAccountOrTrustPresent: false,
  amtFactsConfirmed: true, otherwiseAllowableDeduction: '0',
  amtStatements: [{ sourceId: 'actual-child-bank', form: '1099-INT', taxExemptInterest: '500.25', specifiedPrivateActivityBondInterest: '125.10' }],
};
