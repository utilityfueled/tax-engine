import { emptyDeductionData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';

/** Fictional known originals for tests; application fields start unanswered. */
export function actualGuidedCryptoDonation() {
  return {
    asset: 'BTC', quantity: '0.0000000001234567890123456789123',
    dateAcquired: '2023-01-01', dateDonated: '2025-06-01',
    fairMarketValueAtDonation: '20000.00', costBasis: '1000.00',
    charityName: 'Synthetic public charity', charityEIN: '12-3456789',
    isQualifiedOrganization: true, recipientCategory: 'fifty-percent' as const,
    capitalAsset: true, fullOwnershipInterestDonated: true, noGoodsOrServicesReceived: true,
    substantiationRequirementsMet: true, appraisalRequired: true, qualifiedAppraisalObtained: true,
    sourceFactsConfirmed: true,
  };
}
export function actualCryptoDonationInterview() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '20000', socialSecurityWages: '100000', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], cryptoDonations: [actualGuidedCryptoDonation()] };
  return state;
}
