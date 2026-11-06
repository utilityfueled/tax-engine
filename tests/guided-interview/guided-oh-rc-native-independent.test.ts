/** Spec: spec/state/oh-resident-credit-native-independent.yaml. Independent integration boundaries. */
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {guidedResidentCreditFixture,recordAt,required} from '../fixtures/guided-oh-resident-credit-complete';
type Fixture=ReturnType<typeof guidedResidentCreditFixture>;
function run(f:Fixture){const input=buildGuidedStateOriginals(f.input,f.state);return calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:calculateFederalTax(input)});}
it('independent native RC retains ordinary source and literal result',()=>{
 const f=guidedResidentCreditFixture(),before=JSON.stringify(f.state),input=JSON.stringify(f.input);
 for(let i=0;i<2;i++){
  const r=run(f);expect(r.residentCredit?.totalResidentCredit.toString()).toBe('1000');expect(r.it1040.line26_refund.toString()).toBe('677');
  expect(JSON.stringify(f.state)).toBe(before);expect(JSON.stringify(f.input)).toBe(input);
  f.state=JSON.parse(JSON.stringify(f.state));
 }
});
const unsupported:Array<[string,(f:Fixture)=>void]>=[
 ['second actual zero W2',f=>{f.input.w2s.push({...structuredClone(required(f.input.w2s[0])),wages:'0',federalWithheld:'0',socialSecurityWages:'0',socialSecurityWithheld:'0',medicareWages:'0',medicareWithheld:'0',stateLocalSources:undefined,stateTaxWithheld:'0',stateWages:'0',localWages:'0',localTaxWithheld:'0'});}],
 ['retained zero interest',f=>{f.input.form1099Int=[{taxYear:2025,accountHolder:'primary',payer:'Fictional additional original interest',interestIncome:'0',usSavingsBondInterest:'0',federalWithheld:'0',earlyWithdrawalPenalty:'0',foreignTaxPaid:'0',taxExemptInterest:'0',paDirectObligationInterest:'0',stateWithheld:'0'}];}],
 ['retained zero dividends',f=>{f.input.form1099Div=[{taxYear:2025,accountHolder:'primary',payer:'Fictional additional original dividends',ordinaryDividends:'0',qualifiedDividends:'0',totalCapitalGainDistributions:'0',federalWithheld:'0',section1250Gain:'0',section1202Gain:'0',collectiblesGain:'0',nondividendDistributions:'0',section199ADividends:'0',foreignTaxPaid:'0',exemptInterestDividends:'0',paExemptInterestDividendAllocation:'0',stateWithheld:'0'}];}],
 ['retained zero nonemployee original',f=>{f.input.form1099Nec=[{taxYear:2025,accountHolder:'primary',payer:'Fictional additional actual NEC',nonemployeeCompensation:'0',federalWithheld:'0',stateWithheld:'0'}];}]
];
it.each(unsupported)('independent native RC refuses coherent unsupported inventory %s',(_name,change)=>{
 const f=guidedResidentCreditFixture();change(f);
 // Coherent explicit captures prevent a stale-capture check from standing in for inventory validation.
 f.draft.originalFederalSources=structuredClone(f.input);f.residency.originalFederalSources=structuredClone(f.input);f.payments.originalFederalSources=structuredClone(f.input);
 expect(()=>run(f)).toThrow();
});
it.each(['amount','tax-period']as const)('independent native RC preserves canonical paired-original refusal %s',kind=>{
 const f=guidedResidentCreditFixture('distinct'),payment=recordAt(f.draft,'completedAccount','payments',1);
 const original=recordAt(payment,'transactionOriginals','bankTransferOriginal');
 if(kind==='amount')original.amount='249.99';else original.taxPeriodEnd='2024-12-31';
 const commitment=structuredClone(f.source),committed=recordAt(commitment,'completedAccount','payments',1,'transactionOriginals','bankTransferOriginal');
 if(kind==='amount')committed.amount='249.99';else committed.taxPeriodEnd='2024-12-31';
 f.draft.originalResidentCreditSourcePacket=commitment;
 const before=JSON.stringify(f.state);expect(()=>run(f)).toThrow();expect(JSON.stringify(f.state)).toBe(before);
});
