import type { EducationDistributionData } from '@/lib/guided-education-distributions';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeEducationClaimant, completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { mixedTuitionFixture } from './education-mixed-tuition';

export function actualGuidedMixedTuition() {
  const original = mixedTuitionFixture(), facts = original.qualifiedEducationExpenses?.sourceFacts;
  if (!facts) throw new Error('Missing actual fictional mixed tuition sources');
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  Object.assign(state.sectionData['personal-info'] ?? {}, original.taxpayer.primary);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000', socialSecurityWages: '50000', medicareWages: '50000', federalWithheld: '20000' }] };
  const data: EducationDistributionData = { ...facts, taxYear: '2025', forms: original.form1099Q.map(({ taxYear, transfer, ...fields }) =>
    ({ fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer?.kind } })) };
  state.sectionData.credits = { ...structuredClone(emptyCreditsData), educationDistributions: data,
    education: { ...completeEducationClaimant, aocStudents: [], llcExpenses: '1000',
      llcStudents: (original.educationExpenses?.llcStudents ?? []).map(student => ({ ...student, institutions: [{ name: 'Fictional university',
        address: '100 College Road, Columbus OH 43215', ein: '12-3456789', receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }] })) } };
  return { state, data, original };
}
