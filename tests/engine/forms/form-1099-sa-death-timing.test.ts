// Spec: spec/federal/form-1099-sa.yaml, spec/federal/form-8889.yaml.
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {calculateForm1099SA,mergeForm1099SAIntoForm8889Input} from '@/engine/forms/form-1099-sa.js';
import {calculateForm8889} from '@/engine/forms/form-8889.js';
import {Form1099SASchema,TaxYearInputSchema} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {getConstants} from '@/models/constants.js';
import {calculateVerifiedAiAudit} from '@/lib/ai-tax-context';
import {createTaxExplanationRouteHandlers} from '@/lib/transient-tax-explanation-route';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {simpleW2Fixture} from '../../fixtures/simple-w2';
function required<T,>(v:T|undefined):T{if(v===undefined)throw Error('Missing actual synthetic source');return v;}
function death(overrides:Record<string,unknown>={}) {return Form1099SASchema.parse({payer:'PRIVATE-DEATH-CUSTODIAN',taxYear:2025,grossDistribution:'1000',earningsOnExcessContributions:'0',distributionCode:'6',accountType:'hsa',accountHolder:'primary',fmvOnDateOfDeath:'800',beneficiaryRole:'other_beneficiary',...overrides});}
beforeEach(()=>mocks.rate.mockResolvedValue({allowed:true}));
it('routes intrinsic code six after death earnings once without repeating death FMV',()=>{
 for(const optional of [{},{deathDistributionTiming:'after_year_of_death'},{beneficiaryRole:undefined}]){
  const original=death(optional),before=structuredClone(original),summary=calculateForm1099SA([original]);
  expect(summary.hsaGrossDistributions.toFixed()).toBe('0');expect(summary.hsaDeathDistributionDateOfDeathValue.toFixed()).toBe('0');
  expect(summary.hsaOtherBeneficiaryDeathDistributionDateOfDeathValue.toFixed()).toBe('0');expect(summary.hsaPostDeathEarnings.toFixed()).toBe('200');
  expect(summary.hsaReportedDeathDistributionDateOfDeathValue.toFixed()).toBe('800');
  expect(summary.lines.find(x=>x.line==='5')?.value.toFixed()).toBe('800');
  expect(mergeForm1099SAIntoForm8889Input(undefined,summary,simpleW2Fixture.taxpayer)).toBeUndefined();
  const raw={...structuredClone(simpleW2Fixture),form1099SA:[original]},canonical=calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(canonical.agi.toFixed()).toBe('85200');expect(canonical.form8889).toBeUndefined();expect(original).toEqual(before);
 }
});
it('preserves mixed timing ownership medical offsets and historical trace',()=>{
 const rows=[death(),death({distributionCode:'4',beneficiaryRole:'estate',deathDistributionTiming:'after_year_of_death',accountHolder:'spouse',grossDistribution:'900',fmvOnDateOfDeath:'800'}),death({distributionCode:'4',beneficiaryRole:'other_beneficiary',deathDistributionTiming:'year_of_death',grossDistribution:'800',fmvOnDateOfDeath:'800'})];
 const summary=calculateForm1099SA(rows),merged=required(mergeForm1099SAIntoForm8889Input({accountOwner:'primary',decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath:'300'},summary));
 expect(summary.hsaGrossDistributions.toFixed()).toBe('800');expect(summary.hsaDeathDistributionDateOfDeathValue.toFixed()).toBe('800');expect(summary.hsaPostDeathEarnings.toFixed()).toBe('300');
 expect(summary.accountOwnerSupport.primary.hsaGrossDistributions.toFixed()).toBe('800');expect(summary.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe('0');
 expect(summary.lines.find(x=>x.line==='5')?.value.toFixed()).toBe('2400');
 const form=calculateForm8889(simpleW2Fixture.taxpayer,merged,getConstants(2025));
 expect(form.line14a.toFixed()).toBe('800');expect(form.line15.toFixed()).toBe('300');expect(form.line16.toFixed()).toBe('500');expect(form.line17b.toFixed()).toBe('0');
 const afterOnly=calculateForm1099SA([death(),Form1099SASchema.parse({payer:'OWN-CURRENT',grossDistribution:'100',earningsOnExcessContributions:'0',distributionCode:'1',accountHolder:'primary',accountType:'hsa'})]);
 const current=calculateForm8889(simpleW2Fixture.taxpayer,required(mergeForm1099SAIntoForm8889Input({decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath:'800'},afterOnly)),getConstants(2025));
 expect(current.line14a.toFixed()).toBe('100');expect(current.line15.toFixed()).toBe('0');expect(current.line16.toFixed()).toBe('100');expect(current.line17b.toFixed()).toBe('20');
});
it('preserves actual private verified admission and independent source gates',async()=>{
 const taxInput={...structuredClone(simpleW2Fixture),form1099SA:[death()]},before=structuredClone(taxInput),scope={ownerScope:'synthetic',workspaceId:'death-timing',workspaceRevision:'revision'};
 expect(calculateVerifiedAiAudit(scope,taxInput).entries.find(x=>x.line==='11')?.value).toBe('85200');
 const actor={id:'death-owner',label:'Synthetic',email:'synthetic@example.test'},workspace=createWorkspaceRecord('death-timing');workspace.returnSummary.targetTaxYear=2025;
 const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain totals.',now:'2026-11-15T07:10:00Z'}),fetchFn=vi.fn(()=>{throw Error('No transport');}),accounting=vi.fn();
 const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),rateLimitStore:new Map(),fetchFn,accounting});
 const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':'hosted-owner:'+actor.id},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('private');expect(response.headers.get('cache-control')).toContain('no-store');expect(fetchFn).not.toHaveBeenCalled();expect(accounting).toHaveBeenCalledTimes(1);
 const body=await response.text();expect(body).not.toContain('PRIVATE-DEATH-CUSTODIAN');expect(body).not.toContain(simpleW2Fixture.taxpayer.primary.ssn);expect(taxInput).toEqual(before);
 expect(()=>calculateVerifiedAiAudit(scope,{...taxInput,form1099SA:[death({taxYear:2024})]})).toThrow('source-reconciled');
 expect(()=>calculateVerifiedAiAudit(scope,{...taxInput,taxpayer:{...taxInput.taxpayer,taxYear:2026}})).toThrow();
 expect(Form1099SASchema.safeParse({...death(),deathDistributionTiming:'year_of_death'}).success).toBe(false);
});
it('preserves explicit estate after death and unknown code four boundaries',()=>{
 const estate=calculateForm1099SA([death({distributionCode:'4',beneficiaryRole:'estate',deathDistributionTiming:'after_year_of_death'})]);
 expect(estate.hsaGrossDistributions.toFixed()).toBe('0');expect(estate.hsaEstateDeathDistributionDateOfDeathValue.toFixed()).toBe('0');expect(estate.hsaPostDeathEarnings.toFixed()).toBe('200');
 for(const timing of [undefined,'year_of_death']){
  const current=calculateForm1099SA([death({distributionCode:'4',beneficiaryRole:'estate',deathDistributionTiming:timing})]);expect(current.hsaGrossDistributions.toFixed()).toBe('800');expect(current.hsaEstateDeathDistributionDateOfDeathValue.toFixed()).toBe('800');
 }
 const cents=calculateForm1099SA([death({grossDistribution:'800.11',fmvOnDateOfDeath:'800.01'}),death({grossDistribution:'800.22',fmvOnDateOfDeath:'800.02'})]);
 expect(cents.hsaGrossDistributions.toFixed()).toBe('0');expect(cents.hsaPostDeathEarnings.toFixed()).toBe('0.3');
});

it('retains actual owner checks even when all prior FMV has no current earnings',()=>{
 const summary=calculateForm1099SA([death({grossDistribution:'800'}),death({grossDistribution:'800',accountHolder:'spouse'})]);
 expect(summary.accountOwnerSupport.spouse.hsaReportedDeathDistributionDateOfDeathValue.toFixed()).toBe('800');
 expect(summary.accountOwnerSupport.spouse.hsaGrossDistributions.toFixed()).toBe('0');
 expect(()=>mergeForm1099SAIntoForm8889Input(undefined,summary,simpleW2Fixture.taxpayer)).toThrow('spouse-owned');
});
