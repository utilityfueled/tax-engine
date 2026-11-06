import {retirementFactErrors} from '@/lib/guided-retirement-facts';
import Decimal from 'decimal.js';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {confirmZeroIncomeMiscSource} from '@/lib/guided-zero-income-misc-sources';
import {reconcileGuidedZeroIncomeMiscWithholding} from '@/lib/guided-zero-income-misc-withholding-reconciliation';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {fictionalMiscOriginal} from '../fixtures/guided-zero-income-misc';
import {guidedPARetirementSourceFixture} from '../fixtures/guided-pa-bridge-complete';
import {paOrdinaryOIDFixture} from '../fixtures/pa-ordinary-oid-sources';
// Spec: spec/state/guided-zero-income-misc-withholding-reconciliation.yaml
import {expect,it} from 'vitest';
import {completeTreasuryRouting} from '../fixtures/guided-state-routing-complete';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
function complete(code:'PA'|'OH'){return completeTreasuryRouting(code,true,true).state;}
it('saved MISC claims reconcile actual originals once in both state previews',()=>{
 for(const code of ['PA','OH']as const){const state=complete(code),before=structuredClone(state);
  expect(computeGuidedPreview(state)?.state,code).toMatchObject({stateTax:code==='PA'?'1842':'1217',stateRefund:code==='PA'?'158':'783',stateAmountOwed:'0',stateWithholding:'2000'});
  expect(state).toEqual(before);
 }
});
it('missing original and missing source proof retain current source guards',()=>{
 for(const code of ['PA','OH']as const)for(const missing of ['original','proof']){const state=complete(code),data=state.sectionData['state-return'];if(!data)throw Error('Complete fictional original packets required');
  if(missing==='original')data.zeroIncomeMiscSources=[];
  else if(code==='PA'){const row=data.paResidencySources?.oidAndMiscSources?.miscWithholding[0];if(!row)throw Error('Actual fictional PA original proof required');row.withholdingConfirmation.actualPaymentToPAConfirmed=null;}
  else{if(!data.ohioPayments)throw Error('Actual fictional OH payment packet required');data.ohioPayments.sourceFactsConfirmed=null;}
  const before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null).toBeNull();expect(state).toEqual(before);
 }
});
it('unmatched and duplicate saved claims cannot invent another original',()=>{
 for(const code of ['PA','OH']as const)for(const kind of ['payer','state','year','amount','duplicate']){const state=complete(code),data=state.sectionData['state-return'],row=data?.additionalStateWithholdingEntries?.[0];if(!data||!row)throw Error('Actual fictional retained MISC claim required');
  if(kind==='payer')row.payer='Another actual payer';else if(kind==='state')row.state=code==='PA'?'OH':'PA';else if(kind==='year')row.taxYear='2024';else if(kind==='amount'){row.amount='0.21';data.additionalStateWithholding='0.21';}else{data.additionalStateWithholdingEntries?.push(structuredClone(row));data.additionalStateWithholding='0.40';}
  const before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null,kind).toBeNull();expect(state).toEqual(before);
 }
});
it('equal-dollar actual remittance edits remain stale and private',()=>{
 for(const code of ['PA','OH']as const){const state=complete(code),row=state.sectionData['state-return']?.zeroIncomeMiscSources?.[0];if(!row)throw Error('Actual fictional original source required');row.remittance.confirmationNumber='Equal money distinct private remittance';const before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null).toBeNull();expect(state).toEqual(before);}
});

it('saved Ohio MISC claim independently reconciles actual original once',()=>{
 const state=complete('OH'),before=structuredClone(state),sources=state.sectionData['state-return'];
 expect(sources?.zeroIncomeMiscSources?.[0].stateWithheld).toBe('0.20');
 expect(sources?.additionalStateWithholdingEntries).toEqual([{payer:'Separate actual payer',documentType:'1099-MISC',state:'OH',taxYear:'2025',amount:'0.20'}]);
 expect(sources?.ohioPayments?.paymentRows[0].amount).toBe('0.30');
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1217',stateRefund:'783',stateAmountOwed:'0',stateWithholding:'2000'});
 expect(state).toEqual(before);
});

