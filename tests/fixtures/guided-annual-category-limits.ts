import type { EducationDistributionData, EducationSourceRecord } from '@/lib/guided-education-distributions';
import { actualGuidedAnnualCashQtp } from './guided-annual-cash-qtp';
import { annualCategoryFixture } from './education-annual-category-limits';
export function actualGuidedAnnualCategory(apprenticeship = false) {
  const { state } = actualGuidedAnnualCashQtp();
  const { input: original, facts, expense } = annualCategoryFixture(2025, apprenticeship ? 'apprenticeship' : 'k12_tuition', apprenticeship ? '6000' : '25000');
  if (apprenticeship) Object.assign(expense, { apprenticeshipRegistered: true, requiredForApprenticeship: true });
  const collections = Object.fromEntries(Object.entries(facts).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key,
    (value as Array<Record<string, unknown>>).map(row => Object.fromEntries(Object.entries(row).map(([field, item]) =>
      [field, typeof item === 'number' ? String(item) : item])) as EducationSourceRecord),
  ]));
  const data: EducationDistributionData = { ...collections, taxYear: '2025', sourceFactsConfirmed: true,
    allDistributionsReconciled: true, exceptionsDistinctFromCreditConfirmed: true,
    forms: original.form1099Q.map(({ taxYear, transfer, ...fields }) => ({ fields: { ...fields, taxYear: String(taxYear) }, transfer: { kind: transfer?.kind } })) };
  if (!state.sectionData.credits) throw new Error('Missing fictional credits');
  state.sectionData.credits.educationDistributions = data;
  return { state, original, data };
}
