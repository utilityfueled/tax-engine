// Spec: spec/state/guided-state-routing-source-successor.yaml; explicit source literals.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildGuidedStateOriginals,buildGuidedOhioOverlay,buildGuidedPennsylvaniaOverrides} from '@/lib/guided-state-engine-inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {calculateOhioScheduleOfWithholding} from '@/engine/state/oh-schedule-of-withholding';
import {buildOhioPaymentSource} from '@/engine/state/oh-payment-source';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {completeTreasuryRouting,originalIncompleteTreasury} from '../fixtures/guided-state-routing-complete';
import {emptyDeductionData} from '@/lib/guided-interview-flow';
function required<T>(value:T|null|undefined):T{if(value===undefined||value===null)throw Error('Explicit fictional current source required');return value;}
function current(state:ReturnType<typeof originalIncompleteTreasury>){return buildGuidedStateOriginals(TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),state);}
it('complete source routing preserves PA Treasury tax and reported payments',()=>{
 const {state}=completeTreasuryRouting('PA'),before=structuredClone(state);
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1842',stateRefund:'158',stateAmountOwed:'0',stateWithholding:'2000'});
 expect(state).toEqual(before);
});
it('complete source routing compares independently confirmed Ohio Treasury variants',()=>{
 const {state}=completeTreasuryRouting('OH'),without=completeTreasuryRouting('OH',false);
 expect(computeGuidedPreview(state)?.totalIncome).toBe('61000');
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1217',stateRefund:'783',stateWithholding:'2000'});
 expect(computeGuidedPreview(without.state)?.totalIncome).toBe('60000');
 expect(computeGuidedPreview(without.state)?.state?.stateTax).toBe('1217');
});
it('old incomplete routing sources remain federal positives and canonical state negatives',()=>{
 for(const code of ['PA','OH']as const){const state=originalIncompleteTreasury(code),before=structuredClone(state);expect(buildTaxInputFromGuidedData(state)).not.toBeNull();expect(computeGuidedPreview(state)?.totalIncome).toBe('61000');expect(computeGuidedPreview(state)?.state).toBeNull();expect(state).toEqual(before);}
});
it('complete routing retains raw payment cents and separately reported canonical lines',()=>{
 for(const code of ['PA','OH']as const){
  const {state}=completeTreasuryRouting(code,true,true),input=current(state),before=structuredClone(state);
  expect(input.w2s[0]?.wages).toBe('60000');expect(input.w2s[0]?.stateTaxWithheld).toBe('2000');expect(input.form1099OID[0]?.treasuryOID).toBe('1000');
  expect(input.form1099OID[0]?.stateWithholding?.[0]?.stateWithheld).toBe('0.10');expect(input.form1099Misc[0]?.payer).toBe('Separate actual payer');expect(input.form1099Misc[0]?.stateWithheld).toBe('0.20');
  expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('2000');
  if(code==='PA'){
   const raw=calculatePAOrdinaryReturnFacts(input,input.paOrdinaryReturnFacts),result=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources);
   expect(raw.paWithholding.toFixed()).toBe('2000.3');expect(raw.estimatedPayments.toFixed()).toBe('0.3');
   expect(result.pa40.stateWithholding.toFixed()).toBe('2000');expect(result.pa40.estimatedPayments.toFixed()).toBe('0');expect(result.pa40.netOverpayment.toFixed()).toBe('158');
  }else{
   const raw=calculateOhioScheduleOfWithholding({w2s:input.w2s,w2SourceContext:input,form1099OIDs:input.form1099OID,form1099Miscs:input.form1099Misc}),payments=buildOhioPaymentSource(input,input.ohioPayments);
   expect(raw.line1_w2OhioWithholding.toFixed()).toBe('2000');expect(raw.line5f_1099OIDOhioWithholding.toFixed()).toBe('0.1');expect(raw.line5b_1099MiscOhioWithholding.toFixed()).toBe('0.2');
   expect(raw.line6_totalOhioWithholding.toFixed()).toBe('2000.3');expect(payments.estimatedPayments.toFixed()).toBe('0.3');expect(new Decimal(raw.line6_totalOhioWithholding).plus(payments.estimatedPayments).toFixed()).toBe('2000.6');
   const adapted=buildOhioResidentReturnInput(input,calculateFederalTax(input));expect(new Decimal(required(adapted.ohioWithholding)).toFixed()).toBe('2000');expect(new Decimal(required(adapted.estimatedPayments)).toFixed()).toBe('0');
   expect(computeGuidedPreview(state)?.state?.stateRefund).toBe('783');
  }
  expect(state).toEqual(before);
 }
});
it('legacy routing adapter arithmetic retains original PA and OH literal controls',()=>{
 // The old direct adapter API is intentionally separate from current canonical qualification.
 for(const code of ['PA','OH']as const){
  const state=originalIncompleteTreasury(code),source=required(state.sectionData['income-investments']?.oidEntries?.[0]);source.stateTaxReporting='single';source.stateWithholding=[{state:code,statePayerId:'actual-id',stateWithheld:'0.10'}];
  state.sectionData.deductions={...emptyDeductionData,nonW2IncomeTaxesDeductedElsewhere:'0'};
  const input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state)));
  state.sectionData['state-return']={additionalStateWithholding:'0.20',additionalStateWithholdingEntries:[{payer:'Separate actual payer',documentType:'1099-MISC',state:code,taxYear:'2025',amount:'0.20'}],stateEstimatedPayments:[{state:code,date:'2025-04-15',amount:'0.30'}]};
  if (code === "OH") expect(buildGuidedOhioOverlay(input, state, calculateFederalTax(input).taxExemptInterest)).toMatchObject({ ohioWithholdingOverride: "2000.3", estimatedPayments: "0.3" });
  else {
    const result = calculatePAReturn(input, buildGuidedPennsylvaniaOverrides(state));
    expect(result.stateWithholding.toFixed()).toBe("2000.3");
    expect(result.pa40.stateWithholding.toFixed()).toBe("2000");
    expect(buildGuidedPennsylvaniaOverrides(state).estimatedPayments?.toFixed()).toBe("0.3");
    expect(result.pa40.estimatedPayments.toFixed()).toBe("0");
    expect(result.pa40.netOverpayment.toFixed()).toBe("158");
  }
 }
});
it('clearing a retained Treasury original cannot refresh either state packet on read',()=>{
 for(const code of ['PA','OH']as const){const {state}=completeTreasuryRouting(code);state.sectionData['income-investments']={interestEntries:[],dividendEntries:[],brokerageEntries:[],oidEntries:[]};const before=structuredClone(state);expect(buildTaxInputFromGuidedData(state)).not.toBeNull();expect(computeGuidedPreview(state)?.state).toBeNull();expect(state).toEqual(before);}
});
it('saved routing ledger changes require exact actual remittance and receipt reconciliation',()=>{
 for(const code of ['PA','OH']as const){
  const {state}=completeTreasuryRouting(code,true,true);required(required(state.sectionData['state-return']).stateEstimatedPayments[0]).amount='0.31';expect(()=>current(state)).toThrow(code==='PA'?/current originals differ from confirmed snapshot/:/Actual Ohio original sources are missing or stale; explicitly reconfirm current owner, year and federal originals\./);
  const second=completeTreasuryRouting(code,true,true).state;required(required(second.sectionData['state-return']).additionalStateWithholdingEntries?.[0]).amount='0.21';required(second.sectionData['state-return']).additionalStateWithholding='0.21';const secondBefore=structuredClone(second);expect(()=>{const input=current(second);if(code==='OH')buildGuidedOhioOverlay(input,second,calculateFederalTax(input).taxExemptInterest);}).toThrow(/Actual zero-income MISC original-claim reconciliation: saved claim is unmatched ambiguous or already assigned/);expect(computeGuidedPreview(second)?.state).toBeNull();expect(second).toEqual(secondBefore);
 }
});
it('complete Ohio source routing rejects free payment overrides',()=>{
 const {state}=completeTreasuryRouting('OH',true,true),input=current(state),federal=calculateFederalTax(input),overlay=buildGuidedOhioOverlay(input,state,federal.taxExemptInterest);
 expect(overlay.ohioWithholdingOverride).toBeUndefined();expect(overlay.estimatedPayments).toBeUndefined();
 expect(()=>buildOhioResidentReturnInput(input,federal,{ohioWithholdingOverride:'2000.3'})).toThrow(/overrides/i);
 expect(()=>buildOhioResidentReturnInput(input,federal,{estimatedPayments:'0.3'})).toThrow(/overrides/i);
});
