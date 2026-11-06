// Spec: spec/federal/shared-unshared-marketplace-health.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { sharedUnsharedHealthInput } from '../fixtures/shared-unshared-marketplace-health.js';

it('coordinates shared and unshared health premiums without double counting', () => {
  const input = sharedUnsharedHealthInput(), before = structuredClone(input), result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962!.ptcAllowed.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['2052', '44415', '5844', '0']);
  expect(input).toEqual(before);
  input.scheduleC!.grossReceipts = '1000000';
  const noCredit = calculateFederalTax(input);
  expect([noCredit.schedule1!.seHealthInsurance.toFixed(), noCredit.form8962!.ptcAllowed.toFixed(), noCredit.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['8400', '0', '4200']);
});

it('retains actual partial unshared months and source ordering', () => {
  const input = sharedUnsharedHealthInput('agreement', 7), result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962!.ptcAllowed.toFixed()]).toEqual(['2196', '44271', '4668']);
  input.form7206!.plans![0].payments!.reverse(); input.form7206!.plans![0].marketplacePolicySourceIds!.reverse();
  input.form8962!.sharedPolicyAllocations!.policies!.reverse();
  const reversed = calculateFederalTax(input);
  expect([reversed.schedule1!.seHealthInsurance.toFixed(), reversed.form8962!.ptcAllowed.toFixed()]).toEqual(['2196', '4668']);
});
