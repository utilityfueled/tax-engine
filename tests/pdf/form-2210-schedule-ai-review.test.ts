// Spec: spec/federal/form-2210-schedule-ai.yaml review.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { PDFDocument } from 'pdf-lib';
import { calculateForm2210 } from '@/engine/forms/form-2210.js';
import { FORM_2210_FIELDS as F, fillForm2210 } from '@/pdf/mappings/2025/fill-form-2210.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const period = (adjustedGrossIncome: string) => ({ adjustedGrossIncome, itemizedDeductions: '0', qbiDeduction: '0', qualifiedDividends: '0', netCapitalGain: '0',
  netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0' });
const base = { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
  withholdingMethod: 'equal-installments' as const, priorYearTaxStatus: 'no-return' as const };
const facts = (annualized: boolean) => annualized ? { ...base, calculationMethod: 'annualized' as const, annualizedIncomePeriods: ['30000', '60000', '120000', '200000'].map(period) } : { ...base, calculationMethod: 'regular' as const };
const calculate = (annualized: boolean) => calculateForm2210({ currentYearTax: new Decimal(37067), incomeTaxAfterCredits: new Decimal(37067), withholding: new Decimal(0), estimatedPayments: new Decimal(33361),
  refundableCredits: new Decimal(0), filingStatus: 'single', taxYear: 2025, scheduleAiReturn: { standardDeduction: new Decimal(15750), agi: new Decimal(200000), taxableIncome: new Decimal(184250), preferentialIncome: false, selfEmployedOwners: 0, specialTaxMethod: false }, payments: [{ date: '2026-01-15', amount: '33361', kind: 'estimated' }], facts: facts(annualized) });
const render = async (annualized: boolean, form2210 = calculate(annualized)) => {
  const input = { ...simpleW2Fixture, form2210: facts(annualized) } as TaxYearInput;
  const doc = await fillForm2210(input, { taxYear: 2025, form2210 } as TaxReturnResult, 'forms/blank/2025/f2210.pdf');
  return (await PDFDocument.load(await doc.save())).getForm();
};

it('marks box C and reconciles line10 to Schedule AI', async () => {
  const annualized = await render(true);
  expect(annualized.getCheckBox(F.boxC).isChecked()).toBe(true);
  expect(annualized.getTextField(F.line10a).getText()).toBe('4020');
  const regular = await render(false);
  expect(regular.getCheckBox(F.boxC).isChecked()).toBe(false);
  expect(regular.getTextField(F.line10a).getText()).toBe('8340');
  const stale = calculate(true);
  stale.lines = stale.lines.filter(row => row.line !== '27b');
  await expect(render(true, stale)).rejects.toThrow(/original period sources/);
  const tampered = calculate(true);
  tampered.lines = tampered.lines.map(row => row.line === '14a' ? { ...row, value: new Decimal(1) } : row);
  await expect(render(true, tampered)).rejects.toThrow(/original period sources/);
  await expect(render(false, calculate(true))).rejects.toThrow(/Schedule AI audit/);
  await expect(render(true, calculate(false))).rejects.toThrow(/Schedule AI audit/);
});
