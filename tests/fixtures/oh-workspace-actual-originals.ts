/** Explicit fictional actual records for workspace tests; never application defaults. */
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '@/models/inputs';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts,type OhioPaymentDraft} from '@/lib/guided-ohio-payment-facts';
import {ohioPaymentFixture} from './oh-payments';
import {guidedOhioSourceFlow} from './guided-state-originals';
export function confirmCurrentOhioWorkspaceOriginals(state:GuidedFlowState,receipts:Array<{date:string;amount:string}>=[]){
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Explicit synthetic workspace federal source facts are incomplete');
 const input=TaxYearInputSchema.parse(raw),template=ohioPaymentFixture('full_year_resident'),person=input.taxpayer.primary;
 const data=state.sectionData['state-return'];if(!data)throw Error('Explicit synthetic workspace state source facts are missing');
 data.ohioResidency=confirmGuidedOhioResidencyFacts(input,{...template.ohioResidency,taxYear:'2025',owners:template.ohioResidency.owners.map(o=>({...o,status:'full_year_resident',periods:[{from:'2025-01-01',to:'2025-12-31',domicileState:'OH'}]}))});
 const draft:OhioPaymentDraft={...template.ohioPayments,taxYear:'2025',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'},
  paymentRows:receipts.map((r,i)=>({sourceId:'Independent-workspace-receipt-'+i,sourceReference:'Independent actual synthetic account original '+i,accountHolder:'primary',taxYear:'2025',returnType:'it1040',kind:'estimated',date:r.date,amount:r.amount,appliedToThisReturnConfirmed:true,original:{accountName:person.firstName+' '+person.lastName,accountSsn:person.ssn,taxYear:'2025',returnType:'it1040',kind:'estimated',date:r.date,amount:r.amount,confirmationNumber:'Independent-workspace-confirmation-'+i}})),
  remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Independent complete synthetic account confirms tax covered by current original withholding or estimates',sourceFactsConfirmed:true}};
 data.ohioPayments=confirmGuidedOhioPaymentFacts(input,draft);return state;
}
export function actualOhioWorkspaceFlow(status:'full_year_resident'|'part_year_resident'|'nonresident'){
 return guidedOhioSourceFlow(status);
}
