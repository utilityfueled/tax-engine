/** Explicit fictional source variants for native controls, never actual user evidence. */
import {guidedPACompleteDigital} from './guided-pa-digital-complete';
import {confirmGuidedPAOrdinaryDigitalSources} from '@/lib/guided-pa-ordinary-digital-sources';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPADigitalTaxRefundSources} from '@/lib/guided-pa-digital-tax-refund-sources';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
export function nativeRefundFixture(exact:'0.30'|'1.30'='0.30'){
 const f=guidedPACompleteDigital(),input=structuredClone(f.input),statement=input.form1099DA[2];if(!statement)throw new Error('Actual VA original required');
 statement.stateWithheld=exact;
 const digital=confirmGuidedPAOrdinaryDigitalSources(input,f.digital,'resident');
 input.paResidencySources=confirmGuidedPAResidencySources(input,{...input.paResidencySources,digitalSources:digital});
 const facts=confirmGuidedPAOrdinaryReturnFacts(input,f.facts),draft=structuredClone(f.refundSources),receipt=draft.statements[0];if(!receipt)throw new Error('Actual remittance required');
 receipt.withholdingOriginal.amount=exact;
 const printed=exact==='0.30'?'0':'1';
 for(const key of ['reportedWithholding','totalPayments','overpayment','refundRequested']as const)draft.filedReturn[key]=printed;
 if(exact==='1.30')Object.assign(draft,{specialWrittenApplication:null});else draft.specialWrittenApplication.amountRequested='0.30';
 draft.agencyAward.refundAwarded=exact;draft.agencyAward.applicationId=exact==='1.30'?'':draft.specialWrittenApplication.applicationId;draft.refund.amount=exact;
 const records=confirmGuidedPADigitalTaxRefundSources(input,facts,draft);
 const original=structuredClone(f.completion),history=original.otherStateTaxes.jurisdictions[0];if(!history)throw new Error('Actual complete VA history required');history.incomeTaxWithheld=exact;original.otherStateTaxes.refundedDigitalSources=records;
 const completion=confirmGuidedPAOrdinaryReturnCompletionSources(input,original,facts);
 return{input,facts,records,completion};
}
export function completionWithoutRefund(f:ReturnType<typeof nativeRefundFixture>){const d=structuredClone(f.completion);delete d.otherStateTaxes.refundedDigitalSources;d.sourceFactsConfirmed=null;return d;}
