// Spec: spec/federal/form-1099-b-withholding.yaml.
import { expect, it } from 'vitest';
import { Form1099BSchema, TaxYearInputSchema } from '@/models/inputs.js';
import { calculateBrokerageWithholding } from '@/engine/forms/form-1099-b-withholding.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const source = (overrides: Record<string, unknown> = {}) => Form1099BSchema.parse({ broker: 'Actual broker', sourceId: 'original-statement-A', taxYear: 2025, accountHolder: 'primary', accountReference: 'Original account A', federalWithheld: '12.34', stateWithheld: '0', transactions: [
  { description: 'Actual first sale', dateAcquired: '2024-01-15', dateSold: '2025-02-03', proceeds: '100', costBasis: '100', holdingPeriod: 'long', basisReportedToIRS: true, adjustments: '0', washSale: false, washSaleDisallowed: '0', digitalAsset: false },
  { description: 'Actual second sale', dateAcquired: '2025-01-15', dateSold: '2025-03-03', proceeds: '200', costBasis: '200', holdingPeriod: 'short', basisReportedToIRS: true, adjustments: '0', washSale: false, washSaleDisallowed: '0', digitalAsset: false },
], ...overrides });
const context = { taxYear: 2025, filingStatus: 'single' as const, spousePresent: false };

it('binds actual brokerage withholding to unique original sources', () => {
  expect(Form1099BSchema.parse({ broker: 'Legacy source', transactions: [] }).federalWithheld).toBeUndefined();
  const legacy = Form1099BSchema.parse({ broker: 'Legacy source', transactions: [] });
  expect(calculateBrokerageWithholding([legacy], context).sourceFactsComplete).toBe(false);
  expect(legacy.federalWithheld).toBeUndefined();
  expect(() => calculateBrokerageWithholding([source({ federalWithheld: undefined })], context)).toThrow(/original Box4/);
  expect(calculateBrokerageWithholding([source({ federalWithheld: '9007199254740993.03' }), source({ sourceId: 'original-statement-B', federalWithheld: '0.07' })], context).federalWithheld.toFixed()).toBe('9007199254740993.1');
  expect(calculateBrokerageWithholding([source({ federalWithheld: '0' })], context).federalWithheld.toFixed()).toBe('0');
  for (const patch of [{ sourceId: undefined }, { sourceId: ' ' }, { taxYear: 2024 }, { taxYear: undefined }, { accountHolder: undefined }, { accountHolder: 'spouse' }, { broker: ' ' }]) expect(() => calculateBrokerageWithholding([source(patch)], context)).toThrow(/source|year|owner|broker|spouse/i);
  for (const value of ['', ' ', '-0.01', 'NaN', 'Infinity']) expect(() => calculateBrokerageWithholding([source({ federalWithheld: value })], context)).toThrow();
  expect(() => calculateBrokerageWithholding([source(), source({ transactions: [source().transactions[1]] })], context)).toThrow(/duplicate|repeat|once/i);
  expect(calculateBrokerageWithholding([source({ accountHolder: 'spouse' })], { taxYear: 2025, filingStatus: 'married_filing_jointly', spousePresent: true }).federalWithheld.toFixed()).toBe('12.34');
  expect(() => calculateBrokerageWithholding([source({ accountHolder: 'spouse' })], { taxYear: 2025, filingStatus: 'married_filing_jointly', spousePresent: false })).toThrow(/spouse/);
});

it('routes original brokerage withholding once to federal payments', () => {
  const baseline = calculateFederalTax(TaxYearInputSchema.parse(simpleW2Fixture));
  const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099B: [source(), source({ sourceId: 'original-statement-B', federalWithheld: '0.66', transactions: [{ ...source().transactions[0], description: 'Actual third sale' }] })] }));
  expect(result.totalWithholding.toFixed()).toBe('12763');
  expect(result.totalWithholding.minus(baseline.totalWithholding).toFixed()).toBe('13');
  expect(result.agi.toFixed()).toBe('85000');
  expect(result.totalTax.toFixed()).toBe(baseline.totalTax.toFixed());
  expect(result.allLines.find(line => line.form === '1040' && line.line === '25b')?.value.toFixed()).toBe('13');
});

it('retains open-short-sale withholding without fabricating a capital transaction', () => {
  const shortSale = { description: '$5000 short sale of100shares still open', openedDate: '2025-10-01', stillOpenAtYearEndConfirmed: true, otherNumberedBoxesBlankConfirmed: true };
  const actual = source({ federalWithheld: '1200.25', transactions: [], withholdingOnlyOpenShortSale: shortSale });
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099B: [actual] });
  const result = calculateFederalTax(input);
  expect(input.form1099B[0]?.transactions).toEqual([]);
  expect(result.agi.toFixed()).toBe('85000');
  expect(result.totalWithholding.toFixed()).toBe('13950.25');
  for (const patch of [{ openedDate: '2024-10-01' }, { openedDate: '2025-02-30' }, { description: '' }, { stillOpenAtYearEndConfirmed: false }, { otherNumberedBoxesBlankConfirmed: undefined }]) expect(() => calculateBrokerageWithholding([source({ transactions: [], withholdingOnlyOpenShortSale: { ...shortSale, ...patch } })], context)).toThrow(/short|source|date|description|blank/i);
  expect(() => calculateBrokerageWithholding([source({ withholdingOnlyOpenShortSale: shortSale })], context)).toThrow(/transaction|short/i);
  for (const stateWithheld of ['-1', '0.01']) expect(() => calculateBrokerageWithholding([source({ stateWithheld, transactions: [], withholdingOnlyOpenShortSale: shortSale })], context)).toThrow(/short|numbered/i);
  expect(() => source({ stateWithheld: 'NaN' })).toThrow(/decimal/i);
  expect(() => calculateBrokerageWithholding([source({ taxYear: 2026, transactions: [], withholdingOnlyOpenShortSale: shortSale })], { ...context, taxYear: 2026 })).toThrow(/year|date|short/i);
});
