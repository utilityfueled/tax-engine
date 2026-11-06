// Spec: spec/federal/guided-source-capture-composition.yaml.
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {buildTaxInputFromGuidedData,captureGuidedRRTAPayrollSources,captureGuidedRefundRecoverySources} from '@/lib/guided-interview-bridge';
import {updateSectionData,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {rrtaParentValues} from '@/lib/guided-rrta-payroll-sources';
import {nativeRRTA} from './guided-rrta-fixture';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculateTaxableStateRefundRecoveries} from '@/engine/forms/taxable-state-refund-recoveries';
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction';
function need<T>(value:T|null|undefined):T{if(value==null)throw Error('Required fictional actual source');return value;}
function refund():GuidedFlowState{return JSON.parse(readFileSync('tests/fixtures/guided-tax-refund-payment-years.json','utf8'));}
function both():GuidedFlowState{const s=refund(),rrta=nativeRRTA();s.segmentation.lifeEvents=['additional-deductions'];s.sectionData['income-w2']=structuredClone(rrta.sectionData['income-w2']);s.sectionData['additional-deductions']=structuredClone(rrta.sectionData['additional-deductions']);return s;}
const government=(s:GuidedFlowState)=>need(s.sectionData['income-unemployment']);
const recovery=(s:GuidedFlowState)=>need(government(s).refundRecoveries);
const additional=(s:GuidedFlowState)=>need(s.sectionData['additional-deductions']);
const rrta=(s:GuidedFlowState)=>need(additional(s).rrtaPayrollSources);
function capture(s:GuidedFlowState,kind:'rrta'|'refund'):GuidedFlowState{
 const before=JSON.stringify(s);
 if(kind==='rrta'){
  const draft=captureGuidedRRTAPayrollSources(s);expect(JSON.stringify(s)).toBe(before);expect(draft.sourceFactsConfirmed).toBeNull();
  const next=updateSectionData(s,'additional-deductions',{...additional(s),rrtaPayrollSources:draft});
  return updateSectionData(next,'additional-deductions',{...additional(next),rrtaPayrollSources:{...rrta(next),sourceFactsConfirmed:true}});
 }
 const originals=captureGuidedRefundRecoverySources(s);expect(JSON.stringify(s)).toBe(before);
 const next=updateSectionData(s,'income-unemployment',{...government(s),refundRecoveries:{...recovery(s),...originals,sourceFactsConfirmed:null}});
 return updateSectionData(next,'income-unemployment',{...government(next),refundRecoveries:{...recovery(next),sourceFactsConfirmed:true}});
}
function complete(order:readonly('rrta'|'refund')[]=['rrta','refund']){let s=both();for(const kind of order)s=capture(s,kind);return s;}
it('captures both documentary collections in either order and requires both ordinary confirmations',()=>{
 for(const order of [['rrta','refund'],['refund','rrta']] as const){let s=both();expect(buildTaxInputFromGuidedData(s)).toBeNull();s=capture(s,order[0]);expect(buildTaxInputFromGuidedData(s)).toBeNull();s=capture(s,order[1]);expect(rrta(s).sourceFactsConfirmed).toBe(true);expect(recovery(s).sourceFactsConfirmed).toBe(true);expect(buildTaxInputFromGuidedData(s)).not.toBeNull();
 for(const kind of ['rrta','refund']as const){const missing=structuredClone(s);if(kind==='rrta')rrta(missing).sourceFactsConfirmed=null;else recovery(missing).sourceFactsConfirmed=null;expect(buildTaxInputFromGuidedData(missing)).toBeNull();}}
});
it('preserves RRTA currentness across refund-only custody and confirmation changes',()=>{
 let s=capture(both(),'rrta');const parent=rrtaParentValues(s),old=structuredClone(rrta(s).capturedOriginal);
 const originals=captureGuidedRefundRecoverySources(s);
 s=updateSectionData(s,'income-unemployment',{...government(s),refundRecoveries:{...recovery(s),...originals,sourceFactsConfirmed:null}});
 expect(rrtaParentValues(s)).toBe(parent);expect(rrta(s).sourceFactsConfirmed).toBe(true);expect(rrta(s).capturedOriginal).toEqual(old);
 s=updateSectionData(s,'income-unemployment',{...government(s),refundRecoveries:{...recovery(s),sourceFactsConfirmed:true}});
 expect(rrtaParentValues(s)).toBe(parent);expect(buildTaxInputFromGuidedData(s)).not.toBeNull();
});
it('recovers in either order after real source edits while forged confirmation stays denied',()=>{
 for(const order of [['rrta','refund'],['refund','rrta']]as const){const saved=complete(),oldRefund=structuredClone(recovery(saved).originalSources),oldRRTA=structuredClone(rrta(saved).capturedOriginal),edited=structuredClone(government(saved));need(need(need(edited.entries)[0].refundPaymentBasis).payments)[0].sourceReference+=' corrected';let s=updateSectionData(saved,'income-unemployment',edited);
 expect(recovery(s).sourceFactsConfirmed).toBeNull();expect(rrta(s).sourceFactsConfirmed).toBeNull();expect(recovery(s).originalSources).toEqual(oldRefund);expect(rrta(s).capturedOriginal).toEqual(oldRRTA);
 const forged=structuredClone(s);recovery(forged).sourceFactsConfirmed=true;rrta(forged).sourceFactsConfirmed=true;expect(buildTaxInputFromGuidedData(forged)).toBeNull();
 for(const kind of order)s=capture(s,kind);expect(buildTaxInputFromGuidedData(s)).not.toBeNull();expect(recovery(saved).originalSources).toEqual(oldRefund);expect(rrta(saved).capturedOriginal).toEqual(oldRRTA);}
});
it('denies invalid actual facts in either present collector without changing the input',()=>{
 const changes:Array<(s:GuidedFlowState)=>void>=[
 s=>{rrta(s).noCorrectionsConfirmed=null;},s=>{rrta(s).sources[0].owner='spouse';},s=>{rrta(s).sources[0].additionalMedicareTaxWithheld='';},
 s=>{need(recovery(s).years)[0].priorYearHadAMT=undefined;},s=>{need(recovery(s).years)[0].priorYearTaxableIncome='40001';},s=>{need(recovery(s).years)[0].priorYearPrimarySsn='999-88-7777';},
 s=>{need(need(need(government(s).entries)[0].refundPaymentBasis).payments)[3].currentYearStatePaymentConfirmed=null;},s=>{need(s.sectionData['state-return']).stateEstimatedPayments=[];},
 s=>{need(s.sectionData['personal-info']).dateOfBirth='';},s=>{need(need(s.sectionData['income-w2']).entries)[0].wages='';},s=>{s.taxYear=2026;},
 ];
 for(const change of changes){const s=both();change(s);const before=JSON.stringify(s);expect(()=>captureGuidedRRTAPayrollSources(s)).toThrow();expect(()=>captureGuidedRefundRecoverySources(s)).toThrow();expect(buildTaxInputFromGuidedData(s)).toBeNull();expect(JSON.stringify(s)).toBe(before);}
});
it('replays independent refund and RRTA literal outputs from the final combined input',()=>{
 for(const order of [['rrta','refund'],['refund','rrta']]as const)for(const reload of [false,true]){const original=complete(order),s=reload?JSON.parse(JSON.stringify(original))as GuidedFlowState:original,before=JSON.stringify(s),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s)),refundResult=calculateTaxableStateRefundRecoveries(input),result=calculateFederalTax(input);
 expect(input.rrtaPayrollSources?.originalTaxpayer).toStrictEqual(input.taxpayer);expect(input.taxableStateRefundRecoveries?.originalTaxpayer).toStrictEqual(input.taxpayer);expect(refundResult.taxableRefund.toFixed()).toBe('300');expect(refundResult.currentYearRefund.toFixed()).toBe('100');expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe('900');
 expect(result.form8959?.additionalMedicareTax.toFixed()).toBe('270');expect(result.form8959?.withholdingCredit.toFixed()).toBe('270');expect(result.form4137ByOwner?.primary?.line13.toFixed()??result.form4137?.line13.toFixed()).toBe('15');expect(result.totalWithholding.toFixed()).toBe('60270');expect(JSON.stringify(s)).toBe(before);}
});
it('preserves exact no-op JSON reload and unconfirmed originals across recovery',()=>{const s=complete(),before=JSON.stringify(s);let next=updateSectionData(s,'income-unemployment',structuredClone(government(s)));next=updateSectionData(next,'additional-deductions',structuredClone(additional(next)));expect(buildTaxInputFromGuidedData(next)).not.toBeNull();const restored=JSON.parse(JSON.stringify(next))as GuidedFlowState;expect(buildTaxInputFromGuidedData(restored)).not.toBeNull();expect(JSON.stringify(s)).toBe(before);recovery(restored).sourceFactsConfirmed=null;rrta(restored).sourceFactsConfirmed=null;expect(buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(restored)))).toBeNull();});
it('keeps exact zeros distinct from missing originals in the combined route',()=>{let s=both();need(government(s).entries)[0].stateOrLocalTaxRefund='0';rrta(s).sources[0].additionalMedicareTaxWithheld='0';s=capture(capture(s,'refund'),'rrta');const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s));expect(calculateTaxableStateRefundRecoveries(input).taxableRefund.toFixed()).toBe('0');expect(calculateFederalTax(input).form8959?.withholdingCredit.toFixed()).toBe('0');const blank=both();need(government(blank).entries)[0].stateOrLocalTaxRefund='';expect(()=>captureGuidedRRTAPayrollSources(blank)).toThrow();expect(()=>captureGuidedRefundRecoverySources(blank)).toThrow();});
it('does not omit actual lexical financial eligibility reference or owner values from RRTA parent',()=>{const state=both(),original=rrtaParentValues(state);const changes:Array<(s:GuidedFlowState)=>void>=[s=>{need(recovery(s).years)[0].priorYearStateLocalTaxesPaid='4000.00';},s=>{recovery(s).sourceReference+=' corrected';},s=>{need(recovery(s).years)[0].priorYearHadAMT=true;},s=>{need(recovery(s).years)[0].priorYearPrimarySsn='999-88-7777';},s=>{need(government(s).entries)[0].sourceFactsConfirmed=false;},s=>{need(government(s).entries)[0].accountReference+=' changed';}];for(const change of changes){const next=structuredClone(state);change(next);expect(rrtaParentValues(next)).not.toBe(original);}});
it('keeps independent RRTA and refund captures and absent-packet paths unchanged',()=>{let rrtaState=nativeRRTA();rrtaState=capture(rrtaState,'rrta');expect(buildTaxInputFromGuidedData(rrtaState)).not.toBeNull();let refundState=refund();refundState=capture(refundState,'refund');expect(buildTaxInputFromGuidedData(refundState)).not.toBeNull();const raw=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(refundState));expect(raw.rrtaPayrollSources).toBeUndefined();expect(raw.taxableStateRefundRecoveries).toBeDefined();});
it('documentary validation never persists another collection consent or custody',()=>{const s=both(),before=structuredClone(s);recovery(s).sourceFactsConfirmed=false;const falseBefore=structuredClone(s),payroll=captureGuidedRRTAPayrollSources(s);expect(s).toEqual(falseBefore);expect(payroll.sourceFactsConfirmed).toBeNull();expect(recovery(s).originalSources).toBeUndefined();expect(recovery(s).sourceFactsConfirmed).toBe(false);const originals=captureGuidedRefundRecoverySources(before);expect(before).toEqual(both());expect(rrta(before).capturedOriginal).toBeUndefined();expect(rrta(before).sourceFactsConfirmed).toBeNull();expect(Object.keys(originals).sort()).toEqual(['originalDraft','originalSources']);expect(buildTaxInputFromGuidedData(s)).toBeNull();});
it('retains both actual proof guards against forged saved originals or confirmation alone',()=>{for(const mutate of [(s:GuidedFlowState)=>{need(need(rrta(s).capturedOriginal).packet.sources)[0].sourceReference+=' forged';},(s:GuidedFlowState)=>{need(recovery(s).originalSources).taxpayer.primary.ssn='999-88-7777';},(s:GuidedFlowState)=>{need(recovery(s).originalSources).forms[0].stateOrLocalTaxRefund='401';},(s:GuidedFlowState)=>{delete rrta(s).capturedOriginal;},(s:GuidedFlowState)=>{delete recovery(s).originalDraft;}]){const s=complete();mutate(s);recovery(s).sourceFactsConfirmed=true;rrta(s).sourceFactsConfirmed=true;const before=JSON.stringify(s);expect(buildTaxInputFromGuidedData(s)).toBeNull();expect(JSON.stringify(s)).toBe(before);}});
it('preserves independent refund documentary capture of inconsistent history as ordinary-denied',()=>{const s=refund();need(recovery(s).years)[0].priorYearTaxableIncome='40001';expect(()=>captureGuidedRefundRecoverySources(s)).not.toThrow();Object.assign(recovery(s),captureGuidedRefundRecoverySources(s),{sourceFactsConfirmed:true});expect(buildTaxInputFromGuidedData(s)).toBeNull();});
it('replays both capture orders after payroll lexeme and historical-reference edits',()=>{for(const order of [['rrta','refund'],['refund','rrta']]as const){let s=complete();const old=structuredClone(rrta(s).capturedOriginal),w2=structuredClone(need(s.sectionData['income-w2']));w2.entries[0].wages='230000.00';s=updateSectionData(s,'income-w2',w2);expect(rrta(s).sourceFactsConfirmed).toBeNull();expect(rrta(s).capturedOriginal).toEqual(old);expect(buildTaxInputFromGuidedData(s)).toBeNull();expect(need(additional(s).tipIncomeAccounts)[0].sourceFactsConfirmed).toBeNull();const tipReview=structuredClone(additional(s));need(tipReview.tipIncomeAccounts)[0].sourceFactsConfirmed=true;s=updateSectionData(s,'additional-deductions',tipReview);for(const kind of order)s=capture(s,kind);expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s))).form8959?.additionalMedicareTax.toFixed()).toBe('270');const changed=structuredClone(government(s));need(need(changed.refundRecoveries).years)[0].sourceReference+=' corrected';s=updateSectionData(s,'income-unemployment',changed);expect(rrta(s).sourceFactsConfirmed).toBeNull();expect(recovery(s).sourceFactsConfirmed).toBeNull();for(const kind of order)s=capture(s,kind);expect(calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s))).taxableStateRefundRecoveries?.taxableRefund.toFixed()).toBe('300');}});
