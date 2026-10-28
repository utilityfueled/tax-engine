// Spec: spec/federal/k1-ordinary-gift-at-risk.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { ordinaryGiftOnlyInput, ordinaryGiftActivityInput } from '../fixtures/k1-ordinary-gift-at-risk.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { requireRiskSource as required } from '../fixtures/k1-charitable-at-risk.js';
it('uses actual ordinary gifts at zero activity risk for either entity', () => {
  for (const entity of ['partnership', 's_corporation'] as const) {
    const input = ordinaryGiftOnlyInput(entity), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe('100000');
    expect(result.scheduleA?.cashCharitable.toFixed()).toBe('5000');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('preserves basis ordinary risk and charitable ledgers separately', () => {
  const input = ordinaryGiftActivityInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  const activity = required(result.scheduleE).partnerships[0], basis = required(activity.basisResult);
  expect(activity.netAmount.toFixed()).toBe('-25000');
  expect(activity.suspendedAtRiskLoss.toFixed()).toBe('-15000');
  expect(basis.suspendedLossCarryforward.ordinary.toFixed()).toBe('40000');
  expect(basis.suspendedLossCarryforward.charitable.toFixed()).toBe('10000');
  expect(result.agi.toFixed()).toBe('75000');
  expect(result.scheduleA?.cashCharitable.toFixed()).toBe('10000');
  expect(result.carryforwards.qbiLossCarryforward.toFixed()).toBe('25000');
  expect(result.carryforwards.charitableContributions.toFixed()).toBe('0');
  const risk = required(result.carryforwards.k1AtRiskByCharacter)[0];
  expect(risk.ordinary.toFixed()).toBe('15000');
  expect(risk.charitable.map(row => [row.allowed.toFixed(), row.suspended.toFixed()])).toEqual([['10000', '0']]);
  expect(JSON.stringify(input)).toBe(before);
});
it('rejects gift-as-activity statements and missing original zero', () => {
  for (const change of [
    (x: ReturnType<typeof ordinaryGiftActivityInput>) => { required(x.scheduleK1[0].form6198).otherDeductionsLosses = '10000'; required(required(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds = ['gift-1']; },
    (x: ReturnType<typeof ordinaryGiftActivityInput>) => { required(x.scheduleK1[0].form6198).otherDeductionsLosses = '10000'; },
    (x: ReturnType<typeof ordinaryGiftActivityInput>) => { required(required(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds = ['gift-1']; },
    (x: ReturnType<typeof ordinaryGiftActivityInput>) => { delete required(x.scheduleK1[0].form6198).otherDeductionsLosses; },
    (x: ReturnType<typeof ordinaryGiftActivityInput>) => { delete required(required(charitableStatement(x).atRisk).activityAllocation).charitableSourceIds; },
  ]) {
    const input = ordinaryGiftActivityInput(); change(input); const before = JSON.stringify(input);
    expect(() => calculateK1CharitableReturnSources(input)).toThrow(/activity|gift|deduction|source|Form6198 PartI/i);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('retains original history and requires complete actual source identity', () => {
  for (const change of [
    (x: ReturnType<typeof ordinaryGiftOnlyInput>) => { required(charitableStatement(x).atRisk).priorLossHistory = undefined; },
    (x: ReturnType<typeof ordinaryGiftOnlyInput>) => { required(required(charitableStatement(x).atRisk).priorLossHistory).sourceFactsConfirmed = false; },
    (x: ReturnType<typeof ordinaryGiftOnlyInput>) => { required(charitableStatement(x).basis).recipientTaxpayerIdLast4 = '0000'; },
    (x: ReturnType<typeof ordinaryGiftOnlyInput>) => { required(charitableStatement(x).atRisk).currentYearDecreases = undefined; },
  ]) {
    const input = ordinaryGiftOnlyInput(); change(input);
    expect(() => calculateK1CharitableReturnSources(input)).toThrow(/source|risk|history|identity|taxpayer|recipient/i);
  }
});
