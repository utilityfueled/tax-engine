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

it('passes return facts into Schedule AI', () => {
  const k1 = (partnershipName: string, accountHolder: string) => ({ partnershipName, partnershipEIN: '12-3456789', accountHolder, ordinaryIncome: '100000', entityType: 'partnership',
    selfEmploymentEarnings: '100000', selfEmploymentFactsConfirmed: true, selfEmploymentNetEarningsAfterAdjustments: '100000', selfEmploymentIncomeType: 'nonfarm' });
  const periods = [zero, zero, zero, { ...zero, adjustedGrossIncome: '200000', netProfitFromSelfEmployment: '200000' }];
  const spouses = base(periods, { w2s: [], scheduleK1: [k1('P', 'primary'), k1('Q', 'spouse')],
    taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: 'married_filing_jointly', spouse: { firstName: 'Sam', lastName: 'Doe', ssn: '111-22-3334', dateOfBirth: '1980-06-15', occupation: 'Consultant' } } });
  Object.assign(spouses.form2210!, { bothSpousesSelfEmployed: false });
  expect(() => calculateFederalTax(spouses)).toThrow(/separate PartII/);
  const itemizer = base([zero, zero, zero, { ...zero, adjustedGrossIncome: '200000', itemizedDeductions: '1' }], { scheduleA: { realEstateTaxes: '25000' } });
  expect(() => calculateFederalTax(itemizer)).toThrow(/reconcile to the completed return/);
});

it('reconciles a return with Schedule 1-A through line 14', () => {
  const senior = { w2s: [{ ...simpleW2Fixture.w2s[0], wages: '100000', federalWithheld: '0', socialSecurityWages: '100000', medicareWages: '100000' }],
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: '1950-01-01' } },
    schedule1A: { primarySsnEligible: true, excludedPuertoRicoIncome: '0', form4563Exclusion: '0', employeeTips: [], businessTips: [], vehicleLoans: [], seniorOwners: ['primary'], overtime: [] } };
  const periods = (last: string) => [{ ...zero, adjustedGrossIncome: '25000', schedule1AAdjustment: '0' }, { ...zero, adjustedGrossIncome: '41666.67', schedule1AAdjustment: '0' }, { ...zero, adjustedGrossIncome: '66666.67', schedule1AAdjustment: '0' }, { ...zero, adjustedGrossIncome: '100000', schedule1AAdjustment: last }];
  const result = calculateFederalTax(base(periods('4500'), senior));
  expect(result.schedule1A?.totalDeduction.toFixed()).toBe('4500');
  const adjustment = result.form2210!.lines.find(row => row.line === '14-adjustment-d');
  expect(adjustment?.value.toFixed()).toBe('4500');
  expect(result.form2210!.lines.find(row => row.line === '13d')?.value.toFixed()).toBe(result.taxableIncome.plus(4500).toFixed());
  expect(() => calculateFederalTax(base(periods('4499'), senior))).toThrow(/must equal the deduction/);
});

