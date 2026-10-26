// Spec: spec/federal/nonitemized-charitable-categories.yaml. Draft constants only in this isolated test.
import { expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js',async importOriginal=>{const original=await importOriginal<typeof import('@/models/constants.js')>();const {FEDERAL_2026_CONSTANTS}=await import('@/models/federal-2026-indexed.js');return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};});
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { extractMetricsFromResult } from '@/lib/guided-preview-compute';
import { nonitemizedCategoryFixture } from '../fixtures/nonitemized-charitable-categories.js';
it('transfers actual selected category balances without claiming itemization',()=>{
  for(const method of ['standard','nonitemized'] as const){
    const input=nonitemizedCategoryFixture();input.deductionElection=method;
    if(!input.standardDeductionFacts)throw Error('Missing actual entitlement');input.standardDeductionFacts.spouseItemizes=method==='nonitemized';
    const before=JSON.stringify(input),r=calculateFederalTax(input);
    expect(r.deductionUsed).toBe(method);expect(r.deductionAmount.toFixed()).toBe(method==='standard'?'16100':'0');
    expect(r.nonitemizerCharitableDeduction?.toFixed()).toBe('1000');expect(r.taxableIncome.toFixed()).toBe(method==='standard'?'82900':'99000');
    expect(r.carryforwards.charitableContributions.toFixed()).toBe('53000');
    expect(r.scheduleA?.charitableTotal.toFixed()).toBe('0');
    expect(r.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('15000');expect(r.scheduleA?.charitableTreatment?.priorDeduction.toFixed()).toBe('0');
    expect(r.carryforwards.charitableContributionsByYear.map(row=>[row.taxYear,row.category,row.medium,row.amount.toFixed()]))
      .toEqual([[2022,'capital_gain_20','noncash','8000'],[2023,'capital_gain_30','noncash','10000'],[2025,'other_30','cash','10000'],[2026,'capital_gain_30','noncash','10000'],[2026,'capital_gain_20','noncash','15000']]);
    expect(buildOhioResidentReturnInput(input,r).federalAgi.toFixed()).toBe('100000');expect(extractMetricsFromResult(r).taxableIncome).toBe(r.taxableIncome.toFixed());
    expect(r.allLines.filter(row=>row.form==='Charitable Carryover'&&row.line==='selected-deduction')).toHaveLength(1);
    expect(JSON.stringify(input)).toBe(before);
  }
  for(const election of ['automatic','itemized'] as const){
    const input=nonitemizedCategoryFixture();input.deductionElection=election;const result=calculateFederalTax(input);
    expect(result.deductionUsed).toBe('itemized');expect(result.deductionAmount.toFixed()).toBe('49500');
    expect(result.taxableIncome.toFixed()).toBe('50500');expect(result.nonitemizerCharitableDeduction?.toFixed()).toBe('0');
    expect(result.carryforwards.charitableContributions.toFixed()).toBe('53500');
    expect(result.scheduleA?.charitableTreatment?.priorTreatedAsPaid.toFixed()).toBe('15000');
    expect(result.scheduleA?.charitableTreatment?.priorDeduction.toFixed()).toBe('15000');
    expect(result.scheduleA?.determinedCharitableFloor?.currentFloorByCategory.capital_gain_30.toFixed()).toBe('500');
  }
});
