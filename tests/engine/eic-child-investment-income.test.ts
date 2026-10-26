import { expect, it } from 'vitest';
import { TaxYearInputSchema, Form8814ChildSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm8814IncomeCharacter } from '@/engine/forms/form-8814-income-character.js';
import { getConstants } from '@/models/constants.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { syntheticChildElection } from '../fixtures/form-8814-election.js';

// Spec: spec/federal/eic-child-investment-income.yaml. Fictional original sources.
function child(values: Record<string, string>, alaska = '0', suffix = '01') {
  const exempt = values.taxExemptInterest ?? '0';
  const facts = syntheticChildElection(2025, suffix);
  return Form8814ChildSchema.parse({ taxableInterest: '0', taxExemptInterest: '0',
    ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0', ...values,
    electionFacts: { ...facts, incomeCharacter: { ...facts.incomeCharacter, alaskaPermanentFundDividends: alaska } },
    amtSources: { taxYear: 2025, allStatementsConfirmed: true, otherwiseAllowableDeduction: '0', statements: [
      { sourceId: `Fictional child exempt source ${suffix}`, form: '1099-INT', taxExemptInterest: exempt, specifiedPrivateActivityBondInterest: '0' },
    ] },
  });
}
function input(children: ReturnType<typeof child>[], interest = '0') {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '2000', federalWithheld: '0', socialSecurityWages: '2000', socialSecurityWithheld: '124', medicareWages: '2000', medicareWithheld: '29' }],
    form1099Int: [{ payer: 'Fictional parent bank', interestIncome: interest }], form8814: children, eic: {},
  });
}
function value(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  return result.allLines.find(row => row.form === form && row.line === line)?.value.toFixed();
}
it('includes child ordinary income on both sides of the investment ceiling', () => {
  const children = [child({ taxableInterest: '10000' })];
  const at = calculateFederalTax(input(children, '4650'));
  const above = calculateFederalTax(input(children, '4650.01'));
  expect(value(above, '1040', '27a')).toBe('0');
  expect(at.form8814?.totalOtherIncome.toFixed()).toBe('7300');
  expect(value(at, 'EIC Investment Income Worksheet', '4')).toBe('7300');
  expect(value(at, '1040', '27a')).toBe('155');
});
it('includes child exempt interest only in the required EIC component', () => {
  const result = calculateFederalTax(input([child({ taxableInterest: '2700', taxExemptInterest: '11950.01' })]));
  expect(value(result, '1040', '27a')).toBe('0');
  expect(value(result, '1040', '2a')).toBe('0');
  expect(value(result, 'EIC Investment Income Worksheet', '2')).toBe('11950.01');
  expect(value(result, 'EIC Investment Income Worksheet', '4')).toBe('0');
});
it('uses Worksheet2 child line12 rather than the NIIT allocation', () => {
  const children = [child({ taxableInterest: '500', ordinaryDividends: '6000', qualifiedDividends: '5000', capitalGainDistributions: '2000' }, '999')];
  const character = calculateForm8814IncomeCharacter(children, getConstants(2025));
  expect(character.children[0]?.line12.toFixed()).toBe('1023');
  expect(character.ordinaryInvestmentIncome.toFixed()).toBe('341');
  const at = calculateFederalTax(input(children, '6831'));
  const above = calculateFederalTax(input(children, '6831.01'));
  expect(value(above, '1040', '27a')).toBe('0');
  expect(value(at, 'EIC Investment Income Worksheet', '4')).toBe('342');
  expect(at.allLines.filter(row => row.form === 'EIC Investment Income Worksheet 2').map(row => [row.line, row.value.toFixed()])).toEqual([
    ['1:1', '6000'], ['1:2', '5000'], ['1:3', '1000'], ['1:4', '500'], ['1:5', '1500'],
    ['1:6', '999'], ['1:7', '0.666'], ['1:8', '1023'], ['1:9', '681'], ['1:10', '342'],
  ]);
  expect(value(at, '1040', '27a')).toBe('155');
});
it('preserves a signed child remainder and an explicit zero transfer', () => {
  const signed = calculateFederalTax(input([child({ ordinaryDividends: '1350.50', qualifiedDividends: '1350.50', capitalGainDistributions: '1350.50' })], '11949'));
  expect(value(signed, '1040', '27a')).toBe('155');
  expect(value(signed, 'EIC Investment Income Worksheet', '4')).toBe('-1');
  const zero = calculateFederalTax(input([child({ taxableInterest: '2700' })], '11950'));
  expect(value(zero, 'EIC Investment Income Worksheet', '4')).toBe('0');
  expect(value(zero, '1040', '27a')).toBe('155');
});
it('aggregates distinct child worksheets once without leaking identities', () => {
  const children = [child({ taxableInterest: '4000', ordinaryDividends: '2000', taxExemptInterest: '100' }, '2000'),
    child({ taxableInterest: '3000', taxExemptInterest: '200' }, '0', '02')];
  const source = input(children, '9150'); const saved = JSON.stringify(source);
  const result = calculateFederalTax(TaxYearInputSchema.parse(JSON.parse(saved)));
  expect(value(result, 'EIC Investment Income Worksheet', '2')).toBe('300');
  expect(value(result, 'EIC Investment Income Worksheet', '4')).toBe('2500');
  expect(value(result, '1040', '27a')).toBe('155');
  expect(JSON.stringify(source)).toBe(saved);
  const trace = JSON.stringify(result.allLines.filter(row => row.form.startsWith('EIC Investment')));
  for (const row of children) expect(trace).not.toContain(row.electionFacts?.child.ssn);
});
