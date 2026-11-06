// Spec: spec/state/pa-digital-refund-independent.yaml. Independent literal oracles.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {guidedPACompleteDigital} from '../../fixtures/guided-pa-digital-complete';
import {calculatePADigitalTaxRefundSources as calculate} from '@/engine/state/pa-digital-tax-refund-sources';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {buildGuidedPADigitalTaxRefundSources} from '@/lib/guided-pa-digital-tax-refund-sources';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
type Fixture=ReturnType<typeof guidedPACompleteDigital>;
const run=(f:Fixture)=>calculate(f.input,f.facts,f.refundSources);
function bind(f:Fixture):void{
 const digital=f.input.paResidencySources.digitalSources;if(!digital)throw new Error('Explicit fictional digital proof required');
 for(const row of digital.statements)if(row.originalIndex!==null)row.original=structuredClone(f.input.form1099DA[row.originalIndex]);
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.refundSources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.refundSources.originalPAResidencySources=structuredClone(f.input.paResidencySources);
 f.refundSources.originalPAFacts=structuredClone(f.facts);
 for(const row of f.refundSources.statements)row.originalStatement=structuredClone(f.input.form1099DA[row.originalIndex]);
}
/** New separate fictional original/receipt; every other source field explicit and unchanged. */
function twoActualOriginals():Fixture{
 const f=guidedPACompleteDigital(),extra=structuredClone(f.input.form1099DA[2]);
 extra.sourceId='Independent distinct VA statement4';extra.accountReference='Independent separate VA account4';
 for(const [i,t] of extra.transactions.entries())t.sourceId='Independent distinct transaction4-'+i;
 f.input.form1099DA.push(extra);
 const digital=f.input.paResidencySources.digitalSources;if(!digital)throw new Error('Explicit actual digital proof required');
 digital.statements.push({...structuredClone(digital.statements[2]),originalIndex:3,sourceReference:'Independent actual separate VA statement4 classification'});
 const second=structuredClone(f.refundSources.statements[0]);second.originalIndex=3;second.sourceReference='Independent distinct VA statement4 remittance proof';
 second.withholdingOriginal.confirmationNumber='Independent separate receipt4';second.withholdingOriginal.sourceReference='Independent actual separate receipt4 source';
 f.refundSources.statements.push(second);
 const p=f.refundSources;for(const key of ['reportedWithholding','totalPayments','overpayment','refundRequested'] as const)p.filedReturn[key]='1';
 p.specialWrittenApplication.amountRequested='0.60';p.agencyAward.refundAwarded='0.60';p.refund.amount='0.60';bind(f);return f;
}
it('independent literal complete composition keeps refunded cash and PA tax separate',()=>{
 const f=guidedPACompleteDigital(),a=run(f),r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
 expect(a.actualVAWithholding.toFixed()).toBe('0.3');expect(a.actualReceivedRefund.toFixed()).toBe('0.3');expect(a.actualNetTaxPaid.toFixed()).toBe('0');expect(a.paResidentCredit.toFixed()).toBe('0');
 expect(r.pa40.taxLiability.toFixed()).toBe('1537');expect(r.pa40.stateWithholding.toFixed()).toBe('1');expect(r.pa40.taxDue.toFixed()).toBe('1536');expect(r.pa40.residentCredit.toFixed()).toBe('0');
 expect(r.scheduleSP.eligibilityIncome.toFixed()).toBe('50061');expect(r.readiness.filingEligible).toBe(false);expect(a.filingEligible).toBe(false);
});
it('independent serialized replay retains digest and every private original',()=>{
 const f=guidedPACompleteDigital(),before=JSON.stringify(f),first=run(f),saved=JSON.parse(JSON.stringify(f.refundSources));
 expect(calculate(f.input,f.facts,saved).sourceCommitment).toBe(first.sourceCommitment);expect(JSON.stringify(f)).toBe(before);
 expect(buildGuidedPADigitalTaxRefundSources(f.input,f.facts,saved)).toEqual(saved);
});
it('independent stale equal-money statement cannot refresh on read',()=>{
 const f=guidedPACompleteDigital();f.input.form1099DA[2].accountReference='Changed same-money current account';const before=JSON.stringify(f);
 expect(()=>buildGuidedPADigitalTaxRefundSources(f.input,f.facts,f.refundSources)).toThrow();expect(JSON.stringify(f)).toBe(before);
});
it('independent changed actual facts cannot refresh on read',()=>{
 const f=guidedPACompleteDigital();f.facts.sourceReference+=' changed actual source';const before=JSON.stringify(f);
 expect(()=>run(f)).toThrow();expect(JSON.stringify(f)).toBe(before);
});
it('independent outstanding tiny tax account cannot be called fully refunded',()=>{
 const f=guidedPACompleteDigital();f.refundSources.account.overpaymentOutstandingReported='0.0000000000000000000000000000000000000001';expect(()=>run(f)).toThrow();
});
it('independent sub-dollar application must actually have been submitted',()=>{
 const f=guidedPACompleteDigital();f.refundSources.specialWrittenApplication.actuallySubmittedConfirmed=false;expect(()=>run(f)).toThrow();
});
it('independent received refund cannot predate its posted payment',()=>{
 const f=guidedPACompleteDigital();f.refundSources.refund.receivedOn='2026-02-19';expect(()=>run(f)).toThrow();
});
it('independent actual source owner cannot differ from current owner',()=>{
 const f=guidedPACompleteDigital();f.refundSources.statements[0].withholdingOriginal.accountSsn='999-77-0001';expect(()=>run(f)).toThrow();
});
it('independent distinct VA originals and distinct remittances reconcile exact0.60',()=>{
 const f=twoActualOriginals(),r=run(f);expect(r.actualVAWithholding.toFixed()).toBe('0.6');expect(r.actualReceivedRefund.toFixed()).toBe('0.6');expect(r.coveredOriginalIndices).toEqual([2,3]);expect(r.paResidentCredit.toFixed()).toBe('0');
});
it.each(['case','outer whitespace','inner whitespace','combined'])('independent semantic duplicate remittance is rejected: %s',(variant)=>{
 const f=twoActualOriginals(),rows=f.refundSources.statements;rows[0].withholdingOriginal.confirmationNumber='Actual Receipt Same';
 rows[1].withholdingOriginal.confirmationNumber=variant==='case'?'ACTUAL RECEIPT SAME':variant==='outer whitespace'?' Actual Receipt Same ':variant==='inner whitespace'?'Actual  Receipt Same':' ACTUAL  RECEIPT SAME ';
 expect(()=>run(f)).toThrow();
});
it('independent tiny exact refund cash survives public Decimal boundary',()=>{
 const f=guidedPACompleteDigital(),exact='0.3000000000000000000000000000000000000001';
 f.input.form1099DA[2].stateWithheld=exact;f.refundSources.statements[0].withholdingOriginal.amount=exact;f.refundSources.specialWrittenApplication.amountRequested=exact;f.refundSources.agencyAward.refundAwarded=exact;f.refundSources.refund.amount=exact;bind(f);
 const r=run(f);expect(r.actualVAWithholding.toFixed()).toBe(exact);expect(r.actualReceivedRefund.toFixed()).toBe(exact);expect(r.actualVAWithholding.constructor).toBe(Decimal);expect(r.actualReceivedRefund.constructor).toBe(Decimal);
 f.refundSources.refund.amount='0.3';expect(()=>run(f)).toThrow();
});
it('independent source audit emits no actual private receipt identities',()=>{
 const f=guidedPACompleteDigital(),audit=JSON.stringify(run(f).lines);
 for(const value of [f.input.taxpayer.primary.ssn,f.refundSources.statements[0].withholdingOriginal.confirmationNumber,f.refundSources.refund.confirmationNumber,f.refundSources.specialWrittenApplication.applicationId,f.refundSources.agencyAward.awardId,f.input.form1099DA[2].accountReference])expect(audit).not.toContain(value);
});
it('independent canonical preview never repairs an unreceived refund',()=>{
 const f=guidedPACompleteDigital(),packet=f.state.sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedDigitalSources;
 if(!packet)throw new Error('Explicit actual refund source required');packet.refund.actuallyReceivedConfirmed=null;const before=JSON.stringify(f.state);
 expect(computeGuidedPreview(f.state)?.state??null).toBeNull();expect(JSON.stringify(f.state)).toBe(before);
});
