/** Explicit fictional400 balance receipt; spec state/oh-sd-100-guided-remaining-balance.yaml. */
import type { OhioSchoolDistrictFacts } from '@/models/ohio-school-district';
import type { OhioSchoolDistrictDraft } from '@/lib/guided-ohio-school-district-facts';
import {guidedSchoolDistrictFixture,enteredSchoolDraft,required} from './guided-oh-school-district-complete';
export function guidedSchoolBalanceFixture(status:'unpaid'|'expected_payment'|'actual_payment'='actual_payment') {
 const f=guidedSchoolDistrictFixture('estimates');
 const facts:OhioSchoolDistrictFacts=structuredClone(f.facts),p=facts.payments;
 p.paymentRows=[];p.account.estimatedPaymentsCredited='0';p.account.currentOriginalReturnPaymentCredited=status==='actual_payment'?'400':'0';
 p.remainingTaxPayment=status==='unpaid'?{status,sourceReference:'PRIVATE-FICTIONAL-SD-UNPAID',sourceFactsConfirmed:true}
  :status==='expected_payment'?{status,sourceReference:'PRIVATE-FICTIONAL-SD-PLAN',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'400'}
  :{status,sourceReference:'PRIVATE-FICTIONAL-SD-CURRENT-RETURN-PAYMENT',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'400',currentOriginalReturnConfirmed:true,
   original:{accountName:'Avery School',accountSsn:f.original.taxpayer.primary.ssn,taxYear:2025,returnType:'sd100',districtCode:'0302',kind:'balance',date:'2026-04-15',amount:'400',confirmationNumber:'PRIVATE-FICTIONAL-SD-GUIDE-BALANCE'}};
 if(status==='actual_payment'){p.currentTiming={kind:'filed',filedDate:'2026-04-15',asOfDate:'2026-04-16'};p.account.asOfDate='2026-04-16';}
 const draft=enteredSchoolDraft(facts) as unknown as OhioSchoolDistrictDraft;
 // Translate this literal original's year for native source entry, never infer it.
 Reflect.set(draft.payments,'remainingTaxPayment',p.remainingTaxPayment.status==='actual_payment'
  ?{...structuredClone(p.remainingTaxPayment),original:{...structuredClone(p.remainingTaxPayment.original),taxYear:'2025'}}:structuredClone(p.remainingTaxPayment));
 draft.sourceFactsConfirmed=null;draft.originalFederalSources=undefined;
 f.data.ohioSchoolDistrict=draft;
 return{...f,facts,draft,canonical:{...f.canonical,ohioSchoolDistrict:facts}};
}
export const balanceVisibleFields:readonly(readonly[string,string])[]=[
 ['School account current-original payment credited','400'],['School remaining tax payment status','actual_payment'],
 ['School remaining tax payment reference','PRIVATE-FICTIONAL-SD-CURRENT-RETURN-PAYMENT'],['Actual school remaining payment records checked','true'],
 ['School remaining payment date','2026-04-15'],['School remaining payment amount applied to tax','400'],
 ['Payment was remitted with this current original return','true'],['School balance original account holder name','Avery School'],['School balance original account SSN','900-70-0302'],
 ['School balance original tax year','2025'],['School balance original return type','sd100'],['School balance original district code','0302'],['School balance original payment kind','balance'],
 ['School balance original payment date','2026-04-15'],['School balance original payment amount','400'],['School balance original confirmation number','PRIVATE-FICTIONAL-SD-GUIDE-BALANCE'],
 ['School current filing timing','filed'],['School current expected filing date',''],['School current actual filed date','2026-04-15'],['School current timing as of date','2026-04-16'],['School account as of date','2026-04-16'],
];
export function requiredSchoolBalanceOriginal(f:ReturnType<typeof guidedSchoolBalanceFixture>){return required(f.facts.payments.remainingTaxPayment.status==='actual_payment'?f.facts.payments.remainingTaxPayment.original:undefined);}
