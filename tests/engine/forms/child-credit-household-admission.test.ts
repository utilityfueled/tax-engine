// Spec: spec/federal/child-credit-household-admission.yaml.
import {describe,expect,it,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({rate:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {calculateFederalTax,TaxYearInputSchema,type TaxYearInput} from '../../../../src/index.js';
import {calculateChildCreditEligibility} from '@/engine/forms/child-credit-eligibility.js';
import {simpleW2Fixture} from '../../fixtures/simple-w2.js';
import {createTaxExplanationRouteHandlers} from '../../../../apps/web/src/lib/transient-tax-explanation-route.js';
import {createWorkspaceRecord} from '../../../../apps/web/src/lib/workspace-storage.js';
import {buildProviderWorkspaceRequest} from '../../../../apps/web/src/lib/provider-workspace-request.js';
const child:TaxYearInput['taxpayer']['dependents'][number]={firstName:'Fictional',lastName:'Child',ssn:'321-54-9876',relationship:'child',dateOfBirth:'2015-01-15',monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true,qualifiesForEIC:false,qualifiesForODC:false};
function fixture(){const x=structuredClone(simpleW2Fixture);x.taxpayer.primary.employmentValidSsnIssuedByDueDate=true;x.taxpayer.primary.tinIssuedByDueDate=true;x.taxpayer.dependents=[structuredClone(child)];return x;}
const calculate=(input:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(input));
const repeat=(x:TaxYearInput)=>x.taxpayer.dependents.push({...structuredClone(child),ssn:'321549876'});
const primaryCollision=(x:TaxYearInput)=>{x.taxpayer.dependents[0]!.ssn=x.taxpayer.primary.ssn.replaceAll('-','');};
const ageContradiction=(x:TaxYearInput)=>{x.taxpayer.dependents[0]!.dateOfBirth='2008-12-31';};
const bothCredits=(x:TaxYearInput)=>{x.taxpayer.dependents[0]!.qualifiesForODC=true;x.taxpayer.dependents[0]!.odcTinEligible=true;};
beforeEach(()=>{vi.clearAllMocks();mocks.rate.mockResolvedValue({allowed:true});});
describe('actual household child-credit admission',()=>{
  it('rejects actual repeated household TINs before counting child credits',()=>{
    for(const change of [repeat,primaryCollision,(x:TaxYearInput)=>{x.taxpayer.spouse={...x.taxpayer.primary,ssn:'555-44-3333'};x.taxpayer.filingStatus='married_filing_jointly';x.taxpayer.dependents[0]!.ssn='555443333';},(x:TaxYearInput)=>{x.taxpayer.dependents.push({...structuredClone(child),qualifiesForCTC:false});},(x:TaxYearInput)=>{x.taxpayer.dependents.push({...structuredClone(child),ssn:'321549876',qualifiesForCTC:false,qualifiesForODC:true,odcTinEligible:true});},(x:TaxYearInput)=>{x.taxpayer.filingStatus='married_filing_jointly';x.taxpayer.spouse={...x.taxpayer.primary};}]){const x=fixture();change(x);expect(()=>calculate(x)).toThrow();}
  });
  it('rejects known actual birth dates contradicting a CTC claim',()=>{
    for(const date of ['1980-01-01','2008-12-31','2026-01-01']){const x=fixture();x.taxpayer.dependents[0]!.dateOfBirth=date;expect(()=>calculate(x)).toThrow();}
    const youngest=fixture();youngest.taxpayer.dependents[0]!.dateOfBirth='2009-01-01';expect(calculate(youngest).childTaxCredit.toFixed()).toBe('2200');
  });
  it('rejects one dependent claimed for both CTC and ODC',()=>{const x=fixture();bothCredits(x);expect(()=>calculate(x)).toThrow();});
  it('rejects explicit nonchild relationship labels before 2025 line 19 and 2026 Schedule 8812', () => {
    const line19 = (input: TaxYearInput) => calculate(input).allLines
      .find(line => line.form === '1040' && line.line === '19')?.value.toFixed();

    const contradictoryRelationships = [
      'parent', 'other', 'grandparent', 'grandmother', 'other qualifying relative',
      'mother', 'father', 'grand parent', 'grandfather', 'parent or grandparent',
      '  Other\tQualifying  Relative  ',
    ];
    for (const relationship of contradictoryRelationships) {
      const input = fixture();
      input.taxpayer.dependents = [{ ...child, relationship }];
      const annual = { ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } };
      expect(() => line19(input), relationship).toThrow(/relationship.*Child Tax Credit/i);
      expect(() => calculateChildCreditEligibility(annual), relationship).toThrow(/relationship.*Child Tax Credit/i);

      const odc = { ...child, relationship, qualifiesForCTC: false, qualifiesForODC: true, odcTinEligible: true,
        dateOfBirth: '1955-05-01' };
      input.taxpayer.dependents = [odc];
      annual.taxpayer.dependents = [odc];
      expect(line19(input)).toBe('500');
      expect(calculateChildCreditEligibility(annual)).toEqual({ qualifyingChildren: 0, otherDependents: 1 });
    }

    for (const relationship of [
      'half-sister', ' HALF BROTHER ', 'Granddaughter', 'child of my sister', 'Other', ' other ',
    ]) {
      const input = fixture();
      input.taxpayer.dependents = [{ ...child, relationship }];
      expect(line19(input), relationship).toBe('2200');
      input.taxpayer.taxYear = 2026;
      expect(calculateChildCreditEligibility(input)).toEqual({ qualifyingChildren: 1, otherDependents: 0 });
      expect(() => calculate(input)).toThrow(/not (?:available|ready)|incomplete/i);
    }
  });
  it('rejects contradictory household facts at the actual confirmed explanation POST',async()=>{
    const actor={id:'synthetic-owner',label:'Synthetic',email:'fixture@example.test'};
    for(const change of [repeat,primaryCollision,ageContradiction,bothCredits]){
      const taxInput=fixture();change(taxInput);const workspace=createWorkspaceRecord('household-admission');workspace.returnSummary.targetTaxYear=2025;
      const providerRequest=buildProviderWorkspaceRequest(workspace,{task:'workspace-help',question:'Explain total tax.',now:'2026-11-14T12:00:00Z'});
      const fetchFn=vi.fn(()=>{throw new Error('External transport prohibited');}),accounting=vi.fn();
      const handler=createTaxExplanationRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',TAX_ENGINE_APP_URL:'https://tax.example'},rateLimitStore:new Map(),resolveActor:vi.fn().mockResolvedValue(actor),getEntitlementByOwnerId:vi.fn().mockResolvedValue({subscription:{planId:'starter'},entitlement:{workspaceAccess:true}}),fetchFn,accounting});
      const response=await handler.POST(new Request('https://tax.example/api/workspace/tax-explanation',{method:'POST',headers:{'content-type':'application/json',origin:'https://tax.example','X-Tax-Engine-Workspace-Owner':`hosted-owner:${actor.id}`},body:JSON.stringify({version:1,confirmed:true,workspaceId:workspace.id,workspaceRevision:workspace.updatedAt,taxYear:2025,taxInput,providerRequest})}));
      expect(response.status).toBe(400);expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('cache-control')).toContain('private');expect(fetchFn).not.toHaveBeenCalled();expect(accounting).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain(child.ssn);
    }
  });
  it('preserves distinct children and existing historical unknown and strict-year behavior',()=>{
    const one=fixture();expect(calculate(one).childTaxCredit.toFixed()).toBe('2200');expect(calculate(one).totalTax.toFixed()).toBe('7955');
    const two=fixture();two.taxpayer.dependents.push({...structuredClone(child),ssn:'987-65-4321'});expect(calculate(two).childTaxCredit.toFixed()).toBe('4400');
    const legacy=fixture();legacy.taxpayer.dependents[0]!.dateOfBirth='';legacy.taxpayer.dependents[0]!.ssn='';expect(calculate(legacy).childTaxCredit.toFixed()).toBe('2200');
    const noClaim=fixture();noClaim.taxpayer.dependents[0]!.qualifiesForCTC=false;noClaim.taxpayer.dependents[0]!.ssn=noClaim.taxpayer.primary.ssn;expect(calculate(noClaim).childTaxCredit.toFixed()).toBe('0');
    const malformed=fixture();malformed.taxpayer.dependents[0]!.ssn='letters123456789';expect(calculate(malformed).childTaxCredit.toFixed()).toBe('2200');
    const strict=fixture();strict.taxpayer.taxYear=2026;strict.taxpayer.dependents[0]!.dateOfBirth='';expect(()=>calculateChildCreditEligibility(strict)).toThrow();
    const repeated2026=fixture();repeated2026.taxpayer.taxYear=2026;repeat(repeated2026);expect(()=>calculateChildCreditEligibility(repeated2026)).toThrow();
    const blankTwins=fixture();blankTwins.taxpayer.dependents[0]!.ssn='';blankTwins.taxpayer.dependents.push({...structuredClone(child),ssn:''});expect(calculate(blankTwins).childTaxCredit.toFixed()).toBe('4400');
    const died=fixture();died.taxpayer.dependents[0]!.ssn='DIED';expect(calculate(died).childTaxCredit.toFixed()).toBe('2200');
    const odc=fixture();odc.taxpayer.dependents[0]!.qualifiesForCTC=false;odc.taxpayer.dependents[0]!.qualifiesForODC=true;odc.taxpayer.dependents[0]!.odcTinEligible=true;expect(calculate(odc).childTaxCredit.toFixed()).toBe('500');
  });
});
