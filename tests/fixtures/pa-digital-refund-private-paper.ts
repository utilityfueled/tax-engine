/** Separate explicit fictional paper-compatible originals; never production defaults. */
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {confirmGuidedPAOrdinaryDigitalSources} from '@/lib/guided-pa-ordinary-digital-sources';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPADigitalTaxRefundSources} from '@/lib/guided-pa-digital-tax-refund-sources';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {guidedPACompleteDigital} from './guided-pa-digital-complete';
export function refundPrivatePaperFixture(){
 const f=guidedPACompleteDigital(),input=structuredClone(f.input);
 const applicationId='PRIVATE-VA-APPLICATION-843297',awardId='PRIVATE-VA-AWARD-739246';
 for(const statement of input.form1099DA)for(const transaction of statement.transactions){
  // New actual original amounts: the earlier 100.49 fixture remains untouched.
  transaction.proceeds='100.24';
  transaction.digitalAssetName='Complete actual refund safe prefix '+applicationId+' '+awardId+' COMPLETE ACTUAL REFUND SAFE END';
 }
 const digital=confirmGuidedPAOrdinaryDigitalSources(input,f.digital,'resident');
 const residency=confirmGuidedPAResidencySources(input,{...f.input.paResidencySources,digitalSources:digital});
 input.paResidencySources=residency;
 const facts=confirmGuidedPAOrdinaryReturnFacts(input,{...f.facts,sourceReference:'Separate fictional paper-compatible actual source records'});
 const refundDraft=structuredClone(f.refundSources);
 refundDraft.specialWrittenApplication.applicationId=applicationId;
 refundDraft.agencyAward.applicationId=applicationId;
 refundDraft.agencyAward.awardId=awardId;
 const refund=confirmGuidedPADigitalTaxRefundSources(input,facts,refundDraft);
 const completion=confirmGuidedPAOrdinaryReturnCompletionSources(input,{...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedDigitalSources:refund}},facts);
 const actual=TaxYearInputSchema.parse({...input,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion});
 const ordinary=calculatePAOrdinaryReturn(actual,facts,completion),result=calculateFederalTax(actual);
 result.stateReturns={pennsylvania:ordinary};return {input:actual,ordinary,result,applicationId,awardId};
}
