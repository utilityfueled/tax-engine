// Spec: state/pa-business-pending-independent.yaml. Literal independent cash and bounds.
import {expect,it} from 'vitest';
import {Form1099DivSchema,Form1099BSchema,Form1099MiscSchema,Form1099OIDSchema} from '@/models/inputs';
import {calculatePABusinessPendingAccountSources} from '@/engine/state/pa-business-pending-account';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {zeroBusinessPendingFixture} from '../../fixtures/pa-business-pending-account';
type Fixture=ReturnType<typeof zeroBusinessPendingFixture>;
const replay=(f:Fixture)=>calculatePABusinessPendingAccountSources(f.input,f.account,'2026-04-15');
it.each(['resident','part_year','nonresident'] as const)('independent cash and credit remain distinct for %s',status=>{
 const f=zeroBusinessPendingFixture(status),before=structuredClone(f),r=replay(f),pa=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
 expect([r.actualWithholding.toFixed(2),r.actualNetRemittances.toFixed(2),r.actualRefundsReceived.toFixed(2),r.outstandingOverpayment.toFixed(2)]).toEqual(['0.20','0.20','0.00','0.20']);
 expect([r.actualTaxLiability.toFixed(),r.qualifiedSameIncome.toFixed(),r.paCredit.toFixed()]).toEqual(['0','0','0']);
 expect([pa.pa40.taxLiability.toFixed(),pa.pa40.residentCredit.toFixed(),pa.pa40.stateWithholding.toFixed()]).toEqual(['0','0','0']);
 expect(r.filingEligible).toBe(false);expect(f).toEqual(before);
 for(const secret of [f.input.taxpayer.primary.ssn,f.account.sourceReference,f.account.payments[0].confirmationNumber])expect(JSON.stringify(r)).not.toContain(secret);
});
const mutations: Array<[string,(f:Fixture)=>void]>=[
 ['missingactualowner',f=>{f.account.payments[0].accountName='';}],
 ['payerrecourse',f=>{Object.assign(f.account.payments[0],{noPayerRefundReimbursementOrRecourseConfirmed:null});}],
 ['missingagencybalance',f=>{f.account.account.overpaymentOutstandingReported='';}],
 ['reportedrefundcent',f=>{f.account.account.refundsActuallyReceivedReported='0.01';}],
 ['reportedoffsetcent',f=>{f.account.account.offsetsReported='0.01';}],
 ['reportedtransfercent',f=>{f.account.account.transfersReported='0.01';}],
 ['reportedwriteoffcent',f=>{f.account.account.writeoffsOrForfeituresReported='0.01';}],
 ['receivedsubcentrefund',f=>{f.account.refunds.push({confirmationNumber:'Independentactualrefund',date:'2026-04-01',amount:'0.001',sourceReference:'Independent actual receipt'});}],
 ['futureagency',f=>{f.account.account.completeThroughDate='2026-04-16';}],
 ['impossiblefileddate',f=>{f.account.filedReturn.filedOn='2026-02-30';}],
 ['unknownfullhistory',f=>{Object.assign(f.account.account,{allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed:null});}],
 ['uncreditedcash',f=>{f.account.payments[0].taxpayerAccountCreditConfirmed=false;}],
 ['missingdomicileperiod',f=>{const r=f.input.paResidencySources;if(!r)throw new Error('Actual fixture residency sources required');r.residency.domicilePeriods[0].from='2025-01-02';}],
 ['NYoperation',f=>{f.business.allocation.locations[0].state='NY';}],
 ['positiveNYliability',f=>{f.account.filedReturn.finalTaxLiability='0.01';}],
 ['inventedformcredit',f=>{f.account.filedReturn.withholdingReported='0.20';}],
 ['unknownremittance',f=>{Object.assign(f.account.payments[0],{actualPaymentToStateConfirmed:null});}],
 ['sourceamountchanged',f=>{f.input.form1099Nec[1].stateWithheld='0.19';}],
];
it.each(mutations)('independent pending account refuses altered evidence %s',(_name,mutate)=>{
 const f=zeroBusinessPendingFixture();mutate(f);const before=structuredClone(f);expect(()=>replay(f)).toThrow();expect(f).toEqual(before);
});
const families:Array<[string,(f:Fixture)=>void]>=[
 ['DIV',f=>{f.input.form1099Div.push(Form1099DivSchema.parse({payer:'IndependentNYSEdividend',ordinaryDividends:'0',state:' ny ',stateWithheld:'0.01'}));}],
 ['B',f=>{f.input.form1099B.push(Form1099BSchema.parse({broker:'IndependentNYbroker',transactions:[],state:' ny ',stateWithheld:'0.01'}));}],
 ['MISC',f=>{f.input.form1099Misc.push(Form1099MiscSchema.parse({payer:'IndependentNYmisc',state:' ny ',stateWithheld:'0.01'}));}],
 ['OID',f=>{f.input.form1099OID.push(Form1099OIDSchema.parse({payer:'IndependentNYOID',originalIssueDiscount:'0',stateWithholding:[{state:'NY',statePayerId:'IndependentOriginalID',stateWithheld:'0.01'}]}));}],
];
it.each(families)('independent source coverage rejects NY %s',(_name,add)=>{
 const f=zeroBusinessPendingFixture();add(f);expect(()=>replay(f)).toThrow(/additional actual NY|account|source/i);
});
