// Spec: spec/federal/guided-cod-principal-residence.yaml.
import { expect, it } from 'vitest';
import { validateSection, setInterviewTaxYear, updateSectionData, loadGuidedFlowState, saveGuidedFlowState } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedCodPrincipalResidence, updateGuidedCodPrincipalResidence } from '@/lib/guided-cod-principal-residence';
import { buildCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { reconcileWorkspaceGuidedState } from '@/lib/workspace-guided-state';
import { actualGuidedNolSources } from '../fixtures/guided-net-operating-loss';
import { actualCurrentLossOrigin } from '../fixtures/guided-current-loss-origin';
import { calculateFederalTax, parseInput } from '@/index';
import { guidedPrincipalResidenceState as fixture } from '../fixtures/guided-cod-principal-residence';
import { guidedCodPartialPersonalState } from '../fixtures/guided-cod-partial-personal';

it('builds the supported mortgage sources without fictional personal debt histories', () => {
  const state=fixture(), before=JSON.stringify(state);
  expect(validateSection(state,'adjustments').status).toBe('complete');
  const raw=buildTaxInputFromGuidedData(state); expect(raw).not.toBeNull();
  const parsed=parseInput(raw); expect(parsed.form982NolSources).toBeUndefined(); expect(parsed.netOperatingLoss).toBeUndefined();
  const result=calculateFederalTax(parsed);
  expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('50000');
  expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
  expect(JSON.stringify(state)).toBe(before);
});
it('keeps missing originals unknown and records the actual2026 arrangement', () => {
  const state=fixture(), source=state.sectionData.adjustments.codPrincipalResidenceSources;
  expect(source?.debt?.interestIncluded).toBe('0');
  for (const field of ['interestIncluded','actualDischargedInterest','statementId','dischargeDate'] as const) {
    const copy=structuredClone(source); if(!copy?.debt)throw Error('Missing original fixture');
    copy.debt[field]='';
    expect(()=>buildGuidedCodPrincipalResidence(copy,state),field).toThrow();
  }
  for (const field of ['acquisitionCosts','capitalImprovements','previousBasisReductions'] as const) {
    const copy=structuredClone(source); if(!copy?.basis)throw Error('Missing basis fixture');
    copy.basis[field]=''; expect(()=>buildGuidedCodPrincipalResidence(copy,state),field).toThrow();
  }
  const next=fixture(2026), originals=next.sectionData.adjustments.codPrincipalResidenceSources;
  const canonical=buildGuidedCodPrincipalResidence(originals,next);
  expect(canonical?.form982PrincipalResidenceSources.arrangement).toEqual(originals?.arrangement);
  expect(canonical?.form982PrincipalResidenceSources.sourceTaxYear).toBe(2026);
  expect(()=>calculateFederalTax(parseInput({taxpayer:{...parseInput(buildTaxInputFromGuidedData(state)).taxpayer,taxYear:2026},...canonical}))).toThrow(/rule pack.*incomplete/);
  expect(()=>buildGuidedCodPrincipalResidence({...originals,arrangement:undefined},next)).toThrow();
  const incomplete=structuredClone(originals); if(!incomplete?.arrangement)throw Error('Missing writing fixture');
  incomplete.arrangement.evidencedInWritingDate='2026-01-01';
  expect(()=>buildGuidedCodPrincipalResidence(incomplete,next)).toThrow();
});
it('preserves prior loss sources and the current origin admission boundary', () => {
  const state=fixture(), personal=state.sectionData['personal-info']; if(!personal)throw Error('Missing fictional owner');
  const prior=structuredClone(actualGuidedNolSources);
  prior.primaryName=`${personal.firstName} ${personal.lastName}`; prior.primaryTaxpayerIdLast4=personal.ssn.replace(/-/g,'').slice(-4);
  const withPrior={...state,sectionData:{...state.sectionData,adjustments:{...state.sectionData.adjustments,netOperatingLossSources:prior}}};
  const raw=buildTaxInputFromGuidedData(withPrior); expect(raw).not.toBeNull();
  const parsed=parseInput(raw), result=calculateFederalTax(parsed);
  expect(result.netOperatingLoss?.deduction.gt(0)).toBe(true);
  expect(parsed.form982NolSources).toBeUndefined();
  const ordinary=parseInput({...raw,form982PrincipalResidenceSources:undefined,codExclusion:undefined,
    form1099C:[{...parsed.form1099C[0],amountDischarged:'50000'}]});
  const control=calculateFederalTax(ordinary);
  expect(result.netOperatingLoss?.deduction.toFixed()).toBe(control.netOperatingLoss?.deduction.toFixed());
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe(control.carryforwards.nolCarryforward.toFixed());
  for(const included of [false,null]) {
    const origin={...actualCurrentLossOrigin,businessSources:[],cancelledDebtIncluded:included};
    // No public method may hide the mortgage debt by declaring false, or invent
    // personal insolvency/NOL attribute facts to make a true answer pass.
    const current={...withPrior,sectionData:{...withPrior.sectionData,adjustments:{...withPrior.sectionData.adjustments,currentLossOrigin:origin}}};
    expect(buildTaxInputFromGuidedData(current)).toBeNull();
    expect(()=>buildCurrentLossOrigin(origin,current)).toThrow();
  }
});
it('preserves private reload and revokes actual original edits', () => {
  const state=fixture(), source=state.sectionData.adjustments.codPrincipalResidenceSources;
  const records=new Map<string,string>();
  const storage:Storage={get length(){return records.size;},getItem:key=>records.get(key)??null,
    setItem:(key,value)=>{records.set(key,value);},removeItem:key=>{records.delete(key);},clear:()=>records.clear(),key:index=>[...records.keys()][index]??null};
  saveGuidedFlowState(storage,'fictional-qpr-private',state);
  const restored=loadGuidedFlowState(storage,'fictional-qpr-private'); if(!restored)throw Error('Private reload lost original state');
  expect(restored?.sectionData.adjustments?.codPrincipalResidenceSources).toEqual(source);
  expect(buildTaxInputFromGuidedData(restored)).toEqual(buildTaxInputFromGuidedData(state));
  const workspace=reconcileWorkspaceGuidedState(createWorkspaceRecord('fictional-qpr-private',{storageMode:'hosted-postgres'}),state);
  const shell=JSON.stringify(sanitizeWorkspaceForHostedStorage(workspace));
  for(const original of [source?.sourceReference,source?.debt?.statementId,source?.debt?.accountReference,source?.debt?.creditor]) {
    if(!original)throw Error('Missing actual fixture identity'); expect(shell).not.toContain(original);
  }
  if(!source?.debt)throw Error('Missing original mortgage');
  const edited=updateGuidedCodPrincipalResidence(source,{debt:{...source.debt,amountDischarged:'100001'}});
  expect(edited.debt?.sourceFactsConfirmed).toBeNull(); expect(edited.basis?.sourceFactsConfirmed).toBeNull();
  expect(edited.debt?.statementId).toBe(source.debt.statementId);
  expect(()=>buildGuidedCodPrincipalResidence(edited,state)).toThrow();
  const confirmed=updateGuidedCodPrincipalResidence(source,{sourceFactsConfirmed:true,debt:{...source.debt,sourceFactsConfirmed:true}});
  expect(confirmed).toEqual(source);
});
it('keeps cancellation methods exclusive and absent sources unknown', () => {
  const mortgage=fixture(), personal=guidedCodPartialPersonalState();
  const mixed={...personal,sectionData:{...personal.sectionData,adjustments:{...personal.sectionData.adjustments,codPrincipalResidenceSources:mortgage.sectionData.adjustments.codPrincipalResidenceSources}}};
  expect(buildTaxInputFromGuidedData(mixed)).toBeNull();
  delete mortgage.sectionData.adjustments.codPrincipalResidenceSources;
  expect(validateSection(mortgage,'adjustments').status).not.toBe('complete');
  expect(buildTaxInputFromGuidedData(mortgage)).toBeNull();
  expect(buildTaxInputFromGuidedData(personal)).not.toBeNull();
});
it('invalidates implicated mortgage originals after edits and year changes', () => {
  const state=fixture(), personal=state.sectionData['personal-info']; if(!personal)throw Error('Missing fictional person');
  const changed=updateSectionData(state,'personal-info',{...personal,ssn:'000-00-0002'});
  const source=changed.sectionData.adjustments?.codPrincipalResidenceSources;
  expect(source?.sourceFactsConfirmed).toBeNull(); expect(source?.debt?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  const nextYear=setInterviewTaxYear(state,2026);
  expect(nextYear.sectionData.adjustments?.codPrincipalResidenceSources?.sourceFactsConfirmed).toBeNull();
  expect(nextYear.sectionData.adjustments?.codPrincipalResidenceSources?.acquisition?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(nextYear)).toBeNull();
});
