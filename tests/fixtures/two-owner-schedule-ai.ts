/** Synthetic original facts pinned before engine outputs; spec two-owner-canonical. */
import {buildGuidedK1Sources} from '@/lib/guided-k1-qbi-sources';
import {actualGuidedK1Sources} from './guided-k1-qbi-sources.js';
import {startCompleteInterview} from '../guided-interview/complete-facts.js';
import {emptyAdjustmentData} from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
export function twoOwnerScheduleAiFixture() {
 const profits=['10000','16666.67','26666.67','40000'], wages=['44025','73375','117400','176100'];
 const owner=(accountHolder:'primary'|'spouse')=>({accountHolder,sourceTaxYear:2025,sourceReference:`Original private ${accountHolder} period ledger`,sourceFactsConfirmed:true,periods:profits.map((netProfitFromSelfEmployment,i)=>({netProfitFromSelfEmployment,socialSecurityWages:accountHolder==='primary'?wages[i]:'0'}))});
 return TaxYearInputSchema.parse({...structuredClone(simpleW2Fixture),taxpayer:{...structuredClone(simpleW2Fixture.taxpayer),filingStatus:'married_filing_jointly',primary:{...simpleW2Fixture.taxpayer.primary,firstName:'Avery',lastName:'Original',ssn:'900-70-0311'},spouse:{firstName:'Sam',lastName:'Original',ssn:'900-70-0312',dateOfBirth:'1988-06-15'}},w2s:[{...simpleW2Fixture.w2s[0],accountHolder:'primary',wages:'176100',federalWithheld:'0',socialSecurityWages:'176100',socialSecurityTips:'0',socialSecurityWithheld:'10918.20',medicareWages:'176100',medicareWithheld:'2553.45'}],scheduleC:{accountHolder:'primary',businessName:'Original primary services',ein:'12-1111111',grossReceipts:'40000',expenses:{},materialParticipation:true,qbiMateriallyParticipated:true},scheduleF:{accountHolder:'spouse',principalCropOrActivity:'Original spouse farm',ein:'12-2222222',salesOfProductsRaised:'40000',qbiMateriallyParticipated:true},form2210:{calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',calculationMethod:'annualized',bothSpousesSelfEmployed:true,selfEmploymentOwnerPeriods:[owner('primary'),owner('spouse')],annualizedIncomePeriods:['63185','105308.34','168492.34','252738'].map((adjustedGrossIncome,i)=>({adjustedGrossIncome,itemizedDeductions:'0',qbiDeduction:'15328',qualifiedDividends:'0',netCapitalGain:'0',netProfitFromSelfEmployment:['20000','33333.34','53333.34','80000'][i],socialSecurityWages:wages[i],otherTaxes:'0',credits:'0'}))}});
}

/** Existing guide original K1 adapter, without claiming a complete browser journey. */
export function twoOwnerK1ScheduleAiFixture(){
 const input=twoOwnerScheduleAiFixture(),state=startCompleteInterview({filingStatus:'mfj',incomeTypes:['w2-wages'],lifeEvents:['k1-loss-sources'],stateCode:null});
 const personal=state.sectionData['personal-info']!;Object.assign(personal,{firstName:input.taxpayer.primary.firstName,lastName:input.taxpayer.primary.lastName,ssn:input.taxpayer.primary.ssn,dateOfBirth:input.taxpayer.primary.dateOfBirth,spouse:{...personal.spouse,...input.taxpayer.spouse}});
 const data=actualGuidedK1Sources(),original=data.activities![0]!;
 data.activities=(['primary','spouse'] as const).map(accountHolder=>{const row=structuredClone(original),person=accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse!;Object.assign(row,{accountHolder,entityName:`Original ${accountHolder} domestic partnership`,entityEIN:accountHolder==='primary'?'12-1111111':'12-2222222',recipientName:`${person.firstName} ${person.lastName}`,recipientTaxpayerIdLast4:person.ssn.replaceAll('-','').slice(-4)});Object.assign(row.statement!,{ordinaryIncome:'40000',section199AQBI:'40000',selfEmploymentEarnings:'40000'});row.atRisk!.currentYearIncreases='40000';return row;});
 Object.assign(data.priorQbiCarry!,{primaryName:'Avery Original',primaryTaxpayerIdLast4:'0311',spouseName:'Sam Original',spouseTaxpayerIdLast4:'0312',sameFilingUnit:{priorFilingStatus:'married_filing_jointly',sameTaxpayersConfirmed:true}});
 state.sectionData.adjustments={...emptyAdjustmentData,k1LossSources:data};
 const built=buildGuidedK1Sources(data,state);if(!built)throw new Error('Missing actual guide source packet');
 return TaxYearInputSchema.parse({...input,scheduleC:undefined,scheduleF:undefined,scheduleK1:built.scheduleK1,qbiLossSources:built.qbiLossSources,priorYear:{...built.priorQbiCarry,suspendedPassiveLosses:built.suspendedPassiveLosses}});
}
