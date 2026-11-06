import { roomBoardEsaPeriodFixture, roomBoardPeriodFixture } from './education-room-board-periods.js';

/** Explicit fictional prior worksheet and receipt originals, never production defaults. */
export function roomBoardPriorUseFixture(year = 2025, esa = false) {
  const fixture = esa ? roomBoardEsaPeriodFixture(year) : roomBoardPeriodFixture(year);
  const { facts, period } = fixture;
  period.academicPeriodStart = `${year - 1}-08-15`;
  period.academicPeriodEnd = `${year}-06-20`;
  Object.assign(period, { priorUseHistoryConfirmed: true, priorUseHistorySourceReference: 'Fictional complete period history' });
  for (const expense of facts.expenses ?? []) expense.paidDate = `${year}-01-15`;
  for (const benefit of facts.inKindBenefits ?? []) benefit.providedDate = `${year}-01-15`;
  for (const link of facts.roomBoardPeriodExpenses) {
    link.coveredStart = `${year}-01-15`;
    link.coveredEnd = `${year}-06-01`;
  }
  const history = {
    id: 'prior-worksheet', periodId: period.id, sourceTaxYear: year - 1,
    sourceReference: 'Fictional filed prior period worksheet', sourceFactsConfirmed: true,
    allPriorUseSourcesIncludedConfirmed: true, noPostFilingChangesConfirmed: true,
    beneficiaryId: period.beneficiaryId, beneficiaryName: facts.beneficiaries?.[0]?.name, institutionId: period.institutionId,
    academicPeriodStart: period.academicPeriodStart, academicPeriodEnd: period.academicPeriodEnd,
    livingArrangement: period.livingArrangement, institutionEligible: true, halfTimeStudent: true,
    roomBoardAllowance: period.roomBoardAllowance, schoolOwnedHousing: false, schoolOwnedHousingCharge: '0',
    qualifiedCostBeforeAssistance: '5000', adjustedQualifiedExpenses: '4000',
  };
  const receipt = {
    id: 'prior-receipt', priorUseId: history.id, paidDate: `${year - 1}-09-01`,
    coveredStart: `${year - 1}-09-01`, coveredEnd: `${year - 1}-12-20`,
    amount: '5000', refundedAmount: '0', taxFreeAssistance: '1000', qualificationConfirmed: true,
    educationCreditAmount: '0', otherTaxBenefitAmount: '0',
    sourceReference: 'Fictional actual prior room receipt', sourceFactsConfirmed: true,
  };
  const priorFacts = Object.assign(facts, { roomBoardPriorUses: [history], roomBoardPriorUseExpenses: [receipt] });
  if (esa) {
    facts.roomBoardEsaAllocations = [
      { periodId: period.id, sourceId: fixture.form.sourceId ?? '', amount: '300' },
      { periodId: period.id, sourceId: 'esa', amount: '700' },
    ];
  }
  return { ...fixture, facts: priorFacts, history, receipt };
}
