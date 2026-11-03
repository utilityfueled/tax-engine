/** Independently authored before candidate product inspection; spec/state/oh-resident-credit-transactions-independent.yaml. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {ohioResidentCreditFixture} from '../../fixtures/oh-resident-credit-sources.js';
type Packet=ReturnType<typeof ohioResidentCreditFixture>;
type Person={firstName:string;lastName:string;ssn:string};
type Bank={sourceReference:string;taxYear:number;accountHolder:string;originalTaxpayer:Person;stateCode:string;purpose:string;taxPeriodEnd:string;amount:string;achTraceNumber:string;settlementDate:string;status:string};
type Agency=Omit<Bank,'settlementDate'>&{accountSourceReference:string;postingDate:string;postingId:string};
type Proof={kind:string;bankTransferOriginal:Bank;agencyPostingOriginal:Agency};
function row(p:Packet,n=0){const r=p.source.completedAccount.payments.filter(r=>r.kind==='balance')[n];if(!r)throw new Error('Independent original missing');return r;}
function proof(p:Packet,n=0){const value:unknown=Reflect.get(row(p,n),'transactionOriginals');if(!value||typeof value!=='object')throw new Error('Independent paired original missing');return value as Proof;}
function fixture(each='350.00',net='1000.00',refund='900.00'){
 const p=ohioResidentCreditFixture('60000',net,'2000'),s=p.source,D=Decimal.clone({precision:100});
 s.filedReturn.balancePayments=new D(each).times(2).toFixed(2);s.filedReturn.refund=refund;
 const withheld=s.completedAccount.payments.find(r=>r.kind==='withholding');if(!withheld)throw new Error('Independent actual WH missing');s.completedAccount.payments=[withheld];
 for(const [n,trace] of [[1,'042000031008801'],[2,'042000031008802']] as const){
  const original={taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(s.originalTaxpayer),stateCode:'VA',purpose:'individual_income_tax_balance',taxPeriodEnd:'2025-12-31',amount:each,achTraceNumber:trace};
  const paired:Proof={kind:'settled_ach_credit',bankTransferOriginal:{...structuredClone(original),sourceReference:`INDEPENDENT-BANK-ORIGINAL-${n}`,settlementDate:'2026-02-16',status:'settled'},agencyPostingOriginal:{...structuredClone(original),sourceReference:`INDEPENDENT-AGENCY-ORIGINAL-${n}`,accountSourceReference:s.completedAccount.sourceReference,postingDate:'2026-02-18',postingId:`INDEPENDENT-APPLIED-POST-${n}`,status:'applied'}};
  const receipt={sourceId:`INDEPENDENT-RECEIPT-${n}`,sourceReference:`INDEPENDENT-REMITTANCE-${n}`,taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(s.originalTaxpayer),kind:'balance',date:'2026-02-16',amount:each};Reflect.set(receipt,'transactionOriginals',paired);s.completedAccount.payments.push(receipt);
 }
 if(new D(refund).isZero())s.completedAccount.refunds=[];else{const received=s.completedAccount.refunds[0];if(!received)throw new Error('Independent actual refund missing');received.amount=refund;}
 return p;
}
const run=(p:Packet)=>calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});
function denied(action:()=>unknown){let error:unknown;try{action();}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(TypeError);}
it.each([
 ['whole','350.00','1000.00','900.00','1000','677'],
 ['cent-down','350.25','1000.49','900.01','1000','677'],
 ['cent-up','350.25','1000.50','900.00','1001','678'],
 ['cap','450.00','2100.00','0.00','1394','1071'],
] as const)('independent receipt originals retain literal paid tax %s',(_label,each,net,refund,credit,requested)=>{
 const p=fixture(each,net,refund),before=JSON.stringify(p),r=run(p);expect(r.it1040.line3_ohioAgi.toFixed()).toBe('100000');expect(r.it1040.line8c_totalTax.toFixed()).toBe('2323');expect(r.residentCredit?.line6_ohioTaxOnOtherStateIncome.toFixed()).toBe('1394');expect(r.residentCredit?.totalResidentCredit.toFixed()).toBe(credit);expect(r.it1040.line26_refund.toFixed()).toBe(requested);expect(JSON.stringify(p)).toBe(before);
});
const wrong:[string,(p:Packet)=>void][]=[
 ['one unproved colliding member',p=>{Reflect.deleteProperty(row(p),'transactionOriginals');}],
 ['agency missing',p=>{Reflect.deleteProperty(proof(p),'agencyPostingOriginal');}],
 ['bank missing',p=>{Reflect.deleteProperty(proof(p),'bankTransferOriginal');}],
 ['bank only initiated',p=>{proof(p).bankTransferOriginal.status='pending';}],
 ['agency only pending',p=>{proof(p).agencyPostingOriginal.status='pending';}],
 ['bank owner',p=>{proof(p).bankTransferOriginal.originalTaxpayer.ssn='900-71-0999';}],
 ['agency owner',p=>{proof(p).agencyPostingOriginal.accountHolder='spouse';}],
 ['bank source year',p=>{proof(p).bankTransferOriginal.taxYear=2024;}],
 ['agency source year',p=>{proof(p).agencyPostingOriginal.taxYear=2026;}],
 ['bank foreignstate',p=>{proof(p).bankTransferOriginal.stateCode='OH';}],
 ['agency purpose',p=>{proof(p).agencyPostingOriginal.purpose='estimated_income_tax';}],
 ['bank period',p=>{proof(p).bankTransferOriginal.taxPeriodEnd='2024-12-31';}],
 ['agency account',p=>{proof(p).agencyPostingOriginal.accountSourceReference='INDEPENDENT-DIFFERENT-ACCOUNT';}],
 ['bank cents',p=>{proof(p).bankTransferOriginal.amount='350.01';}],
 ['agency cents',p=>{proof(p).agencyPostingOriginal.amount='350.01';}],
 ['bank fractioncents',p=>{proof(p).bankTransferOriginal.amount='350.001';}],
 ['trace mismatch',p=>{proof(p).agencyPostingOriginal.achTraceNumber='042000031008809';}],
 ['trace wronglength',p=>{proof(p).bankTransferOriginal.achTraceNumber='04200003100880';proof(p).agencyPostingOriginal.achTraceNumber='04200003100880';}],
 ['trace alphabetic',p=>{proof(p).bankTransferOriginal.achTraceNumber='04200003100880X';proof(p).agencyPostingOriginal.achTraceNumber='04200003100880X';}],
 ['bank date differentreceipt',p=>{proof(p).bankTransferOriginal.settlementDate='2026-02-15';}],
 ['posting before settlement',p=>{proof(p).agencyPostingOriginal.postingDate='2026-02-15';}],
 ['posting after completeaccount',p=>{proof(p).agencyPostingOriginal.postingDate='2026-03-11';}],
];
it.each(wrong)('independent receipt originals reject contradictory proof %s',(_label,mutate)=>{const p=fixture();mutate(p);denied(()=>run(p));});
it.each(['trace','posting','crossdate-trace','crossdate-posting'] as const)('independent receipt originals reject reused cash identity %s',kind=>{
 const p=fixture(),a=proof(p),b=proof(p,1);if(kind.includes('trace')){b.bankTransferOriginal.achTraceNumber=a.bankTransferOriginal.achTraceNumber;b.agencyPostingOriginal.achTraceNumber=a.bankTransferOriginal.achTraceNumber;}else b.agencyPostingOriginal.postingId=a.agencyPostingOriginal.postingId;
 if(kind.startsWith('crossdate')){row(p,1).date='2026-02-17';b.bankTransferOriginal.settlementDate='2026-02-17';b.agencyPostingOriginal.postingDate='2026-02-19';}denied(()=>run(p));
});
it('independent receipt originals preserve private binding and known legacy path',()=>{
 const p=fixture(),before=JSON.stringify(p),r=run(p);expect(run(p)).toEqual(r);expect(JSON.stringify(p)).toBe(before);const publicText=JSON.stringify(r);for(const secret of ['042000031008801','042000031008802','INDEPENDENT-BANK-ORIGINAL','INDEPENDENT-APPLIED-POST','PRIVATE-COMPLETE-VA-AGENCY-ACCOUNT','900-71-0412'])expect(publicText).not.toContain(secret);
 const adapted=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input));expect(calculateOhioResidentReturn(adapted).it1040.line26_refund.toFixed()).toBe('677');if(!adapted.residency?.residentCreditSources)throw new Error('Independent retained projection missing');const paid=adapted.residency.residentCreditSources.completedAccount.payments.find(r=>r.kind==='balance');if(!paid)throw new Error('Independent retained receipt missing');Reflect.set(paid,'sourceReference','INDEPENDENT-ALTERED-SAME-CASH');denied(()=>calculateOhioResidentReturn(adapted));expect(run(ohioResidentCreditFixture()).it1040.line26_refund.toFixed()).toBe('677');
});