/** Explicit fictional additional current originals precede fresh confirmation actions. */
function currentInput(state:ReturnType<typeof complete>){const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Actual current original builder required');return TaxYearInputSchema.parse(raw);}
function refreshKnownSources(state:ReturnType<typeof complete>,refund:string){
 const data=state.sectionData['state-return'];if(!data)throw Error('Explicit actual source records required');const input=currentInput(state);
 if(state.segmentation.stateCode==='PA'){
  const old=data.paResidencySources,facts=data.paOrdinaryReturnFacts,completion=data.paOrdinaryReturnCompletionSources;if(!old||!facts||!completion)throw Error('Existing fictional PA records required');
  const template=paOrdinaryOIDFixture(),owner={accountHolder:'primary' as const,originalTaxpayer:{firstName:input.taxpayer.primary.firstName,lastName:input.taxpayer.primary.lastName,ssn:input.taxpayer.primary.ssn}};
  const sources={...(old.oidAndMiscSources??template.oidAndMiscSources),owner,oid:old.oidAndMiscSources?.oid??[],miscWithholding:input.form1099Misc.map((original,index)=>({...template.oidAndMiscSources.miscWithholding[0],originalIndex:index,sourceReference:'Fictional distinct current MISC original '+String(index),original:structuredClone(original),withholdingConfirmation:{sourceReference:'Fictional current actual PA payer remittance record '+String(index),actualPaymentToPAConfirmed:true,notRefundedByPayerConfirmed:true}}))};
  const residency=confirmGuidedPAResidencySources(input,{...old,oidAndMiscSources:sources}),current={...input,paResidencySources:residency};
  const ordinary=confirmGuidedPAOrdinaryReturnFacts(current,{...facts,disposition:{...facts.disposition,refundRequested:refund}});
  const final=confirmGuidedPAOrdinaryReturnCompletionSources(current,completion,ordinary);
  Object.assign(data,{paResidencySources:residency,paOrdinaryReturnFacts:ordinary,paOrdinaryReturnCompletionSources:final});
 }else{
  data.ohioResidency=confirmGuidedOhioResidencyFacts(input,data.ohioResidency);
  data.ohioPayments=confirmGuidedOhioPaymentFacts(input,data.ohioPayments);
 }
 return state;
}
it('canonical MISC identity changes cannot qualify retained saved claims',()=>{
 for(const code of ['PA','OH']as const)for(const field of ['sourceId','taxYear','payerTin','accountReference','accountHolder']as const){const state=complete(code),input=buildGuidedStateOriginals(currentInput(state),state),original=input.form1099Misc[0];
  if(field==='taxYear')original.taxYear=2024;else if(field==='accountHolder')original.accountHolder='spouse';else original[field]='Changed actual canonical identity';
  expect(()=>reconcileGuidedZeroIncomeMiscWithholding(input,state,code),field).toThrow();
 }
});
it('distinct complete same-payer originals cannot be selected by source order',()=>{
 for(const code of ['PA','OH']as const){const state=complete(code),data=state.sectionData['state-return'];if(!data?.zeroIncomeMiscSources)throw Error('Actual original rows required');
  const second=fictionalMiscOriginal(code);Object.assign(second,{sourceId:'Fictional-second-distinct-MISC',accountReference:'Fictional distinct source account B'});Object.assign(second.remittance,{accountReference:'Fictional distinct source account B',confirmationNumber:'Fictional distinct remittance B'});
  data.zeroIncomeMiscSources.push(confirmZeroIncomeMiscSource(second,2025,'single'));
  refreshKnownSources(state,'159');const before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null).toBeNull();expect(state).toEqual(before);
 }
});
it('mixed actual PA pension and MISC claims reconcile once without replacing either source',()=>{
 const f=guidedPARetirementSourceFixture(),state=f.state,data=state.sectionData['state-return'];if(!data)throw Error('Actual Jane pension source records required');
 const misc=fictionalMiscOriginal('PA');Object.assign(misc,{recipientFirstName:'Jane',recipientLastName:'Doe'});
 data.zeroIncomeMiscSources=[confirmZeroIncomeMiscSource(misc,2025,'single')];
 data.additionalStateWithholdingEntries=[...(data.additionalStateWithholdingEntries??[]),{payer:'Separate actual payer',documentType:'1099-MISC',state:'PA',taxYear:'2025',amount:'0.20'}];data.additionalStateWithholding='500.20';
 refreshKnownSources(state,'658');const before=structuredClone(state);
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1842',stateWithholding:'2500',stateRefund:'658',stateAmountOwed:'0'});
 expect(data.additionalStateWithholding).toBe('500.20');expect(state).toEqual(before);
});
it('unsupported positive saved source types remain outside finite MISC reconciliation',()=>{
 for(const code of ['PA','OH']as const)for(const type of ['1099-G','1099-INT']as const){const state=complete(code),row=state.sectionData['state-return']?.additionalStateWithholdingEntries?.[0];if(!row)throw Error('Actual saved claim required');row.documentType=type;expect(computeGuidedPreview(state)?.state??null).toBeNull();}
 const state=complete('OH'),row=state.sectionData['state-return']?.additionalStateWithholdingEntries?.[0];if(!row)throw Error('Actual saved claim required');row.documentType='1099-R';expect(computeGuidedPreview(state)?.state??null).toBeNull();
});
it('finite matching reports an existing index and exact public Decimal without adding cash',()=>{
 for(const code of ['PA','OH']as const){const state=complete(code),input=buildGuidedStateOriginals(currentInput(state),state),before=JSON.stringify({input,state}),result=reconcileGuidedZeroIncomeMiscWithholding(input,state,code);
  expect(result.matchedOriginalIndices).toEqual([0]);expect(result.matchedAmount.toFixed()).toBe('0.2');expect(result.matchedAmount.constructor).toBe(Decimal);expect(JSON.stringify({input,state})).toBe(before);
 }
});

