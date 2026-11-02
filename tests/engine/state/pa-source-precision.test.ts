// Spec: state/pa-source-precision.yaml. Literal oracles derived with Python Decimal150 before execution.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {paSourcePrecisionFixture} from '../../fixtures/pa-source-precision';
it('ordinary PA source precision preserves both sides of the large half-dollar boundary',()=>{
 for(const year of [2025,2026])for(const [compensation,income,tax] of [['1000000000000002437','1000000000000002557','30700000000000078'],['1000000000000002438','1000000000000002558','30700000000000079']]){
  const f=paSourcePrecisionFixture(compensation,year),r=calculatePAResidencySources(f.input,f.sources);
  expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe(income);expect(r.taxBeforeCredits.toFixed()).toBe(tax);
 }
});
it('ordinary PA source precision retains sixty source digits before reporting',()=>{
 const f=paSourcePrecisionFixture('100000000000000000000000000000000000000000000000000000002437'),r=calculatePAResidencySources(f.input,f.sources);
 expect(r.compensation.toFixed()).toBe('100000000000000000000000000000000000000000000000000000002437');
 expect(r.totalOrdinaryPATaxableIncome.toFixed()).toBe('100000000000000000000000000000000000000000000000000000002557');
 expect(r.taxBeforeCredits.toFixed()).toBe('3070000000000000000000000000000000000000000000000000000078');
});
it('ordinary PA source precision preserves global Decimal configuration and original facts',()=>{
 const f=paSourcePrecisionFixture('50000'),before=structuredClone(f),precision=Decimal.precision,rounding=Decimal.rounding;
 const r=calculatePAResidencySources(f.input,f.sources);expect(r.taxBeforeCredits.toFixed()).toBe('1539');expect(f).toEqual(before);expect(Decimal.precision).toBe(precision);expect(Decimal.rounding).toBe(rounding);
});
