// Spec: spec/federal/verified-ai-legacy-source-admission.yaml.
import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {TaxYearInputSchema,calculateFederalTax} from '../../../src/index.js';
import {calculateHomeMortgageInterest} from '@/engine/forms/home-mortgage-interest.js';
import {calculateVerifiedAiAudit} from '@/lib/ai-tax-context';
import {hasValid2025RetirementDistributionCodes} from '@/lib/verified-ai-source-admission';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {simpleW2Fixture} from '../../fixtures/simple-w2.js';
import {ordinaryIraBasisFixture} from '../../fixtures/ira-basis.js';
import {mortgageInput} from '../../fixtures/mortgage-source.js';
const scope={ownerScope:'actual-owner',workspaceId:'synthetic-workspace',workspaceRevision:'revision'};
function retirement(){return {...structuredClone(simpleW2Fixture),form1099R:[{payer:'Fictional Pension',grossDistribution:'10000',federalWithheld:'0'}]};}
function mortgage(){return {...structuredClone(simpleW2Fixture),form1098:[{lender:'Fictional Lender',mortgageInterestReceived:'30000',outstandingMortgagePrincipal:'1000000',pointsPaid:'0',refundOfOverpaidInterest:'0'}]};}
beforeEach(()=>mocks.rate.mockResolvedValue({allowed:true}));
it('preserves expressly unverified historical engine preview and established actual retirement sources',()=>{
 const raw=mortgage(),input=TaxYearInputSchema.parse(raw),preview=calculateHomeMortgageInterest(input);expect(preview.sourceFactsVerified).toBe(false);expect(preview.lines.some(x=>x.formula.includes('Unverified historical'))).toBe(true);
 expect(calculateFederalTax(input).totalTax.toFixed()).toBe('8670');expect(calculateFederalTax(TaxYearInputSchema.parse(retirement())).agi.toFixed()).toBe('95000');
 const known={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode:'7'}]};expect(calculateVerifiedAiAudit(scope,known).entries.find(x=>x.line==='11')?.value).toBe('92000');
});
it.each([['retirement',retirement],['mortgage',mortgage]] as const)('denies a confirmed receipt for unresolved %s sources',(_kind,build)=>{expect(()=>calculateVerifiedAiAudit(scope,build())).toThrow();});
it('denies unresolved sources at the actual confirmed explanation POST',async()=>{
 const actor={id:'synthetic-owner',label:'Synthetic',email:'fixture@example.test'};
 for(const taxInput of [retirement(),mortgage()]){const workspace=createWorkspaceRecord('legacy-source-triage');workspace.returnSummary.targetTaxYear=2025;const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-14T12:00:00Z'});const fetchFn=vi.fn(()=>{throw new Error('No external transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();}
});

it('preserves known retirement methods and unselected or zero mortgage previews',()=>{
 const known={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode:'7'}]};
 const simple={...retirement(),form1099R:[{payer:'Actual Pension',grossDistribution:'18000',taxableAmountNotDetermined:true,distributionCode:'7',iraSepSimple:false,simplifiedMethodCostInPlan:'12000',simplifiedMethodAnnuityStartingDate:'2024-06-01',simplifiedMethodPrimaryAnnuitantAgeAtStartingDate:63,simplifiedMethodPaymentsReceivedThisYear:12,simplifiedMethodPriorYearRecovered:'11000'}]};
 const cases=[known,simple,...['G','6','Q'].map(distributionCode=>({...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode,iraSepSimple:distributionCode==='Q'}]})),ordinaryIraBasisFixture(),mortgageInput(),{...retirement(),form1099R:[{...retirement().form1099R[0],grossDistribution:'0'}]},{...mortgage(),form1098:[{...mortgage().form1098[0],mortgageInterestReceived:'1000'}]}];
 for(const [index,input] of cases.entries()){expect(()=>calculateVerifiedAiAudit(scope,input),`known-method-${index}`).not.toThrow();const result=calculateFederalTax(TaxYearInputSchema.parse(input));expect(calculateVerifiedAiAudit(scope,input).entries.find(x=>x.line==='15')?.value).toBe(result.taxableIncome.toFixed());}
});
it('requires actual applicable IRA basis instead of an unrelated owner worksheet',()=>{
 const ira={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'7',iraSepSimple:true,accountHolder:'primary' as const}]};
 expect(()=>calculateVerifiedAiAudit(scope,ira)).toThrow();
 const actual={...ira,form8606:{priorYearBasis:'4000',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'10000'}};
 expect(calculateFederalTax(TaxYearInputSchema.parse(actual)).iraDistributionsTaxable.toFixed()).toBe('6000');expect(calculateVerifiedAiAudit(scope,actual).entries.find(x=>x.line==='11')?.value).toBe('91000');
 const roth={...actual,form1099R:[{...ira.form1099R[0],distributionCode:'J'}],form8606:{...actual.form8606,priorYearBasis:'0',traditionalDistributions:'0',rothDistributions:'10000',rothContributionBasis:'4000'}};
 expect(calculateVerifiedAiAudit(scope,roth).entries.find(x=>x.line==='11')?.value).toBe(calculateFederalTax(TaxYearInputSchema.parse(roth)).agi.toFixed());
 const conversion={...actual,form1099R:[{...ira.form1099R[0],rothConversionAmount:'3000'}],form8606:{...actual.form8606,traditionalDistributions:'7000',rothConversions:'3000'}};
 expect(calculateVerifiedAiAudit(scope,conversion).entries.find(x=>x.line==='11')?.value).toBe(calculateFederalTax(TaxYearInputSchema.parse(conversion)).agi.toFixed());
 const zeroBasis={...ira,form1099R:[{...ira.form1099R[0],iraBasisConfirmedZero:true}]};expect(calculateVerifiedAiAudit(scope,zeroBasis).entries.find(x=>x.line==='11')?.value).toBe('95000');
 const unrelated={...ira,taxpayer:{...ira.taxpayer,filingStatus:'married_filing_jointly',spouse:{...ira.taxpayer.primary,ssn:'987-65-4321'}},form8606ByOwner:{spouse:{priorYearBasis:'4000',yearEndValue:'0'}}};expect(()=>calculateVerifiedAiAudit(scope,unrelated)).toThrow();
});

