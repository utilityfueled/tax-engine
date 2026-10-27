// Spec: spec/federal/charitable-cod-modified-composition.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { charitableCodModifiedInput } from '../fixtures/charitable-cod-modified';
import { actualCodNolInput } from '../fixtures/cod-nol';
import { calculateCodNolReduction } from '@/engine/forms/cod-nol-reductions';
import { d } from '@/utils/decimal';

it('preserves a unique charitable benefit when the same COD fits both loss comparisons', () => {
  const input = charitableCodModifiedInput(), before = JSON.stringify(input);
  const result = calculateFederalTax(input), prior = result.netOperatingLoss;
  expect([result.nolDeduction, result.agi, result.scheduleA?.charitableTotal, prior?.carryforward,
    prior?.charitableCounterfactual?.calculation.carryforward, prior?.determinedCharitableCarryover?.reduction,
    result.carryforwards.charitableContributions, prior?.alternativeTax.deduction,
    result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward,
    result.form6251?.amti].map(value => value?.toFixed()))
    .toEqual(['39200', '60800', '19240', '60800', '51392', '9408', '22352', '84600', '55800', '10400', '9400']);
  const baseline = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined,
    form172: input.form172 ? { ...input.form172, cancelledDebtIncluded: false } : undefined });
  expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(result.totalTax.eq(baseline.totalTax)).toBe(true);
  expect(prior).toEqual(baseline.netOperatingLoss);
  expect(JSON.stringify(input)).toBe(before);
});

it('keeps modified absorption separate from current use before the determined reduction', () => {
  const input = charitableCodModifiedInput(true), before = JSON.stringify(input);
  const result = calculateFederalTax(input), prior = result.netOperatingLoss;
  expect([result.nolDeduction, prior?.absorbed, prior?.carryforward, result.agi,
    result.scheduleA?.charitableTotal, prior?.charitableCounterfactual?.calculation.absorbed,
    prior?.charitableCounterfactual?.calculation.carryforward, prior?.determinedCharitableCarryover?.reduction,
    result.carryforwards.charitableContributions, prior?.alternativeTax.deduction, prior?.alternativeTax.absorbed,
    result.carryforwards.nolCarryforward, result.carryforwards.alternativeTaxNolCarryforward,
    result.form6251?.amti].map(value => value?.toFixed()))
    .toEqual(['37520', '39200', '60800', '59480', '18844', '48925', '51075', '9725', '22431',
      '81900', '84600', '55800', '10400', '9100']);
  expect(JSON.stringify(input)).toBe(before);
});

it('conserves ordinary modified-use differences without creating a charity result', () => {
  const input = actualCodNolInput('5000'); input.priorYear = { shortTermCapitalLoss: '-3000' };
  const result = calculateFederalTax(input), prior = result.netOperatingLoss;
  expect([result.nolDeduction, prior?.absorbed, prior?.carryforward, prior?.alternativeTax.deduction,
    prior?.alternativeTax.absorbed, prior?.alternativeTax.carryforward, result.carryforwards.nolCarryforward,
    result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
    .toEqual(['65000', '67400', '132600', '87300', '90000', '110000', '127600', '105000']);
  expect(prior?.determinedCharitableCarryover).toBeUndefined();
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  const reversed = structuredClone(input);
  reversed.netOperatingLoss?.vintages?.reverse(); reversed.netOperatingLoss?.alternativeTax?.vintages?.reverse();
  const reordered = calculateFederalTax(reversed);
  expect(reordered.codNolReduction).toEqual(result.codNolReduction);
});

it('retains source and exhaustion boundaries without inventing a charitable revival', () => {
  const unknown = charitableCodModifiedInput();
  if (!unknown.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory) throw new Error('Missing original fictional history');
  unknown.netOperatingLoss.alternativeTax.charitableCarryoverHistory.sourceFactsConfirmed = false;
  expect(() => calculateFederalTax(unknown)).toThrow(/histor|source|confirm/i);
  const multi = charitableCodModifiedInput(); multi.donations[0].amount = '60000'; multi.donations[0].costBasis = '60000';
  expect(() => calculateFederalTax(multi)).toThrow(/multiple|origin|attribution/i);
  const conflict = charitableCodModifiedInput();
  if (!conflict.form982NolSources?.debts?.[0]) throw new Error('Missing original fictional debt');
  conflict.form982NolSources.debts[0].amountDischarged = '5001';
  expect(() => calculateFederalTax(conflict)).toThrow(/original.*reconcile|statement.*reconcile/i);
  const exhaustsComparison = charitableCodModifiedInput();
  const debt = exhaustsComparison.form982NolSources?.debts?.[0];
  const alternative = exhaustsComparison.netOperatingLoss?.alternativeTax?.vintages?.[0];
  if (!debt || !alternative) throw new Error('Missing fictional original independent sources');
  debt.amountDischarged = '52000'; exhaustsComparison.form1099C[0].amountDischarged = '52000';
  alternative.originalLoss = '1000000'; alternative.openingCarryforward = '1000000';
  expect(() => calculateFederalTax(exhaustsComparison)).toThrow(/COD.*(?:comparison|exhaust|composition)/i);
  const differentPool = actualCodNolInput('11000'); differentPool.priorYear = { shortTermCapitalLoss: '-3000' };
  expect(() => calculateFederalTax(differentPool)).toThrow(/COD.*(?:modified|exhaust)/i);
});

it('requires complete identical originals and preserves the exact comparison capacity', () => {
  const input = charitableCodModifiedInput(), debt = input.form982NolSources?.debts?.[0];
  const alternative = input.netOperatingLoss?.alternativeTax?.vintages?.[0];
  if (!debt || !alternative) throw new Error('Missing fictional original sources');
  alternative.originalLoss = '1000000'; alternative.openingCarryforward = '1000000';
  debt.amountDischarged = '51392'; input.form1099C[0].amountDischarged = '51392';
  const result = calculateFederalTax(input);
  expect([result.codNolReduction?.regular?.carryforward, result.codNolReduction?.regular?.charitableComparison?.carryforward,
    result.codNolReduction?.regular?.charitableComparison?.nolDifferenceAfterReduction].map(value => value?.toFixed()))
    .toEqual(['9408', '0', '9408']);
  debt.amountDischarged = '51393'; input.form1099C[0].amountDischarged = '51393';
  expect(() => calculateFederalTax(input)).toThrow(/COD.*comparison.*exhaust/i);
  const original = charitableCodModifiedInput(true);
  for (const mutate of [
    (value: ReturnType<typeof calculateFederalTax>) => { const row = value.netOperatingLoss?.charitableCounterfactual?.calculation.vintages[0]; if (row) row.deduction = d('37519'); },
    (value: ReturnType<typeof calculateFederalTax>) => { const row = value.netOperatingLoss?.charitableCounterfactual?.calculation.vintages[0]; if (row) row.sourceId = 'Other original'; },
    (value: ReturnType<typeof calculateFederalTax>) => { if (value.netOperatingLoss) value.netOperatingLoss.charitableCounterfactual = undefined; },
  ]) {
    const calculated = calculateFederalTax(original); mutate(calculated);
    if (!calculated.netOperatingLoss) throw new Error('Missing actual current calculation');
    expect(() => calculateCodNolReduction(original, { priorLoss: calculated.netOperatingLoss, currentOrigin: calculated.form172 })).toThrow(/COD.*(?:original|comparison|deduction|vector)/i);
  }
});
