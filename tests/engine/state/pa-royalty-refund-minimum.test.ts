// Spec: spec/state/pa-royalty-refund-minimum.yaml. Explicit independent fictional cash cohorts.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {paRoyaltyTaxRefundFixture} from '../../fixtures/pa-royalty-tax-refund-sources';
function cohort(amount:'1.30'|'0.30',printed:'1'|'0'){
 const f=paRoyaltyTaxRefundFixture();
 f.input.form1099Misc[0].stateWithheld=amount;
 f.royaltySources.originals[0].original=structuredClone(f.input.form1099Misc[0]);
 f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.completion.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.completion.otherStateTaxes.jurisdictions[0].incomeTaxWithheld=amount;
 f.refund.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);
 f.refund.originalPAResidencySources=structuredClone(f.residency);f.refund.originalPAFacts=structuredClone(f.facts);
 f.refund.statements[0].originalStatement=structuredClone(f.input.form1099Misc[0]);
 f.refund.statements[0].withholdingOriginal.amount=amount;
 f.refund.statements[0].withholdingOriginal.confirmationNumber='Fictional new independent minimum remittance '+amount;
 f.refund.filedReturn.reportedWithholding=printed;f.refund.filedReturn.totalPayments=printed;f.refund.filedReturn.overpayment=printed;f.refund.filedReturn.refundRequested=printed;
 f.refund.writtenClaim.amountRequested=amount;f.refund.writtenClaim.applicationId='Fictional new minimum claim '+amount;
 f.refund.agencyAward.applicationId=f.refund.writtenClaim.applicationId;f.refund.agencyAward.awardId='Fictional new minimum award '+amount;f.refund.agencyAward.refundAwarded=amount;
 f.refund.refund.amount=amount;f.refund.refund.confirmationNumber='Fictional new minimum receipt '+amount;
 return f;
}
it('admits independently evidenced full MI refund above the one-dollar payment minimum',()=>{
 const f=cohort('1.30','1'),r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
 expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.pa40.taxLiability.toFixed()).toBe('6478');expect(f.input.form1099Misc[0].stateWithheld).toBe('1.30');
});
it('rejects a below-one-dollar MI refund cohort inconsistent with the published payment minimum',()=>{
 const f=cohort('0.30','0');expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/minimum|refund|dollar|source|account/i);
});
