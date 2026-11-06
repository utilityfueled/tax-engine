// Spec: spec/state/pa-oid-pending-oh-independent.yaml.
import {describe,expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {
 TaxYearInputSchema,W2Schema,Form1099IntSchema,Form1099DivSchema,Form1099BSchema,
 Form1099NecSchema,Form1099MiscSchema,Form1099GSchema,Form1099KSchema,FormW2GSchema,
 Form1099RSchema,Form1099DASchema,
} from '@/models/inputs';
import {PAOIDPendingOHAccountSchema} from '@/models/pa-oid-pending-oh-account';
import {calculatePAOIDPendingOHAccount} from '@/engine/state/pa-oid-pending-oh-account';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {calculateFederalTax} from '@/engine/federal';
import {preparePAOrdinaryReturnReview,assertPAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {buildGuidedPAOIDPendingOHAccount,confirmGuidedPAOIDPendingOHAccount} from '@/lib/guided-pa-oid-pending-oh-account';
import {originalOIDPendingCompleteFixture} from '../../fixtures/guided-pa-oid-original-complete';

function present<T>(value:T|undefined):T{if(value===undefined)throw Error('Independent explicit fixture value missing');return value;}
const asOf='2026-04-15';
const identity={taxYear:2025,accountHolder:'primary' as const,state:' oh ',stateWithheld:'0.10'};
const hiddenOriginals=[
 ['INT','form1099Int',()=>Form1099IntSchema.parse({...identity,payer:'Independent zero-income bank',interestIncome:'0'})],
 ['DIV','form1099Div',()=>Form1099DivSchema.parse({...identity,payer:'Independent zero-income fund',ordinaryDividends:'0'})],
 ['B','form1099B',()=>Form1099BSchema.parse({...identity,broker:'Independent zero-income broker',transactions:[]})],
 ['NEC','form1099Nec',()=>Form1099NecSchema.parse({...identity,payer:'Independent zero-income payer',nonemployeeCompensation:'0'})],
 ['MISC','form1099Misc',()=>Form1099MiscSchema.parse({...identity,payer:'Independent zero-income royalty payer',royalties:'0'})],
 ['G','form1099G',()=>Form1099GSchema.parse({...identity,payer:'Independent agency',unemploymentCompensation:'0'})],
 ['K','form1099K',()=>Form1099KSchema.parse({...identity,pse:'Independent zero-income processor',grossAmount:'0'})],
 ['W2G','formW2G',()=>FormW2GSchema.parse({...identity,payer:'Independent zero-income gaming payer',reportableWinnings:'0'})],
 ['R-Box14','form1099R',()=>Form1099RSchema.parse({...identity,payer:'Independent zero-income plan',grossDistribution:'0',taxableAmount:'0'})],
 ['R-alias','form1099R',()=>Form1099RSchema.parse({...identity,stateWithheld:'0',stateTaxWithheld:'0.10',payer:'Independent alias plan',grossDistribution:'0',taxableAmount:'0'})],
 ['W2','w2s',()=>W2Schema.parse({taxYear:2025,accountHolder:'primary',employer:{name:'Independent employer',ein:'12-3456789'},wages:'0',federalWithheld:'0',allocatedTips:'0',state:' oh ',stateTaxWithheld:'0.10'})],
 ['DA-nested','form1099DA',()=>Form1099DASchema.parse({taxYear:2025,accountHolder:'primary',brokerName:'Independent nested digital statement',transactions:[],stateTaxReporting:'multiple',stateWithholding:[{state:' oh ',stateWithheld:'0.10'}]})],
] as const;

describe('independent actual Ohio OID pending-account review',()=>{
 it('independent literal pending-cash and complete PA return trace',()=>{
  const f=originalOIDPendingCompleteFixture(),before=JSON.stringify(f),precision=Decimal.precision;
  expect(new Decimal('100.10').plus('20.20').toFixed(2)).toBe('120.30');
  expect(f.account.filedReturn.exactFederalAdjustedGrossIncome).toBe('120.30');
  expect(f.account.filedReturn.reportedFederalAdjustedGrossIncome).toBe('120');
  const r=calculatePAOIDPendingOHAccount(f.input,f.account,asOf),pa=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
  for(const n of [r.actualWithholding,r.actualNetRemittances,r.outstandingOverpayment])expect(n.toFixed(2)).toBe('0.20');
  for(const n of [r.actualRefundsReceived,r.actualTaxLiability,r.qualifiedSameIncome,r.paCredit])expect(n.toFixed()).toBe('0');
  expect(pa.pa40.taxLiability.toFixed()).toBe('4');expect(pa.scheduleSP.taxForgivenessCredit.toFixed()).toBe('4');
  expect(pa.pa40.residentCredit.toFixed()).toBe('0');expect(pa.refundDisposition.refund.toFixed()).toBe('0');
  expect(r.filingEligible).toBe(false);expect(pa.readiness.filingEligible).toBe(false);
  expect(JSON.stringify(f)).toBe(before);expect(Decimal.precision).toBe(precision);
 });
 it('unknown actual payer identifier remains unknown without a manufactured qualification',()=>{
  const f=originalOIDPendingCompleteFixture(),o=present(f.input.form1099OID[0]);
  expect(o.payerTin).toBeUndefined();expect(present(o.stateWithholding?.[1]).statePayerId).toBe('');
  const p=confirmGuidedPAOIDPendingOHAccount(f.input,{...f.account,sourceFactsConfirmed:null},asOf);
  expect(present(p.payments[0]).original.payerTin).toBeUndefined();
  expect(JSON.parse(JSON.stringify(present(p.payments[0]).original))).not.toHaveProperty('payerTin');
  expect(buildGuidedPAOIDPendingOHAccount(f.input,JSON.parse(JSON.stringify(p)),asOf)).toEqual(p);
  expect(o.payerTin).toBeUndefined();
 });
 it.each(hiddenOriginals)('rejects a canonically admitted hidden OH original %s',(_label,family,original)=>{
  const f=originalOIDPendingCompleteFixture(),input=TaxYearInputSchema.parse({...f.input,[family]:[original()]}),p=structuredClone(f.account);
  expect(Reflect.get(input,family)).toHaveLength(1);
  // An explicit fictional history supplement records this known original. Denial
  // cannot be attributed merely to the old filed snapshot omitting that family.
  p.filedReturn.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);
  expect(()=>calculatePAOIDPendingOHAccount(input,p,asOf)).toThrow();
 });
 it.each(['beneficialOwner','payerRecourse','paymentYear','accountOwner','receiptIdentity','unreportedRefund','unknownExtra']as const)('requires actual account/remittance proof beyond a header confirmation %s',kind=>{
  const f=originalOIDPendingCompleteFixture(),p=PAOIDPendingOHAccountSchema.parse(f.account),payment=present(p.payments[0]);
  if(kind==='beneficialOwner')payment.taxpayerBeneficialOwnerConfirmed=null;
  if(kind==='payerRecourse')payment.noPayerRefundReimbursementOrRecourseConfirmed=false;
  if(kind==='paymentYear')payment.sourceTaxYear=null;
  if(kind==='accountOwner')p.account.accountSsn='999-88-7777';
  if(kind==='receiptIdentity')payment.confirmationNumber='   ';
  if(kind==='unreportedRefund')p.account.refundsActuallyReceivedReported='0.20';
  if(kind==='unknownExtra')Reflect.set(p,'unreportedRemittance',{state:'OH',amount:'0.10'});
  expect(()=>calculatePAOIDPendingOHAccount(f.input,p,asOf)).toThrow();
 });
 it.each(['120','120.31'])('rejects an incorrect exact filed amount despite unchanged reported120 %s',exact=>{
  const f=originalOIDPendingCompleteFixture(),p=structuredClone(f.account);p.filedReturn.exactFederalAdjustedGrossIncome=exact;
  expect(new Decimal(exact).toDecimalPlaces(0).toFixed()).toBe('120');
  expect(()=>calculatePAOIDPendingOHAccount(f.input,p,asOf)).toThrow(/immutable filed raw federal originals or reported AGI/);
 });
 it.each(['gap','overlap','OH']as const)('a postal PA address cannot repair missing actual nonOH calendar %s',kind=>{
  const f=originalOIDPendingCompleteFixture(),residency=f.input.paResidencySources;
  if(!residency)throw Error('Independent actual residency source missing');
  expect(f.input.taxpayer.address.state).toBe('PA');
  if(kind==='OH')present(residency.residency.domicilePeriods[0]).state='OH';
  if(kind==='gap')present(residency.residency.domicilePeriods[0]).from='2025-01-02';
  if(kind==='overlap')residency.residency.domicilePeriods.push({...present(residency.residency.domicilePeriods[0]),from:'2025-12-31',through:'2025-12-31'});
  expect(()=>calculatePAOIDPendingOHAccount(f.input,f.account,asOf)).toThrow();
 });
 it('same-dollar current original edit cannot rebind retained filed history on read or confirmation',()=>{
  const f=originalOIDPendingCompleteFixture(),retained=JSON.stringify(f.account),current=structuredClone(f.input);
  present(current.form1099OID[0]).sourceId='independent equal-dollar current original B';
  expect(()=>buildGuidedPAOIDPendingOHAccount(current,f.account,asOf)).toThrow();
  expect(()=>confirmGuidedPAOIDPendingOHAccount(current,f.account,asOf)).toThrow();
  expect(JSON.stringify(f.account)).toBe(retained);
 });
 it('prepared result includes exact pending cash in its original result comparison',()=>{
  const f=originalOIDPendingCompleteFixture(),ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.completion),result=calculateFederalTax(f.input);
  result.stateReturns={pennsylvania:ordinary};const token=preparePAOrdinaryReturnReview(f.input);
  const pending=ordinary.pendingOIDOHAccount;if(!pending)throw Error('Independent actual pending result missing');
  const paBefore=JSON.stringify(ordinary.pa40);pending.actualNetRemittances=new Decimal('0.21');
  expect(JSON.stringify(ordinary.pa40)).toBe(paBefore);expect(ordinary.refundDisposition.refund.toFixed()).toBe('0');
  expect(()=>assertPAOrdinaryReturnReview(f.input,result,token)).toThrow(/result|reconcile/);
 });
});
