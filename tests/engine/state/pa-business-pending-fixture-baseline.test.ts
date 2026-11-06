// Spec: state/pa-business-pending-account.yaml baseline. No new product imported here.
import {describe,it,expect} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {zeroBusinessPendingFixture} from '../../fixtures/pa-business-pending-account';
describe('Pending business fixture precondition',()=>{
 it.each(['resident','part_year','nonresident']as const)('complete all PA zero business remains an existing method for %s',status=>{
  const f=zeroBusinessPendingFixture(status,false),before=structuredClone(f.input);
  expect(calculateFederalTax(f.input).agi.toFixed()).toBe('0');
  const income=calculatePAResidencySources(f.input,f.input.paResidencySources);expect(income.netBusinessIncome.toFixed()).toBe('0');expect(income.businessPAWithholding.toFixed()).toBe('0');expect(income.totalOrdinaryPATaxableIncome.toFixed()).toBe('0');
  const r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);expect(r.pa40.taxLiability.toFixed()).toBe('0');expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.readiness.filingEligible).toBe(false);expect(f.input).toEqual(before);
 });
});
