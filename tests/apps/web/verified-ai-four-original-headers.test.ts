// Spec: spec/federal/verified-ai-legacy-source-admission.yaml.
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {TaxYearInputSchema,calculateFederalTax} from '../../../src/index';
import {calculateVerifiedAiAudit} from '@/lib/ai-tax-context';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {simpleW2Fixture} from '../../fixtures/simple-w2';
import {principalResidenceCodInput} from '../../fixtures/cod-principal-residence';
import {actualPartialPersonalCodInput} from '../../fixtures/cod-partial-personal';
type Input=typeof simpleW2Fixture;
type Kind='cod'|'sa'|'rrb'|'trust';
const scope={ownerScope:'independent-owner',workspaceId:'source-review',workspaceRevision:'review-revision'};
function required<T,>(value:T|undefined):T{if(value===undefined)throw Error('Missing explicit test original');return value;}
function packet(kind:Kind,taxYear:number|undefined,amount='1000',withheld='1000'):Input {
 const x=structuredClone(simpleW2Fixture);
 if(kind==='cod')x.form1099C=[Object.assign({creditor:'PRIVATE-FOUR-SOURCE',amountDischarged:amount,interestIncluded:'0',personallyLiable:true,identifiableEventCode:'H',fmvOfProperty:'0'},{taxYear})];
 else if(kind==='sa')x.form1099SA=[Object.assign({payer:'PRIVATE-FOUR-SOURCE',grossDistribution:amount,earningsOnExcessContributions:amount,distributionCode:'2' as const,accountType:'hsa' as const,accountHolder:'primary' as const},{taxYear})];
 else if(kind==='rrb')x.formRRB1099=[Object.assign({recipient:'PRIVATE-FOUR-SOURCE',netSocialSecurityEquivalentBenefitPortion:amount,federalWithheld:withheld},{taxYear})];
 else x.scheduleK1Form1041=[Object.assign({estateTrustName:'PRIVATE-FOUR-SOURCE',estateTrustEIN:'12-3456789',interestIncome:amount,federalIncomeTaxWithheld:withheld},{taxYear})];
 return x;
}
function original(input:Input,kind:Kind){
 if(kind==='cod')return required(input.form1099C[0]);
 if(kind==='sa')return required(required(input.form1099SA)[0]);
 if(kind==='rrb')return required(required(input.formRRB1099)[0]);
 return required(input.scheduleK1Form1041[0]);
}
beforeEach(()=>mocks.rate.mockResolvedValue({allowed:true}));
async function post(taxInput:Input,status:number){
 const actor={id:'four-source-owner',label:'Synthetic',email:'synthetic@example.test'},workspace=createWorkspaceRecord('four-source-calendar');workspace.returnSummary.targetTaxYear=taxInput.taxpayer.taxYear;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain current totals.',now:'2026-11-15T06:40:00Z'}),fetchFn=vi.fn(()=>{throw Error('No external transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:taxInput.taxpayer.taxYear,taxInput,providerRequest})}));
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();
 if(status===400)expect(accounting).not.toHaveBeenCalled();else expect(accounting).toHaveBeenCalledTimes(1);
 const body=await response.text();for(const marker of ['123-45-6789','PRIVATE-FOUR-SOURCE','12-3456789'])expect(body).not.toContain(marker);
}
it('retains four supplied actual headers without manufacturing absent years',()=>{
 for(const kind of ['cod','sa','rrb','trust']as const)for(const year of [2024,2025,2026,undefined]){
  const x=packet(kind,year),before=structuredClone(x),parsed=TaxYearInputSchema.parse(x);
  const retained=kind==='cod'?parsed.form1099C[0]:kind==='sa'?parsed.form1099SA?.[0]:kind==='rrb'?parsed.formRRB1099?.[0]:parsed.scheduleK1Form1041[0];
  expect(Reflect.get(required(retained),'taxYear')).toBe(year);expect(x).toEqual(before);
 }
});
it('denies known RRB calendar contradictions before provider or accounting',async()=>{
 for(const year of [2024,2026])for(const [benefits,withheld]of [['1000','0'],['0','1000'],['0','0']]){
  const x=packet('rrb',year,benefits,withheld),before=structuredClone(x);
  const expected=`Form RRB-1099 source year ${year} must match the 2025 return`;
  expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
  expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow(expected);await post(x,400);expect(x).toEqual(before);
 }
});
it('denies only future estate trust originals while preserving fiscal compatibility',async()=>{
 for(const year of [2026,2027])for(const [income,withheld]of [['1000','0'],['0','1000'],['0','0']]){
  const x=packet('trust',year,income,withheld),before=structuredClone(x),result=calculateFederalTax(TaxYearInputSchema.parse(x));
  expect(result.agi.toFixed()).toBe(income==='0'?'85000':'86000');expect(result.totalWithholding.toFixed()).toBe(withheld==='0'?'12750':'13750');
  expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow('future-year K1 original');await post(x,400);expect(x).toEqual(before);
 }
 for(const year of [2024,2025,undefined]){const x=packet('trust',year);expect(calculateFederalTax(TaxYearInputSchema.parse(x)).agi.toFixed()).toBe('86000');await post(x,200);}
});
it('holds known cross year COD and HSA compositions without rewriting canonical income',async()=>{
 // Cancellation income can require facts beyond the original statement's reporting year.
 for(const kind of ['cod','sa']as const)for(const year of [2024,2026])for(const amount of ['0','1000']){
  const x=packet(kind,year,amount),before=structuredClone(x);
  if(kind==='sa'){
   const expected=`Form 1099-SA source year ${year} must match the 2025 return`;
   expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
   expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow(expected);await post(x,400);expect(x).toEqual(before);
  }else{
   const expected='Form 1099-C statement year requires actual cancellation-year source reconciliation';
   expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
   expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow(expected);
   await post(x,400);expect(x).toEqual(before);expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
  }
 }
 for(const raw of [principalResidenceCodInput(),actualPartialPersonalCodInput()])for(const header of [2024,2026]){
  const x=TaxYearInputSchema.parse({...raw,form1099C:raw.form1099C.map(row=>({...row,taxYear:header}))}),before=structuredClone(x);
  expect(calculateFederalTax(x).schedule1?.cancelledDebtIncome.toFixed()).toBe(raw.form1099C[0].amountDischarged==='100000'?'50000':'8000');
  expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow('source-reconciled cross-year COD or HSA treatment');
  await post(x,400);expect(x).toEqual(before);
 }
});
it('denies duplicate conflicting originals in either order',async()=>{
 for(const kind of ['cod','sa','rrb','trust']as const)for(const reversed of [false,true]){
  const x=packet(kind,2025),bad=packet(kind,2026),rows=reversed?[original(bad,kind),original(x,kind)]:[original(x,kind),original(bad,kind)];
  if(kind==='cod')x.form1099C=rows as Input['form1099C'];else if(kind==='sa')x.form1099SA=rows as NonNullable<Input['form1099SA']>;else if(kind==='rrb')x.formRRB1099=rows as NonNullable<Input['formRRB1099']>;else x.scheduleK1Form1041=rows as Input['scheduleK1Form1041'];
  const before=structuredClone(x);
  if(kind==='cod'){
   const expected='Form 1099-C statement year requires actual cancellation-year source reconciliation';
   expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
   await post(x,400);expect(x).toEqual(before);expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(expected);
  }else if(kind==='rrb'||kind==='sa'){
   const form=kind==='rrb'?'Form RRB-1099':'Form 1099-SA';
   const assertPaymentYearHold=()=>expect(()=>calculateFederalTax(TaxYearInputSchema.parse(x))).toThrow(`${form} source year 2026 must match the 2025 return`);
   assertPaymentYearHold();await post(x,400);expect(x).toEqual(before);assertPaymentYearHold();
  }else{
   const result=calculateFederalTax(TaxYearInputSchema.parse(x));await post(x,400);expect(x).toEqual(before);expect(calculateFederalTax(TaxYearInputSchema.parse(x)).totalTax.toFixed()).toBe(result.totalTax.toFixed());
  }
 }
});
it('preserves current missing and ordinary source economics privately',async()=>{
 for(const kind of ['cod','sa','rrb','trust']as const)for(const year of [2025,undefined])for(const amount of ['0','1000']){
  const x=packet(kind,year,amount,amount),before=structuredClone(x),result=calculateFederalTax(TaxYearInputSchema.parse(x));
  expect(result.agi.toFixed()).toBe(amount==='0'?'85000':kind==='rrb'?'85850':'86000');expect(result.totalWithholding.toFixed()).toBe(amount==='1000'&&(kind==='rrb'||kind==='trust')?'13750':'12750');
  expect(calculateVerifiedAiAudit(scope,x).entries.find(row=>row.line==='11')?.value).toBe(result.agi.toFixed());await post(x,200);expect(x).toEqual(before);
 }
});
it('preserves malformed original strict source and 2026 annual gates',async()=>{
 for(const kind of ['cod','sa','rrb','trust']as const)for(const invalid of ['2025',2025.5]){
  const x=packet(kind,2025);Reflect.set(original(x,kind),'taxYear',invalid);expect(TaxYearInputSchema.safeParse(x).success).toBe(false);await post(x,400);
 }
 for(const code of ['4','6']as const){const x=packet('sa',2025);required(x.form1099SA)[0]=Object.assign(required(required(x.form1099SA)[0]),{distributionCode:code});expect(TaxYearInputSchema.safeParse(x).success).toBe(false);await post(x,400);}
 for(const kind of ['cod','sa','rrb','trust']as const){const x=packet(kind,2026);x.taxpayer.taxYear=2026;x.w2s=x.w2s.map(row=>({...row,taxYear:2026}));expect(()=>calculateVerifiedAiAudit(scope,x)).toThrow('Year-specific federal calculation is unavailable');await post(x,400);}
});
