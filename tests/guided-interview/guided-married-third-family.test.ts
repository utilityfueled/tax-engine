// Spec: spec/federal/guided-married-third-family.yaml.
import {expect,it} from 'vitest';
import {guidedThirdFamilyFixture} from '../fixtures/guided-married-third-family';
import {calculateForm8962SharedPolicy} from '@/engine/forms/form-8962-shared-policy';
import {confirmMarriedThirdFamilySources} from '@/lib/guided-married-third-family';
import {resolveGuidedSharedPolicy} from '@/lib/guided-shared-policy';
it('preserves the published34 source allocation through guided originals',()=>{
 const{canonical,personal,data}=guidedThirdFamilyFixture();
 if(!data.sharedPolicyAllocations)throw Error("Missing actual allocation");data.sharedPolicyAllocations.marriedThirdFamily=confirmMarriedThirdFamilySources(data,2025,'mfs',personal);const before=structuredClone(data);
 expect(calculateForm8962SharedPolicy(canonical).months.map(row=>row.advance.toFixed())).toEqual(Array(12).fill('34'));
 expect(resolveGuidedSharedPolicy(data,2025,'mfs',personal).allocation.months.map(row=>row.advance.toFixed())).toEqual(Array(12).fill('34'));
 expect(data).toEqual(before);
});

import {vi} from 'vitest';
import {buildPremiumTaxCreditInputs} from '@/lib/guided-premium-tax-credit-facts';
import {buildTaxInputFromGuidedData,buildGuidedSyntheticDocuments,buildGuidedFactAnswers} from '@/lib/guided-interview-bridge';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {guidedThirdFamilyState} from '../fixtures/guided-married-third-family';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext} from '@/lib/ai-tax-context';
import {createWorkspaceRecord,syncGuidedFlowToWorkspace} from '@/lib/workspace-storage';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {assertPdfExportAllowed} from '@/pdf/export-policy';
vi.mock('server-only',()=>({}));
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Missing original fixture');return value;}
function confirm(f:ReturnType<typeof guidedThirdFamilyFixture>){required(f.data.sharedPolicyAllocations).marriedThirdFamily=confirmMarriedThirdFamilySources(f.data,Number(f.data.sourceTaxYear),'mfs',f.personal);return f;}
it('rejects unknown stale conflicting and competing originals without mutation',()=>{
 const baseline=guidedThirdFamilyFixture(true),proof=required(baseline.data.sharedPolicyAllocations?.marriedThirdFamily),paths:Array<string[]>=[];
 function collect(row:object,path:string[]){for(const[key,value]of Object.entries(row)){if(key==='sourceFactsConfirmed')continue;paths.push([...path,key]);if(value&&typeof value==='object')collect(value,[...path,key]);}}
 collect(proof,[]);
 for(const path of paths){const f=guidedThirdFamilyFixture(true);let row:object=required(f.data.sharedPolicyAllocations?.marriedThirdFamily);for(const key of path.slice(0,-1))row=Reflect.get(row,key);Reflect.deleteProperty(row,required(path.at(-1)));confirm(f);expect(()=>resolveGuidedSharedPolicy(f.data,2025,'mfs',f.personal),path.join('.')).toThrow();}
 const mutations:Array<(f:ReturnType<typeof guidedThirdFamilyFixture>)=>void>=[
 f=>{required(f.data.sharedPolicyAllocations?.marriedThirdFamily).noOtherAllocationsRequiredConfirmed=null;},
 f=>{required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.families?.[0]).dependents=[{name:'extra',ssn:'789-01-2345'}];},
 f=>{required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.families?.[1]).taxpayerSsn='345-67-8901';},
 f=>{required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.monthlySources?.[0]).primaryAgreementFraction='0.671';},
 f=>{required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.monthlySources?.[0]).primaryBenchmark='';},
 f=>{Reflect.set(required(f.data.sharedPolicyAllocations?.marriedThirdFamily),'unknownMeaning',true);},
 f=>{required(f.data.sharedPolicyAllocations?.policies[0]).agreementConfirmed=false;},
 f=>{required(f.data.sharedPolicyAllocations?.policies[0]).monthlyAllocations=[{month:'1',fraction:'0'}];},
 f=>{required(f.data.sharedPolicyAllocations?.policies[0]?.separateReturn).ownCoverageFamilySlcsp=[{month:'1',slcsp:'0'}];},
 f=>{required(f.data.sharedPolicyAllocations?.policies[0]?.separateReturn).livingApartExceptionConfirmed=true;},
 f=>{f.personal.ssn='123--45-6789';},f=>{f.data.marriedFilingSeparatelyExceptionConfirmed=true;},f=>{f.data.qsehraAffected=true;},f=>{required(f.data.policies[0]).policyNumber='replacement';}];
 for(const mutate of mutations){const f=guidedThirdFamilyFixture(true);mutate(f);confirm(f);const before=structuredClone(f.data);expect(()=>resolveGuidedSharedPolicy(f.data,2025,'mfs',f.personal)).toThrow();expect(f.data).toEqual(before);}
 const f=confirm(guidedThirdFamilyFixture(true));required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.monthlySources?.[0]).primaryBenchmark='451';expect(()=>resolveGuidedSharedPolicy(f.data,2025,'mfs',f.personal)).toThrow(/last source|household edit/);
});
it('preserves known zero full fractions cents and confirmation lifecycle',()=>{
 for(const[fraction,expected]of[['0','100'],['1','0']]as const){const f=guidedThirdFamilyFixture(true);required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.monthlySources?.[0]).primaryAgreementFraction=fraction;required(f.data.sharedPolicyAllocations?.marriedThirdFamily?.monthlySources?.[0]).primaryBenchmark='450.01';confirm(f);expect(resolveGuidedSharedPolicy(f.data,2025,'mfs',f.personal).allocation.months[0]?.advance.toFixed()).toBe(expected);}
 const state=guidedThirdFamilyState(),next=updateSectionData(state,'personal-info',{...required(state.sectionData['personal-info']),lastName:'Actual edit'});expect(next.sectionData.credits?.premiumTaxCredit?.sharedPolicyAllocations?.marriedThirdFamily?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(next)).toBeNull();
 const f=confirm(guidedThirdFamilyFixture(true)),before=structuredClone(f.data),resolved=resolveGuidedSharedPolicy(f.data,2025,'mfs',f.personal);required(resolved.sourceInput.form8962?.sharedPolicyAllocations?.marriedThirdFamily?.families?.[0]).taxpayerName='Returned mutation';expect(f.data).toEqual(before);
});
it('preserves actual privacy and annual readiness boundaries',()=>{
 const state=guidedThirdFamilyState(),input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),result=calculateFederalTax(input);expect(result.form8962?.advancePTCTotal.toFixed()).toBe('34');expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe('34');expect(result.refund.toFixed()).toBe('3491');
 const scope={ownerScope:'synthetic-three-family-owner',workspaceId:'synthetic-three-family-return',workspaceRevision:'synthetic-three-family-revision'},audit=calculateVerifiedAiAudit(scope,input),publicContext=resolveServerAiTaxContext({...scope,taxYear:2025,audit}),workspace=Object.assign(createWorkspaceRecord(scope.workspaceId,{now:'2026-11-15T00:00:00.000Z'}),{form8962:input.form8962,form1095A:input.form1095A});
 const synced=syncGuidedFlowToWorkspace(createWorkspaceRecord('synthetic-worksheet-e-sync'),buildGuidedSyntheticDocuments(state),buildGuidedFactAnswers(state),state);
 for(const output of[audit,publicContext,synced,sanitizeWorkspaceForHostedStorage(synced),buildProviderWorkspaceRequest(synced,{now:'2026-11-15T00:00:00.000Z'}),sanitizeWorkspaceForHostedStorage(workspace),buildProviderWorkspaceRequest(workspace,{now:'2026-11-15T00:00:00.000Z'})])for(const marker of['marriedThirdFamily','678-90-1234','345-67-8901','Fictional signed primary','Fictional Marketplace primary'])expect(JSON.stringify(output)).not.toContain(marker);
 const f=confirm(guidedThirdFamilyFixture(true,2026));expect(buildPremiumTaxCreditInputs(f.data,2026,'mfs',f.personal).form1095A?.[0]?.taxYear).toBe(2026);expect(()=>calculateFederalTax({...input,taxpayer:{...input.taxpayer,taxYear:2026}})).toThrow(/2026/);expect(()=>assertPdfExportAllowed(2026,2026)).toThrow();
});

