// Spec: spec/federal/form-1099-b-withholding.yaml.
import { expect, it } from 'vitest';
import { buildBrokerageInputs, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { completeBrokerageSource, startCompleteInterview } from './complete-facts';

it('forwards actual statement withholding once and retains open-short sources', () => {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  const actual = { ...completeBrokerageSource, sourceId: 'original-broker-statement', sourceTaxYear: '2025', federalWithheld: '12.34' };
  state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [actual] };
  const input = buildTaxInputFromGuidedData(state); if (!input) throw new Error('Missing actual withholding input');
  expect(input.form1099B[0]).toMatchObject({ sourceId: actual.sourceId, taxYear: 2025, accountHolder: 'primary', federalWithheld: '12.34' });
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalWithholding.toFixed()).toBe('12.34');
  expect(buildBrokerageInputs([{ ...actual, federalWithheld: '9007199254740993.03' }])[0]?.federalWithheld).toBe('9007199254740993.03');
  for (const patch of [{ sourceId: '' }, { sourceTaxYear: '' }, { sourceTaxYear: '2024' }, { accountHolder: '' as const }, { federalWithheld: '' }]) {
    state.sectionData['income-investments'].brokerageEntries = [{ ...actual, ...patch }];
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
  }
  state.sectionData['income-investments'].brokerageEntries = [actual, structuredClone(actual)];
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
  const open = { ...actual, transactions: [], withholdingOnlyOpenShortSale: { description: 'Actual unclosed short sale', openedDate: '2025-04-03', stillOpenAtYearEndConfirmed: true, otherNumberedBoxesBlankConfirmed: true } };
  state.sectionData['income-investments'].brokerageEntries = [open];
  const shortInput = buildTaxInputFromGuidedData(state); if (!shortInput) throw new Error('Missing actual open-short input');
  expect(shortInput.form1099B[0]?.transactions).toEqual([]);
  expect(shortInput.form1099B[0]?.withholdingOnlyOpenShortSale).toEqual(open.withholdingOnlyOpenShortSale);
  expect(calculateFederalTax(TaxYearInputSchema.parse(shortInput)).totalWithholding.toFixed()).toBe('12.34');
  expect(calculateFederalTax(TaxYearInputSchema.parse(shortInput)).agi.toFixed()).toBe('0');
});
