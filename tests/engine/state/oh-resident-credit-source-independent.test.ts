/** Independent controls; source oracles frozen before new implementation inspection. */
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return.js';
import {calculateOhioResidentCredit} from '@/engine/state/oh-resident-credit.js';
import {ohioResidentCreditFixture,rebindResidentCreditOuter} from '../../fixtures/oh-resident-credit-sources.js';
type Packet=ReturnType<typeof ohioResidentCreditFixture>;
const run=(p:Packet)=>calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});
function first<T>(rows:readonly T[]):T{const row=rows[0];if(!row)throw new Error('Independent explicit original record missing');return row;}
function denied(action:()=>unknown){let caught:unknown;try{action();}catch(error){caught=error;}expect(caught).toBeInstanceOf(Error);expect(caught).not.toBeInstanceOf(TypeError);}
const cases=[
 ['base','60000','1000','2000','0.6','1394','1000','1323','677'],
 ['low-fraction','20000','1500','2000','0.2','465','465','1858','142'],
 ['truncated-ratio','27778','1300','2000','0.2777','645','645','1678','322'],
 ['full-income','100000','2500','2000','1','2323','2323','0','2000'],
 ['known-zero','0','0','2500','0','0','0','2323','177'],
] as const;
it.each(cases)('Ohio RC independent literal worksheet %s',(_name,income,paid,withholding,ratio,limit,credit,tax,refund)=>{
 const p=ohioResidentCreditFixture(income,paid,withholding),before=JSON.stringify(p);const r=run(p),rc=r.residentCredit;
 expect(rc).not.toBeNull();expect(rc?.line4_apportionmentFraction.toString()).toBe(ratio);expect(rc?.line6_ohioTaxOnOtherStateIncome.toString()).toBe(limit);
 expect(rc?.totalResidentCredit.toString()).toBe(credit);expect(r.it1040.line3_ohioAgi.toString()).toBe('100000');expect(r.it1040.line8c_totalTax.toString()).toBe('2323');expect(r.it1040.line10_taxAfterCredits.toString()).toBe(tax);expect(r.it1040.line26_refund.toString()).toBe(refund);expect(r.it1040.line14_ohioWithholding.toString()).toBe(withholding);expect(JSON.stringify(p)).toBe(before);
});
it('Ohio RC independent raw receipt aggregation stays exact and immutable',()=>{
 const p=ohioResidentCreditFixture(),a=first(p.source.completedAccount.payments);a.amount='600.24';const b={...structuredClone(a),sourceId:'INDEPENDENT-SECOND-VA-APPLIED',sourceReference:'INDEPENDENT-SECOND-VA-REMITTANCE',date:'2025-12-30',amount:'599.76'};p.source.completedAccount.payments.push(b);const before=JSON.stringify(p),r=run(p);
 expect(r.residentCredit?.line2_totalOtherStateTax.toString()).toBe('1000');expect(r.it1040.line26_refund.toString()).toBe('677');expect(JSON.stringify(p)).toBe(before);
});
const negatives:[string,(p:Packet)=>void][]=[
 ['equal-dollar current primary identity',p=>{p.input.taxpayer.primary.lastName='Different Current Resident';}],
 ['equal-dollar current employer',p=>{first(p.input.w2s).employer.name='Different Actual Corporation';}],
 ['wrong actual W2 year',p=>{first(p.input.w2s).taxYear=2024;}],
 ['wrong packet source year',p=>{p.source.sourceTaxYear=2024;}],
 ['retained additional income source',p=>{Reflect.set(p.input,'form1099Int',[{payerName:'Actual Separate Bank',interestIncome:'0'}]);}],
 ['unknown actual services',p=>{Reflect.deleteProperty(first(p.source.serviceRows),'wages');}],
 ['service date outside year',p=>{first(p.source.serviceRows).servicePeriodFrom='2024-12-31';}],
 ['service coverage hole',p=>{first(p.source.serviceRows).servicePeriodTo='2025-06-29';}],
 ['service and W2 actual wages disagree',p=>{first(p.source.serviceRows).wages='59999';}],
 ['filed Virginia owner SSN',p=>{p.source.filedReturn.originalTaxpayer.ssn='900-71-0991';}],
 ['filed Virginia actual source year',p=>{p.source.filedReturn.taxYear=2024;}],
 ['filed Virginia same-income original',p=>{p.source.filedReturn.incomeTaxedByVirginia='59999';}],
 ['filed Virginia actual liability arithmetic',p=>{p.source.filedReturn.nonrefundableCredits='1499';}],
 ['filed Virginia future to actual account',p=>{p.source.filedReturn.filedDate='2026-03-11';}],
 ['unconfirmed complete agency account',p=>{p.source.completedAccount.allPaymentsAndRefundsIncludedConfirmed=false;}],
 ['agency withheld cash mismatches W2',p=>{first(p.source.completedAccount.payments).amount='1199';}],
 ['refund before filed return',p=>{first(p.source.completedAccount.refunds).date='2026-02-14';}],
 ['refund after complete account coverage',p=>{first(p.source.completedAccount.refunds).date='2026-03-11';}],
 ['refund different actual taxpayer',p=>{first(p.source.completedAccount.refunds).originalTaxpayer.ssn='900-71-0992';}],
 ['refund wrong actual tax year',p=>{first(p.source.completedAccount.refunds).taxYear=2024;}],
 ['pending refund claim',p=>{p.source.completedAccount.noPendingChangesOrRefundClaimsConfirmed=false;}],
 ['semantic duplicate half refunds',p=>{const a=first(p.source.completedAccount.refunds);a.amount='100';const b=structuredClone(a);b.sourceId=` ${a.sourceId.toLowerCase()} `;b.sourceReference='INDEPENDENT-DUPLICATE-CASH-REFERENCE';p.source.completedAccount.refunds.push(b);}],
 ['unsettled actual agency tax',p=>{p.source.completedAccount.unpaidTax='0.01';}],
 ['reciprocal source masquerading as Virginia',p=>{first(p.source.serviceRows).serviceState='PA';}],
 ['part-year source status',p=>{first(p.facts.owners).status='part_year_resident';}],
];
it.each(negatives)('Ohio RC independent rejects actual source contradiction %s',(_name,mutate)=>{const p=ohioResidentCreditFixture();mutate(p);rebindResidentCreditOuter(p);denied(()=>run(p));});
it.each(['absent','null','blank','negative','nonfinite','overprecision'] as const)('Ohio RC independent rejects unknown actual money %s',kind=>{
 const p=ohioResidentCreditFixture();if(kind==='absent')Reflect.deleteProperty(p.source.filedReturn,'outgoingCredit');else Reflect.set(p.source.filedReturn,'outgoingCredit',{null:null,blank:'',negative:'-0.01',nonfinite:'Infinity',overprecision:'0.001'}[kind]);rebindResidentCreditOuter(p);denied(()=>run(p));
});
const projections:[string,(p:ReturnType<typeof buildOhioResidentReturnInput>)=>void][]=[
 ['stripped credit context',p=>{Reflect.deleteProperty(p,'residencyResidentCreditSource');}],
 ['stripped packet and context',p=>{Reflect.deleteProperty(p,'residencyResidentCreditSource');if(!p.residency)throw new Error('Independent adapted residency required');Reflect.deleteProperty(p.residency,'residentCreditSources');}],
 ['replacement scalar credit',p=>{p.residentCredit='1000';}],
 ['replacement federal income',p=>{p.federalAgi='99999';}],
 ['new NRC same-income override',p=>{p.nonresidentCredit='1';}],
 ['changed payment source commitment',p=>{p.paymentSourceDigest='FORGED-NEW-COMMITMENT';}],
 ['changed actual Ohio withholding',p=>{p.ohioWithholding='2001';}],
 ['changed private source equal amount',p=>{if(!p.residency?.residentCreditSources)throw new Error('Independent adapted source required');p.residency.residentCreditSources.completedAccount.sourceReference='INDEPENDENT-DIFFERENT-COMPLETE-ACCOUNT';}],
];
it.each(projections)('Ohio RC independent rejects altered direct projection %s',(_name,mutate)=>{const p=ohioResidentCreditFixture(),a=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input));expect(calculateOhioResidentReturn(a).it1040.line26_refund.toString()).toBe('677');mutate(a);denied(()=>calculateOhioResidentReturn(a));});
it('Ohio RC independent public result hides private originals without mutation',()=>{
 const p=ohioResidentCreditFixture(),before=JSON.stringify(p),precision=Decimal.precision,a=run(p),b=run(p),publicText=JSON.stringify(a);
 expect(a).toEqual(b);expect(JSON.stringify(p)).toBe(before);expect(Decimal.precision).toBe(precision);
 for(const identifier of ['900-71-0412','900710412','90-7100412','907100412','PRIVATE-VA-','PRIVATE-OH-','412 Fictional'])expect(publicText).not.toContain(identifier);
 expect(a.lines.some(line=>line.form==='OH-RESIDENT-CREDIT')).toBe(true);
});
it('Ohio RC independent preserves the standalone scalar worksheet',()=>{
 const a=calculateOhioResidentCredit({ohioAgi:'100000',ohioTaxBeforeCredits:'2323',otherStates:[{stateCode:'VA',incomeType:'compensation',doubleTaxedIncome:'60000',taxPaid:'1000'}]});expect(a.totalResidentCredit.toString()).toBe('1000');
 const z=calculateOhioResidentCredit({ohioAgi:'100000',ohioTaxBeforeCredits:'2323',otherStates:[{stateCode:'VA',doubleTaxedIncome:'0',taxPaid:'0'}]});expect(z.totalResidentCredit.toString()).toBe('0');
});
