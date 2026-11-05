// Spec: spec/state/oh-2026-school-guided-metadata.yaml.
import {expect,it} from 'vitest';
import {startInterview,type W2EntryData} from '../../../apps/web/src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData,buildGuidedW2SourceContext} from '../../../apps/web/src/lib/guided-interview-bridge';
import {confirmGuidedW2StateLocalSources} from '../../../apps/web/src/lib/guided-w2-state-local-facts';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {ohio2026NativeOriginalFixture,enteredOhio2026SchoolDraft} from '../../fixtures/guided-oh-2026-school-native';
import {captureGuidedOhio2026SchoolOriginals,confirmGuidedOhio2026SchoolSource,buildGuidedOhio2026SchoolSource} from '../../../apps/web/src/lib/guided-ohio-2026-school-sources';
function need<T>(v:T|null|undefined):T{if(v==null)throw Error('Explicit fictional original required');return v;}
/** Sole setup seed: ordinary current household/W2 only; no Ohio source roots or results. */
function actualGuidedFixture(){
 const f=ohio2026NativeOriginalFixture(),w=need(f.baseInput.w2s[0]),person=f.baseInput.taxpayer.primary,home=f.baseInput.taxpayer.address;
 const state=startInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'},2026);
 state.sectionData['personal-info']={firstName:person.firstName,middleName:'',lastName:person.lastName,ssn:person.ssn,dateOfBirth:person.dateOfBirth,usResidencyMonths:'12',stateResidency:'full-year',addressLine1:home.street,addressLine2:'',city:home.city,state:home.state,zip:home.zip,dependentCount:'0',dependents:[],livedWithSpouseAtAnyTimeDuringYear:false,employmentValidSsnIssuedByDueDate:true,tinIssuedByDueDate:true,standardDeductionFacts:{primaryBlind:false,spouseBlind:false,primaryCanBeClaimedAsDependent:false,spouseCanBeClaimedAsDependent:false,primaryDeceased:false,spouseDeceased:false,dualStatusAlien:false,nonresidentAlien:false,shortTaxYear:false,spouseItemizes:false,claimSpouseAdditionalDeduction:false}};
 const entry:W2EntryData={employerName:w.employer.name,employerEin:w.employer.ein,sourceTaxYear:'2026',accountHolder:'primary',wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:need(w.socialSecurityWages),socialSecurityTips:need(w.socialSecurityTips),allocatedTips:need(w.allocatedTips),socialSecurityWithheld:need(w.socialSecurityWithheld),medicareWages:need(w.medicareWages),medicareWithheld:need(w.medicareWithheld),stateTaxReporting:'single',state:'OH',stateWages:need(w.stateWages),stateWithheld:need(w.stateTaxWithheld),localWages:need(w.localWages),localTaxWithheld:need(w.localTaxWithheld),localityName:need(w.localityName),stateLocalSources:structuredClone(need(w.stateLocalSources)),aiSuggestedFields:{}};
 for(const key of ['box10DependentCareBenefits','box12CodeW','box12CodeD','box12CodeE','box12CodeF','box12CodeG','box12CodeH','box12CodeS','box12CodeAA','box12CodeBB','box12CodeEE','box12CodeT']as const)entry[key]=need(w[key]);
 state.sectionData['income-w2']={entries:[entry]};
 const context=need(buildGuidedW2SourceContext(state));entry.stateLocalSources=confirmGuidedW2StateLocalSources(context,0,entry.stateLocalSources);
 const original=TaxYearInputSchema.parse(need(buildTaxInputFromGuidedData(state)));
 for(const key of ['ohioResidency','ohioPayments','ohioSchoolDistrict','ohioReturnHeaderSources']as const)if(original[key]!==undefined)throw Error('Setup may not contain target Ohio originals');
 if(state.sectionData['state-return']!==undefined)throw Error('Setup may not contain the target native state section');
 return{state,original};
}

function confirm(input:TaxYearInput){return confirmGuidedOhio2026SchoolSource(input,captureGuidedOhio2026SchoolOriginals(input,enteredOhio2026SchoolDraft()));}
it('admits actual current guided standard originals without stripping any fields',()=>{
 const {original}=actualGuidedFixture(),before=structuredClone(original);
 expect(original).toMatchObject({form1099R:[],formSSA1099:[],formRRB1099:[],deductionElection:'standard'});
 const d=confirm(original),r=buildGuidedOhio2026SchoolSource(original,d);
 expect(r).toMatchObject({taxYear:2026,residentCompensation:'50000',schoolWithholding:'625.25',taxLiability:null,payments:null,refund:null,underpaymentPenalty:null,lateInterest:null,filingQualified:false,calculationStatus:'source-only-incomplete'});
 expect(d.originalFederalSources).toEqual(original);expect(d.originalTaxInput).toMatchObject({deductionElection:'standard',form1099R:[],formSSA1099:[],formRRB1099:[]});expect(original).toEqual(before);
});
it('denies every supplied nonempty malformed or unknown source inventory',()=>{
 const base=ohio2026NativeOriginalFixture().baseInput;
 for(const key of ['form1099R','formSSA1099','formRRB1099'])for(const value of [null,'',0,false,{},[{}],[null]]){
  const input={...structuredClone(base),[key]:value}as unknown as TaxYearInput;expect(()=>confirm(input),`${key}:${JSON.stringify(value)}`).toThrow();
 }
 for(const value of [[],{},null,'0']){const input={...structuredClone(base),unknownSchoolInventory:value}as unknown as TaxYearInput;expect(()=>confirm(input)).toThrow();}
});
it('denies every other supplied deduction choice and preserves historical absence',()=>{
 const base=ohio2026NativeOriginalFixture().baseInput;expect(base.deductionElection).toBeUndefined();expect(buildGuidedOhio2026SchoolSource(base,confirm(base)).schoolWithholding).toBe('625.25');
 for(const value of ['automatic','itemized','nonitemized','',null,{},0,false]){const input={...structuredClone(base),deductionElection:value}as unknown as TaxYearInput;expect(()=>confirm(input)).toThrow();}
});
it('retains complete current originals and denies same-cash metadata drift',()=>{
 const {original}=actualGuidedFixture(),d=confirm(original),before=structuredClone(d);
 for(const key of ['deductionElection','form1099R','formSSA1099','formRRB1099']as const){const changed=structuredClone(original);delete changed[key];expect(()=>buildGuidedOhio2026SchoolSource(changed,d)).toThrow();expect(d).toEqual(before);}
});
