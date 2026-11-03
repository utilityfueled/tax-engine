/** Fictional literal native interview sources; snapshot construction is fixture-only. */
import {TaxYearInputSchema} from '@/models/inputs';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {startCompleteInterview,completeW2Entry} from '../guided-interview/complete-facts';
import {requiredNative,paMarriedNativePublicFixture,type NativeMarriedCase} from './pa-married-native-public';
export function guidedPAMarriedNativeFixture(mode:'J'|'M'='M',name:NativeMarriedCase='whole'){
 const f=paMarriedNativePublicFixture(mode,name),state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'PA'}),p=requiredNative(state.sectionData['personal-info']);
 const e=requiredNative(requiredNative(f.input.eic).claimantEligibility);
 state.sectionData['personal-info']={...p,firstName:'Taylor',lastName:'NativeReview',ssn:'900-70-0411',dateOfBirth:'1950-04-02',addressLine1:'41 Fictional Avenue',addressLine2:'',city:'Pittsburgh',state:'PA',zip:'15201',dependentCount:'0',dependents:[],childTaxCredit:undefined,spouse:{...requiredNative(p.spouse),firstName:'Robin',lastName:'NativeReview',ssn:'900-70-0412',dateOfBirth:'1952-05-03'},eicClaimantEligibility:{...e,sourceTaxYear:'2025'}};
 state.sectionData['income-w2']={entries:f.input.w2s.map((w,index)=>({...completeW2Entry,id:`native-wage-${index+1}`,sourceTaxYear:'2025',accountHolder:index===0?'primary':'spouse',employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:'0',socialSecurityWages:requiredNative(w.socialSecurityWages),socialSecurityTips:'0',allocatedTips:'0',socialSecurityWithheld:requiredNative(w.socialSecurityWithheld),medicareWages:requiredNative(w.medicareWages),medicareWithheld:requiredNative(w.medicareWithheld),box10DependentCareBenefits:'0',stateTaxReporting:'single',state:'PA',stateWages:w.wages,stateWithheld:requiredNative(w.stateTaxWithheld),localWages:'0',localTaxWithheld:'0'}))};
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Actual fictional native originals required');const input=TaxYearInputSchema.parse(raw);
 const sources=PAMarriedOrdinarySourcesSchema.parse({...structuredClone(f.sources),originalFederalSources:structuredClone(input),owners:f.sources.owners.map(row=>{const t=row.accountHolder==='primary'?input.taxpayer.primary:requiredNative(input.taxpayer.spouse);return{...structuredClone(row),originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}};}),wages:f.sources.wages.map((row,index)=>({...structuredClone(row),original:structuredClone(input.w2s[index]),originalRecipientSsn:index===0?input.taxpayer.primary.ssn:requiredNative(input.taxpayer.spouse).ssn}))});
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paMarriedOrdinarySources:sources};
 return{state,input,sources};
}
