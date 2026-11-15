// Spec: spec/federal/form-2210-investment-household.yaml.
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
beforeEach(()=>{mocks.rate.mockReturnValue({allowed:true});});
import {PDFDocument} from 'pdf-lib';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {fillForm2210} from '@/pdf/mappings/2025/fill-form-2210.js';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext} from '../../../apps/web/src/lib/ai-tax-context';
import {createWorkspaceRecord} from '../../../apps/web/src/lib/workspace-storage';
import {sanitizeWorkspaceForHostedStorage} from '../../../apps/web/src/lib/hosted-privacy';
import {buildProviderWorkspaceRequest} from '../../../apps/web/src/lib/provider-workspace-request';
import {createTaxExplanationRouteHandlers} from '../../../apps/web/src/lib/transient-tax-explanation-route';
import {investmentHouseholdFixture} from '../../fixtures/form-2210-investment-household.js';
import {investmentElectionFixture} from '../../fixtures/form-2210-investment-election.js';
const calculate=(raw:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(raw));
const required=<T,>(v:T|undefined|null):T=>{if(v===undefined||v===null)throw Error('Actual synthetic original missing');return v;};
const line14=(r:ReturnType<typeof calculate>)=>['a','b','c','d'].map(c=>required(r.form2210).lines.find(l=>l.form==='Form 2210 Schedule AI'&&l.line===`14${c}`)?.value.toFixed());
const PRIVATE=['PRIVATE-','234-56-7890','123-45-6789','PrivateMfjSpouseName','Jane','Doe'];
it('admits source-complete joint current-paid originals with independent taxes',()=>{
 const x=investmentHouseholdFixture(),before=JSON.stringify(x),r=calculate(x);
 expect(r.agi.toFixed()).toBe('200000');expect(r.taxableIncome.toFixed()).toBe('159000');expect(r.totalTaxBeforeCredits.toFixed()).toBe('22078');
 expect(line14(r)).toEqual(['24888','34012','18636','22078']);expect(r.amt.toFixed()).toBe('0');expect(r.niitTax.toFixed()).toBe('0');expect(JSON.stringify(x)).toBe(before);
 expect(line14(calculate(investmentElectionFixture()))[3]).toBe('32537');
});
it('rejects unknown contradictory and cross-spouse household originals',()=>{
 const changes:Array<(x:ReturnType<typeof investmentHouseholdFixture>)=>void>=[
 x=>{Reflect.deleteProperty(x.form2210.investmentElectionSources,'household');},
 ...['sourceFactsConfirmed','jointReturnConfirmed','marriedAtYearEndConfirmed','bothSpousesAliveAllYearConfirmed','bothSpousesUsResidentsAllYearConfirmed','spouseInvestmentSourcesNoneConfirmed','allInvestmentSourcesIncludedConfirmed','primarySoleInvestmentOwnershipConfirmed','propertyNeverCommunityOwnedConfirmed'].flatMap(k=>[
 (x:ReturnType<typeof investmentHouseholdFixture>)=>{Reflect.deleteProperty(x.form2210.investmentElectionSources.household,k);},
 (x:ReturnType<typeof investmentHouseholdFixture>)=>{Reflect.set(x.form2210.investmentElectionSources.household,k,false);}]),
 ...['spouseInvestmentIncome','spouseInvestmentInterestExpense','spousePriorDisallowedInterest','spouseOtherInvestmentExpenses'].flatMap(k=>[
 (x:ReturnType<typeof investmentHouseholdFixture>)=>{Reflect.deleteProperty(x.form2210.investmentElectionSources.household,k);},
 (x:ReturnType<typeof investmentHouseholdFixture>)=>{Reflect.set(x.form2210.investmentElectionSources.household,k,'0.01');}]),
 x=>{x.form2210.investmentElectionSources.household.spouse.ssn='234--56-7890';},
 x=>{x.taxpayer.spouse.ssn='234--56-7890';},x=>{x.form2210.investmentElectionSources.household.spouse.lastName='Stale';},
 x=>{x.form2210.investmentElectionSources.household.primary.ssn='234-56-7890';},
 x=>{x.form2210.investmentElectionSources.household.primaryDomicile.state='WA';},
 x=>{x.form2210.investmentElectionSources.household.spouseDomicile.startDate='2025-01-02';},
 x=>{x.form2210.investmentElectionSources.household.spouseDomicile.sourceReference=' ';},
 x=>{x.form2210.investmentElectionSources.household.sourceTaxYear=2024;},
 x=>{Reflect.set(x.form1099Div[0],'accountHolder','spouse');},
 x=>{x.form1099Div[0].accountReference='OTHER';},x=>{Reflect.deleteProperty(x.form1099Div[0],'taxYear');},
 x=>{x.form2210.investmentElectionSources.household.dividendSources[0].qualifiedDividends='39999';},
 x=>{x.form2210.investmentElectionSources.household.dividendSources[0].sourceIndex=1;},
 x=>{Reflect.deleteProperty(x.form2210.investmentElectionSources.household.dividendSources[0],'recipient');},
 x=>{x.form2210.investmentElectionSources.household.dividendSources[0].recipient.ssn='234-56-7890';},
 x=>{Reflect.set(x.form1099Div[0],'foreignTaxPaid','1');},
 x=>{x.form1099Int=[{payer:'Other',interestIncome:'0.01'}];},
 x=>{x.taxpayer.taxYear=2026;},x=>{Reflect.set(x.taxpayer,'filingStatus','head_of_household');},
 ];
 for(const [i,change] of changes.entries()){const x=investmentHouseholdFixture();change(x);expect(()=>calculate(x),`household-${i}`).toThrow();}
});
it('preserves cumulative cents and annual conservation guards',()=>{
 const changes:Array<(x:ReturnType<typeof investmentHouseholdFixture>)=>void>=[
 x=>{x.form4952.priorYearDisallowed='1';},x=>{x.form4952.investmentExpenses='1';},
 x=>{x.form2210.investmentElectionSources.periods[1].form4952.investmentInterestExpense='1000.01';},
 x=>{x.form2210.investmentElectionSources.periods[1].form4952.investmentInterestExpense='1001';},
 x=>{x.form2210.investmentElectionSources.periods[2].form4952.investmentInterestExpense='1000';x.form2210.investmentElectionSources.periods[3].form4952.investmentInterestExpense='999';},
 x=>{x.form2210.annualizedIncomePeriods[1].itemizedDeductions='16000.01';},
 x=>{x.form2210.investmentElectionSources.periods[3].form4952.electedPreferentialIncome='999';},
 x=>{x.form2210.investmentElectionSources.periods[1].form4952.sourceReference=x.form2210.investmentElectionSources.periods[0].form4952.sourceReference;},
 ];for(const [i,change]of changes.entries()){const x=investmentHouseholdFixture();change(x);expect(()=>calculate(x),`conservation-${i}`).toThrow();}
});
it('binds distinct accounts reordered originals and actual identity edits',()=>{
 const x=investmentHouseholdFixture();const first=required(x.form1099Div[0]);first.ordinaryDividends='20000';first.qualifiedDividends='20000';
 x.form1099Div.push({...first,accountReference:'PRIVATE-PRIMARY-ACCOUNT-B'});const h=x.form2210.investmentElectionSources.household;
 h.dividendSources=[{...h.dividendSources[0],ordinaryDividends:'20000',qualifiedDividends:'20000'}, {...h.dividendSources[0],sourceIndex:1,sourceReference:'PRIVATE-DIVIDEND-ORIGINAL-B',accountReference:'PRIVATE-PRIMARY-ACCOUNT-B',ordinaryDividends:'20000',qualifiedDividends:'20000'}];
 expect(line14(calculate(x))).toEqual(['24888','34012','18636','22078']);
 x.form1099Div.reverse();expect(()=>calculate(x)).toThrow();h.dividendSources.reverse();h.dividendSources.forEach((s,i)=>{s.sourceIndex=i;});expect(calculate(x).totalTaxBeforeCredits.toFixed()).toBe('22078');
 x.form1099Div[1].accountReference=x.form1099Div[0].accountReference;h.dividendSources[1].accountReference=h.dividendSources[0].accountReference;expect(()=>calculate(x)).toThrow();
 const rename=investmentHouseholdFixture();rename.taxpayer.primary.lastName='Changed';expect(()=>calculate(rename)).toThrow();rename.form2210.investmentElectionSources.taxpayerLastName='Changed';rename.form2210.investmentElectionSources.household.primary.lastName='Changed';rename.form2210.investmentElectionSources.household.dividendSources[0].recipient.lastName='Changed';expect(calculate(rename).totalTaxBeforeCredits.toFixed()).toBe('22078');
});
it('preserves private originals and physical source revalidation',async()=>{
 const x=investmentHouseholdFixture(),r=calculate(x),scope={ownerScope:'hosted-owner:mfj',workspaceId:'mfj-private',workspaceRevision:'revision'};
 const audit=calculateVerifiedAiAudit(scope,x),context=JSON.stringify(resolveServerAiTaxContext({...scope,taxYear:2025,audit}));
 for(const v of PRIVATE){expect(context).not.toContain(v);expect(JSON.stringify(r.allLines)).not.toContain(v);}
 const w=createWorkspaceRecord('mfj-private');Object.assign(w,{confirmedTaxInput:x,investmentElectionSources:x.form2210.investmentElectionSources});const shell=JSON.stringify(sanitizeWorkspaceForHostedStorage(w));for(const v of PRIVATE)expect(shell).not.toContain(v);
 const doc=await fillForm2210(TaxYearInputSchema.parse(x),r,'forms/blank/2025/f2210.pdf'),saved=await PDFDocument.load(await doc.save());
 for(const [i,tax]of ['24888','34012','18636','22078'].entries())expect(saved.getForm().getTextField(`topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_${53+i}[0]`).getText()).toBe(tax);
 x.form2210.investmentElectionSources.household.spouseSourceReference='';await expect(fillForm2210(TaxYearInputSchema.parse(x),r,'/never-open.pdf')).rejects.toThrow(/original|source|household/i);
});
it('admits only actual source-complete historical inputs at authenticated POST',async()=>{
 const actor={id:'mfj-owner',label:'Synthetic',email:'fixture@example.test'},good=investmentHouseholdFixture(),missing=structuredClone(good),future=structuredClone(good);Reflect.deleteProperty(missing.form2210.investmentElectionSources,'household');future.taxpayer.taxYear=2026;
 for(const [taxInput,status]of [[good,200],[missing,400],[future,400]]as const){
 const workspace=createWorkspaceRecord('mfj-private');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-15T01:00:00Z'}),fetchFn=vi.fn(()=>{throw Error('No provider dispatch');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','x-forwarded-for':'127.0.0.2','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();if(status===400)expect(accounting).not.toHaveBeenCalled();const body=JSON.stringify(await response.json());for(const v of PRIVATE)expect(body).not.toContain(v);
 }
});
