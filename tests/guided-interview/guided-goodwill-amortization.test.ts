// Spec: spec/federal/guided-goodwill-amortization.yaml.
import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:vi.fn().mockResolvedValue({allowed:true})}));
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedGoodwill,confirmGuidedGoodwill,goodwillCollectionQuestions,goodwillRowQuestions} from '@/lib/guided-goodwill-amortization';
import {calculateFederalTax} from '@/engine/federal';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext} from '@/lib/ai-tax-context';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord,syncGuidedFlowToWorkspace} from '@/lib/workspace-storage';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {fillScheduleC,SCHEDULE_C_FIELDS} from '@/pdf/fill-schedule-c';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {PDFDocument} from 'pdf-lib';
import {guidedGoodwillState,goodwillDraft,goodwillFacts} from '../fixtures/guided-goodwill-amortization';
function required<T,>(value:T|null|undefined):T{if(value==null)throw Error('Missing explicit synthetic original');return value;}
const scope={ownerScope:'synthetic-goodwill-owner',workspaceId:'synthetic-goodwill-workspace',workspaceRevision:'revision1'};
const markers=['PRIVATE-GOODWILL-INVENTORY','PRIVATE-GOODWILL-REMAINDER','PRIVATE-GOODWILL-PURCHASE','PRIVATE-GOODWILL-ASSET','111-22-3333'];
it('originates actual goodwill originals through the complete guided bridge',()=>{
 const state=guidedGoodwillState(),before=JSON.stringify(state),input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),result=calculateFederalTax(input);
 expect(required(input.form4562).amortizableAssets?.[0]?.amortizableAmount).toBe('18000');
 expect(required(result.scheduleC).form4562?.line44.toFixed()).toBe('600');expect(required(result.scheduleC).expenseBreakdown['Other expenses'].toFixed()).toBe('1100');expect(required(result.scheduleC).netProfit.toFixed()).toBe('37900');expect(JSON.stringify(state)).toBe(before);
 const roundtrip=JSON.parse(JSON.stringify(state)) as typeof state;expect(calculateFederalTax(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(roundtrip)))).scheduleC?.netProfit.toFixed()).toBe('37900');
});
it('rejects unknown stale duplicate mixed or contradictory goodwill originals',()=>{
 const base=goodwillFacts(),draft=goodwillDraft();
 for(const key of Object.keys(goodwillCollectionQuestions) as Array<keyof typeof goodwillCollectionQuestions>)for(const v of [undefined,false,null]){const d=structuredClone(draft);d[key]=v;expect(()=>confirmGuidedGoodwill(d,base),key).toThrow();}
 for(const key of Object.keys(goodwillRowQuestions) as Array<keyof typeof goodwillRowQuestions>){const d=structuredClone(draft);required(d.rows?.[0])[key]=undefined;expect(()=>confirmGuidedGoodwill(d,base),key).toThrow();}
 const mutations:Array<(d:typeof draft,f:typeof base)=>void>=[d=>{d.sourceTaxYear='2026';},d=>{required(d.rows?.[0]).basis='';},d=>{required(d.rows?.[0]).basis='-1';},d=>{required(d.rows?.[0]).acquisitionDate='2025-02-30';},d=>{required(d.rows?.[0]).startMonth='2025-08';},d=>{required(d.rows).push(structuredClone(required(d.rows?.[0])));},(_,f)=>{f.accountHolder='joint';},(_,f)=>{f.accountingMethod='accrual';},(_,f)=>{f.depreciation='1';},(_,f)=>{f.macrsAssets={};},(_,f)=>{f.passengerSources={};}];
 for(const mutate of mutations){const d=structuredClone(draft),f=structuredClone(base);mutate(d,f);expect(()=>confirmGuidedGoodwill(d,f)).toThrow();}
 base.goodwillAmortization=confirmGuidedGoodwill(draft,base);
 for(const mutate of [(f:typeof base)=>{f.businessName='Changed business';},(f:typeof base)=>{required(required(f.goodwillAmortization).rows?.[0]).basis='18000.01';},(f:typeof base)=>{required(f.scheduleCSourceFacts).ownerName='Changed owner';},(f:typeof base)=>{required(f.goodwillAmortization).sourceFactsConfirmed=null;}]){const f=structuredClone(base);mutate(f);expect(()=>buildGuidedGoodwill(f,2025,'500')).toThrow();}
 for(const [year,remaining,other]of [[2026,'500',false],[2025,undefined,false],[2025,'500.01',false],[2025,'500',true]]as const)expect(()=>buildGuidedGoodwill(base,year,remaining,other)).toThrow();
 const state=guidedGoodwillState();state.taxYear=2026;expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
it('preserves cents known zero distinct originals and input isolation',()=>{
 const f=goodwillFacts(),d=goodwillDraft();required(d.rows?.[0]).basis='18,000.15';f.goodwillAmortization=confirmGuidedGoodwill(d,f);const before=JSON.stringify(f),a=required(buildGuidedGoodwill(f,2025,'500'));expect(a.total.toFixed()).toBe('600');required(a.form4562.amortizableAssets?.[0]).description='Mutated returned array';expect(JSON.stringify(f)).toBe(before);
 const zero=goodwillDraft();required(zero.rows?.[0]).basis='0';f.goodwillAmortization=confirmGuidedGoodwill(zero,f);expect(required(buildGuidedGoodwill(f,2025,'500')).total.toFixed()).toBe('0');
 const multi=goodwillDraft();required(multi.rows).push({...required(multi.rows?.[0]),sourceReference:'PRIVATE-DISTINCT-ORIGINAL',description:'Second independently acquired goodwill',basis:'3600',acquisitionDate:'2025-10-15',startMonth:'2025-10'});f.goodwillAmortization=confirmGuidedGoodwill(multi,f);expect(required(buildGuidedGoodwill(f,2025,'500')).total.toFixed()).toBe('660');required(f.goodwillAmortization.rows).reverse();expect(()=>buildGuidedGoodwill(f,2025,'500')).toThrow();
});
it('preserves canonical amounts privacy and state boundaries',async()=>{
 const state=guidedGoodwillState(),input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),result=calculateFederalTax(input),before=JSON.stringify(input);
 const audit=calculateVerifiedAiAudit(scope,input),resolved=resolveServerAiTaxContext({...scope,taxYear:2025,audit});expect(resolved.status).toBe('available');for(const marker of markers)expect(JSON.stringify(resolved)).not.toContain(marker);
 const workspace=syncGuidedFlowToWorkspace(createWorkspaceRecord('goodwill-review'),[],[],state);workspace.returnSummary.targetTaxYear=2025;
 const shell=sanitizeWorkspaceForHostedStorage(workspace);for(const marker of markers)expect(JSON.stringify(shell)).not.toContain(marker);
 const actor={id:'goodwill-owner',label:'Synthetic',email:'synthetic@example.test'},fetchFn=vi.fn(()=>{throw Error('No external transport');}),accounting=vi.fn(),providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain current totals.'});
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput:input,providerRequest})}));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');const body=await response.text();for(const marker of markers)expect(body).not.toContain(marker);expect(fetchFn).not.toHaveBeenCalled();
 const document=await fillScheduleC(redactReviewIdentifiers(input),result,'forms/blank/2025/f1040sc.pdf'),reopened=await PDFDocument.load(await document.save()),form=reopened.getForm();expect(form.getTextField(SCHEDULE_C_FIELDS.line27).getText()).toBe('1100');expect(form.getTextField(SCHEDULE_C_FIELDS.line31).getText()).toBe('37900');
 expect(JSON.stringify(input)).toBe(before);const pa=structuredClone(input);pa.taxpayer.address.state='PA';expect(()=>calculatePAReturn(pa)).toThrow(/amortization|PA/i);
});
