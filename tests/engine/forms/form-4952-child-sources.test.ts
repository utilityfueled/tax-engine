// Spec: spec/federal/form-4952-child-sources.yaml.
import { expect, it } from 'vitest';
import { getConstants } from '@/models/constants.js';
import { calculateForm4952 } from '@/engine/forms/form-4952.js';
import { calculateForm4952ChildSources } from '@/engine/forms/form-4952-child-sources.js';
import { syntheticChildInvestmentInput } from '../../fixtures/child-investment-interest.js';

it('rejects missing duplicate stale and conflicting child sources', () => {
  const input = syntheticChildInvestmentInput(), worksheet = input.form4952;
  for (const change of [
    { childIncomeSources: undefined },
    { childIncomeSources: { ...worksheet.childIncomeSources, children: [] } },
    { childIncomeSources: { ...worksheet.childIncomeSources, sourceTaxYear: 2024 } },
    { childIncomeSources: { ...worksheet.childIncomeSources, parentSourcesExcludeAllChildrenConfirmed: false } },
    { childIncomeSources: { ...worksheet.childIncomeSources, children: [worksheet.childIncomeSources.children[0], worksheet.childIncomeSources.children[0]] } },
    ...['sourceId', 'sourceTaxYear', 'firstName', 'lastName', 'dateOfBirth', 'ssnLast4'].map(key => ({ childIncomeSources: {
      ...worksheet.childIncomeSources, children: [{ ...worksheet.childIncomeSources.children[0], [key]: key === 'sourceTaxYear' ? 2024 : 'invalid' }],
    } })),
    { grossInvestmentIncome: '4400' },
  ]) {
    expect(() => calculateForm4952ChildSources({ ...worksheet, ...change }, input.form8814, getConstants(2025))).toThrow(/child|source|year|reconcile|parent/i);
  }
});

it('reconciles the IRS Alaska example once with signed parent income', () => {
  const input = syntheticChildInvestmentInput(), worksheet = input.form4952;
  worksheet.childIncomeSources.parentGrossInvestmentIncome = '-300.25';
  worksheet.grossInvestmentIncome = '1899.75';
  const before = JSON.stringify(worksheet);
  const result = calculateForm4952ChildSources(worksheet, input.form8814, getConstants(2025));
  expect(result.grossInvestmentIncome.toFixed()).toBe('1899.75');
  expect(calculateForm4952(worksheet).line8.toFixed()).toBe('1900');
  expect(JSON.stringify(worksheet)).toBe(before);
  const audit = JSON.stringify(result.lines);
  expect(audit).not.toContain(input.form8814[0].electionFacts.child.ssn);
  expect(audit).not.toContain('Synthetic parent and child source partition');
});

it('nets actual child dividends and gains before source rounding', () => {
  const input = syntheticChildInvestmentInput(), child = input.form8814[0], worksheet = input.form4952;
  child.taxableInterest = '1000'; child.ordinaryDividends = '4000'; child.qualifiedDividends = '4000'; child.capitalGainDistributions = '5000';
  child.electionFacts.incomeCharacter.alaskaPermanentFundDividends = '0';
  Object.assign(worksheet.childIncomeSources, { parentGrossInvestmentIncome: '10.49', parentQualifiedDividends: '10.49',
    parentNetInvestmentGain: '-1000.49', parentNetLongTermGain: '-3000.49', parentNetShortTermGain: '2000' });
  Object.assign(worksheet, { grossInvestmentIncome: '3660.49', qualifiedDividendsIncluded: '2930.49', netGainFromInvestmentProperty: '2649.51', netCapitalGainFromInvestmentProperty: '649.51' });
  const result = calculateForm4952ChildSources(worksheet, input.form8814, getConstants(2025));
  expect(result.netCapitalGainFromInvestmentProperty.toFixed()).toBe('649.51');
  const form = calculateForm4952(worksheet);
  expect([form.line4a, form.line4b, form.line4d, form.line4e, form.line8].map(v => v.toFixed())).toEqual(['3660', '2930', '2650', '650', '2730']);
  worksheet.childIncomeSources.parentNetShortTermGain = '-5000'; worksheet.childIncomeSources.parentNetLongTermGain = '1000'; worksheet.childIncomeSources.parentNetInvestmentGain = '-4000';
  worksheet.netGainFromInvestmentProperty = '-350'; worksheet.netCapitalGainFromInvestmentProperty = '-350';
  calculateForm4952ChildSources(worksheet, input.form8814, getConstants(2025));
  expect(calculateForm4952(worksheet).line4e.toFixed()).toBe('0');
});

it('adds the actual child private activity preference once only for AMT', () => {
  const input = syntheticChildInvestmentInput();
  expect(calculateForm4952ChildSources(input.form4952, input.form8814, getConstants(2025)).grossInvestmentIncome.toFixed()).toBe('2200');
  expect(calculateForm4952ChildSources(input.form4952Amt, input.form8814, getConstants(2025), 'amt').grossInvestmentIncome.toFixed()).toBe('3000');
  expect(() => calculateForm4952ChildSources(input.form4952, input.form8814, getConstants(2025), 'amt')).toThrow(/reconcile/i);
  expect(() => calculateForm4952ChildSources(input.form4952Amt, input.form8814, getConstants(2025))).toThrow(/reconcile/i);
});

it('binds multiple actual children without converting an unknown parent amount to zero', () => {
  const input = syntheticChildInvestmentInput(), worksheet = input.form4952;
  const second = structuredClone(input.form8814[0]);
  second.electionFacts.child.ssn = '321-54-6702';
  input.form8814.push(second);
  worksheet.childIncomeSources.children.push({ ...worksheet.childIncomeSources.children[0], sourceId: 'form8814:1', ssnLast4: '6702' });
  worksheet.grossInvestmentIncome = '4400';
  expect(calculateForm4952ChildSources(worksheet, input.form8814, getConstants(2025)).grossInvestmentIncome.toFixed()).toBe('4400');
  const missing = structuredClone(worksheet);
  Reflect.deleteProperty(missing.childIncomeSources, 'parentNetLongTermGain');
  expect(() => calculateForm4952ChildSources(missing, input.form8814, getConstants(2025))).toThrow(/actual.*parent/i);
});
