// Spec: spec/federal/form-2210-schedule-ai.yaml guide.
import { expect, it } from 'vitest';
import { buildEstimatedTaxFacts, emptyAnnualizedPeriods, emptyEstimatedTaxFacts } from '@/lib/guided-estimated-tax-facts';
import { emptyPaymentData } from '@/lib/guided-interview-flow';

const periods = () => emptyAnnualizedPeriods().map(period => Object.fromEntries(Object.keys(period).map(key => [key, '0'])) as typeof period);
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
  for (const key of Object.keys(rows[0]!) as Array<keyof typeof rows[number]>) {
    const blank = periods(); blank[2]![key] = '';
    expect(() => buildEstimatedTaxFacts(data({ annualizedIncomePeriods: blank }), 2025), key).toThrow(/period 3/);
  }
});
