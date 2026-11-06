import {calculateFederalTax} from '@/engine/federal';
import {preparePAOrdinaryReturnReview,assertPAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
// Spec: spec/state/pa-oid-pending-oh-account.yaml.
import {describe,it,expect} from 'vitest';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {originalOIDPendingCompleteFixture,originalOIDGuidedState} from '../fixtures/guided-pa-oid-original-complete';

describe('actual pending Ohio OID original-cohort composition',()=>{
 it('complete original OID cohort reaches the existing preview without changing its original amounts',()=>{
  const f=originalOIDPendingCompleteFixture(),before=JSON.stringify(f.state),oid=f.input.form1099OID[0];
  expect(oid).toMatchObject({payer:'Synthetic bond broker',sourceId:'synthetic-obligation-a',taxYear:2025,originalIssueDiscount:'100.10',otherPeriodicInterest:'20.20'});expect(oid.payerTin).toBeUndefined();
  expect(oid.stateWithholding).toEqual([{state:'PA',statePayerId:'pa-id',stateWithheld:'0.10'},{state:'OH',statePayerId:'',stateWithheld:'0.20'}]);
  expect(f.input.w2s).toEqual([]);expect(computeGuidedPreview(f.state)?.state?.stateWithholding).toBe('0');
  const result=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);expect(result.pa40.residentCredit.toFixed()).toBe('0');expect(result.pa40.taxLiability.toFixed()).toBe('4');expect(result.scheduleSP.taxForgivenessCredit.toFixed()).toBe('4');expect(result.refundDisposition.refund.toFixed()).toBe('0');
  expect(JSON.stringify(f.state)).toBe(before);
 });
 it('the original incomplete guided cohort stays incomplete',()=>{const state=originalOIDGuidedState();expect(buildTaxInputFromGuidedData(state)).not.toBeNull();expect(computeGuidedPreview(state)?.state).toBeNull();});
 it.each(['none_paid','eraseCash','missingPacket','sameMoneyHistory','staleOriginal'] as const)('completion cannot erase pending Ohio cash or downgrade source proof %s',kind=>{
  const f=originalOIDPendingCompleteFixture();if(kind==='none_paid')f.completion.otherStateTaxes.status='none_paid';
  if(kind==='eraseCash')f.completion.otherStateTaxes.jurisdictions[0].taxPaid='0';
  if(kind==='missingPacket')Reflect.deleteProperty(f.completion.otherStateTaxes,'pendingOIDOHSources');
  if(kind==='sameMoneyHistory')f.account.filedReturn.originalFederalSources={...f.account.filedReturn.originalFederalSources,form1099OID:[{...f.input.form1099OID[0],sourceId:'different historical original'}]};
  if(kind==='staleOriginal')f.input.form1099OID[0].sourceId='new same-dollar original';
  expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow();
 });
});

function preparedOriginal(){const f=originalOIDPendingCompleteFixture(),ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.completion),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};return{...f,ordinary,result};}
it('prepared original context retains actual pending cash and permits its redacted rendering input',()=>{
 const f=preparedOriginal(),before=JSON.stringify(f.input),token=preparePAOrdinaryReturnReview(f.input);
 expect(f.ordinary.pendingOIDOHAccount?.actualNetRemittances.toFixed(2)).toBe('0.20');expect(f.ordinary.pendingOIDOHAccount?.actualRefundsReceived.toFixed()).toBe('0');
 expect(assertPAOrdinaryReturnReview(f.input,f.result,token)).toMatchObject({requestedRefund:'0',nextYearCredit:'0'});
 expect(assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),f.result,token)).toMatchObject({requestedRefund:'0',nextYearCredit:'0'});
 expect(JSON.stringify(f.input)).toBe(before);
});
it.each(['owner','payer','reference','history']as const)('prepared original context rejects equal-money source change %s',kind=>{
 const f=preparedOriginal(),token=preparePAOrdinaryReturnReview(f.input);
 if(kind==='owner')f.input.taxpayer.primary.ssn='222-33-4444';if(kind==='payer')f.input.form1099OID[0].payer+=' different actual payer';if(kind==='reference')f.account.sourceReference+=' changed private source';if(kind==='history')f.account.filedReturn.originalFederalSources={...f.account.filedReturn.originalFederalSources,form1099OID:[{...f.input.form1099OID[0],otherPeriodicInterest:'20.21'}]};
 expect(()=>assertPAOrdinaryReturnReview(f.input,f.result,token)).toThrow();
});
it('fresh original context rejects the retained equal-money old result',()=>{
 const f=preparedOriginal();f.account.sourceReference+=' actual alternate document reference';
 const fresh=preparePAOrdinaryReturnReview(f.input);expect(()=>assertPAOrdinaryReturnReview(f.input,f.result,fresh)).toThrow(/result|reconcile/);
});
