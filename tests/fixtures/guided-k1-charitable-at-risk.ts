import { guidedK1CharitableAtRiskSources, guidedK1CharitableAtRiskPayments } from './k1-charitable-at-risk-guide-sources';
export { guidedK1CharitableAtRiskSources } from './k1-charitable-at-risk-guide-sources';
import { startCompleteInterview, completeW2Entry } from '../guided-interview/complete-facts';
import { emptyDeductionData } from '@/lib/guided-interview-flow';
export function guidedK1CharitableAtRiskState(separateGain = false) {
    const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null });
    const sources = guidedK1CharitableAtRiskSources(separateGain);
    state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000', federalWithheld: '30000' }] };
    state.sectionData.adjustments = { k1LossSources: sources.qualifiedLoss };
    state.sectionData.deductions = { ...emptyDeductionData, method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0',
        charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [], k1CharitableSources: sources.charity };
    state.sectionData.payments = guidedK1CharitableAtRiskPayments();
    return state;
}
