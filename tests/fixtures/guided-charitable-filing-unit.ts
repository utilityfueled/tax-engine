import { guidedCharitableFilingUnitHistory } from './charitable-filing-unit-sources';
export { guidedCharitableFilingUnitHistory } from './charitable-filing-unit-sources';
import { emptyDeductionData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts.js';

export function guidedCharitableFilingUnitWorkspace() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0',
    realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0',
    gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], charitableCarryoverSources: guidedCharitableFilingUnitHistory() };
  return state;
}
