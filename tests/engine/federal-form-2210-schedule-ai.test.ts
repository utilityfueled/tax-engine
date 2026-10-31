// Spec: spec/federal/form-2210-schedule-ai.yaml return-reconciliation.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const zero = { adjustedGrossIncome: '0', itemizedDeductions: '0', qbiDeduction: '0', qualifiedDividends: '0', netCapitalGain: '0', netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0' };
const base = (periods: unknown[], patch = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: '200000', federalWithheld: '0', socialSecurityWages: '176100', medicareWages: '200000' }],
  form2210: { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, withholdingMethod: 'equal-installments',
    priorYearTaxStatus: 'no-return', calculationMethod: 'annualized', annualizedIncomePeriods: periods }, ...patch });

it('reconciles the full year column to the completed return', () => {
  expect(() => calculateFederalTax(base([zero, zero, zero, zero]))).toThrow(/reconcile to the completed return/);
  expect(() => calculateFederalTax(base([zero, zero, zero, { ...zero, adjustedGrossIncome: '1000' }]))).toThrow(/reconcile to the completed return/);
  expect(() => calculateFederalTax(base([{ ...zero, itemizedDeductions: '50000' }, zero, zero, zero]))).toThrow(/only to a return that itemizes/);
  const dividends = { form1099Div: [{ payer: 'Actual fund', ordinaryDividends: '50000', qualifiedDividends: '40000', totalCapitalGainDistributions: '10000' }] };
  expect(() => calculateFederalTax(base([zero, zero, zero, zero], dividends))).toThrow(/separate period worksheet/);
});