it('rejects missing original basis fields rather than schema-defaulted zeros',()=>{
 const actual={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'7',iraSepSimple:true,accountHolder:'primary'}],form8606:{priorYearBasis:'4000',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'10000'}};
 for(const key of ['priorYearBasis','yearEndValue','nondeductibleContributions','contributionsMadeNextYear']){const incomplete=structuredClone(actual);Reflect.deleteProperty(incomplete.form8606,key);expect(()=>calculateVerifiedAiAudit(scope,incomplete)).toThrow();}
 for(const amount of ['0','9999.99','10000.01','20000']){const wrongCoverage=structuredClone(actual);wrongCoverage.form8606.traditionalDistributions=amount;expect(()=>calculateVerifiedAiAudit(scope,wrongCoverage)).toThrow();}
 const mixed={...actual,form1099R:[...actual.form1099R,{...actual.form1099R[0],taxableAmount:'10000'}]};expect(()=>calculateVerifiedAiAudit(scope,mixed)).toThrow();
});
it('rejects missing distribution classification even when Box2a is known',()=>{
 for(const distributionCode of ['',undefined,'Z','GZ','77']){const input={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode}]};expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow();}
});
it('rejects a Roth-only worksheet used to certify traditional IRA gross',()=>{
 const input={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'7',iraSepSimple:true,accountHolder:'primary'}],form8606:{priorYearBasis:'0',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'0',rothDistributions:'10000',rothContributionBasis:'10000'}};
 expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow();
});
it('binds raw originals at actual POST without blocking complete owner methods',async()=>{
 const actor={id:'synthetic-owner',label:'Synthetic',email:'fixture@example.test'};
 const actual={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'7',iraSepSimple:true,accountHolder:'primary'}],form8606:{priorYearBasis:'4000',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'10000'}};
 const missing=structuredClone(actual);Reflect.deleteProperty(missing.form8606,'priorYearBasis');
 const missingCode={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000'}]};
 for(const [taxInput,status] of [[actual,200],[ordinaryIraBasisFixture(),200],[mortgageInput(),200],[missing,400],[missingCode,400]] as const){
  const workspace=createWorkspaceRecord('raw-basis-originals');workspace.returnSummary.targetTaxYear=2025;
  const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-14T12:00:00Z'});
  const fetchFn=vi.fn(()=>{throw Error('External transport prohibited');}),accounting=vi.fn();
  const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
  const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
  expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();if(status===400)expect(accounting).not.toHaveBeenCalled();
  const body=JSON.stringify(await response.json());for(const identifier of ['123-45-6789','Fictional Pension','primary-private-account'])expect(body).not.toContain(identifier);
 }
});

