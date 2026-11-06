// Spec: spec/state/pa-royalty-tax-refund-sources.yaml.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {paRoyaltyTaxRefundFixture} from '../../fixtures/pa-royalty-tax-refund-sources';
const run=(f:ReturnType<typeof paRoyaltyTaxRefundFixture>)=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
it('composes actual complete MI refund evidence without inventing a resident credit',()=>{
 const f=paRoyaltyTaxRefundFixture(),before=JSON.stringify(f),r=run(f);
 expect(r.pa40.netRentalIncome.toFixed()).toBe('11000');expect(r.pa40.totalPATaxableIncome.toFixed()).toBe('211000');expect(r.pa40.taxLiability.toFixed()).toBe('6478');expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.pa40.stateWithholding.toFixed()).toBe('0');expect(JSON.stringify(f)).toBe(before);
 expect(r.readiness.blockers).toContain('separate-local-return-required');
});
it('keeps original printed MI boxes distinct from separately evidenced exact cash refund',()=>{
 const f=paRoyaltyTaxRefundFixture();expect(f.input.form1099Misc[0]).toMatchObject({state:'MI',stateIncome:'12000.25',stateWithheld:'80.20'});
 expect(f.refund.filedReturn.reportedWithholding).toBe('80');expect(f.refund.writtenClaim.amountRequested).toBe('80.20');expect(f.refund.refund.amount).toBe('80.20');expect(run(f).pa40.residentCredit.toFixed()).toBe('0');
});
it.each(['withholding-only','only80cash','no-claim','requested-not-submitted','award-not-actual','not-received','unknown-history','wrong-owner','wrong-year','stale-original','stateIncome-not-reconciled','MI-publication','unknown-publication','wrong-asof','bad-chronology','outstanding','duplicate-receipt','positive-tax','pending-account'] as const)('rejects incomplete or contradictory actual MI settlement: %s',kind=>{
 const f=paRoyaltyTaxRefundFixture(),s=f.refund;
 if(kind==='withholding-only')Reflect.deleteProperty(f.completion.otherStateTaxes,'refundedRoyaltySources');
 if(kind==='only80cash')s.refund.amount='80';
 if(kind==='no-claim')Reflect.deleteProperty(s,'writtenClaim');
 if(kind==='requested-not-submitted')s.writtenClaim.actuallySubmittedConfirmed=false;
 if(kind==='award-not-actual')s.agencyAward.actualAgencyDeterminationConfirmed=false;
 if(kind==='not-received')s.refund.actuallyReceivedConfirmed=false;
 if(kind==='unknown-history')Object.assign(s,{allMIIncomeTaxOriginalsReviewedConfirmed:null});
 if(kind==='wrong-owner')s.owner.firstName='Wrong';if(kind==='wrong-year')s.sourceTaxYear=2024;
 if(kind==='stale-original')f.input.form1099Misc[0].stateWithheld='80.21';
 if(kind==='stateIncome-not-reconciled')s.agencyAward.originalReportedStateIncome='0';
 if(kind==='MI-publication')s.statements[0].copyrightUse.publicationOriginState='MI';
 if(kind==='unknown-publication')Object.assign(s.statements[0].copyrightUse,{actualPublicationOriginConfirmed:null});
 if(kind==='wrong-asof')s.account.completeThroughDate='2026-03-19';
 if(kind==='bad-chronology')s.refund.receivedOn='2026-03-09';if(kind==='outstanding')s.account.overpaymentOutstandingReported='0.20';
 if(kind==='duplicate-receipt')s.statements.push(structuredClone(s.statements[0]));
 if(kind==='positive-tax')s.agencyAward.finalTaxDetermined='1';if(kind==='pending-account')s.account.noAmendmentAssessmentOrPendingAdjustmentConfirmed=false;
 expect(()=>run(f)).toThrow(/source|original|refund|MI|Michigan|claim|account|history|royalt|complete|shape|scope/i);
});
