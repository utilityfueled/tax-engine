// Spec: spec/federal/form-2210-schedule-ai.yaml guide.
import { expect, it } from 'vitest';
import { buildEstimatedTaxFacts, emptyAnnualizedPeriods, emptyEstimatedTaxFacts, hasOrdinaryPreferentialPeriodAmounts } from '@/lib/guided-estimated-tax-facts';
import { emptyPaymentData, updateSectionData } from '@/lib/guided-interview-flow';
import { completeDividendSource, startCompleteInterview } from './complete-facts';

const periods = () => emptyAnnualizedPeriods().map(period => Object.fromEntries(Object.keys(period).map(key => [key, '0'])) as typeof period);
function firstPeriod(rows: ReturnType<typeof periods>) {
  const first = rows[0];
  if (!first) throw new Error('Missing synthetic period');
  return first;
}
const data = (patch = {}) => ({ ...emptyPaymentData, estimatedTaxFacts: { ...structuredClone(emptyEstimatedTaxFacts), sourceTaxYear: '2025', sourceReference: 'Fictional records', sourceFactsConfirmed: true,
  allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
  calculationMethod: 'annualized' as const, withholdingMethod: 'equal-installments' as const, priorYearTaxStatus: 'no-return' as const, earlyReturnExceptionClaimed: false, annualizedIncomePeriods: periods(), ...patch } });

it('builds four complete periods and keeps blanks unknown', () => {
  const rows = periods(); rows[0]!.adjustedGrossIncome = '-1,500.25'; rows[3]!.netProfitFromSelfEmployment = '40,000';
  const built = buildEstimatedTaxFacts(data({ annualizedIncomePeriods: rows }), 2025)!;
  expect(built.calculationMethod).toBe('annualized');
  expect(built.annualizedIncomePeriods![0]!.adjustedGrossIncome).toBe('-1500.25');
  expect(built.annualizedIncomePeriods![3]!.netProfitFromSelfEmployment).toBe('40000');
  expect(built.annualizedIncomePeriods![1]!.credits).toBe('0');
  expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: undefined }), 2025)).toThrow(/four actual/);
  expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: rows.slice(0, 3) }), 2025)).toThrow(/four actual/);
  const dividends = periods(); firstPeriod(dividends).qualifiedDividends = '40000';
  expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: dividends }), 2025)).toThrow(/confirm.*ordinary/i);
  expect(buildEstimatedTaxFacts(data({ annualizedIncomePeriods: dividends, ordinaryPreferentialPeriodsConfirmed: true }), 2025))
    .toMatchObject({ ordinaryPreferentialPeriodsConfirmed: true, annualizedIncomePeriods: dividends });
  const malformed = periods(); firstPeriod(malformed).qualifiedDividends = '40,';
  expect(hasOrdinaryPreferentialPeriodAmounts(malformed)).toBe(false);
  expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: malformed }), 2025)).toThrow(/valid period 1 qualified dividends/i);
  for (const key of Object.keys(rows[0]!) as Array<keyof typeof rows[number]>) {
    const blank = periods(); blank[2]![key] = '';
    expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: blank }), 2025), key).toThrow(/period 3/);
  }
});

it('collects farmer and waiver facts without defaults', () => {
  const regular = { calculationMethod: 'regular' as const, annualizedIncomePeriods: undefined };
  expect(buildEstimatedTaxFacts(data({ ...regular, ordinaryPreferentialPeriodsConfirmed: true }), 2025)?.ordinaryPreferentialPeriodsConfirmed).toBeUndefined();
  expect(() => buildEstimatedTaxFacts(data({ ...regular, farmerOrFisher: true }), 2025)).toThrow(/two-thirds/);
  expect(buildEstimatedTaxFacts(data({ ...regular, farmerOrFisher: true, farmingIncomeTwoThirdsConfirmed: true }), 2025)).toMatchObject({ farmerOrFisher: true, farmingIncomeTwoThirdsConfirmed: true });
  expect(() => buildEstimatedTaxFacts(data({ ...regular, waiverRequested: true }), 2025)).toThrow(/waiver kind/);
  const waiver = { ...regular, waiverRequested: true, waiverKind: 'partial' as const, waiverReason: 'retirement_or_disability' as const, waiverStatementReference: 'Fictional statement' };
  expect(() => buildEstimatedTaxFacts(data(waiver), 2025)).toThrow(/waiver kind/);
  expect(buildEstimatedTaxFacts(data({ ...waiver, waiverAmount: '1,000' }), 2025)).toMatchObject({ waiverAmount: '1000', waiverKind: 'partial' });
});

it('revokes ordinary period confirmation when its return sources change', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  const rows = periods();
  firstPeriod(rows).qualifiedDividends = '1234.56';
  const payments = data({ annualizedIncomePeriods: rows, ordinaryPreferentialPeriodsConfirmed: true });
  state.sectionData.payments = payments;
  const firstPayer = { ...completeDividendSource, ordinaryDividends: '1800', qualifiedDividends: '1234.56' };
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [firstPayer], brokerageEntries: [] };

  const withPayment = updateSectionData(state, 'payments', { ...payments, estimatedPayments: [{ date: '2025-04-15', amount: '100' }] });
  expect(withPayment.sectionData.payments?.estimatedTaxFacts?.ordinaryPreferentialPeriodsConfirmed).toBe(true);
  const changedReference = updateSectionData(state, 'payments', {
    ...payments, estimatedTaxFacts: { ...payments.estimatedTaxFacts, sourceReference: 'Replacement worksheet reference' },
  });
  expect(changedReference.sectionData.payments?.estimatedTaxFacts?.ordinaryPreferentialPeriodsConfirmed).toBeNull();
  const changed = updateSectionData(withPayment, 'income-investments', {
    ...state.sectionData['income-investments'], dividendEntries: [{ ...firstPayer, payer: 'Replacement synthetic fund' }],
  });
  const retained = changed.sectionData.payments?.estimatedTaxFacts;
  expect(retained?.annualizedIncomePeriods).toEqual(rows);
  expect(retained?.sourceFactsConfirmed).toBeNull();
  expect(retained?.ordinaryPreferentialPeriodsConfirmed).toBeNull();
  expect(buildEstimatedTaxFacts(payments, 2025)?.ordinaryPreferentialPeriodsConfirmed).toBe(true);

  if (!changed.sectionData.payments || !retained) throw new Error('Missing retained source history');
  const onlyOverallReconfirmed = updateSectionData(changed, 'payments', {
    ...changed.sectionData.payments, estimatedTaxFacts: { ...retained, sourceFactsConfirmed: true },
  });
  expect(() => buildEstimatedTaxFacts(onlyOverallReconfirmed.sectionData.payments, 2025)).toThrow(/confirm the ordinary preferential/i);
});