function mixedOriginalState(){
 const state=guidedPARetirementSourceFixture().state,data=state.sectionData['state-return'];if(!data)throw Error('Explicit Jane pension records required');
 const misc=fictionalMiscOriginal('PA');Object.assign(misc,{recipientFirstName:'Jane',recipientLastName:'Doe'});data.zeroIncomeMiscSources=[confirmZeroIncomeMiscSource(misc,2025,'single')];
 data.additionalStateWithholdingEntries=[...(data.additionalStateWithholdingEntries??[]),{payer:'Separate actual payer',documentType:'1099-MISC',state:'PA',taxYear:'2025',amount:'0.20'}];data.additionalStateWithholding='500.20';return state;
}
it('earlier retirement validation separates actual mixed source claims without changing their total',()=>{
 const state=mixedOriginalState(),before=structuredClone(state),errors=retirementFactErrors(state.sectionData['income-retirement']?.entries,true,state.segmentation.filingStatus,state.taxYear,state.sectionData['state-return'],{personal:state.sectionData['personal-info'],adjustments:state.sectionData.adjustments});
 expect(errors).toEqual({});expect(state.sectionData['state-return']?.additionalStateWithholding).toBe('500.20');expect(state).toEqual(before);
});
it('earlier mixed retirement validation preserves unsupported and missing original denials',()=>{
 for(const kind of ['1099-G','1099-INT','missing','edited']as const){const state=mixedOriginalState(),data=state.sectionData['state-return'];if(!data?.additionalStateWithholdingEntries?.[1]||!data.zeroIncomeMiscSources?.[0])throw Error('Actual mixed originals required');
  if(kind==='missing')data.zeroIncomeMiscSources=[];else if(kind==='edited')data.zeroIncomeMiscSources[0].recipientFirstName='Changed actual recipient';else data.additionalStateWithholdingEntries[1].documentType=kind;
  const before=structuredClone(state);expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(state).toEqual(before);
 }
});


