/** Explicit synthetic C/K1 originals, pinned in the package source receipt before outputs. */
import {TaxYearInputSchema} from '@/models/inputs.js';
import {twoOwnerK1ScheduleAiFixture,twoOwnerScheduleAiFixture} from './two-owner-schedule-ai.js';
import {actualGuidedK1Sources} from './guided-k1-qbi-sources.js';
import {startCompleteInterview,completeW2Entry,completeBusinessSection} from '../guided-interview/complete-facts.js';
import {emptyAdjustmentData} from '@/lib/guided-interview-flow';
export function cK1Proof(){return {sourceTaxYear:2025,sourceReference:'Actual private primary domestic ordinary ledger',sourceFactsConfirmed:true,accountHolder:'primary' as const,businessNameStatus:'reported' as const,businessEINStatus:'reported' as const,businessName:'Original primary services',businessEIN:'12-1111111',recipientName:'Avery Original',recipientTaxpayerIdLast4:'0311',allIncomeDomesticConfirmed:true,ordinaryBusinessOnlyConfirmed:true};}
export function cK1OrdinaryFixture(){
 const input=twoOwnerK1ScheduleAiFixture(),c=twoOwnerScheduleAiFixture().scheduleC;
 input.scheduleK1=input.scheduleK1.filter(row=>row.accountHolder==='spouse');
 const facts=input.qbiLossSources!.activities!.filter(row=>row.accountHolder==='spouse');facts[0].k1SourceId='scheduleK1:0';input.qbiLossSources!.activities=facts;
 input.priorYear!.suspendedPassiveLosses=input.priorYear!.suspendedPassiveLosses.filter(row=>row.partnershipName===input.scheduleK1[0].partnershipName);
 return TaxYearInputSchema.parse({...input,scheduleC:c,qbiLossSources:{...input.qbiLossSources,form461Classification:{...input.qbiLossSources!.form461Classification,method:'profitable_ordinary_c_and_k1',scheduleCSource:cK1Proof()}}});
}
export function cK1GuidedFixture(){
 const state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages','self-employment'],lifeEvents:['k1-loss-sources'],stateCode:null}),personal=state.sectionData['personal-info']!;
 Object.assign(personal,{firstName:'Avery',lastName:'Original',ssn:'900-70-0311',spouse:{...personal.spouse,firstName:'Sam',lastName:'Original',ssn:'900-70-0312'}});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'176100',socialSecurityWages:'176100',medicareWages:'176100',socialSecurityWithheld:'10918.20',medicareWithheld:'2553.45'}]};
 state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:'40000',businessFacts:{...completeBusinessSection.businessFacts,businessName:'Original primary services',ein:'12-1111111'}};
 const data=actualGuidedK1Sources(),row=data.activities![0];Object.assign(row,{accountHolder:'spouse',entityName:'Original spouse domestic partnership',entityEIN:'12-2222222',recipientName:'Sam Original',recipientTaxpayerIdLast4:'0312'});
 Object.assign(row.statement!,{ordinaryIncome:'40000',section199AQBI:'40000',selfEmploymentEarnings:'40000'});row.atRisk!.currentYearIncreases='40000';
 Object.assign(data.priorQbiCarry!,{primaryName:'Avery Original',primaryTaxpayerIdLast4:'0311',spouseName:'Sam Original',spouseTaxpayerIdLast4:'0312',sameFilingUnit:{priorFilingStatus:'married_filing_jointly',sameTaxpayersConfirmed:true}});
 data.form461Classification={...data.form461Classification,method:'profitable_ordinary_c_and_k1',scheduleCSource:{...cK1Proof(),sourceTaxYear:'2025'}};
 state.sectionData.adjustments={...emptyAdjustmentData,k1LossSources:data};return state;
}
