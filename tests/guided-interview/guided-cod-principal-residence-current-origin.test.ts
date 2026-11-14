// Spec: spec/federal/guided-cod-principal-residence-current-origin.yaml.
import { expect,it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { validateSection,type GuidedFlowState } from '@/lib/guided-interview-flow';
import { calculateFederalTax,parseInput } from '@/index';
import { guidedPrincipalResidenceCurrentOriginState as fixture } from '../fixtures/guided-cod-principal-residence-current-origin';
import { guidedCodPartialPersonalState } from '../fixtures/guided-cod-partial-personal';

it('composes actual mortgage and current loss originals without fictional attributes',()=>{
  const state=fixture(),before=JSON.stringify(state);
  expect(validateSection(state,'adjustments').status).toBe('complete');
  const raw=buildTaxInputFromGuidedData(state);expect(raw).not.toBeNull();
  const input=parseInput(raw),result=calculateFederalTax(input);
  expect(input.form982NolSources).toBeUndefined();expect(input.form982AttributeSources).toBeUndefined();
  expect(input.netOperatingLoss?.vintages).toEqual([]);expect(input.netOperatingLoss?.alternativeTax?.vintages).toEqual([]);
  expect(result.agi.toFixed()).toBe('-50000');expect(result.form172?.regular.partI[7].toFixed()).toBe('50000');
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('65750');expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('50000');
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('65750');expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('50000');
  expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
  expect(JSON.stringify(state)).toBe(before);
});
it('rejects unknown or contradictory current cancellation and carry sources',()=>{
  const changes:Array<(state:GuidedFlowState)=>void>=[
    state=>{if(state.sectionData.adjustments?.currentLossOrigin)state.sectionData.adjustments.currentLossOrigin.cancelledDebtIncluded=false;},
    state=>{if(state.sectionData.adjustments?.currentLossOrigin)state.sectionData.adjustments.currentLossOrigin.cancelledDebtIncluded=null;},
    state=>{if(state.sectionData.adjustments)state.sectionData.adjustments.currentLossOrigin=undefined;},
    state=>{if(state.sectionData.adjustments)state.sectionData.adjustments.netOperatingLossSources=undefined;},
    state=>{if(state.sectionData.adjustments?.netOperatingLossSources)state.sectionData.adjustments.netOperatingLossSources.alternativeTax=undefined;},
    state=>{if(state.sectionData.adjustments?.netOperatingLossSources)state.sectionData.adjustments.netOperatingLossSources.vintages=undefined;},
    state=>{if(state.sectionData.adjustments?.codPrincipalResidenceSources?.debt)state.sectionData.adjustments.codPrincipalResidenceSources.debt.amountDischarged='';},
    state=>{if(state.sectionData.adjustments)state.sectionData.adjustments.codNolSources=guidedCodPartialPersonalState().sectionData.adjustments?.codNolSources;},
  ];
  for(const change of changes){const state=fixture();change(state);expect(validateSection(state,'adjustments').status).not.toBe('complete');expect(buildTaxInputFromGuidedData(state)).toBeNull();}
});
