/** Spec: spec/federal/form-8814-rounding.yaml. Literal arithmetic from final2025 form. */
import { expect, it } from 'vitest';
import { Form8814ChildSchema, TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { getConstants } from '@/models/constants.js';
import { calculateForm8814, aggregateForm8814Results } from '@/engine/forms/form-8814.js';
import { calculateForm8814IncomeCharacter } from '@/engine/forms/form-8814-income-character.js';
import { syntheticChildElection } from '../../fixtures/form-8814-election.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

const constants = getConstants(2025);
const child = (values: Record<string, string>) => Form8814ChildSchema.parse({
  taxableInterest: '0', taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0',
  electionFacts: syntheticChildElection(), ...values,
});
it('rounds each preferential ratio without truncating the dollar transfer', () => {
  for (const capital of [false, true]) {
    const result = calculateForm8814(child(capital
      ? { taxableInterest: '3516', capitalGainDistributions: '1500' }
      : { taxableInterest: '3516', ordinaryDividends: '1500', qualifiedDividends: '1500' }), constants);
    expect(result.lines.find(row => row.line === (capital ? '8' : '7'))?.value.toFixed(6)).toBe('0.299043');
    expect((capital ? result.capitalGainsToReport : result.qualifiedDividendsToReport).toFixed()).toBe('693');
    expect(result.otherIncomeToReport.toFixed()).toBe('1623');
  }
});
it('preserves the signed line12 rounding remainder and total parent income', () => {
  const input = child({ ordinaryDividends: '1350.50', qualifiedDividends: '1350.50', capitalGainDistributions: '1350.50' });
  const result = calculateForm8814(input, constants);
  expect(result.line4.toFixed()).toBe('2701');
  expect(result.line6.toFixed()).toBe('1');
  expect(result.qualifiedDividendsToReport.toFixed()).toBe('1');
  expect(result.capitalGainsToReport.toFixed()).toBe('1');
  expect(result.otherIncomeToReport.toFixed()).toBe('-1');
  const aggregate = aggregateForm8814Results([input], constants);
  expect(aggregate.totalOtherIncome.plus(aggregate.totalCapitalGains).plus(aggregate.totalQualifiedDividends).toFixed()).toBe('1');
});
it('preserves the signed ordinary transfer in child investment character', () => {
  const input = child({ ordinaryDividends: '1350.50', qualifiedDividends: '1350.50', capitalGainDistributions: '1350.50' });
  const result = calculateForm8814IncomeCharacter([input], constants);
  expect(result.ordinaryInvestmentIncome.toFixed()).toBe('-1');
  expect(result.grossInvestmentIncomeFor4952.toFixed()).toBe('0');
});
it('retains the signed child remainder in the canonical parent return', () => {
  const result = calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '300000', federalWithheld: '100000' }],
    form8814: [child({ ordinaryDividends: '1350.50', qualifiedDividends: '1350.50', capitalGainDistributions: '1350.50' })],
  }));
  expect(result.agi.toFixed()).toBe('300001');
  expect(result.form8814?.totalOtherIncome.toFixed()).toBe('-1');
  expect(result.allLines.find(row => row.form === 'Form 8960' && row.line === '7')?.value.toFixed()).toBe('-1');
});
