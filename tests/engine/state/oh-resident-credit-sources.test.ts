/** Spec: spec/state/oh-resident-credit-sources.yaml. Existing canonical APIs only. */
import Decimal from 'decimal.js';
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { ohioResidentCreditFixture,rebindResidentCreditOuter } from '../../fixtures/oh-resident-credit-sources.js';
type Packet=ReturnType<typeof ohioResidentCreditFixture>;
const run=(p:Packet)=>calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});
it('admits actual resident same-income Virginia tax with complete paid account',()=>{
 const p=ohioResidentCreditFixture(),before=JSON.stringify(p);const result=run(p);
 expect(result.it1040.line3_ohioAgi.toString()).toBe('100000');expect(result.it1040.line8c_totalTax.toString()).toBe('2323');
 expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');
 expect(result.residentCredit?.line1_totalDoubleTaxedIncome.toString()).toBe('60000');expect(result.residentCredit?.line2_totalOtherStateTax.toString()).toBe('1000');
 expect(result.residentCredit?.line4_apportionmentFraction.toString()).toBe('0.6');expect(result.residentCredit?.line6_ohioTaxOnOtherStateIncome.toString()).toBe('1394');expect(result.residentCredit?.line7_residentCredit.toString()).toBe('1000');
 expect(result.scheduleOfCredits.line39_residentCredit.toString()).toBe('1000');expect(result.it1040.line10_taxAfterCredits.toString()).toBe('1323');expect(result.it1040.line14_ohioWithholding.toString()).toBe('2000');expect(result.it1040.line26_refund.toString()).toBe('677');expect(JSON.stringify(p)).toBe(before);
});
it.each([['60000','1800','60000','1800','1394'],['60000.49','1000.49','60000','1000','1000'],['60000.50','1000.50','60001','1001','1001'],['100000','2500','100000','2500','2323']] as const)('preserves actual source cents and paid-credit cap %s',(income,tax,a,b,credit)=>{
 const p=ohioResidentCreditFixture(income,tax);const result=run(p);expect(p.source.filedReturn.incomeTaxedByVirginia).toBe(income);expect(p.source.completedAccount.netIncomeTax).toBe(tax);
 expect(result.residentCredit?.line1_totalDoubleTaxedIncome.toString()).toBe(a);expect(result.residentCredit?.line2_totalOtherStateTax.toString()).toBe(b);expect(result.residentCredit?.totalResidentCredit.toString()).toBe(credit);
});
const negatives:[string,(p:Packet)=>void][]=[
 ['missing-corporate-employer-original',p=>{Reflect.deleteProperty(p.source,'employerEntityOriginal');}],['pass-through-employer',p=>{p.source.employerEntityOriginal.entityType='pass_through';}],
 ['unconfirmed',p=>{Reflect.set(p.source,'sourceFactsConfirmed',false);}],['missing-source-reference',p=>{p.source.sourceReference='';}],['missing-complete-income',p=>{Reflect.deleteProperty(p.source,'allIncomeOriginalsIncludedConfirmed');}],
 ['wrong-year',p=>{p.source.sourceTaxYear=2026;}],['wrong-owner',p=>{p.source.accountHolder='spouse';}],['missing-filed-return',p=>{Reflect.deleteProperty(p.source,'filedReturn');}],['missing-complete-account',p=>{Reflect.deleteProperty(p.source,'completedAccount');}],
 ['unknown-VA-withholding',p=>{Reflect.deleteProperty(p.source.filedReturn,'withholding');}],['negative-tax',p=>{p.source.completedAccount.netIncomeTax='-1';}],['nonfinite-tax',p=>{p.source.completedAccount.netIncomeTax='NaN';}],['overprecision-tax',p=>{p.source.completedAccount.netIncomeTax='1000.001';}],
 ['stale-filed-owner',p=>{p.source.filedReturn.originalTaxpayer.ssn='900-71-0999';}],['stale-account-owner',p=>{p.source.completedAccount.originalTaxpayer.ssn='900-71-0999';}],['other-state',p=>{p.source.filedReturn.stateCode='PA';}],
 ['pending-refund',p=>{p.source.completedAccount.noPendingChangesOrRefundClaimsConfirmed=false;}],['unpaid-liability',p=>{p.source.completedAccount.unpaidTax='1';}],['refund-omitted',p=>{p.source.completedAccount.refunds=[];}],['duplicate-payment',p=>{const r=p.source.completedAccount.payments[0];if(!r)throw new Error('Fixture receipt required');p.source.completedAccount.payments.push(structuredClone(r));}],
 ['invalid-source-date',p=>{p.source.completedAccount.statementDate='2026-02-30';}],['future-refund',p=>{const r=p.source.completedAccount.refunds[0];if(!r)throw new Error('Fixture refund required');r.date='2026-04-02';}],['missing-known-zero',p=>{Reflect.deleteProperty(p.source.completedAccount,'outgoingCredit');}],
 ['federal-deducted-tax',p=>{p.source.taxDeductedInFederalAgi='actual';}],['filed-income-not-same-source',p=>{p.source.filedReturn.incomeTaxedByVirginia='60001';}],['return-nettax-not-paid',p=>{p.source.filedReturn.netIncomeTax='999';}],['actual-credits-missing',p=>{Reflect.deleteProperty(p.source.filedReturn,'nonrefundableCredits');}],
 ['service-incomplete',p=>{p.source.serviceRows.pop();}],['service-duplicate',p=>{const r=p.source.serviceRows[0];if(!r)throw new Error('Fixture service required');p.source.serviceRows.push(structuredClone(r));}],['service-wrong-state',p=>{const r=p.source.serviceRows[0];if(!r)throw new Error('Fixture service required');r.serviceState='PA';}],
 ['current-source-name',p=>{const w=p.input.w2s[0];if(!w)throw new Error('Fixture W2 required');w.employer.name='Different current employer';rebindResidentCreditOuter(p);}],
 ['no-actual-payment-packet',p=>{Reflect.deleteProperty(p.input,'ohioPayments');}],['not-fullresident',p=>{const o=p.facts.owners[0];if(!o)throw new Error('Fixture owner required');o.status='part_year_resident';}],
];
it.each(negatives)('rejects missing or contradictory resident-credit original %s',(_name,mutate)=>{const p=ohioResidentCreditFixture();mutate(p);expect(()=>run(p)).toThrow();});
it.each(['scheduleC','form1099Int','scheduleF','formSSA1099','ohioSchoolDistrict'] as const)('rejects retained unsupported resident-credit composition %s',key=>{const p=ohioResidentCreditFixture();Reflect.set(p.input,key,key==='form1099Int'||key==='formSSA1099'?[{actualOriginal:'retained even zero'}]:{actualOriginal:'retained'});rebindResidentCreditOuter(p);expect(()=>run(p)).toThrow();});
const projectionMutations:[string,(p:Record<string,unknown>)=>void][]=[
 ...['useTax','refundableCredits','donations','creditCarryforward','latePaymentInterest','amendedPriorOverpayment','underpaymentPenalty','estimatedPayments','refundableHistoricPreservationCredit','refundableJobCreationCredit','passThroughEntityCredit','refundableMotionPictureCredit','filmTheaterCapitalImprovementCredit','ventureCapitalCredit'].map(key=>[key,(p:Record<string,unknown>)=>{p[key]='100';}] as [string,(p:Record<string,unknown>)=>void]),
 ['stripped-packet-and-context',p=>{delete p.residencyResidentCreditSource;const facts=p.residency;if(!facts||typeof facts!=='object')throw new Error('Actual adapted residency required');Reflect.deleteProperty(facts,'residentCreditSources');}],
 ['exemptions',p=>{p.exemptions=2;}],['resident-scalar',p=>{p.residentCredit='1000';}],['NRC-scalar',p=>{p.nonresidentCredit='100';}],['other-state-income',p=>{p.otherStateTaxes=[{stateCode:'VA',doubleTaxedIncome:'100000',taxPaid:'1000'}];}],['forged-context',p=>{p.residencyResidentCreditSource={methodId:'ohio-2025-va-resident-credit-v1'};}],['missing-context',p=>{delete p.residencyResidentCreditSource;}],['payment-commitment',p=>{p.paymentSourceDigest='forged';}],['residency-commitment',p=>{p.residencySourceDigest='forged';}],['current-AGI',p=>{p.federalAgi='100001';}],
];
it.each(projectionMutations)('denies changed direct adapted source projection %s',(_name,mutate)=>{
 const p=ohioResidentCreditFixture();const adapted=buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input));expect(calculateOhioResidentReturn(adapted).it1040.line26_refund.toString()).toBe('677');mutate(adapted as unknown as Record<string,unknown>);expect(()=>calculateOhioResidentReturn(adapted)).toThrow();
});
it('binds exact private originals without mutation or private audit disclosure',()=>{
 const p=ohioResidentCreditFixture(),before=JSON.stringify(p),precision=Decimal.precision;const a=run(p);p.source.completedAccount.sourceReference='PRIVATE-REPLACED-ACTUAL-COMPLETE-ACCOUNT';const b=run(p);expect(a.it1040.line26_refund.eq(b.it1040.line26_refund)).toBe(true);expect(a.lines).not.toEqual(b.lines);expect(JSON.stringify(a.lines)).not.toMatch(/900-71-0412|90-7100412|PRIVATE-/);p.source.completedAccount.sourceReference='PRIVATE-COMPLETE-VA-AGENCY-ACCOUNT';expect(JSON.stringify(p)).toBe(before);expect(Decimal.precision).toBe(precision);
});
it('retains bare credit guard and public2026 gate',()=>{
 const p=ohioResidentCreditFixture();Reflect.deleteProperty(p.facts,'residentCreditSources');const federal=calculateFederalTax(p.input);expect(()=>buildOhioResidentReturnInput(p.input,federal,{otherStateTaxes:[{stateCode:'VA',incomeType:'compensation',doubleTaxedIncome:'60000',taxPaid:'1000'}]})).toThrow();p.input.taxpayer.taxYear=2026;expect(()=>calculateFederalTax(p.input)).toThrow();
});

