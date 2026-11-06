import type { EducationDistributionData } from '@/lib/guided-education-distributions';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { ordinaryEducationRefundFixture, required } from './education-ordinary-expense-composition';

export function actualGuidedOrdinaryEducationExpenses() {
  const original = ordinaryEducationRefundFixture(), facts = required(original.qualifiedEducationExpenses?.sourceFacts);
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  Object.assign(state.sectionData['personal-info'] ?? {}, original.taxpayer.primary);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000', socialSecurityWages: '50000', medicareWages: '50000', federalWithheld: '20000' }] };
  const data: EducationDistributionData = { ...facts, taxYear: '2025', forms: original.form1099Q.map(({ taxYear, transfer, ...fields }) =>
    ({ fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer?.kind } })) };
  state.sectionData.credits = { ...structuredClone(emptyCreditsData), educationDistributions: data };
  return { state, data, original };
}