import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fillForm8962SharedPolicy,FORM_8962_FIELDS as F} from '@/pdf/fill-form-8962';
import {preparePremiumTaxCreditReview} from '@/pdf/premium-tax-credit-review-context';
it('transfers guided originals into saved historical physical review without private family identifiers',async()=>{
 const input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(guidedThirdFamilyState()))),result=calculateFederalTax(input),dir=mkdtempSync(join(tmpdir(),'worksheet-e-guided-'));
 try{const doc=await fillForm8962SharedPolicy(input,result,'forms/blank/2025/f8962.pdf',preparePremiumTaxCreditReview(input)),file=join(dir,'saved.pdf');writeFileSync(file,await doc.save());
 const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"from pypdf import PdfReader;import json,sys;r=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'fields':{k:str(v.get('/V','')) for k,v in r.get_fields().items()},'text':' '.join(p.extract_text()or'' for p in r.pages)}))",file],{encoding:'utf8',timeout:4000,maxBuffer:65536}));expect(saved.pages).toBe(2);expect(saved.fields[F.line25]).toBe('34');expect(saved.fields[F.line27]).toBe('34');expect(saved.fields[required(F.allocations[0]?.[6])]).toBe('0.17');expect(saved.fields[required(F.allocations[0]?.[4])]).toBe('');expect(saved.fields[required(F.allocations[0]?.[5])]).toBe('');for(const marker of['123-45-6789','678-90-1234','Fictional signed primary'])expect(saved.text).not.toContain(marker);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
