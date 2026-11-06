// Spec: charitable-determined-nol.yaml actual-guide.
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {validateSection,updateSectionData} from '@/lib/guided-interview-flow';
import {determinedCharitableNolInterview} from '../../fixtures/guided-charitable-determined-nol';
it('binds mixed current and prior original charity through the actual guide',()=>{
  const state=determinedCharitableNolInterview(),before=structuredClone(state);
  expect(validateSection(state,'adjustments').status).toBe('complete');
  const input=buildTaxInputFromGuidedData(state);if(!input)throw new Error('Complete original sources must reach calculation');
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect([result.nolDeduction,result.scheduleA?.charitableTotal,result.carryforwards.charitableContributions,result.form6251?.amti].map(row=>row?.toFixed()))
    .toEqual(['48000','25600','32880','85000']);
  expect(state).toEqual(before);
  for(const mutation of ['missing','false','unknown','amount'] as const){
    const changed=determinedCharitableNolInterview(),history=changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory;
    if(!history?.alternativeCarryoverSources?.vintages?.[0])throw new Error('Missing fictional history');
    if(mutation==='missing')history.alternativeCarryoverSources=undefined;
    else if(mutation==='false')history.alternativeCarryoverSources.sourceFactsConfirmed=false;
    else if(mutation==='unknown')history.alternativeCarryoverSources.sourceFactsConfirmed=null;
    else history.alternativeCarryoverSources.vintages[0].openingCarryforward='5000.01';
    expect(validateSection(changed,'adjustments').status).toBe('partial');expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
  const personal=state.sectionData['personal-info'];if(!personal)throw new Error('Missing fictional identity');
  const changed=updateSectionData(state,'personal-info',{...personal,lastName:'Changed source'});
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.alternativeTax?.charitableCarryoverHistory?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
});
