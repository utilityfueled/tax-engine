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
 const actor={id:'private-w2g-source-owner',label:'Synthetic',email:'synthetic@example.test'},workspace=createWorkspaceRecord('independent-calendar');workspace.returnSummary.targetTaxYear=taxInput.taxpayer.taxYear;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain current totals.',now:'2026-11-15T05:00:00Z'}),fetchFn=vi.fn(()=>{throw Error('External transport forbidden');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:taxInput.taxpayer.taxYear,taxInput,providerRequest})}));
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();if(status===400)expect(accounting).not.toHaveBeenCalled();else expect(accounting).toHaveBeenCalledTimes(1);
 const text=await response.text();for(const value of ['123-45-6789','PRIVATE-INDEPENDENT-PAYER','PRIVATE-HISTORY-PAYER'])expect(text).not.toContain(value);
}
type Input = typeof simpleW2Fixture;
function inputWithW2G(taxYear:number|undefined,winnings='1000',federalWithheld='1000'):Input {
 const input=structuredClone(simpleW2Fixture);
 input.formW2G=[{payer:'PRIVATE-INDEPENDENT-PAYER',taxYear,reportableWinnings:winnings,federalWithheld}];
 return input;
}
it('retains supplied W2G calendar years without fabricating missing originals',()=>{
 for(const taxYear of [2024,2025,2026,undefined]){
  const input=inputWithW2G(taxYear),parsed=TaxYearInputSchema.parse(input);
  expect(Reflect.get(parsed.formW2G[0],'taxYear')).toBe(taxYear);
  expect(input.formW2G[0].taxYear).toBe(taxYear);
 }
});
it('rejects known W2G year contradictions while retaining historical arithmetic',()=>{
 for(const year of [2024,2026])for(const [winnings,withheld]of [['0','0'],['1000','0'],['0','1000']]as const){
  const input=inputWithW2G(year,winnings,withheld),before=structuredClone(input),result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe(winnings==='1000'?'86000':'85000');
  expect(result.totalWithholding.toFixed()).toBe(withheld==='1000'?'13750':'12750');
  expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow('matching-year direct income originals');expect(input).toEqual(before);
 }
});
it('denies contradictory W2G originals at actual authenticated POST before dispatch',async()=>{
 for(const year of [2024,2026])for(const [winnings,withheld]of [['0','0'],['1000','0'],['0','1000']]as const){
  const input=inputWithW2G(year,winnings,withheld),before=structuredClone(input);
  await post(input,400);expect(input).toEqual(before);
 }
});
it('rejects conflicting duplicate W2G years in either order',async()=>{
 for(const year of [2024,2026])for(const reversed of [false,true]){
  const input=inputWithW2G(2025),bad=inputWithW2G(year);
  input.formW2G=reversed?[...bad.formW2G,...input.formW2G]:[...input.formW2G,...bad.formW2G];
  const result=calculateFederalTax(TaxYearInputSchema.parse(input));expect(result.agi.toFixed()).toBe('87000');expect(result.totalWithholding.toFixed()).toBe('14750');
  await post(input,400);
 }
});
it('preserves matching and missing W2G years without changing amounts or identity privacy',async()=>{
 for(const year of [2025,undefined])for(const [winnings,withheld]of [['1000','1000'],['0','1000'],['0','0']]as const){
  const input=inputWithW2G(year,winnings,withheld),before=structuredClone(input),result=calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.agi.toFixed()).toBe(winnings==='1000'?'86000':'85000');expect(result.totalWithholding.toFixed()).toBe(withheld==='1000'?'13750':'12750');
  expect(calculateVerifiedAiAudit(scope,input).entries.find(x=>x.line==='11')?.value).toBe(result.agi.toFixed());await post(input,200);expect(input).toEqual(before);
 }
});
it('preserves strict W2G source completeness and unavailable 2026 qualification',async()=>{
 const input=inputWithW2G(2026);
 const original={sourceId:'actual-slot-original',taxYear:2026,winningDate:'2026-01-12',accountHolder:'primary',payer:'PRIVATE-INDEPENDENT-PAYER',payerTin:'12-3456789',typeOfWager:'slots',prizeType:'cash',reportableWinnings:'1000',federalWithheld:'1000'};
 input.formW2G=[original];
 expect(Reflect.get(TaxYearInputSchema.parse(input).formW2G[0],'taxYear')).toBe(2026);
 expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow();await post(input,400);
 for(const field of ['winningDate','payerTin','accountHolder']){const bad=structuredClone(input);Reflect.deleteProperty(bad.formW2G[0],field);expect(TaxYearInputSchema.safeParse(bad).success).toBe(false);}
 const wrongYear=structuredClone(input);wrongYear.formW2G[0].taxYear=2025;expect(TaxYearInputSchema.safeParse(wrongYear).success).toBe(false);
 const current=inputWithW2G(2026);current.taxpayer.taxYear=2026;current.w2s=current.w2s.map(w=>({...w,taxYear:2026}));
 expect(()=>calculateVerifiedAiAudit(scope,current)).toThrow('Year-specific federal calculation is unavailable');await post(current,400);
});
