import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { niitDispositionSources } from '../fixtures/niit-sources.js';

// Spec: spec/federal/eic-investment-capital.yaml. Fictional original records.
function input(businessGain: string, securitiesGain = '0', lookback = '0', wages = '2000') {
  const business = new Decimal(businessGain);
  const ordinary = Decimal.min(business, new Decimal(lookback));
  const capital = business.minus(ordinary).plus(securitiesGain);
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages, federalWithheld: '0', socialSecurityWages: wages,
      socialSecurityWithheld: new Decimal(wages).times('0.062').toFixed(), medicareWages: wages,
      medicareWithheld: new Decimal(wages).times('0.0145').toFixed() }],
    scheduleK1: [{ partnershipName: 'Fictional active business', partnershipEIN: '44-4444444',
      ordinaryIncome: '0', section1231Gain: businessGain, isPassiveActivity: false,
      netLongTermCapitalGain: securitiesGain }],
    form4797: { nonrecapturedNetSection1231Losses: lookback },
    form8960Sources: niitDispositionSources(capital.toFixed(), ordinary.toFixed(), business.negated().toFixed()),
    eic: {},
  });
}
function worksheet(result: ReturnType<typeof calculateFederalTax>, line: string) {
  return result.allLines.find(row => row.form === 'EIC Investment Income Worksheet' && row.line === line)?.value.toFixed();
}
function credit(result: ReturnType<typeof calculateFederalTax>) {
  return result.allLines.find(row => row.form === '1040' && row.line === '27a')?.value.toFixed();
}
it('excludes section1231 business gain from the investment ceiling', () => {
  const source = input('12000'); const before = JSON.stringify(source);
  const result = calculateFederalTax(source);
  expect(result.capitalGainLoss.toFixed()).toBe('12000');
  expect(credit(result)).toBe('155');
  expect(worksheet(result, '5')).toBe('12000');
  expect(worksheet(result, '6')).toBe('12000');
  expect(worksheet(result, '7')).toBe('0');
  expect(JSON.stringify(source)).toBe(before);
  expect(credit(calculateFederalTax(TaxYearInputSchema.parse(JSON.parse(before))))).toBe('155');
});
it('uses post-lookback gain without excluding separate securities gains', () => {
  const result = calculateFederalTax(input('12000', '200.01', '4000'));
  expect(result.form4797?.line7.toFixed()).toBe('12000');
  expect(result.form4797?.line9.toFixed()).toBe('8000');
  expect(result.capitalGainLoss.toFixed()).toBe('8200.01');
  expect(worksheet(result, '5')).toBe('8200.01');
  expect(worksheet(result, '6')).toBe('8000');
  expect(worksheet(result, '7')).toBe('200.01');
  expect(credit(result)).toBe('155');
});
it('floors a net capital loss before and after the business subtraction', () => {
  const result = calculateFederalTax(input('12000', '-15000', '0', '20000'));
  expect(result.capitalGainLoss.toFixed()).toBe('-3000');
  expect(worksheet(result, '5')).toBe('0');
  expect(worksheet(result, '6')).toBe('12000');
  expect(worksheet(result, '7')).toBe('0');
});
it('preserves both sides of the securities investment ceiling', () => {
  const at = calculateFederalTax(input('0', '11950'));
  const above = calculateFederalTax(input('0', '11950.01'));
  expect(worksheet(at, '7')).toBe('11950');
  expect(worksheet(above, '7')).toBe('11950.01');
  expect(credit(at)).toBe('155');
  expect(credit(above)).toBe('0');
});
it('does not subtract business gain recharacterized as ordinary income', () => {
  const result = calculateFederalTax(input('100', '12000', '100'));
  expect(result.form4797?.line9.toFixed()).toBe('0');
  expect(worksheet(result, '7')).toBe('12000');
  expect(credit(result)).toBe('0');
});
