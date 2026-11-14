// Spec: spec/federal/form-172-principal-residence.yaml. Literal manual PartI examples.
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '../../src/index.js';
import { principalResidenceCodInput } from '../fixtures/cod-principal-residence.js';
import { currentOriginInput } from '../fixtures/form-172-origin.js';

function currentMortgageOrigin() {
  const base = currentOriginInput(), home = principalResidenceCodInput();
  if (!base.form172 || !base.netOperatingLoss) throw Error('Actual fictional origin and prior packet required');
  return parseInput({ ...base, ...home, w2s: [], form1099Int: [],
    form172: { ...base.form172, cancelledDebtIncluded: true },
    netOperatingLoss: { ...base.netOperatingLoss, primaryName: 'Fictional Homeowner', primaryTaxpayerIdLast4: '0001' } });
}

it('classifies actual taxable mortgage cancellation as nonbusiness income in each origin', () => {
  const input = currentMortgageOrigin(), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('-50000');
  expect(result.form172?.regular.partI[1].toFixed()).toBe('-65750');
  expect(result.form172?.regular.partI[7].toFixed()).toBe('50000');
  expect(result.form172?.regular.partI[9].toFixed()).toBe('0');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('65750');
  expect(result.form172?.alternativeTax.partI[7].toFixed()).toBe('50000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('50000');
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe('0');
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('65750');
  expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('50000');
  expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
  expect(result.allLines.find(row => row.form === 'Sched 1' && row.line === '8c')?.value.toFixed()).toBe('50000');
  expect(JSON.stringify(input)).toBe(before);
});

it('preserves current loss attributes when original residence debt is fully excluded', () => {
  const input = currentMortgageOrigin();
  if (!input.form982PrincipalResidenceSources?.acquisition) throw Error('Original acquisition required');
  input.form982PrincipalResidenceSources.acquisition.outstandingPrincipal = '750000';
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe('-100000');
  expect(result.form172?.regular.partI[7].toFixed()).toBe('0');
  expect(result.form172?.regular.partI[9].toFixed()).toBe('15750');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('100000');
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('100000');
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('100000');
  expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('100000');
  expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('200000');
  expect(input.form982NolSources).toBeUndefined();
});

it('keeps source cents through the nonbusiness deduction boundary', () => {
  for (const [loan, taxable, regularExact, alternativeExact, alternativeReported] of [
    ['751000', '1000', '-100000', '-99000', '99000'],
    ['765750.01', '15750.01', '-99999.99', '-84249.99', '84250'],
  ]) {
    const input = currentMortgageOrigin();
    if (!input.form982PrincipalResidenceSources?.acquisition) throw Error('Original acquisition required');
    input.form982PrincipalResidenceSources.acquisition.outstandingPrincipal = loan;
    const result = calculateFederalTax(input);
    expect(result.form172?.regular.sourcePartI[7].toFixed()).toBe(taxable);
    expect(result.form172?.regular.sourcePartI[24].toFixed()).toBe(regularExact);
    expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('100000');
    expect(result.form172?.alternativeTax.sourcePartI[24].toFixed()).toBe(alternativeExact);
    expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe(alternativeReported);
  }
});

it('rejects incomplete or contradictory current mortgage origin classification', () => {
  type Input = ReturnType<typeof currentMortgageOrigin>;
  const changes: Array<(input: Input) => void> = [
    input => { if (input.form172) input.form172.cancelledDebtIncluded = false; },
    input => { if (input.form172) input.form172.cancelledDebtIncluded = undefined; },
    input => { input.form982PrincipalResidenceSources = undefined; },
    input => { if (input.form982PrincipalResidenceSources) input.form982PrincipalResidenceSources.neverBusinessOrRentalUseConfirmed = undefined; },
    input => { input.codExclusion = { qualifiedPrincipalResidence: { dischargedAmount: '1' } }; },
  ];
  for (const mutate of changes) {
    const input = currentMortgageOrigin(); mutate(input);
    expect(() => calculateFederalTax(input)).toThrow(/Form172|QPR|COD exclusions/);
  }
});
