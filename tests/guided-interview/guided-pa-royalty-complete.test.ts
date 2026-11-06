// Spec: spec/state/guided-pa-royalty-complete.yaml.
import {describe,expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {roundDollar} from '@/utils/decimal';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {buildGuidedPARoyaltyTaxRefundSources,confirmGuidedPARoyaltyTaxRefundSources} from '@/lib/guided-pa-royalty-tax-refund-sources';
import {guidedPARoyaltyComplete,guidedPARoyaltyLegacyBControl,rawGuidedPARoyaltyCohort} from '../fixtures/guided-pa-royalty-complete';
function requirePreview(f:ReturnType<typeof guidedPARoyaltyComplete>){const result=computeGuidedPreview(f.state);expect(result).not.toBeNull();return result;}
function expectAGI(p:ReturnType<typeof computeGuidedPreview>,raw:string,printed:string){
 expect(p?.agi).toBe(raw);if(!p)throw new Error('Actual preview required for raw/display AGI boundary');
 expect(roundDollar(new Decimal(p.agi)).toFixed()).toBe(printed);
}
function expectStateDenied(f:ReturnType<typeof guidedPARoyaltyComplete>){const preview=computeGuidedPreview(f.state);expect(preview).not.toBeNull();expect(preview?.state).toBeNull();}
function retainedRefund(f:ReturnType<typeof guidedPARoyaltyComplete>){const packet=f.state.sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources;if(!packet)throw new Error('Retained actual fictional MI source packet required');return packet;}
describe('Complete fictional guided PA royalty history',()=>{
 it('canonical reviewed B sources preserve original amounts at their engine boundary',()=>{
  for(const cohort of ['workspace','browser'] as const){const f=guidedPARoyaltyLegacyBControl(cohort),before=JSON.stringify(f),r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
   expectAGI(requirePreview(f),'211000.5','211001');expect(r.pa40.taxLiability.toFixed()).toBe('6478');expect(r.pa40.stateWithholding.toFixed()).toBe('0');expect(r.pa40.residentCredit.toFixed()).toBe('0');expect(r.readiness.filingEligible).toBe(false);expect(JSON.stringify(f)).toBe(before);}
 });
 it('legacy guided settlement without actual filed history remains unknown and denied',()=>{
  for(const cohort of ['workspace','browser'] as const){const f=guidedPARoyaltyLegacyBControl(cohort),before=JSON.stringify(f.state),raw=buildTaxInputFromGuidedData(f.state);if(!raw)throw new Error('Actual retained federal sources required');
   const packet=f.completion.otherStateTaxes.refundedRoyaltySources;
   expect(()=>buildGuidedPARoyaltyTaxRefundSources(f.input,f.facts,packet)).toThrow(/histor|filed/i);expect(()=>confirmGuidedPARoyaltyTaxRefundSources(f.input,f.facts,packet)).toThrow(/histor|filed/i);
   expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(raw),f.state)).toThrow(/histor|filed/i);expect(()=>confirmGuidedPAOrdinaryReturnCompletionSources(f.input,f.completion,f.facts)).toThrow(/histor|filed/i);
   expectStateDenied(f);expect(JSON.stringify(f.state)).toBe(before);}
 });
 it('complete workspace originals preserve initial federal and PA amounts',()=>{
  const f=guidedPARoyaltyComplete('workspace'),p=requirePreview(f);
  expect(f.input.w2s[0]).toMatchObject({wages:'200000',socialSecurityWages:'0',socialSecurityWithheld:'0',medicareWages:'0',medicareWithheld:'0'});
  expect(f.input.form1099Misc[0]).toMatchObject({royalties:'12000.25',federalWithheld:'100.10',stateIncome:'12000.25',stateWithheld:'80.20',state:'MI'});
  expectAGI(p,'211000.5','211001');expect(p?.state?.stateTax).toBe('6478');expect(p?.state?.stateWithholding).toBe('0');
 });
 it('complete browser originals preserve initial federal and PA amounts',()=>{
  const f=guidedPARoyaltyComplete('browser'),p=requirePreview(f);
  expect(f.input.w2s[0]).toMatchObject({wages:'200000',socialSecurityWages:'176100',socialSecurityWithheld:'10918.20',medicareWages:'200000',medicareWithheld:'2900'});
  expectAGI(p,'211000.5','211001');expect(p?.state?.stateTax).toBe('6478');expect(p?.state?.stateWithholding).toBe('0');
 });
 it('explicit correction records preserve historical MI filing and corrected PA amounts',()=>{
  const initial=guidedPARoyaltyComplete('browser'),f=guidedPARoyaltyComplete('browser',true),p=requirePreview(f);
  expect(f.refund.filedReturn).toEqual(initial.refund.filedReturn);expect(f.refund.writtenClaim).toEqual(initial.refund.writtenClaim);expect(f.refund.agencyAward).toEqual(initial.refund.agencyAward);expect(f.refund.refund).toEqual(initial.refund.refund);
  expect(f.filedFederalHistory.filedFederalAGI).toBe('211001');expect(f.filedFederalHistory.originalGuidedPropertySources.properties[0].expenses[0].amountPaid).toBe('49.25');
  expect(f.historicalExpenseCorrection).toMatchObject({originalFiledFederalAGI:'211001',currentFederalAGI:'210901',actualAdditionalExpense:'100',michiganTaxableIncomeEffect:'0',michiganTaxEffect:'0'});
  expectAGI(p,'210900.5','210901');expect(p?.state?.stateTax).toBe('6475');expect(p?.state?.stateWithholding).toBe('0');
 });
 it('old raw royalty sources remain an incomplete state-return negative',()=>{
  for(const cohort of ['workspace','browser'] as const){const state=rawGuidedPARoyaltyCohort(cohort),before=JSON.stringify(state),p=computeGuidedPreview(state);expect(p).not.toBeNull();expectAGI(p,'211000.5','211001');expect(p?.state).toBeNull();expect(JSON.stringify(state)).toBe(before);}
 });
 it('preview reads never refresh privately retained history or originals',()=>{
  for(const corrected of [false,true]){const f=guidedPARoyaltyComplete('workspace',corrected),before=JSON.stringify(f.state),raw=buildTaxInputFromGuidedData(f.state);if(!raw)throw new Error('Actual fictional current input required');
   const current=buildGuidedStateOriginals(TaxYearInputSchema.parse(raw),f.state);
   const {filedFederalHistory:_h,historicalExpenseCorrection:_c,...strictSettlement}=f.refund;
   expect(current.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources).toEqual(strictSettlement);
   expect(f.state.sectionData['state-return']?.paOrdinaryReturnCompletionSources?.otherStateTaxes.refundedRoyaltySources).toEqual(f.refund);
   expect(f.refund.filedFederalHistory).toEqual(f.filedFederalHistory);if(corrected)expect(f.refund.historicalExpenseCorrection).toEqual(f.historicalExpenseCorrection);
   expect(requirePreview(f)?.state?.stateTax).toBe(corrected?'6475':'6478');expect(JSON.stringify(f.state)).toBe(before);}
 });
 it('editing a legal receipt never silently refreshes current source snapshots',()=>{
  const f=guidedPARoyaltyComplete('browser'),royalty=f.state.sectionData['income-royalties'];if(!royalty)throw new Error('Actual fictional royalty original required');
  const before=JSON.stringify(f.state.sectionData['state-return']);royalty.properties[0].expenses[0].amountPaid='149.25';
  expectStateDenied(f);expect(JSON.stringify(f.state.sectionData['state-return'])).toBe(before);expect(f.refund.filedReturn.refundRequested).toBe('80');
 });
 it('corrected current sources cannot omit historical expense reconciliation',()=>{
  const f=guidedPARoyaltyComplete('browser',true),packet=retainedRefund(f);
  Reflect.deleteProperty(packet,'historicalExpenseCorrection');expectStateDenied(f);
 });
 it('contradictory Michigan correction effect is denied',()=>{
  const f=guidedPARoyaltyComplete('browser',true);f.historicalExpenseCorrection.michiganTaxableIncomeEffect='1';
  // Mutate the separately retained packet, not a disconnected helper result.
  Reflect.set(retainedRefund(f),'historicalExpenseCorrection',f.historicalExpenseCorrection);expectStateDenied(f);
 });
 it('stale correction expense originals are denied',()=>{
  const f=guidedPARoyaltyComplete('browser',true);f.historicalExpenseCorrection.correctedLegalReceipt.amountPaid='148.25';Reflect.set(retainedRefund(f),'historicalExpenseCorrection',f.historicalExpenseCorrection);expectStateDenied(f);
 });
 it('current amounts cannot overwrite historical filed figures',()=>{
  const f=guidedPARoyaltyComplete('browser',true);f.filedFederalHistory.filedFederalAGI='210901';Reflect.set(retainedRefund(f),'filedFederalHistory',f.filedFederalHistory);expectStateDenied(f);
 });
});
