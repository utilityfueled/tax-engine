import Decimal from 'decimal.js';
import type {PA40Input} from '@/engine/state/pa-40.js';
/** New independently stated fictional actual sources; no production defaults. */
import {paOrdinaryOIDFixture,refreshPAOIDOriginals} from './pa-ordinary-oid-sources.js';
export const oidHugeInteger='1'+'0'.repeat(140);
export const oidHugePlus=(suffix:string)=>'1'+'0'.repeat(140-suffix.split('.')[0].length)+suffix;
export function oidConsumerPrecisionFixture(status:'resident'|'part_year'|'nonresident'='resident',kind:'taxable'|'treasury'='taxable'){
 const f=paOrdinaryOIDFixture(status,kind),original=f.input.form1099OID[0];
 if(kind==='taxable')original.originalIssueDiscount=oidHugePlus('2.51');else original.treasuryOID=oidHugePlus('2.51');
 f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-06-30',oid:oidHugeInteger+'.49',coupon:'0',sourceReference:'Fictional actual long pre-move accrual'},{from:'2025-07-01',through:'2025-12-31',oid:'2.02',coupon:'0',sourceReference:'Fictional actual post-move accrual'}];
 refreshPAOIDOriginals(f);return f;
}

/** Explicit fictional pre-penalty printed source lines; every other income/credit source is known none. */
export function oidPrintedPA40Input():PA40Input{
 const z=new Decimal(0);return {taxYear:2025,compensation:new Decimal('50000'),interest:new Decimal(oidHugePlus('123')),unreimbursedExpenses:z,dividends:z,netBusinessIncome:z,netGainOrLoss:z,netRentalIncome:z,estateTrustIncome:z,gamblingIncome:z,otherDeductions:z,taxForgivenessEligibilityIncome:new Decimal(oidHugePlus('50123')),useTax:z,stateWithholding:new Decimal('1539.30'),creditFromPriorYear:z,estimatedPayments:z,extensionPayment:z,nonresidentTaxWithheld:z,refundableCredits:z,taxForgivenessCredit:z,residentCredit:z,otherCredits:z,underpaymentPenalty:z,lateFilingOrPaymentPenalty:z,latePaymentInterest:z};
}
