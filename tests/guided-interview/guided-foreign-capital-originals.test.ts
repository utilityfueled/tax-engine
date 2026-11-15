// Spec: spec/federal/guided-foreign-capital-originals.yaml.
import {expect,it} from 'vitest';
import {guidedForeignCapitalFixture} from '../fixtures/guided-foreign-capital-originals';
import {confirmForeignCapitalOriginals,foreignCapitalFields} from '@/lib/guided-foreign-capital-originals';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildForeignIncomeInput} from '@/lib/guided-foreign-income';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const)it('preserves both existing canonical source methods through guided originals',()=>{const f=guidedForeignCapitalFixture(method);const original=calculateFederalTax(TaxYearInputSchema.parse(f.canonical));expect(original.form2555?.netExclusion.toFixed()).toBe(method==='mixedCapitalServices'?'634':'-13713');Reflect.set(f.row,method,confirmForeignCapitalOriginals(f.data,0,method));const form=buildForeignIncomeInput(f.data,f.state);expect(Reflect.get(form?.sourceMapping?.rows?.[0]??{},method)).toEqual({...f.proof,taxYear:2025});});

for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const)it(`full guided ${method} preserves independent calculation`,()=>{const f=guidedForeignCapitalFixture(method);Reflect.set(f.row,method,confirmForeignCapitalOriginals(f.data,0,method));const input=buildTaxInputFromGuidedData(f.state);expect(input).not.toBeNull();const result=calculateFederalTax(TaxYearInputSchema.parse(input));expect(result.form2555?.netExclusion.toFixed()).toBe(method==='mixedCapitalServices'?'634':'-13713');const original=calculateFederalTax(TaxYearInputSchema.parse(f.canonical));const amounts=(value:typeof result)=>value.allLines.filter(line=>line.form==='1040').map(line=>[line.form,line.line,line.value.toFixed()]);expect(amounts(result).length).toBeGreaterThan(0);expect(amounts(result)).toEqual(amounts(original));});

