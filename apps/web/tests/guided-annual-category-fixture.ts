// Fictional original source facts only; no application imports or calculated amounts.
import { actualAnnualCashInterview } from './guided-annual-cash-fixture';
export function actualAnnualCategoryInterview(apprenticeship: boolean) {
  const state = actualAnnualCashInterview(), source = state.sectionData.credits.educationDistributions;
  const first = source.forms[0], second = source.forms[1], original = source.expenses[0];
  if (!first || !second || !original) throw new Error('Missing fictional actual category originals');
  Object.assign(first.fields, { grossDistribution: '15000', earnings: '3000', basis: '12000', distributionDate: '2025-09-01' });
  Object.assign(second.fields, { grossDistribution: '15000', earnings: '6000', basis: '9000', distributionDate: '2025-09-02' });
  const expense = { ...original, id: 'actual-category-receipt', category: apprenticeship ? 'apprenticeship' : 'k12_tuition', amount: apprenticeship ? '6000' : '25000' };
  if (apprenticeship) Object.assign(expense, { apprenticeshipRegistered: true, requiredForApprenticeship: true });
  source.expenses = [expense]; source.allocations = [];
  source.roomBoardPeriods = []; source.roomBoardPeriodExpenses = []; source.roomBoardEsaAllocations = [];
  Object.assign(source, { expenseRefunds: [] });
  return state;
}
