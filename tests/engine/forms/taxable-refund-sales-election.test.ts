// Spec: spec/federal/taxable-refund-worksheet.yaml — prior_tax_election.
import { expect, it } from 'vitest';
import { TaxYearInputSchema, TaxableRefundWorksheetSchema } from '@/models/inputs';
import { calculateTaxableRefundWorksheet } from '@/engine/forms/taxable-refund-worksheet';
import { calculateFederalTax } from '@/engine/federal';
import { simpleW2Fixture } from '../../fixtures/simple-w2';

const original = () => ({ priorTaxYear: 2024, priorYearItemized: true, priorYearItemizedTotal: '20000',
  priorYearStandardDeduction: '14600', priorYearStateLocalTaxesPaid: '8000', priorYearPropertyTaxesPaid: '0',
  priorYearAlternativeGeneralSalesTaxDeduction: '3000', priorYearFilingStatus: 'single' as const,
  priorYearStateLocalTaxElection: 'sales' as const });
const sources = [{ stateLocalIncomeTaxRefund: '1000.25', refundTaxYear: 2024, refundExpenseTaxYear: 2024 }];

it('preserves an actual sales election and excludes the income-tax refund', () => {
  const worksheet = TaxableRefundWorksheetSchema.parse(original());
  expect(worksheet).toHaveProperty('priorYearStateLocalTaxElection', 'sales');
  const result = calculateTaxableRefundWorksheet(sources, worksheet, 2025);
  expect(result.totalRefund.toFixed()).toBe('1000.25');
  expect(result.taxableRefund.toFixed()).toBe('0');
  expect(result.lines.some(line => line.line === 'prior_tax_election' && line.value.toFixed() === '0')).toBe(true);
  expect(worksheet.priorYearItemized).toBe(true);
});

it('retains actual itemization and the sales election through the full return', () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxableRefundWorksheet: original(),
    form1099G: [{ payer: 'Actual state', unemploymentCompensation: '0', federalWithheld: '0',
      stateOrLocalTaxRefund: '1000.25', refundTaxYear: 2024 }] });
  const control = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099G: [] }));
  const result = calculateFederalTax(input);
  expect(result.agi.eq(control.agi)).toBe(true);
  expect(input.taxableRefundWorksheet?.priorYearItemized).toBe(true);
});

it('preserves omitted election compatibility and rejects mismatched recovery years', () => {
  const { priorYearStateLocalTaxElection: _omitted, ...legacy } = original();
  expect(TaxableRefundWorksheetSchema.parse(legacy)).not.toHaveProperty('priorYearStateLocalTaxElection');
  expect(calculateTaxableRefundWorksheet(sources, legacy, 2025).taxableRefund.toFixed()).toBe('1000.25');
  expect(() => calculateTaxableRefundWorksheet([{ ...sources[0], refundExpenseTaxYear: 2023 }], original(), 2025)).toThrow(/year/i);
});