it('retains actual zero tax and exact raw account sums without inventing paid tax',()=>{
 const zero=ohioResidentCreditFixture('60000','0','2500');const z=run(zero);expect(z.residentCredit?.line1_totalDoubleTaxedIncome.toString()).toBe('0');expect(z.residentCredit?.line2_totalOtherStateTax.toString()).toBe('0');expect(z.residentCredit?.totalResidentCredit.toString()).toBe('0');expect(z.it1040.line10_taxAfterCredits.toString()).toBe('2323');expect(z.it1040.line26_refund.toString()).toBe('177');
 const p=ohioResidentCreditFixture(),first=p.source.completedAccount.payments[0];if(!first)throw new Error('Actual fixture receipt required');first.amount='600.24';const second=structuredClone(first);second.amount='599.76';second.date='2025-12-30';second.sourceId='PRIVATE-VA-SECOND-APPLIED-RECEIPT';second.sourceReference='PRIVATE-VA-SECOND-APPLIED-ORIGINAL';p.source.completedAccount.payments.push(second);const a=run(p);expect(a.residentCredit?.line2_totalOtherStateTax.toString()).toBe('1000');p.source.completedAccount.payments.reverse();const b=run(p);expect(b.it1040.line26_refund.toString()).toBe('677');expect(a.lines).not.toEqual(b.lines);
});