// ADDITIVE source-first controls: original twelve above remain byte-exact.
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction';
function explicitFictionalItemizedElection(state:ReturnType<typeof complete>){
 state.sectionData.deductions={method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',nonW2IncomeTaxesDeductedElsewhere:'0',realEstateTaxes:'0',personalPropertyTaxes:'0',mortgageInterest:'0',mortgageEntries:[],charitableContributions:'0',donationEntries:[],casualtyLosses:'0',otherItemized:'0',investmentInterestExpense:'0',gamblingWinnings:'0',gamblingLosses:'0',gamblingExpenses:'0'};
 return state;
}
function exactSourceTaxComponents(input:ReturnType<typeof currentInput>){
 const worksheet=calculateStateLocalIncomeTaxDeduction(input);
 return {w2State:worksheet.w2StateWithholding.toFixed(),w2Local:worksheet.w2LocalWithholding.toFixed(),nonW2:worksheet.nonW2Withholding.toFixed(),inYear:worksheet.statePaymentsInYear.toFixed(),additional:worksheet.additionalPayments.toFixed(),elsewhere:worksheet.deductedElsewhere.toFixed(),refunds:worksheet.currentYearRefunds.toFixed(),total:worksheet.total.toFixed()};
}
it('itemized PA MISC saved claim preserves exact once-only federal income tax payments',()=>{
 const state=explicitFictionalItemizedElection(complete('PA'));refreshKnownSources(state,'158');const before=structuredClone(state),input=currentInput(state);
 expect(input.form1099Misc[0].stateWithheld).toBe('0.20');
 expect(input.adjustments?.estimatedTaxPayments).toContainEqual({date:'2025-04-15',amount:'0.30',type:'state',state:'PA'});
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1842',stateWithholding:'2000',stateRefund:'158',stateAmountOwed:'0'});
 expect(exactSourceTaxComponents(input)).toEqual({w2State:'2000',w2Local:'0',nonW2:'0.3',inYear:'0.3',additional:'0',elsewhere:'0',refunds:'0',total:'2000.6'});
 expect(state.sectionData['state-return']?.additionalStateWithholding).toBe('0.20');expect(state).toEqual(before);
});
it('itemized Ohio MISC saved claim preserves exact once-only federal income tax payments',()=>{
 const state=explicitFictionalItemizedElection(complete('OH'));refreshKnownSources(state,'783');const before=structuredClone(state),input=currentInput(state);
 expect(input.form1099Misc[0].stateWithheld).toBe('0.20');
 expect(input.adjustments?.estimatedTaxPayments).toContainEqual({date:'2025-04-15',amount:'0.30',type:'state',state:'OH'});
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1217',stateWithholding:'2000',stateRefund:'783',stateAmountOwed:'0'});
 expect(exactSourceTaxComponents(input)).toEqual({w2State:'2000',w2Local:'0',nonW2:'0.3',inYear:'0.3',additional:'0',elsewhere:'0',refunds:'0',total:'2000.6'});
 expect(state.sectionData['state-return']?.additionalStateWithholding).toBe('0.20');expect(state).toEqual(before);
});
it('itemized mixed pension and MISC saved claims preserve exact once-only federal income tax payments',()=>{
 const state=explicitFictionalItemizedElection(mixedOriginalState());refreshKnownSources(state,'658');const before=structuredClone(state),input=currentInput(state);
 expect(input.form1099R[0].stateWithheld).toBe('500');expect(input.form1099Misc[0].stateWithheld).toBe('0.20');
 expect(computeGuidedPreview(state)?.state).toMatchObject({stateTax:'1842',stateWithholding:'2500',stateRefund:'658',stateAmountOwed:'0'});
 expect(exactSourceTaxComponents(input)).toEqual({w2State:'2000',w2Local:'0',nonW2:'500.2',inYear:'0',additional:'0',elsewhere:'0',refunds:'0',total:'2500.2'});
 expect(state.sectionData['state-return']?.additionalStateWithholding).toBe('500.20');expect(state).toEqual(before);
});


// ADDITIVE source-context denials before source-only matching implementation.
import {buildScheduleAInput} from '@/lib/guided-interview-bridge';
it('itemized finite MISC source removal rejects missing original context',()=>{
 for(const code of ['PA','OH']as const){const state=explicitFictionalItemizedElection(complete(code)),before=structuredClone(state);
  expect(()=>buildScheduleAInput(state.sectionData.deductions,state.sectionData['state-return'],state.sectionData['income-retirement']?.entries,state.taxYear)).toThrow();expect(state).toEqual(before);
 }
});
it('itemized finite MISC source removal rejects stale actual remittance',()=>{
 for(const code of ['PA','OH']as const){const state=explicitFictionalItemizedElection(complete(code)),input=currentInput(state),row=state.sectionData['state-return']?.zeroIncomeMiscSources?.[0];if(!row)throw Error('Actual native original required');row.remittance.confirmationNumber='Fictional changed equal-dollar original remittance';const before=structuredClone(state);
  expect(()=>buildScheduleAInput(state.sectionData.deductions,state.sectionData['state-return'],state.sectionData['income-retirement']?.entries,state.taxYear,{state,originals:input.form1099Misc})).toThrow();expect(state).toEqual(before);
 }
});
it('itemized finite MISC source removal rejects duplicated saved claims',()=>{
 for(const code of ['PA','OH']as const){const state=explicitFictionalItemizedElection(complete(code)),input=currentInput(state),data=state.sectionData['state-return'];if(!data?.additionalStateWithholdingEntries?.[0])throw Error('Actual retained claim required');data.additionalStateWithholdingEntries.push(structuredClone(data.additionalStateWithholdingEntries[0]));data.additionalStateWithholding='0.40';const before=structuredClone(state);
  expect(()=>buildScheduleAInput(state.sectionData.deductions,data,state.sectionData['income-retirement']?.entries,state.taxYear,{state,originals:input.form1099Misc})).toThrow();expect(state).toEqual(before);
 }
});
