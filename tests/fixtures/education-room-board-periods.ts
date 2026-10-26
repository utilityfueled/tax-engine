import type { EducationRoomBoardPeriod } from '@/models/education-room-board-periods.js';
import { inKindRoomBoardFixture } from './education-in-kind-room-board.js';
export function roomBoardPeriodFixture(year = 2025) {
  const input = inKindRoomBoardFixture(year), facts = input.qualifiedEducationExpenses?.sourceFacts;
  const form = input.form1099Q?.[0], expense = facts?.expenses?.[0], benefit = facts?.inKindBenefits?.[0];
  if (!facts || !form || !expense || !benefit)
    throw new Error('Missing fictional original room-and-board records');
  form.grossDistribution = '10000';
  form.earnings = '2000';
  form.basis = '8000';
  facts.expenses = ['first', 'second'].map(id => ({ ...expense, id, amount: '5000', paidDate: `${year}-09-01`, halfTimeStudent: undefined, roomBoardAllowance: undefined, schoolOwnedHousingCharge: undefined }));
  facts.allocations = facts.expenses.map(row => ({ sourceId: form.sourceId ?? '', expenseId: row.id, amount: '5000', creditAmount: '0' }));
  facts.inKindBenefits = facts.expenses.map(row => ({ ...benefit, id: `benefit-${row.id}`, expenseId: row.id, amount: '5000', providedDate: `${year}-09-01` }));
  const period: EducationRoomBoardPeriod = { id: 'fall', beneficiaryId: expense.beneficiaryId, sourceTaxYear: year, sourceReference: 'Fictional fall attendance record', sourceFactsConfirmed: true,
    institutionId: 'fictional-institution', institutionName: 'Fictional Example College', institutionEligible: true,
    academicPeriodStart: `${year}-08-15`, academicPeriodEnd: `${year}-12-20`, livingArrangement: 'off_campus' as const,
    halfTimeStudent: true, roomBoardAllowance: '6000', allowanceApplicableConfirmed: true,
    schoolOwnedHousing: false, schoolOwnedHousingCharge: '0', allReceiptsIncludedConfirmed: true };
  const periodFacts = Object.assign(facts, { roomBoardPeriods: [period],
    roomBoardPeriodExpenses: facts.expenses.map(row => ({ periodId: 'fall', expenseId: row.id, coveredStart: `${year}-09-01`, coveredEnd: `${year}-12-01`, sourceReference: `Fictional receipt ${row.id}`, sourceFactsConfirmed: true })),
    roomBoardEsaAllocations: [] as Array<{
      periodId: string;
      sourceId: string;
      amount: string;
    }> });
  return { input, facts: periodFacts, period, form };
}
export function roomBoardEsaPeriodFixture(year = 2025, withTuition = false) {
  const fixture = roomBoardPeriodFixture(year), { input, facts, period, form } = fixture;
  const esaGross = withTuition ? '7000' : '5000', esaBasis = withTuition ? '5600' : '4000';
  input.form1099Q?.push({ ...form, sourceId: 'esa', accountId: 'fictional-esa', accountType: 'coverdell_esa',
    distributionMedium: 'cash', grossDistribution: esaGross, earnings: withTuition ? '1400' : '1000', basis: esaBasis });
  facts.coverdellAccounts = [{ accountId: 'fictional-esa', priorYearBasis: esaBasis, currentYearContributions: '0', yearEndValue: '0', outstandingRollovers: '0', rolloverBasisReceived: '0' }];
  for (const allocation of facts.allocations ?? [])
    allocation.amount = '2500';
  facts.allocations?.push(...(facts.expenses ?? []).map(row => ({ sourceId: 'esa', expenseId: row.id, amount: '2500', creditAmount: '0' })));
  period.esaAllocationConfirmed = true;
  period.esaAllocationSourceReference = 'Fictional actual taxpayer allocation';
  facts.roomBoardEsaAllocations = [{ periodId: 'fall', sourceId: form.sourceId ?? '', amount: '2000' }, { periodId: 'fall', sourceId: 'esa', amount: '4000' }];
  if (withTuition) {
    const expense = facts.expenses?.[0], benefit = facts.inKindBenefits?.[0];
    if (!expense || !benefit)
      throw new Error('Missing fictional room-and-board originals');
    form.grossDistribution = '12000';
    form.earnings = '2400';
    form.basis = '9600';
    facts.expenses?.push({ ...expense, id: 'tuition', category: 'postsecondary_tuition', amount: '2000' });
    facts.inKindBenefits?.push({ ...benefit, id: 'tuition-benefit', expenseId: 'tuition', amount: '2000' });
    facts.allocations?.push({ sourceId: form.sourceId ?? '', expenseId: 'tuition', amount: '1000', creditAmount: '0' }, { sourceId: 'esa', expenseId: 'tuition', amount: '1000', creditAmount: '0' });
  }
  return fixture;
}
