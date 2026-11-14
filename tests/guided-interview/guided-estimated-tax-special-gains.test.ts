// Spec: spec/federal/form-2210-schedule-ai.yaml special-rate-original-guide.
import { expect,it } from 'vitest';
import { buildEstimatedTaxFacts,emptyAnnualizedPeriods,emptyEstimatedTaxFacts } from '@/lib/guided-estimated-tax-facts';
import { emptyPaymentData,updateSectionData } from '@/lib/guided-interview-flow';
import { startCompleteInterview } from './complete-facts';
const data=()=>({...emptyPaymentData,estimatedTaxFacts:{...structuredClone(emptyEstimatedTaxFacts),sourceTaxYear:'2025',sourceReference:'Fictional actual special worksheets',sourceFactsConfirmed:true,
 allPaymentRecordsIncluded:true,calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,calculationMethod:'annualized' as const,
 withholdingMethod:'equal-installments' as const,priorYearTaxStatus:'no-return' as const,earlyReturnExceptionClaimed:false,specialRatePeriodsConfirmed:true,
 annualizedIncomePeriods:emptyAnnualizedPeriods().map(period=>({...Object.fromEntries(Object.keys(period).map(key=>[key,'0'])),rate28GainLoss:'-1,000.25',unrecaptured1250BeforeLosses:'2,000.50'}))}});
it('keeps special period originals unknown and invalidates changed source confirmation',()=>{
 const payment=data(); const built=buildEstimatedTaxFacts(payment,2025)!;
 expect(built.specialRatePeriodsConfirmed).toBe(true);
 expect(built.annualizedIncomePeriods?.[0]).toMatchObject({rate28GainLoss:'-1000.25',unrecaptured1250BeforeLosses:'2000.5'});
 for(const key of ['rate28GainLoss','unrecaptured1250BeforeLosses'] as const){const missing=data();missing.estimatedTaxFacts.annualizedIncomePeriods[0]![key]='';expect(()=>buildEstimatedTaxFacts(missing,2025)).toThrow(/actual|enter/i);}
 const unconfirmed=data();unconfirmed.estimatedTaxFacts.specialRatePeriodsConfirmed=false;expect(()=>buildEstimatedTaxFacts(unconfirmed,2025)).toThrow(/confirm.*special/i);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['investments'],lifeEvents:[],stateCode:null});state.sectionData.payments=payment;
 const reference=updateSectionData(state,'payments',{...payment,estimatedTaxFacts:{...payment.estimatedTaxFacts,sourceReference:'Changed actual source'}});
 expect(reference.sectionData.payments?.estimatedTaxFacts?.specialRatePeriodsConfirmed).toBeNull();
 const changed=updateSectionData(state,'personal-info',{...state.sectionData['personal-info']!,taxYear:2026});
 expect(changed.sectionData.payments?.estimatedTaxFacts?.specialRatePeriodsConfirmed).toBeNull();
 const onlyPayment=updateSectionData(state,'payments',{...payment,estimatedPayments:[{date:'2025-04-15',amount:'100'}]});
 expect(onlyPayment.sectionData.payments?.estimatedTaxFacts?.specialRatePeriodsConfirmed).toBe(true);
 expect(buildEstimatedTaxFacts({...payment,estimatedTaxFacts:{...payment.estimatedTaxFacts,calculationMethod:'regular'}},2025)?.specialRatePeriodsConfirmed).toBeUndefined();
});