it('rejects a conversion-only worksheet used to certify ordinary traditional IRA gross',()=>{
 const input={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'1',iraSepSimple:true,accountHolder:'primary'}],form8606:{priorYearBasis:'0',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'0',rothConversions:'10000'}};
 expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow();
});

it('rejects an inconsistent manual worksheet overriding a known original IRA amount',()=>{
 const input={...retirement(),form1099R:[{...retirement().form1099R[0],distributionCode:'7',iraSepSimple:true,accountHolder:'primary',taxableAmount:'7000'}],form8606:{priorYearBasis:'0',yearEndValue:'0',nondeductibleContributions:'0',contributionsMadeNextYear:'0',traditionalDistributions:'0'}};
 expect(()=>calculateVerifiedAiAudit(scope,input)).toThrow();
});

it('rejects an invalid actual Box7 combination before certifying its excluded income',()=>{
 const raw={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode:'P7',iraSepSimple:false}]};
 // The legacy numeric preview is intentionally preserved; the original has contradictory classification.
 expect(calculateFederalTax(TaxYearInputSchema.parse(raw)).agi.toFixed()).toBe('85000');
 expect(()=>calculateVerifiedAiAudit(scope,raw)).toThrow();
});

it('binds the complete 2025 Table1 combination syntax without treating it as taxability proof',()=>{
 // Independent transcription of the table's unordered pairs; Y has the explicit first-slot rule.
 const permittedPairs=new Set(['18','1B','1D','1K','1L','1M','1P','28','2B','2D','2K','2L','2M','2P','3D','48','4A','4B','4D','4G','4H','4K','4L','4M','4P','6W','7A','7B','7D','7K','7L','7M','8B','8J','8K','BG','BL','BM','BP','BU','CD','GK','JP','JS']);
 const codes='123456789ABCDEFGHJKLMNPQRSTUWY';
 for(const a of codes){
  expect(hasValid2025RetirementDistributionCodes(a),a).toBe(a!=='Y');
  for(const b of codes){const code=a+b;const allowed=a==='Y'?['4','7','K'].includes(b):b!=='Y'&&permittedPairs.has([...code].sort().join(''));
   expect(hasValid2025RetirementDistributionCodes(code),code).toBe(allowed);}
 }
 for(const value of [undefined,'','P7','7P','QP','PQ','GQ','QG','17','77','PP','GG','Y','7Y','4Y','KY','123','GZ','I','O','Z'])expect(hasValid2025RetirementDistributionCodes(value),String(value)).toBe(false);
 expect(hasValid2025RetirementDistributionCodes(' p 1 ')).toBe(true);
});
it('preserves actual permitted prior-year pairs and ordinary current-year originals',()=>{
 for(const distributionCode of ['P','P1','1P','P2','2P','P4','4P','PB','BP','PJ','JP']){
  const raw={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode,iraSepSimple:false}]};
  expect(calculateVerifiedAiAudit(scope,raw).entries.find(x=>x.line==='11')?.value,distributionCode).toBe('85000');
 }
 for(const distributionCode of ['7','G']){const raw={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode,iraSepSimple:false}]};expect(calculateVerifiedAiAudit(scope,raw).entries.find(x=>x.line==='11')?.value).toBe('92000');}
});
it('denies an invalid actual Box7 combination at the authenticated POST before dispatch',async()=>{
 const actor={id:'synthetic-owner',label:'Synthetic',email:'fixture@example.test'};
 const taxInput={...retirement(),form1099R:[{...retirement().form1099R[0],taxableAmount:'7000',distributionCode:'P7',iraSepSimple:false}]};
 const workspace=createWorkspaceRecord('box7-combination');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-14T12:00:00Z'});
 const fetchFn=vi.fn(()=>{throw Error('External transport prohibited');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();
 const body=JSON.stringify(await response.json());for(const value of ['123-45-6789','Fictional Pension','P7'])expect(body).not.toContain(value);
});

it.each([[2024,'7'],[2026,'7'],[2026,'P1']] as const)('denies an explicit mismatched retirement original %s at confirmed POST',async(originalYear,distributionCode)=>{
 const taxInput={...retirement(),form1099R:[{...retirement().form1099R[0],taxYear:originalYear,taxableAmount:'7000',distributionCode,iraSepSimple:false}]};
 const preview=calculateFederalTax(TaxYearInputSchema.parse(taxInput));expect(preview.agi.toFixed()).toBe(distributionCode==='P1'?'85000':'92000');
 const actor={id:'synthetic-year-owner',label:'Synthetic',email:'year-fixture@example.test'};
 const workspace=createWorkspaceRecord('original-year-triage');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-14T12:00:00Z'});
 const fetchFn=vi.fn(()=>{throw Error('No external transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toEqual({error:'Complete and confirm matching-year taxpayer facts before requesting a calculation explanation.'});expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();
 expect(()=>calculateVerifiedAiAudit(scope,taxInput)).toThrow();
});
it('preserves matching missing and zero retirement original-year controls',()=>{
 for(const taxYear of [undefined,2025]){
  const ordinary={...retirement(),form1099R:[{...retirement().form1099R[0],taxYear,taxableAmount:'7000',distributionCode:'7',iraSepSimple:false}]};
  expect(calculateVerifiedAiAudit(scope,ordinary).entries.find(x=>x.line==='11')?.value).toBe('92000');
  const prior={...ordinary,form1099R:[{...ordinary.form1099R[0],distributionCode:'P1'}]};expect(calculateVerifiedAiAudit(scope,prior).entries.find(x=>x.line==='11')?.value).toBe('85000');
 }
 const zero={...retirement(),form1099R:[{...retirement().form1099R[0],taxYear:2025,taxableAmount:'0',grossDistribution:'0'}]};expect(()=>calculateVerifiedAiAudit(scope,zero)).not.toThrow();
});

it.each(['w2','interest','dividend'] as const)('denies a known mismatched %s direct-income original at confirmed POST',async(kind)=>{
 const taxInput=structuredClone(simpleW2Fixture);
 if(kind==='w2')taxInput.w2s[0].taxYear=2024;
 else if(kind==='interest')taxInput.form1099Int=[{taxYear:2024,payer:'Fictional source-year bank',interestIncome:'1000'}];
 else taxInput.form1099Div=[{taxYear:2024,payer:'Fictional source-year dividend',ordinaryDividends:'1000'}];
 expect(calculateFederalTax(TaxYearInputSchema.parse(taxInput)).agi.toFixed()).toBe(kind==='w2'?'85000':'86000');
 const actor={id:'synthetic-direct-owner',label:'Synthetic',email:'direct-fixture@example.test'},workspace=createWorkspaceRecord('direct-original-year');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain taxable income.',now:'2026-11-14T12:00:00Z'}),fetchFn=vi.fn(()=>{throw Error('No external transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toEqual({error:'Complete and confirm matching-year taxpayer facts before requesting a calculation explanation.'});expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();
});

it.each(['w2','interest','dividend','retirement'] as const)('denies a withholding-only mismatched %s original before confirmed accounting',async(kind)=>{
 const taxInput=structuredClone(simpleW2Fixture);
 if(kind==='w2')taxInput.w2s=[{...taxInput.w2s[0],taxYear:2024,wages:'0',federalWithheld:'1000',socialSecurityWages:'0',socialSecurityWithheld:'0',medicareWages:'0',medicareWithheld:'0'}];
 else if(kind==='interest')taxInput.form1099Int=[{taxYear:2024,payer:'Fictional bank',interestIncome:'0',federalWithheld:'1000'}];
 else if(kind==='dividend')taxInput.form1099Div=[{taxYear:2024,payer:'Fictional dividend',ordinaryDividends:'0',federalWithheld:'1000'}];
 else taxInput.form1099R=[{taxYear:2024,payer:'Fictional retirement',grossDistribution:'0',taxableAmount:'0',federalWithheld:'1000'}];
 const actor={id:'synthetic-withholding-owner',label:'Synthetic',email:'withholding-fixture@example.test'},workspace=createWorkspaceRecord('withholding-source-year');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain tax payments.',now:'2026-11-14T12:00:00Z'}),fetchFn=vi.fn(()=>{throw Error('No external transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toEqual({error:'Complete and confirm matching-year taxpayer facts before requesting a calculation explanation.'});expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();
});
it('preserves matching and missing direct-original years',()=>{
 for(const taxYear of [undefined,2025]){
  const taxInput=structuredClone(simpleW2Fixture);taxInput.w2s[0].taxYear=taxYear;
  taxInput.form1099Int=[{taxYear,payer:'Fictional bank',interestIncome:'1000'}];taxInput.form1099Div=[{taxYear,payer:'Fictional dividend',ordinaryDividends:'1000'}];taxInput.form1099R=[{taxYear,payer:'Fictional pension',grossDistribution:'10000',taxableAmount:'7000',distributionCode:'7',federalWithheld:'0'}];
  expect(calculateVerifiedAiAudit(scope,taxInput).entries.find(x=>x.line==='11')?.value).toBe('94000');
 }
});
