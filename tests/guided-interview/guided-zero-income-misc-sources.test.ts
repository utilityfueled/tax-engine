// Spec: spec/state/guided-zero-income-misc-sources.yaml; literal actual fictional records precede products.
import {describe,expect,it} from 'vitest';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {loadGuidedFlowState,saveGuidedFlowState} from '@/lib/guided-interview-flow';
import {TaxYearInputSchema} from '@/models/inputs';
import {actualGuidedRoyaltySources} from '../fixtures/guided-royalty-sources';
import {confirmFictionalMisc,fictionalMiscFlow,fictionalMiscOriginal,miscRows,type FictionalMiscDraft} from '../fixtures/guided-zero-income-misc';

const changes:[string,(row:FictionalMiscDraft)=>void][]=[
 ['unknown original income',r=>{r.otherIncome='';}],['positive other income',r=>{r.otherIncome='1';}],['unknown federal withholding',r=>{r.federalWithheld='';}],
 ['unknown all boxes',r=>{r.allOriginalBoxesKnownConfirmed=null;}],['unknown original status',r=>{r.currentOriginalConfirmed=null;}],['corrected original',r=>{r.corrected=true;}],['void original',r=>{r.void=true;}],
 ['unknown source year',r=>{r.sourceTaxYear='';}],['wrong source year',r=>{r.sourceTaxYear='2026';}],['unsupported revision',r=>{r.sourceFormRevision='2026-12';}],
 ['missing payer identity',r=>{r.payerTin='';}],['unknown owner',r=>{r.accountHolder='';}],['ineligible spouse owner',r=>{r.accountHolder='spouse';}],['unknown recipient SSN',r=>{r.recipientSsn='';}],['different actual recipient',r=>{r.recipientFirstName='Different';}],
 ['unknown legacy compensation',r=>{r.legacyAndNewerCompensationAbsentConfirmed=null;}],['unknown state reporting',r=>{r.stateTaxReporting='';}],['multiple state original',r=>{r.stateTaxReporting='multiple';}],['invalid state',r=>{r.state='ZZ';}],['missing state payer ID',r=>{r.payerStateId='';}],['zero state withholding',r=>{r.stateWithheld='0';}],['malformed money',r=>{r.stateWithheld='0.2.0';}],
];
const receipts:[string,(row:FictionalMiscDraft)=>void][]=[
 ['unknown actual payment',r=>{r.remittance.actuallyRemittedConfirmed=null;}],['payer refunded payment',r=>{r.remittance.notRefundedByPayerConfirmed=false;}],
 ['amount mismatch',r=>{r.remittance.amountPaid='0.21';}],['year mismatch',r=>{r.remittance.sourceTaxYear='2024';}],['state mismatch',r=>{r.remittance.state='OH';}],['payer mismatch',r=>{r.remittance.payerTin='12-3456789';}],
 ['account mismatch',r=>{r.remittance.accountReference='different account';}],['recipient mismatch',r=>{r.remittance.recipientSsn='222-33-4444';}],['missing confirmation',r=>{r.remittance.confirmationNumber='';}],
 ['unknown paid date',r=>{r.remittance.paidDate='';}],['impossible date',r=>{r.remittance.paidDate='2025-02-30';}],['future versus actual asof',r=>{r.remittance.paidDate='2026-03-02';}],['unknown asof',r=>{r.remittance.sourceAsOfDate='';}],
];
describe('actual zero-income MISC source admission',()=>{
 it('actual zero-income MISC original reaches canonical sources exactly once',()=>{
  const state=fictionalMiscFlow(),before=structuredClone(state),input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  expect(input.form1099Misc).toHaveLength(1);expect(input.form1099Misc[0]).toMatchObject({sourceId:'Fictional-zero-income-MISC-2025-A',payer:'Separate actual payer',taxYear:2025,state:'PA',stateWithheld:'0.20',rents:'0',royalties:'0',otherIncome:'0',stateIncome:'0'});
  expect(input.paResidencySources).toBeUndefined();expect(input.paOrdinaryReturnFacts).toBeUndefined();expect(input.paOrdinaryReturnCompletionSources).toBeUndefined();expect(state).toEqual(before);
 });
 it.each(changes)('actual zero-income MISC rejects %s without refreshing originals',(_name,change)=>{
  const row=fictionalMiscOriginal();change(row);const state=fictionalMiscFlow([confirmFictionalMisc(row)]),before=structuredClone(state);expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(state).toEqual(before);
 });
 it.each(receipts)('actual zero-income MISC rejects remittance %s',(_name,change)=>{
  const row=fictionalMiscOriginal();change(row);const state=fictionalMiscFlow([confirmFictionalMisc(row)]),before=structuredClone(state);expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(state).toEqual(before);
 });
 it('actual zero-income MISC rejects stale or unconfirmed snapshots',()=>{
  const unconfirmed=fictionalMiscFlow([fictionalMiscOriginal()]);expect(buildTaxInputFromGuidedData(unconfirmed)).toBeNull();
  const stale=fictionalMiscFlow();miscRows(stale)[0].payer='Equal-dollar changed payer';const before=structuredClone(stale);expect(buildTaxInputFromGuidedData(stale)).toBeNull();expect(stale).toEqual(before);
 });
 it('actual zero-income MISC rejects duplicate original and semantic duplicate receipts',()=>{
  const original=fictionalMiscOriginal(),clone=structuredClone(original);clone.sourceId='Different source ID';
  expect(buildTaxInputFromGuidedData(fictionalMiscFlow([confirmFictionalMisc(original),confirmFictionalMisc(clone)]))).toBeNull();
  clone.accountReference='Distinct fictional account';clone.remittance.accountReference=clone.accountReference;clone.remittance.confirmationNumber='  FICTIONAL   REMITTANCE a  ';
  expect(buildTaxInputFromGuidedData(fictionalMiscFlow([confirmFictionalMisc(original),confirmFictionalMisc(clone)]))).toBeNull();
 });
 it('distinct actual zero-income MISC originals preserve both remittances once',()=>{
  const second=fictionalMiscOriginal();second.sourceId='Fictional source B';second.accountReference='Fictional account B';second.remittance.accountReference=second.accountReference;second.remittance.confirmationNumber='Fictional remittance B';
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(fictionalMiscFlow([confirmFictionalMisc(fictionalMiscOriginal()),confirmFictionalMisc(second)])));
  expect(input.form1099Misc).toHaveLength(2);expect(input.form1099Misc.map(row=>row.stateWithheld)).toEqual(['0.20','0.20']);
 });
 it('actual zero-income MISC rejects source identity already present in royalty originals',()=>{
  const royalty=actualGuidedRoyaltySources(),row=fictionalMiscOriginal();row.payerTin='12-3456789';row.accountReference=' ROYALTY-ACCOUNT-1 ';row.remittance.payerTin=row.payerTin;row.remittance.accountReference=row.accountReference;
  const state=fictionalMiscFlow([confirmFictionalMisc(row)]);state.segmentation.stateCode='MI';state.segmentation.incomeTypes.push('royalties');state.sectionData['income-royalties']=royalty;
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
 });
 it('distinct zero-income MISC and original royalty statements remain separate once',()=>{
  const state=fictionalMiscFlow();state.segmentation.stateCode='MI';state.segmentation.incomeTypes.push('royalties');state.sectionData['income-royalties']=actualGuidedRoyaltySources();
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));expect(input.form1099Misc).toHaveLength(2);expect(input.form1099Misc.map(row=>row.sourceId)).toEqual(['royalty-original-1','Fictional-zero-income-MISC-2025-A']);
 });
 it('generic ledger remains reconciliation and never creates an original',()=>{
  const state=fictionalMiscFlow([]);state.sectionData['state-return']={additionalStateWithholding:'0.20',additionalStateWithholdingEntries:[{payer:'Separate actual payer',documentType:'1099-MISC',state:'PA',taxYear:'2025',amount:'0.20'}],stateEstimatedPayments:[]};
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));expect(input.form1099Misc).toEqual([]);
 });
 it('actual zero-income MISC persists entered facts and rejects changed current taxpayer',()=>{
  const state=fictionalMiscFlow(),values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear(),key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}};
  saveGuidedFlowState(storage,'fictional-private-MISC',state);const loaded=loadGuidedFlowState(storage,'fictional-private-MISC');if(!loaded)throw Error('Explicit fictional saved source required');expect(miscRows(loaded)).toEqual(miscRows(state));
  const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(loaded));expect(input.form1099Misc).toHaveLength(1);
  const personal=loaded.sectionData['personal-info'];if(!personal)throw Error('Explicit fictional recipient required');personal.ssn='999-88-7777';const before=structuredClone(miscRows(loaded));expect(buildTaxInputFromGuidedData(loaded)).toBeNull();expect(miscRows(loaded)).toEqual(before);
 });
});
