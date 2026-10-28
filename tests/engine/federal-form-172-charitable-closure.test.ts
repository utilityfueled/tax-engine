// Spec: spec/federal/form-172-charitable-closure.yaml. Derived literal controls.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateForm172CharitableSources } from '@/engine/forms/form-172-charitable-sources.js';
import { calculateCurrentCharitableCandidates } from '@/engine/forms/current-charitable-candidates.js';
import { readCurrentCharitableReceiptAmounts } from '@/utils/charitable-current-receipts.js';
import { d } from '@/utils/decimal.js';
import { currentCharitableOriginInput } from '../fixtures/form-172-charitable-origin.js';
import { originalCharitableOriginInput, priorCharitableOriginInput } from '../fixtures/form-172-charitable-closure.js';

it('uses actual donation-only crypto and charity-only K1 sources in current origins', () => {
  for (const kind of ['crypto', 'partnership', 's_corporation'] as const) {
    const input = originalCharitableOriginInput(kind), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect([result.agi, result.scheduleA?.charitableTotal, result.form172?.regular.netOperatingLoss,
      result.form172?.alternativeTax.netOperatingLoss, result.carryforwards.charitableContributions,
      result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
      .toEqual(['10000', '3000', '13000', '0', '57000', '57000']);
    expect(result.form172?.charitableSources?.qualifiedValue.toFixed()).toBe('60000');
    if (kind !== 'crypto') expect(result.scheduleE?.partnerships[0].basisResult?.suspendedLossCarryforward.charitable.toFixed()).toBe('20000');
    expect(JSON.stringify(input)).toBe(before);
  }
});

it('preserves actual source classifications and unknown histories before current origin netting', () => {
  for (const field of ['ordinaryIncome', 'interestIncome', 'guaranteedPayments', 'royalties', 'netShortTermCapitalGain', 'section199AQBI'] as const) {
    const input = originalCharitableOriginInput('partnership'); input.scheduleK1[0][field] = '1';
    expect(() => calculateFederalTax(input)).toThrow(/Form172|current origin|source|basis|charitable/i);
  }
  const missing = originalCharitableOriginInput('crypto');
  if (!missing.netOperatingLoss?.alternativeTax) throw Error('Missing fictional independent record');
  missing.netOperatingLoss.alternativeTax.charitableCarryoverHistory = undefined;
  expect(() => calculateFederalTax(missing)).toThrow(/charit.*histor|histor.*charit/i);
  const mining = originalCharitableOriginInput('crypto');
  if (!mining.cryptoIncome) throw Error('Missing fictional crypto record');
  mining.cryptoIncome.isMiningBusiness = true;
  expect(() => calculateFederalTax(mining)).toThrow(/donation.only|crypto|current origin/i);
  const prior = originalCharitableOriginInput('partnership');
  if (!prior.scheduleK1[0].priorSuspendedLosses) throw Error('Missing fictional complete zero prior basis history');
  prior.scheduleK1[0].priorSuspendedLosses.ordinary = '1';
  expect(() => calculateFederalTax(prior)).toThrow(/prior|charitable|current origin/i);
});

it('retains original prior charity and independent current AMT differences in loss origins', () => {
  const input = priorCharitableOriginInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.agi, result.scheduleA?.charitableTotal, result.deductionAmount, result.form172?.regular.netOperatingLoss,
    result.form172?.alternativeTax.netOperatingLoss, result.form6251?.amti,
    result.netOperatingLoss?.priorCharitableAlternativeAdjustment?.amount,
    result.carryforwards.charitableContributions, result.carryforwards.amtCharitableContributions].map(value => value?.toFixed()))
    .toEqual(['10000', '3000', '23000', '13000', '0', '9000', '2000', '47000', '0']);
  expect(result.carryforwards.charitableContributionsByYear.map(row => [row.taxYear, row.category, row.medium, row.amount.toFixed()]))
    .toEqual([[2024, 'capital_gain_30', 'noncash', '47000']]);
  expect(JSON.stringify(input)).toBe(before);
});

it('requires internal current-origin source proof and keeps the real year gate closed', () => {
  const input = currentCharitableOriginInput('G', 2026), source = calculateForm172CharitableSources(input);
  if (!source) throw Error('Missing fictional current charitable proof');
  const context = { contributionBase: d('10000'), current: readCurrentCharitableReceiptAmounts(input) };
  for (const originSourceDigest of [undefined, 'wrong-source-digest']) {
    expect(() => calculateCurrentCharitableCandidates(input, { ...context, originSourceDigest })).toThrow(/source|loss method/i);
  }
  expect(calculateCurrentCharitableCandidates(input, { ...context, originSourceDigest: source.sourceDigest }).nonitemizedCarryforwards[0].amount.toFixed()).toBe('14050');
  input.donations[0].organization = 'Changed fictional qualified recipient';
  expect(() => calculateCurrentCharitableCandidates(input, { ...context, originSourceDigest: source.sourceDigest })).toThrow(/source|loss method/i);
  expect(() => calculateFederalTax(input)).toThrow(/2026|qualified|support|enabled/i);
});
