// Spec: spec/federal/guided-foreign-tax-carryover.yaml.
import {expect,it} from 'vitest';
import {buildGuidedForeignTaxElection,guidedForeignTaxFactErrors} from '@/lib/guided-foreign-tax-election';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {validateSection} from '@/lib/guided-interview-flow';
import {calculateFederalTax} from '@/engine/federal.js';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {guidedCarryoverFixture} from '../fixtures/guided-foreign-tax-carryover';
it('collects actual carryover sources and preserves unknowns',()=>{
  const{facts,investment}=guidedCarryoverFixture();
  const result=buildGuidedForeignTaxElection(facts,investment,2025,'single');
  expect(result?.deductionYearCarryover?.carryovers?.[0]).toMatchObject({originTaxYear:2024,category:'passive',amount:'200'});
  for(const patch of [{sourceTaxYear:''},{adjustedThroughTaxYear:''},{method:undefined},{sourceFactsConfirmed:undefined},
    {incomeSources:[{}]},{carryovers:[{originTaxYear:'2024',amount:'200'}]},{filingHistoryConfirmed:false}]) {
    expect(guidedForeignTaxFactErrors({...facts,deductionYearCarryover:{...facts.deductionYearCarryover,...patch}},investment,2025,'single')).toHaveProperty('foreignTaxElection');
  }
  expect(guidedForeignTaxFactErrors(facts,{...investment,interestEntries:[{...investment.interestEntries[0],accountReference:'Replacement account'}]},2025,'single')).toHaveProperty('foreignTaxElection');
  const empty={...facts,deductionYearCarryover:{}};
  expect(guidedForeignTaxFactErrors(empty,investment,2025,'single')).toHaveProperty('foreignTaxElection');
});
it('binds guided carryover sources to the canonical return',()=>{
  const{state}=guidedCarryoverFixture();
  expect(validateSection(state,'other-taxes').status).toBe('complete');
  const input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();if(!input)throw new Error('Missing input');
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.foreignTaxCredit.isZero()).toBe(true);expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('127');
  const facts=state.sectionData['other-taxes']?.foreignTaxElection;if(!facts?.deductionYearCarryover)throw new Error('Missing facts');
  facts.deductionYearCarryover.carryovers=[{originTaxYear:'2024',category:'passive',amount:'',sourceReference:'Actual balance'}];
  expect(validateSection(state,'other-taxes').status).not.toBe('complete');expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