function confirm(f:ReturnType<typeof guidedForeignCapitalFixture>){Reflect.set(f.row,f.method,confirmForeignCapitalOriginals(f.data,0,f.method));}
it('rejects incomplete extra and stale capital originals without mutation',()=>{
 for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const){const base=guidedForeignCapitalFixture(method);
  for(const key of foreignCapitalFields[method])for(const value of[undefined,null]){const f=guidedForeignCapitalFixture(method);Reflect.set(f.proof,key,value);confirm(f);const before=structuredClone(f.data);expect(()=>buildForeignIncomeInput(f.data,f.state),`${method}.${key}=${String(value)}`).toThrow();expect(f.data).toEqual(before);}
  const extra=guidedForeignCapitalFixture(method);Reflect.set(extra.proof,'unreviewedMeaning','private-extra');confirm(extra);expect(()=>buildForeignIncomeInput(extra.data,extra.state)).toThrow();
  const wrong=guidedForeignCapitalFixture(method);Reflect.set(wrong.proof,'allCurrentBusinessSourcesIncluded',false);confirm(wrong);expect(()=>buildForeignIncomeInput(wrong.data,wrong.state)).toThrow();
  confirm(base);const confirmed=Reflect.get(base.row,method);if(!confirmed)throw Error('Missing confirmed proof');const snapshot=structuredClone(confirmed.confirmedOriginals);base.row.sourceReference='Edited private source';expect(confirmed.confirmedOriginals).toEqual(snapshot);expect(()=>buildForeignIncomeInput(base.data,base.state)).toThrow();
  const returned=guidedForeignCapitalFixture(method);confirm(returned);const before=structuredClone(returned.data);const form=buildForeignIncomeInput(returned.data,returned.state);Reflect.set(Reflect.get(form?.sourceMapping?.rows?.[0]??{},method),'sourceReference','Returned mutation');expect(returned.data).toEqual(before);
  const business=guidedForeignCapitalFixture(method);confirm(business);if(!business.state.sectionData['income-self-employment'])throw Error('Missing business');business.state.sectionData['income-self-employment'].manualGrossReceipts='1';expect(()=>buildForeignIncomeInput(business.data,business.state)).toThrow();
 }
});
it('preserves every entered competing full-boundary fact',()=>{
 const cases:Array<(f:ReturnType<typeof guidedForeignCapitalFixture>)=>void>=[
 f=>{const p=f.state.sectionData['personal-info'];if(!p)throw Error('Missing personal');Reflect.set(p,'childTaxCredit',null);},
 f=>{const p=f.state.sectionData['personal-info'];if(!p)throw Error('Missing personal');Reflect.set(p.childTaxCredit??{},'nonTaxableCombatPayElection','0');},
 f=>{const p=f.state.sectionData['personal-info'];if(!p)throw Error('Missing personal');Reflect.set(p.childTaxCredit??{},'extraOriginalMeaning',true);},
 f=>{const p=f.state.sectionData['personal-info'];if(!p)throw Error('Missing personal');Reflect.set(p.childTaxCredit??{},'bonaFidePuertoRicoResident',null);},
 f=>{const d=f.state.sectionData.deductions;if(!d)throw Error('Missing deductions');d.medicalExpenses='0';},
 f=>{const d=f.state.sectionData.deductions;if(!d)throw Error('Missing deductions');Reflect.set(d,'extraOriginalMeaning',true);},
 f=>{const d=f.state.sectionData.deductions;if(!d)throw Error('Missing deductions');d.method='itemized';},
 ];for(const mutate of cases){const f=guidedForeignCapitalFixture('allForeignCapitalLoss');mutate(f);confirm(f);const input=buildTaxInputFromGuidedData(f.state);if(input!==null)expect(()=>calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow();}
 const f=guidedForeignCapitalFixture('mixedCapitalServices');confirm(f);const input=buildTaxInputFromGuidedData(f.state);expect(input?.deductionElection).toBe('standard');expect(input?.childTaxCredit).toEqual({bonaFidePuertoRicoResident:false,puertoRicoExcludedIncome:'0',form4563ExcludedIncome:'0',possessionIncomeExclusion:'0'});
});
import {vi} from 'vitest';
import {resolveForm2555Sources} from '@/engine/forms/form-2555-source-binding';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext} from '@/lib/ai-tax-context';
import {createWorkspaceRecord,syncGuidedFlowToWorkspace} from '@/lib/workspace-storage';
import {buildGuidedFactAnswers,buildGuidedSyntheticDocuments} from '@/lib/guided-interview-bridge';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {assertPdfExportAllowed} from '@/pdf/export-policy';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator';
import {calculatePANonresidentReturn} from '@/engine/state/pa-nonresident-orchestrator';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
vi.mock('server-only',()=>({}));
it('preserves canonical privacy annual and state gates',()=>{
 for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const){const f=guidedForeignCapitalFixture(method);confirm(f);const raw=buildTaxInputFromGuidedData(f.state);expect(raw).not.toBeNull();const input=TaxYearInputSchema.parse(raw),before=structuredClone(input),federal=calculateFederalTax(input),scope={ownerScope:'synthetic-capital-owner',workspaceId:'synthetic-capital-workspace',workspaceRevision:'synthetic-capital-revision'},audit=calculateVerifiedAiAudit(scope,input),context=resolveServerAiTaxContext({...scope,taxYear:2025,audit});
  const ws=syncGuidedFlowToWorkspace(createWorkspaceRecord(scope.workspaceId),buildGuidedSyntheticDocuments(f.state),buildGuidedFactAnswers(f.state),f.state);const rawWs=Object.assign(createWorkspaceRecord('synthetic-raw-capital'),{form2555:input.form2555});
  const markers=[method,'confirmedOriginals',...Object.values(f.proof).filter((value):value is string=>typeof value==='string'&&value.startsWith('Fictional'))];
  for(const output of[audit,context,ws,sanitizeWorkspaceForHostedStorage(ws),buildProviderWorkspaceRequest(ws,{now:'2026-11-15T00:00:00.000Z'}),sanitizeWorkspaceForHostedStorage(rawWs),buildProviderWorkspaceRequest(rawWs,{now:'2026-11-15T00:00:00.000Z'})])for(const marker of markers)expect(JSON.stringify(output)).not.toContain(marker);
  expect(input).toEqual(before);const next=guidedForeignCapitalFixture(method,2026);confirm(next);const form=buildForeignIncomeInput(next.data,next.state);expect(form?.taxYear).toBe(2026);expect(resolveForm2555Sources(TaxYearInputSchema.parse(next.canonical)).sourceFactsVerified).toBe(true);expect(()=>calculateFederalTax(TaxYearInputSchema.parse(next.canonical))).toThrow(/2026.*incomplete/i);expect(()=>assertPdfExportAllowed(2026,2026)).toThrow();
  if(method==='allForeignCapitalLoss'){expect(()=>calculatePAReturn(input)).toThrow(/all-foreign capital loss.*separate state/i);expect(()=>calculatePANonresidentReturn(input,{residencyStatus:'nonresident'})).toThrow(/all-foreign capital loss.*separate state/i);expect(()=>buildOhioResidentReturnInput(input,federal)).toThrow(/all-foreign capital loss.*separate state/i);}
 }
});

import {updateSectionData} from '@/lib/guided-interview-flow';
it('revokes enclosing foreign confirmation on actual household edits',()=>{for(const method of['mixedCapitalServices','allForeignCapitalLoss']as const){const f=guidedForeignCapitalFixture(method);confirm(f);const personal=f.state.sectionData['personal-info'];if(!personal)throw Error('Missing household');const next=updateSectionData(f.state,'personal-info',{...personal,lastName:'Actual changed household'});expect(next.sectionData.adjustments?.foreignIncome?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(next)).toBeNull();}});
