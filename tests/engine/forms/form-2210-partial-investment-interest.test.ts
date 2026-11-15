// Spec: spec/federal/form-2210-investment-election.yaml.
import {beforeEach,expect,it,vi} from 'vitest';
import Decimal from 'decimal.js';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {TaxYearInputSchema,calculateFederalTax,type TaxYearInput} from '../../../src/index.js';
import {calculateForm4952} from '@/engine/forms/form-4952.js';
import {fillForm2210} from '@/pdf/mappings/2025/fill-form-2210.js';
import {PDFDocument} from 'pdf-lib';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {calculateVerifiedAiAudit,resolveServerAiTaxContext} from '@/lib/ai-tax-context';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {investmentElectionFixture} from '../../fixtures/form-2210-investment-election.js';

// Actual Form2210line14 directs the return worksheet, including its TaxTable branch.
function required<T>(value:T|null|undefined):T {
 if(value===undefined||value===null)throw Error('Complete explicit partial-interest fixture required');
 return value;
}
const TAXES=['21180','26471','24463','21180'];
const DEDUCTED=['1500','3000','4500','6000'];
const UNUSED=['3500','7000','10500','14000'];
function partialFixture():TaxYearInput {
 const x=TaxYearInputSchema.parse(investmentElectionFixture());
 Object.assign(required(x.w2s[0]),{wages:'108000',socialSecurityWages:'108000',socialSecurityWithheld:'6696',medicareWages:'108000',medicareWithheld:'1566',federalWithheld:'0'});
 x.form1099Int=[{taxYear:2025,accountHolder:'primary',payer:'Fictional Partial Interest Bank',interestIncome:'2000',federalWithheld:'0',earlyWithdrawalPenalty:'0',usSavingsBondInterest:'0',taxExemptInterest:'0',privateActivityBondInterest:'0',foreignTaxPaid:'0',paDirectObligationInterest:'0',stateWithheld:'0'}];
 x.form1099Div=[{taxYear:2025,accountHolder:'primary',payer:'Fictional Partial Interest Fund',ordinaryDividends:'40000',qualifiedDividends:'40000',totalCapitalGainDistributions:'10000',section1250Gain:'0',section1202Gain:'0',collectiblesGain:'0',nondividendDistributions:'0',federalWithheld:'0',section199ADividends:'0',foreignTaxPaid:'0',exemptInterestDividends:'0',specifiedPrivateActivityBondInterest:'0',paExemptInterestDividendAllocation:'0',stateWithheld:'0'}];
 Object.assign(required(x.scheduleA),{realEstateTaxes:'20000'});
 const qd=['10000','20000','30000','40000'],ordinary=['500','1000','1500','2000'],gain=['2500','5000','7500','10000'];
 const cost=['5000','10000','15000','20000'],elected=['1000','2000','3000','4000'],other=['5000','10000','15000','20000'];
 const agi=['40000','80000','120000','160000'],wages=['27000','54000','81000','108000'],itemized=['6500','13000','19500','26000'];
 const source=(i:number,reference:string)=>({...required(x.form4952),sourceTaxYear:2025,sourceReference:reference,sourceFactsConfirmed:true,sourceFactsComplete:true,investmentInterestExpense:required(cost[i]),priorYearDisallowed:'0',grossInvestmentIncome:required(['10500','21000','31500','42000'][i]),qualifiedDividendsIncluded:required(qd[i]),netGainFromInvestmentProperty:required(gain[i]),netCapitalGainFromInvestmentProperty:required(gain[i]),electedPreferentialIncome:required(elected[i]),electedNetCapitalGain:'0',investmentExpenses:'0'});
 x.form4952=source(3,'fictional-partial-annual4952');
 required(required(x.form2210).investmentElectionSources).annualForm4952SourceReference=required(x.form4952.sourceReference);
 required(required(x.form2210).investmentElectionSources).sourceReference='fictional-partial-period-packet';
 for(let i=0;i<4;i++){
  Object.assign(required(required(required(required(x.form2210).investmentElectionSources).periods)[i]),{form4952:source(i,'fictional-partial-original-'+i),otherItemizedDeductions:required(other[i])});
  Object.assign(required(required(required(x.form2210).annualizedIncomePeriods)[i]),{adjustedGrossIncome:required(agi[i]),itemizedDeductions:required(itemized[i]),qualifiedDividends:required(qd[i]),netCapitalGain:required(gain[i]),socialSecurityWages:required(wages[i]),netProfitFromSelfEmployment:'0',otherTaxes:'0',credits:'0'});
  // All actual investment income here is ordinary bank interest/QD/capital gain;
  // each cumulative AGI is wages + that actual interest + both gross preferences.
  expect(new Decimal(required(agi[i])).minus(required(wages[i])).toFixed()).toBe(new Decimal(required(ordinary[i])).plus(required(qd[i])).plus(required(gain[i])).toFixed());
 }
 return x;
}
const calculate=(input:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(input));
const line14=(result:ReturnType<typeof calculate>)=>['a','b','c','d'].map(column=>required(result.form2210).lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14'+column)?.value.toFixed());
beforeEach(()=>mocks.rate.mockResolvedValue({allowed:true}));
it('uses only actual allowed current interest in every period and annual calculation',()=>{
 const input=partialFixture(),before=JSON.stringify(input),result=calculate(input);
 expect(result.agi.toFixed()).toBe('160000');expect(result.taxableIncome.toFixed()).toBe('134000');// Both annual ScheduleD and actual ScheduleAI use printed TaxTable tax14280
 // on ordinary88000; the Pub505 projected-rate worksheet is a distinct method.
 expect(result.totalTaxBeforeCredits.toFixed()).toBe('21180');expect(line14(result)).toEqual(TAXES);
 for(const [i,row] of required(required(required(input.form2210).investmentElectionSources).periods).entries()){
  const form=calculateForm4952(required(row.form4952),2025);expect(form.line8.toFixed()).toBe(DEDUCTED[i]);expect(form.line7.toFixed()).toBe(UNUSED[i]);expect(form.line8.plus(form.line7).eq(form.line3)).toBe(true);
 }
 expect(required(result.form4952).line7.toFixed()).toBe('14000');expect(required(result.form4952).line8.toFixed()).toBe('6000');expect(JSON.stringify(input)).toBe(before);
 const largerActualCosts=partialFixture();required(largerActualCosts.form4952).investmentInterestExpense='24000';
 for(const [i,cost] of ['6000','12000','18000','24000'].entries())required(required(required(required(required(largerActualCosts.form2210).investmentElectionSources).periods)[i]).form4952).investmentInterestExpense=cost;
 const larger=calculate(largerActualCosts);expect(line14(larger)).toEqual(TAXES);expect(required(larger.form4952).line8.toFixed()).toBe('6000');expect(required(larger.form4952).line7.toFixed()).toBe('18000');
});
it('admits the coherent previously excluded period without changing its actual deduction',()=>{
 const input=investmentElectionFixture();required(input.form2210.investmentElectionSources.periods[1]).form4952.investmentInterestExpense='2';
 const result=calculate(input);expect(result.totalTaxBeforeCredits.toFixed()).toBe('32537');expect(line14(result)[1]).toBe('40655');
 expect(calculateForm4952(required(required(required(required(required(TaxYearInputSchema.parse(input).form2210).investmentElectionSources).periods)[1]).form4952)).line8.toFixed()).toBe('1');
});
it('rejects cumulative current-paid contradictions while preserving actual source denials',()=>{
 const changes:Array<(x:TaxYearInput)=>void>=[
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).investmentInterestExpense='16000';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).investmentInterestExpense='20001';required(required(required(required(required(x.form2210).investmentElectionSources).periods)[2]).form4952).investmentInterestExpense='20002';},
  x=>{Reflect.deleteProperty(required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952),'investmentInterestExpense');},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).priorYearDisallowed='1';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).investmentExpenses='1';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).investmentInterestExpense='10000.01';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[3]).form4952).investmentInterestExpense='20001';},
  x=>{required(required(required(x.form2210).annualizedIncomePeriods)[1]).itemizedDeductions='20000';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).electedPreferentialIncome='2001';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).sourceFactsConfirmed=false;},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).sourceTaxYear=2024;},
  x=>{required(x.form4952).priorYearDisallowed='1';},
  x=>{required(required(required(required(required(x.form2210).investmentElectionSources).periods)[1]).form4952).priorYearDisallowed='3500';},
  x=>{x.taxpayer.filingStatus='head_of_household';},
  x=>{x.taxpayer.taxYear=2026;},
 ];
 for(const [i,change] of changes.entries()){const input=partialFixture();change(input);expect(()=>calculate(input),'source-denial-'+i).toThrow();}
});
it('recomputes partial-interest sources at authenticated POST with private responses',async()=>{
 const actor={id:'partial-owner',label:'Synthetic',email:'fixture@example.test'};
 const complete=partialFixture(),incomplete=structuredClone(complete);required(required(required(required(required(incomplete.form2210).investmentElectionSources).periods)[1]).form4952).sourceFactsConfirmed=false;
 for(const [taxInput,status] of [[complete,200],[incomplete,400]] as const){
  const workspace=createWorkspaceRecord('partial-investment-private');workspace.returnSummary.targetTaxYear=2025;
  const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-15T01:00:00Z'});
  const fetchFn=vi.fn(()=>{throw Error('External transport prohibited');}),accounting=vi.fn();
  const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
  const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'127.0.0.2',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
  expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();if(status===400)expect(accounting).not.toHaveBeenCalled();
  const body=JSON.stringify(await response.json());for(const value of ['fictional-partial','Jane','Doe','123-45-6789','Fictional Partial Interest'])expect(body).not.toContain(value);
 }
 const scope={ownerScope:'hosted-owner:partial-owner',workspaceId:'partial-investment-private',workspaceRevision:'actual-revision'};
 const audit=calculateVerifiedAiAudit(scope,complete);expect(audit.entries.find(row=>row.line==='15')?.value).toBe('134000');const context=JSON.stringify(resolveServerAiTaxContext({...scope,taxYear:2025,audit}));
 for(const value of ['fictional-partial','Jane','Doe','6789','Fictional Partial Interest'])expect(context).not.toContain(value);
 const workspace=createWorkspaceRecord('partial-investment-private');Object.assign(workspace,{confirmedTaxInput:complete,investmentElectionSources:required(complete.form2210).investmentElectionSources});
 const shell=JSON.stringify(sanitizeWorkspaceForHostedStorage(workspace));for(const value of ['investmentElectionSources','fictional-partial','Jane','Doe','6789'])expect(shell).not.toContain(value);
});
it('recomputes four actual physical review columns and denies stale originals',async()=>{
 const input=partialFixture(),result=calculate(input),doc=await fillForm2210(input,result,'forms/blank/2025/f2210.pdf'),bytes=await doc.save(),reopened=await PDFDocument.load(bytes);
 const artifactDirectory=process.env.TAX_ENGINE_PARTIAL_REVIEW_ARTIFACT_DIR;
 if(artifactDirectory)await writeFile(join(artifactDirectory,'actual-partial-interest-form2210.pdf'),bytes,{flag:'wx'});
 for(const [index,tax] of TAXES.entries())expect(reopened.getForm().getTextField(`topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_${53+index}[0]`).getText()).toBe(tax);
 const stale=structuredClone(input);required(required(required(required(required(stale.form2210).investmentElectionSources).periods)[1]).form4952).sourceFactsConfirmed=false;
 await expect(fillForm2210(stale,result,'/nonexistent-template-must-not-open.pdf')).rejects.toThrow(/original|source/);
});
