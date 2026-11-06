/** Explicit synthetic C/K1 originals, pinned in the package source receipt before outputs. */
import {Form1099NecSchema,TaxYearInputSchema} from '@/models/inputs.js';
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

export function cK1NecOriginal(){return Form1099NecSchema.parse({taxYear:2025,payer:'Actual ordinary client',payerTin:'12-4444444',accountHolder:'primary',nonemployeeCompensation:'25000.10',federalWithheld:'0',stateWithheld:'0'});}
export function cK1NecReceipts(){const original=cK1NecOriginal();return {sourceTaxYear:2025,sourceReference:'Actual private receipt reconciliation ledger',sourceFactsConfirmed:true,allNecSourcesIncluded:true,noDuplicateStatementsConfirmed:true,otherGrossReceiptsNotOnNec:'14999.90',otherGrossSourceReference:'Actual private cash receipt ledger excluding NEC',rows:[{necSourceId:'form1099Nec:0',sourceTaxYear:2025,sourceReference:'Actual private current original client NEC',sourceFactsConfirmed:true,payerTinStatus:'reported' as const,sameBusinessConfirmed:true,includedOnceConfirmed:true,currentOriginalNoCorrectionsOrVoidsConfirmed:true,allUnmodeledBoxesZeroOrBlankConfirmed:true,original}]};}
export function cK1NecFixture(){const input=cK1OrdinaryFixture();input.form1099Nec=[cK1NecOriginal()];return TaxYearInputSchema.parse({...input,qbiLossSources:{...input.qbiLossSources,form461Classification:{...input.qbiLossSources!.form461Classification,scheduleCSource:{...input.qbiLossSources!.form461Classification!.scheduleCSource,necReceipts:cK1NecReceipts()}}}});}
export function cK1NecGuidedFixture(){const state=cK1GuidedFixture();state.sectionData['income-self-employment']!.manualGrossReceipts='14999.90';state.sectionData['income-self-employment']!.necEntries=[{sourceTaxYear:'2025',payerName:'Actual ordinary client',payerTin:'12-4444444',accountHolder:'primary',nonemployeeCompensation:'25000.10',federalWithheld:'0',stateTaxReporting:'none',state:'',stateIncome:'0',stateWithheld:'0'}];const packet=cK1NecReceipts();state.sectionData.adjustments!.k1LossSources!.form461Classification!.scheduleCSource!.necReceipts={...packet,sourceTaxYear:'2025',rows:packet.rows.map(({original:_original,...row})=>({...row,sourceTaxYear:'2025'}))};return state;}
