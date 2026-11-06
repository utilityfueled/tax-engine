// Spec: spec/state/pa-royalty-history-independent.yaml. Offline/no PDF creation.
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {guidedPARoyaltyComplete,guidedPARoyaltyLegacyBControl} from '../fixtures/guided-pa-royalty-complete';
import {buildGuidedPARoyaltyTaxRefundSources,confirmGuidedPARoyaltyTaxRefundSources} from '@/lib/guided-pa-royalty-tax-refund-sources';
import {buildGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {preparePARoyaltyReview,assertPARoyaltyReview} from '@/pdf/pa-royalty-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {TaxYearInputSchema} from '@/models/inputs';
type F=ReturnType<typeof guidedPARoyaltyComplete>;
const mutations:Array<[string,(f:F)=>void]>=[
 ['filed-original-fractional-dollar',f=>{f.refund.filedFederalHistory.filedFederalAGI='211000.50';}],
 ['current-AGI-overprecision',f=>{f.historicalExpenseCorrection.currentFederalAGI='210901.000';}],
 ['delta-overprecision',f=>{f.historicalExpenseCorrection.actualAdditionalExpense='100.000';}],
 ['different-household-history',f=>{f.refund.filedFederalHistory.owner.lastName='Different Household';}],
 ['different-household-correction',f=>{f.historicalExpenseCorrection.owner.ssn='999-88-7777';}],
 ['old-guided-unknown-classification',f=>{f.refund.filedFederalHistory.originalGuidedPropertySources.properties[0].sameRegularAmtTreatmentConfirmed=null;}],
 ['old-canonical-unmodelled-source',f=>{Reflect.set(f.refund.filedFederalHistory.originalFederalSources,'inventedTaxAdjustment','1');}],
 ['old-guided-second-property',f=>{f.refund.filedFederalHistory.originalGuidedPropertySources.properties.push(structuredClone(f.historicalData.properties[0]));}],
 ['current-two-receipt-corrections',f=>{const p=f.input.royaltyPropertySources?.properties?.[0];if(!p?.expenses||!p.paTreatment?.expenses)throw Error('Required original');p.expenses[1].amountPaid='951.50';p.paTreatment.expenses[1].amountPaid='951.50';}],
 ['old-receipt-reference-only',f=>{f.historicalExpenseCorrection.originalLegalReceipt.sourceReference='A different original legal receipt';}],
 ['corrected-receipt-date-only',f=>{f.historicalExpenseCorrection.correctedLegalReceipt.paidDate='2025-02-16';}],
 ['corrected-receipt-extra-field',f=>{Reflect.set(f.historicalExpenseCorrection.correctedLegalReceipt,'inventedReceipt',true);}],
 ['new-pa-copy-only',f=>{const p=f.input.royaltyPropertySources?.properties?.[0];if(!p?.paTreatment?.expenses)throw Error('Required PA original');p.paTreatment.expenses[0].amountPaid='149.24';}],
 ['filed-return-id-mismatch',f=>{f.refund.filedFederalHistory.returnId='Another actual return';}],
 ['correction-return-id-mismatch',f=>{f.historicalExpenseCorrection.returnId='Another actual return';}],
 ['history-date-mismatch',f=>{f.refund.filedFederalHistory.filedOn='2026-03-02';}],
 ['correction-predates-filed-return',f=>{f.historicalExpenseCorrection.reviewedOn='2026-02-28';f.historicalExpenseCorrection.amendmentReview.reviewedOn='2026-02-28';}],
 ['amendment-review-date-conflict',f=>{f.historicalExpenseCorrection.amendmentReview.reviewedOn='2026-03-14';}],
 ['amendment-review-reference-empty',f=>{f.historicalExpenseCorrection.amendmentReview.sourceReference=' ';}],
 ['amendment-review-incomplete',f=>{f.historicalExpenseCorrection.amendmentReview.allFederalAndMichiganAdjustmentsReviewedConfirmed=false;}],
 ['amendment-determination-unresolved',f=>{f.historicalExpenseCorrection.amendmentReview.determination='requires_michigan_amendment';}],
 ['correction-account-other-owner',f=>{f.historicalExpenseCorrection.completeAccountAfterReview.accountSsn='999-88-7777';}],
 ['correction-use-origin-conflict',f=>{f.historicalExpenseCorrection.originalCopyrightUse.publicationOriginState='MI';}],
 ['correction-positive-mi-tax',f=>{f.historicalExpenseCorrection.michiganTaxEffect='0.01';}],
 ['history-reports-positive-mi-source',f=>{f.refund.filedFederalHistory.filedMichiganSourceIncome='0.01';}],
 ['missing-historical-correction',f=>{Reflect.deleteProperty(f.refund,'historicalExpenseCorrection');}],
 ['correction-without-history',f=>{Reflect.deleteProperty(f.refund,'filedFederalHistory');}],
 ['null-read-confirmation',f=>{f.refund.sourceFactsConfirmed=null;}],
 ['missing-complete-review',f=>{f.refund.filedFederalHistory.allFiledOriginalIncomeAndExpenseSourcesReviewedConfirmed=null;}],
 ['current-unbound-original-id',f=>{f.input.form1099Misc[0].accountReference='Different actual original';}],
 ['paid-only-printed-refund',f=>{f.refund.refund.amount='80';}],
 ['unresolved-current-assessment',f=>{f.refund.account.unpaidTaxReported='0.01';}],
];
it.each(mutations)('independent source mutation rejects %s',(_name,mutate)=>{const f=guidedPARoyaltyComplete('browser',true);mutate(f);const before=JSON.stringify(f);expect(()=>buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund)).toThrow();expect(JSON.stringify(f)).toBe(before);});
it('independent unchanged raw originals conserve cents and preserve history',()=>{
 for(const corrected of [false,true]){const f=guidedPARoyaltyComplete('browser',corrected),before=JSON.stringify(f),oldFiled=JSON.stringify([f.refund.filedReturn,f.refund.agencyAward,f.refund.refund]);
  const canonical=buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund);expect(canonical).not.toHaveProperty('filedFederalHistory');expect(canonical).not.toHaveProperty('historicalExpenseCorrection');
  const federal=calculateFederalTax(f.input);expect(federal.agi.toFixed()).toBe(corrected?'210900.5':'211000.5');expect(new Decimal(federal.agi.toFixed()).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed()).toBe(corrected?'210901':'211001');
  expect(canonical.refund.amount).toBe('80.20');expect(canonical.filedReturn.reportedWithholding).toBe('80');
  const confirmed=confirmGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund);expect(JSON.stringify([confirmed.filedReturn,confirmed.agencyAward,confirmed.refund])).toBe(oldFiled);expect(confirmed.filedFederalHistory).toEqual(f.refund.filedFederalHistory);expect(JSON.stringify(f)).toBe(before);
 }
 const legacy=guidedPARoyaltyLegacyBControl('browser'),beforeLegacy=JSON.stringify(legacy.state);const canonicalB=calculatePAOrdinaryReturn(legacy.input,legacy.facts,legacy.completion);expect(calculateFederalTax(legacy.input).agi.toFixed()).toBe('211000.5');expect(canonicalB.pa40.taxLiability.toFixed()).toBe('6478');expect(canonicalB.pa40.residentCredit.toFixed()).toBe('0');expect(canonicalB.pa40.stateWithholding.toFixed()).toBe('0');const raw=buildTaxInputFromGuidedData(legacy.state);if(!raw)throw Error('Required original');expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(raw),legacy.state)).toThrow(/histor|filed/i);expect(JSON.stringify(legacy.state)).toBe(beforeLegacy);
});
it('independent completion replay retains raw history without read-time refresh',()=>{const f=guidedPARoyaltyComplete('browser',true),before=JSON.stringify(f.completion);const result=buildGuidedPAOrdinaryReturnCompletionSources(f.input,f.completion,f.facts);expect(result.otherStateTaxes.refundedRoyaltySources).not.toHaveProperty('historicalExpenseCorrection');expect(JSON.stringify(f.completion)).toBe(before);f.historicalExpenseCorrection.currentFederalAGI='0';expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,f.completion,f.facts)).toThrow();});
it('independent canonical context rejects stale source and retained calculation',()=>{
 const f=guidedPARoyaltyComplete('browser',true),completion=buildGuidedPAOrdinaryReturnCompletionSources(f.input,f.completion,f.facts),input={...f.input,paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:completion};const result=calculateFederalTax(input);result.stateReturns={pennsylvania:calculatePAOrdinaryReturn(input,f.facts,completion)};const token=preparePARoyaltyReview(input);
 expect(()=>assertPARoyaltyReview(input,result,token)).not.toThrow();expect(()=>assertPARoyaltyReview(redactReviewIdentifiers(input),result,token)).not.toThrow();
 const changed=structuredClone(input);changed.form1099Misc[0].accountReference='Different actual private source';expect(()=>assertPARoyaltyReview(changed,result,token)).toThrow();
 const state=result.stateReturns.pennsylvania;if(!state)throw Error('Required state');state.pa40.netRentalIncome=state.pa40.netRentalIncome.plus(1);expect(()=>assertPARoyaltyReview(input,result,token)).toThrow();expect(()=>assertPARoyaltyReview(input,result,Object.freeze({}) as typeof token)).toThrow();
});
it('independent corrected workflow cannot erase both history records',()=>{const f=guidedPARoyaltyComplete('browser',true),filedBefore=JSON.stringify([f.refund.filedReturn,f.refund.agencyAward,f.refund.refund]);Reflect.deleteProperty(f.refund,'filedFederalHistory');Reflect.deleteProperty(f.refund,'historicalExpenseCorrection');expect(()=>buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund)).toThrow();expect(JSON.stringify([f.refund.filedReturn,f.refund.agencyAward,f.refund.refund])).toBe(filedBefore);});
