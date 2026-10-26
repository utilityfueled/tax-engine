import { emptyAdjustmentData, emptyCreditsData } from '@/lib/guided-interview-flow';
import { guidedCoverageFamilyHealthState } from './guided-coverage-family-health';
import { guidedMarketplaceBusinessCreditMethodRecords } from './guided-marketplace-business-credit-method-records';
import { completeW2Entry } from '../guided-interview/complete-facts';

export function guidedMarketplaceBusinessCreditMethodState() {
  const state = guidedCoverageFamilyHealthState(), records = guidedMarketplaceBusinessCreditMethodRecords();
  state.segmentation.incomeTypes.push('w2-wages');
  state.sectionData['income-self-employment']!.manualGrossReceipts = '20000';
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, accountHolder: 'spouse', employerName: 'Actual Shareholder Corporation', wages: '20000', socialSecurityWages: '14000', socialSecurityWithheld: '868', medicareWages: '14000', medicareWithheld: '203' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: records.health };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: records.coverage };
  return state;
}
