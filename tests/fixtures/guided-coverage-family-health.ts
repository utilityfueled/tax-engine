import { emptyAdjustmentData, emptyCreditsData } from '@/lib/guided-interview-flow';
import { guidedCoverageFamilyHealthRecords } from './guided-coverage-family-health-records';
import { completeBusinessSection, startCompleteInterview } from '../guided-interview/complete-facts';

export function guidedCoverageFamilyHealthState(shared?: 'agreement' | 'no_advance') {
  const { health, coverage } = guidedCoverageFamilyHealthRecords(shared);
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['self-employment'], lifeEvents: ['self-employed-health-insurance'], stateCode: null });
  Object.assign(state.sectionData['personal-info']!, { firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-02-15',
    spouse: { ...state.sectionData['personal-info']!.spouse!, firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1990-02-15' } });
  state.sectionData['income-self-employment'] = { ...structuredClone(completeBusinessSection), manualGrossReceipts: '40000' };
  state.sectionData.adjustments = { ...emptyAdjustmentData, healthInsuranceFacts: health };
  state.sectionData.credits = { ...emptyCreditsData, premiumTaxCredit: coverage };
  return state;
}
