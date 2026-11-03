// Spec: spec/state/guided-pa-royalty-history-guards.yaml.
import {expect,it} from 'vitest';
import {buildGuidedPARoyaltyTaxRefundSources,confirmGuidedPARoyaltyTaxRefundSources} from '@/lib/guided-pa-royalty-tax-refund-sources';
import {guidedPARoyaltyComplete} from '../fixtures/guided-pa-royalty-complete';
it('projects exact canonical settlement only after validating retained history',()=>{
 for(const corrected of [false,true]){const f=guidedPARoyaltyComplete('browser',corrected),before=JSON.stringify(f.refund),{filedFederalHistory:_h,historicalExpenseCorrection:_c,...canonical}=f.refund;
  expect(buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund)).toEqual(canonical);expect(JSON.stringify(f.refund)).toBe(before);}
});
const mutations:[string,(f:ReturnType<typeof guidedPARoyaltyComplete>)=>void][]=[
 ['unknown-history-confirmation',f=>{f.refund.filedFederalHistory.sourceFactsConfirmed=null as unknown as boolean;}],
 ['missing-history-reference',f=>{f.refund.filedFederalHistory.sourceReference='';}],
 ['wrong-owner',f=>{f.refund.filedFederalHistory.owner.ssn='999-77-0001';}],
 ['wrong-year',f=>{f.refund.filedFederalHistory.sourceTaxYear=2024;}],
 ['wrong-filed-AGI',f=>{f.refund.filedFederalHistory.filedFederalAGI='210901';}],
 ['changed-historical-original',f=>{const originals=f.refund.filedFederalHistory.originalFederalSources;const rows=originals.form1099Misc as Array<{royalties:string}>;rows[0].royalties='12001.25';}],
 ['changed-historical-wages',f=>{const originals=f.refund.filedFederalHistory.originalFederalSources;const rows=originals.w2s as Array<{wages:string}>;rows[0].wages='200001';}],
 ['unbound-guided-old-receipt',f=>{f.refund.filedFederalHistory.originalGuidedPropertySources.properties[0].expenses[0].amountPaid='48.25';}],
 ['missing-correction',f=>{Reflect.deleteProperty(f.refund,'historicalExpenseCorrection');}],
 ['wrong-current-AGI',f=>{f.historicalExpenseCorrection.currentFederalAGI='210900';}],
 ['wrong-delta',f=>{f.historicalExpenseCorrection.actualAdditionalExpense='99';}],
 ['stale-current-receipt',f=>{f.historicalExpenseCorrection.correctedLegalReceipt.amountPaid='148.25';}],
 ['stale-old-receipt',f=>{f.historicalExpenseCorrection.originalLegalReceipt.amountPaid='48.25';}],
 ['changed-economic-use',f=>{f.historicalExpenseCorrection.currentCopyrightUse.publicationOriginState='MI';}],
 ['unknown-complete-review',f=>{f.historicalExpenseCorrection.allOriginalAndCorrectedIncomeExpensesAndUsesReviewedConfirmed=null as unknown as boolean;}],
 ['positive-MI-effect',f=>{f.historicalExpenseCorrection.michiganTaxableIncomeEffect='1';}],
 ['unknown-no-amendment-review',f=>{f.historicalExpenseCorrection.amendmentReview.noMichiganAmendmentRequiredConfirmed=null as unknown as boolean;}],
 ['future-review',f=>{f.historicalExpenseCorrection.reviewedOn='2026-03-21';}],
 ['unresolved-review-account',f=>{f.historicalExpenseCorrection.completeAccountAfterReview.overpaymentOutstandingReported='0.20';}],
 ['extra-unvalidated-field',f=>{Reflect.set(f.refund,'inventedSourceOverride',true);}],
];
it.each(mutations)('rejects contradictory or incomplete actual history: %s',(_label,mutate)=>{
 const f=guidedPARoyaltyComplete('browser',true);mutate(f);expect(()=>buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,f.refund)).toThrow();
});
it('explicit confirmation preserves filed and correction originals',()=>{
 const f=guidedPARoyaltyComplete('browser',true),draft={...f.refund,sourceFactsConfirmed:null,originalFederalSources:{},originalPAResidencySources:{},originalPAFacts:{}},before=JSON.stringify(draft);
 const confirmed=confirmGuidedPARoyaltyTaxRefundSources(f.input,f.facts,draft);expect(confirmed.sourceFactsConfirmed).toBe(true);expect(confirmed.filedReturn).toEqual(f.refund.filedReturn);expect(confirmed.filedFederalHistory).toEqual(f.refund.filedFederalHistory);expect(confirmed.historicalExpenseCorrection).toEqual(f.refund.historicalExpenseCorrection);expect(JSON.stringify(draft)).toBe(before);
});
it('read never supplies an unknown confirmation',()=>{
 const f=guidedPARoyaltyComplete('browser',true),raw={...f.refund,sourceFactsConfirmed:null},before=JSON.stringify(raw);expect(()=>buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,raw)).toThrow();expect(JSON.stringify(raw)).toBe(before);
});
