/** Actual synthetic source fixture for shared paths, never application defaults. */
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
import {startCompleteInterview,completeW2Entry,completeInterestSource} from '../guided-interview/complete-facts';
export function guidedPACompleteOriginals(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status),t=f.input.taxpayer,w=f.input.w2s[0],b=f.input.form1099Int[0];if(!w||!b)throw Error('Actual source fixture requires W2 and bank original');
 const s=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:'PA'});
 Object.assign(s.sectionData['personal-info'],{firstName:t.primary.firstName,lastName:t.primary.lastName,ssn:t.primary.ssn,dateOfBirth:t.primary.dateOfBirth,addressLine1:t.address.street,city:t.address.city,state:t.address.state,zip:t.address.zip,stateResidency:status==='resident'?'full-year':status==='part_year'?'part-year':'nonresident'});
 s.sectionData['income-w2']={entries:[{...completeW2Entry,sourceTaxYear:'2025',employerName:w.employer.name,employerEin:w.employer.ein,wages:w.wages,federalWithheld:w.federalWithheld,socialSecurityWages:w.socialSecurityWages??'',socialSecurityWithheld:w.socialSecurityWithheld??'',medicareWages:w.medicareWages??'',medicareWithheld:w.medicareWithheld??'',stateTaxReporting:'single',state:w.state??'',stateWages:w.stateWages??'',stateWithheld:w.stateTaxWithheld??''}]};
 s.sectionData['income-investments']={interestEntries:[{...completeInterestSource,payer:b.payer,payerTin:b.payerTin??'',accountReference:b.accountReference??'',interestIncome:b.interestIncome,stateTaxReporting:'single',state:'PA',stateWithheld:'0'}],dividendEntries:[],brokerageEntries:[],digitalAssetEntries:[],oidEntries:[]};
 const raw=buildTaxInputFromGuidedData(s);if(!raw)throw Error('Actual synthetic shared federal originals missing');
 const base=TaxYearInputSchema.parse(raw),residency=confirmGuidedPAResidencySources(base,f.input.paResidencySources),current={...base,paResidencySources:residency};
 const facts=confirmGuidedPAOrdinaryReturnFacts(current,f.facts),completion=confirmGuidedPAOrdinaryReturnCompletionSources(current,f.sources);
 s.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 return s;
}
