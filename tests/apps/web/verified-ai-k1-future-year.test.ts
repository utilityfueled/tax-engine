import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {calculateFederalTax,TaxYearInputSchema} from '../../../src/index';
import {calculateVerifiedAiAudit} from '@/lib/ai-tax-context';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {simpleW2Fixture} from '../../fixtures/simple-w2';
const scope={ownerScope:'independent-owner',workspaceId:'source-review',workspaceRevision:'review-revision'};
beforeEach(()=>mocks.rate.mockResolvedValue({allowed:true}));
async function post(taxInput:typeof simpleW2Fixture,status:number){
 const actor={id:'private-k1-future-owner',label:'Synthetic',email:'synthetic@example.test'},workspace=createWorkspaceRecord('independent-calendar');workspace.returnSummary.targetTaxYear=taxInput.taxpayer.taxYear;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain current totals.',now:'2026-11-15T05:00:00Z'}),fetchFn=vi.fn(()=>{throw Error('External transport forbidden');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:taxInput.taxpayer.taxYear,taxInput,providerRequest})}));
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();if(status===400)expect(accounting).not.toHaveBeenCalled();else expect(accounting).toHaveBeenCalledTimes(1);
 const text=await response.text();for(const value of ['123-45-6789','PRIVATE-INDEPENDENT-PAYER','PRIVATE-HISTORY-PAYER'])expect(text).not.toContain(value);
}
type Input=typeof simpleW2Fixture;
type Entity='partnership'|'s_corporation';
function packet(entityType:Entity,year:number|undefined,ordinaryIncome='0',federalIncomeTaxWithheld='1000'):Input{
 const input=structuredClone(simpleW2Fixture);input.scheduleK1=[{partnershipName:'PRIVATE-INDEPENDENT-PAYER',partnershipEIN:'12-3456789',entityType,taxYear:year,ordinaryIncome,federalIncomeTaxWithheld}];return input;
}
it('rejects future K1 original years privately before authenticated dispatch',async()=>{
 for(const entity of ['partnership','s_corporation']as const)for(const year of [2026,2027])for(const [ordinary,withheld]of [['0','0'],['0','1000']]as const){
  const input=packet(entity,year,ordinary,withheld),before=structuredClone(input);
  const valid=calculateFederalTax(TaxYearInputSchema.parse(packet(entity,2025,ordinary,withheld)));
  expect(valid.agi.toFixed()).toBe('85000');expect(valid.totalWithholding.toFixed()).toBe(withheld==='1000'?'13750':'12750');
  expect(()=>calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow('reconcile the original period');
  await post(input,400);
  expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow('reconcile the original period');
  expect(input).toEqual(before);
 }
});
it('preserves prior matching and unknown K1 header years without inventing fiscal dates',async()=>{
 for(const entity of ['partnership','s_corporation']as const)for(const year of [2024,2025,undefined]){
  const input=packet(entity,year),before=structuredClone(input),parsed=TaxYearInputSchema.parse(input),result=calculateFederalTax(parsed);expect(parsed.scheduleK1[0].taxYear).toBe(year);expect(result.totalWithholding.toFixed()).toBe('13750');expect(result.agi.toFixed()).toBe('85000');
  expect(calculateVerifiedAiAudit(scope,input).entries.find(x=>x.line==='11')?.value).toBe('85000');await post(input,200);expect(input).toEqual(before);
 }
});
it('rejects conflicting future K1 duplicates in either order while preserving actual history',async()=>{
 for(const entity of ['partnership','s_corporation']as const)for(const reversed of [false,true]){
  const input=packet(entity,2024),future=packet(entity,2026);
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalWithholding.toFixed()).toBe('13750');
  input.scheduleK1=reversed?[...future.scheduleK1,...input.scheduleK1]:[...input.scheduleK1,...future.scheduleK1];
  expect(()=>calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow('reconcile the original period');
  await post(input,400);
 }
 const input=packet('partnership',2024);input.scheduleK1[0].beginningBasis='1000';input.scheduleK1[0].priorSuspendedLosses={ordinary:'100'};input.scheduleK1[0].ordinaryIncome='500';const before=structuredClone(input),result=calculateFederalTax(TaxYearInputSchema.parse(input));expect(calculateVerifiedAiAudit(scope,input).entries.find(x=>x.line==='11')?.value).toBe(result.agi.toFixed());await post(input,200);expect(input).toEqual(before);
});
it('preserves known-year schema and unavailable 2026 qualification',async()=>{
 for(const invalid of ['2025',2025.5]){const input=packet('partnership',2025);Reflect.set(input.scheduleK1[0],'taxYear',invalid);expect(TaxYearInputSchema.safeParse(input).success).toBe(false);await post(input,400);}
 const input=packet('partnership',2026);input.taxpayer.taxYear=2026;input.w2s=input.w2s.map(w=>({...w,taxYear:2026}));expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow('Year-specific federal calculation is unavailable');await post(input,400);
});
