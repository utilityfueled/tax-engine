import type { EducationDistributionData } from '@/lib/guided-education-distributions';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import { completeW2Entry, startCompleteInterview } from '../guided-interview/complete-facts';
import { distinctInKindFixture } from './education-distinct-in-kind';

/** The original fictional records expressed as the existing guided controls. */
export function actualGuidedDistinctInKind() {
  const original = distinctInKindFixture(2025), facts = original.qualifiedEducationExpenses!.sourceFacts!;
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
  Object.assign(state.sectionData['personal-info']!, original.taxpayer.primary);
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '50000', socialSecurityWages: '50000', medicareWages: '50000', federalWithheld: '20000' }] };
  const data: EducationDistributionData = {
    taxYear: '2025', sourceFactsConfirmed: true, allDistributionsReconciled: true,
    forms: original.form1099Q.map(form => {
      const { taxYear, transfer, ...fields } = form;
      return { fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer!.kind } };
    }),
    beneficiaries: facts.beneficiaries, expenses: facts.expenses, allocations: facts.allocations,
    inKindBenefits: facts.inKindBenefits, loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
  };
  state.sectionData.credits = { ...structuredClone(emptyCreditsData), educationDistributions: data };
  return { state, data, original };
}
