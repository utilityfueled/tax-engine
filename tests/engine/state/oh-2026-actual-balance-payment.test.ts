/** Spec: state/oh-2026-actual-balance-payment.yaml. Literal enacted-law/original account oracles. */
import {expect,it} from 'vitest';
import {calculateOhio2026ReturnDraftFromSources} from '@/engine/state/oh-engine.js';
import {ohio2026ActualBalanceFixture} from '../../fixtures/oh-2026-actual-balance-payment.js';
const run=(p:ReturnType<typeof ohio2026ActualBalanceFixture>)=>calculateOhio2026ReturnDraftFromSources({taxInput:p.input,sources:p.sources});
it.each([['500','432'],['499','433']])('admits actual timely balance at statutory boundary %s',(due,withholding)=>{
 const p=ohio2026ActualBalanceFixture('full_year_resident',withholding,due),before=JSON.stringify(p),r=run(p);
 expect(r.incomeTax.toFixed()).toBe('932');expect(r.withholding.toFixed()).toBe(withholding);expect(r.amountDue.toFixed()).toBe(due);expect(r.refund.toFixed()).toBe('0');expect(r.underpaymentPenalty.toFixed()).toBe('0');expect(r.latePaymentInterest.toFixed()).toBe('0');expect(JSON.stringify(p)).toBe(before);
});
import {calculateOhio2026OrdinarySource} from '@/engine/state/oh-2026-ordinary-source.js';
import {calculateOhio2026ReturnDraft} from '@/engine/state/oh-2026-return-draft.js';
import {ohio2026OrdinaryFixture} from '../../fixtures/oh-2026-ordinary-return.js';
function facts(p:ReturnType<typeof ohio2026ActualBalanceFixture>){const f=p.input.ohioPayments;if(!f)throw Error('Actual fixture payment facts required');return f;}
function payment(p:ReturnType<typeof ohio2026ActualBalanceFixture>){const f=facts(p).remainingTaxPayment;if(f.status!=='actual_payment')throw Error('Actual fixture balance receipt required');return f;}
it.each([
 ['full_year_resident','432','500','932','0'],
 ['part_year_resident','59','500','559','373'],
 ['nonresident','0','186','186','746'],
] as const)('reports source-qualified return and paid account separately for %s',(status,withholding,due,tax,nrc)=>{
 const p=ohio2026ActualBalanceFixture(status,withholding,due),before=JSON.stringify(p),r=run(p);
 expect(r.incomeTax.toFixed()).toBe(tax);expect(r.nonresidentCredit.toFixed()).toBe(nrc);expect(r.amountDue.toFixed()).toBe(due);expect(r.withholding.toFixed()).toBe(withholding);expect(r.refund.toFixed()).toBe('0');
 expect(r.actualBalancePayment?.methodVersion).toBe('oh-2026-actual-timely-small-balance-v1');expect(r.actualBalancePayment?.status).toBe('actual_paid_on_time');expect(r.actualBalancePayment?.actualPaymentDate).toBe('2027-04-15');expect(r.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe(due);expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
 expect(r.calculationStatus).toBe('incomplete');expect(r.reviewStatus).toBe('independent-review-pending');expect(r.filingQualified).toBe(false);expect(JSON.stringify(p)).toBe(before);
});
it.each(['missingAmount','unknownAmount','missingReceipt','expected','partial','excess','receiptCents','originalMismatch','zero','above500','noBalance','overpayment','wrongOwner','wrongName','wrongSsn','wrongYear','inputYear','returnType','receiptKind','missingConfirmation','unconfirmed','invalidDate','dateMismatch','earlyDate','lateDate','afterAsOf','lateFiling','filedFuture','expectedPast','paymentRows','priorReturn','carry','useTax','outgoing','donation','extension','special','snapshot'] as const)('rejects unknown contradictory or unsupported actual payment %s',kind=>{
 const p=ohio2026ActualBalanceFixture(),f=facts(p),pay=payment(p),mutable=pay as unknown as Record<string,unknown>;
 if(kind==='missingAmount')delete mutable.amountAppliedToTax;
 if(kind==='unknownAmount')mutable.amountAppliedToTax=null;
 if(kind==='missingReceipt')delete mutable.original;
 if(kind==='expected')mutable.status='expected_payment';
 if(kind==='partial')pay.amountAppliedToTax=pay.original.amount='499';
 if(kind==='excess')pay.amountAppliedToTax=pay.original.amount='501';
 if(kind==='receiptCents')pay.amountAppliedToTax=pay.original.amount='499.99';
 if(kind==='originalMismatch')pay.original.amount='500.01';
 if(kind==='zero')pay.amountAppliedToTax=pay.original.amount='0';
 if(kind==='above500')return expect(()=>run(ohio2026ActualBalanceFixture('full_year_resident','431','501'))).toThrow(/installment|500/);
 if(kind==='noBalance')return expect(()=>run(ohio2026ActualBalanceFixture('full_year_resident','932','1'))).toThrow(/positive balance|500/);
 if(kind==='overpayment')return expect(()=>run(ohio2026ActualBalanceFixture('full_year_resident','1000','1'))).toThrow(/positive balance|500/);
 if(kind==='wrongOwner')pay.accountHolder='spouse';
 if(kind==='wrongName')pay.original.accountName='Different Fictional Owner';
 if(kind==='wrongSsn')pay.original.accountSsn='900-70-0999';
 if(kind==='wrongYear')pay.original.taxYear=2025;
 if(kind==='inputYear')p.input.taxpayer.taxYear=2025;
 if(kind==='returnType')(pay.original as unknown as Record<string,unknown>).returnType='sd100';
 if(kind==='receiptKind')(pay.original as unknown as Record<string,unknown>).kind='estimated';
 if(kind==='missingConfirmation')pay.original.confirmationNumber='';
 if(kind==='unconfirmed')mutable.sourceFactsConfirmed=false;
 if(kind==='invalidDate')pay.date=pay.original.date='2027-02-30';
 if(kind==='dateMismatch')pay.original.date='2027-04-14';
 if(kind==='earlyDate')pay.date=pay.original.date='2026-12-31';
 if(kind==='lateDate')pay.date=pay.original.date='2027-04-16';
 if(kind==='afterAsOf')f.currentTiming={kind:'expected',expectedDate:'2027-04-15',asOfDate:'2027-04-14'};
 if(kind==='lateFiling')f.currentTiming={kind:'expected',expectedDate:'2027-04-16',asOfDate:'2027-04-15'};
 if(kind==='filedFuture')f.currentTiming={kind:'filed',filedDate:'2027-04-15',asOfDate:'2027-04-14'};
 if(kind==='expectedPast')f.currentTiming={kind:'expected',expectedDate:'2027-04-14',asOfDate:'2027-04-15'};
 if(kind==='paymentRows')f.paymentRows=[{sourceId:'Private-estimate',sourceReference:'Private-estimate-original',accountHolder:'primary',taxYear:2026,returnType:'it1040',kind:'estimated',date:'2026-04-15',amount:'0',appliedToThisReturnConfirmed:true,original:{...pay.original,kind:'estimated',date:'2026-04-15',amount:'0'}}];
 if(kind==='priorReturn')(f.priorReturn as unknown as Record<string,unknown>).status='filed_return';
 if(kind==='carry')(f.priorCreditCarryforward as unknown as Record<string,unknown>).status='actual_credit';
 if(kind==='useTax')f.balanceFacts.useTax='1';
 if(kind==='outgoing')f.balanceFacts.outgoingCarryforward='1';
 if(kind==='donation')f.balanceFacts.donations='1';
 if(kind==='extension')(f.filingExtension as unknown as Record<string,unknown>).kind='extended';
 if(kind==='special')(f as unknown as Record<string,unknown>).specialMethod='annualized';
 if(kind==='snapshot')f.originalFederalSources={};
 const before=JSON.stringify(p);expect(()=>run(p)).toThrow(/Ohio2026|actual|source|current|year|balance/);expect(JSON.stringify(p)).toBe(before);
});
it('binds exact current originals and keeps payment private identifiers off results',()=>{
 for(const key of ['sourceReference','lexicalAmount','confirmation'] as const){const p=ohio2026ActualBalanceFixture(),context=calculateOhio2026OrdinarySource(p.input,p.sources),original=run(p),pay=payment(p);
 if(key==='sourceReference')pay.sourceReference+=' changed';if(key==='lexicalAmount')pay.amountAppliedToTax=pay.original.amount='500.00';if(key==='confirmation')pay.original.confirmationNumber+=' changed';
 expect(()=>calculateOhio2026ReturnDraft(p.input,p.sources,context)).toThrow(/stale|forged|current/);const next=run(p);expect(next.sourceCommitment).not.toBe(original.sourceCommitment);expect(next.amountDue.toFixed()).toBe('500');
 const serialized=JSON.stringify(next);for(const secret of [pay.sourceReference,pay.original.accountName,pay.original.accountSsn,pay.original.accountSsn.replace(/\D/g,''),pay.original.confirmationNumber])expect(serialized).not.toContain(secret);
 }
 const p=ohio2026ActualBalanceFixture(),context=calculateOhio2026OrdinarySource(p.input,p.sources);expect(()=>calculateOhio2026ReturnDraft(p.input,p.sources,{...context})).toThrow(/forged|current/);
});
it('preserves withholding-only fields and unsupported year gates',()=>{
 const p=ohio2026OrdinaryFixture(),before=JSON.stringify(p),r=calculateOhio2026ReturnDraftFromSources({taxInput:p.input,sources:p.sources});expect(r.incomeTax.toFixed()).toBe('932');expect(r.amountDue.toFixed()).toBe('0');expect(r.refund.toFixed()).toBe('68');expect(r).not.toHaveProperty('actualBalancePayment');expect(JSON.stringify(p)).toBe(before);
 const paid=ohio2026ActualBalanceFixture();paid.input.taxpayer.taxYear=2025;expect(()=>run(paid)).toThrow(/year|current/);
});
it.each(['2027-01-01','2027-04-14'])('uses actual timely original date %s without inferring receipt timing',date=>{const p=ohio2026ActualBalanceFixture(),pay=payment(p);pay.date=pay.original.date=date;const r=run(p);expect(r.actualBalancePayment?.actualPaymentDate).toBe(date);expect(r.amountDue.toFixed()).toBe('500');});

it('does not round an actual withholding shortfall down into the statutory500 threshold',()=>{const p=ohio2026ActualBalanceFixture('full_year_resident','431.50','500');expect(()=>run(p)).toThrow(/500|threshold|raw/);});

it.each([['431.49','500',false],['431.50','500',false],['432.49','500',true],['432.50','499',true]] as const)('preserves raw withholding cents %s under conservative threshold admission',(withholding,due,admitted)=>{
 const p=ohio2026ActualBalanceFixture('full_year_resident',withholding,due),before=JSON.stringify(p);
 if(admitted){const r=run(p);expect(r.incomeTax.toFixed()).toBe('932');expect(r.withholding.toFixed()).toBe(withholding==='432.50'?'433':'432');expect(r.amountDue.toFixed()).toBe(due);expect(r.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe(due);expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');}else expect(()=>run(p)).toThrow(/500|threshold|raw/);
 expect(JSON.stringify(p)).toBe(before);expect(p.input.w2s[0].stateLocalSources?.stateRows[0].withheld).toBe(withholding);
});
