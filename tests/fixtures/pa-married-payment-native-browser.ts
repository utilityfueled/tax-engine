/** Synthetic documentary facts shared by prospective browser controls and offline replay. */
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources';
import {PAMarriedPaymentSourcesSchema} from '@/models/pa-married-payment-sources';
import {guidedPAMarriedNativeFixture} from './guided-pa-married-native';
import {paMarriedPaymentsFixture} from './pa-married-payments';

export function paMarriedPaymentNativeBrowserFixture(){
 const native=guidedPAMarriedNativeFixture('M','whole'),payment=PAMarriedOrdinarySourcesSchema.parse(paMarriedPaymentsFixture().sources);
 const sources=PAMarriedOrdinarySourcesSchema.parse(native.sources),target=PAMarriedPaymentSourcesSchema.parse(payment.paymentSources);
 target.sourceReference='fictional-browser-payment-private-collection';
 for(const account of target.accounts){
  const person=account.accountHolder==='primary'?native.input.taxpayer.primary:native.input.taxpayer.spouse;
  if(!person)throw Error('Explicit synthetic actual owner required');
  const identity={accountName:person.firstName+' '+person.lastName,accountSsn:person.ssn};
  Object.assign(account.originalAccount,identity);account.sourceReference=`fictional-browser-payment-private-${account.accountHolder}-account`;
  for(const[n,row]of account.receipts.entries()){
   Object.assign(row.original,identity,{confirmationNumber:`BROWSER-PAYMENT-PRIVATE-${account.accountHolder}-${n}`});
   row.sourceReference=`fictional-browser-payment-private-${account.accountHolder}-receipt-${n}`;
  }
  // These are explicit synthetic originals, not copied from a calculated result.
  // Both independently printed copies intentionally describe the same receipts.
  for(const[n,row]of account.originalAccount.receipts.entries())Object.assign(row,identity,{confirmationNumber:`BROWSER-PAYMENT-PRIVATE-${account.accountHolder}-${n}`});
  account.priorCredit.sourceReference=`fictional-browser-payment-private-${account.accountHolder}-prior-credit`;
  if(account.priorCredit.originalPriorReturn)Object.assign(account.priorCredit.originalPriorReturn,identity);
  const owner=sources.owners.find(row=>row.accountHolder===account.accountHolder),paymentOwner=payment.owners.find(row=>row.accountHolder===account.accountHolder);
  if(!owner||!paymentOwner)throw Error('Explicit synthetic owner originals required');
  owner.payments={...structuredClone(paymentOwner.payments),sourceReference:`fictional-browser-payment-private-${account.accountHolder}-owner-review`,priorReturnSourceReference:`fictional-browser-payment-private-${account.accountHolder}-${account.priorCredit.status==='actual_credit'?'actual-prior-election':'no-prior-return'}`,originalReceipts:account.receipts.map(row=>structuredClone(row.original))};
 }
 sources.paymentSources=target;sources.sourceFactsConfirmed=true;
 sources.timing={...sources.timing,sourceReference:'fictional-browser-payment-private-timing',asOfDate:'2026-04-15',filingExtension:'actual_extension'};
 sources.dispositions.forEach((row,index)=>{row.refundRequested=index===0?'327':'80';row.nextYearCreditRequested='0';row.sourceReference=`fictional-browser-payment-private-${row.accountHolder}-disposition`;row.remainingPayment={status:'no_remaining_tax',sourceReference:`fictional-browser-payment-private-${row.accountHolder}-no-remaining-tax`};});
 const expected=PAMarriedOrdinarySourcesSchema.parse(sources),state=structuredClone(native.state),initial=PAMarriedOrdinarySourcesSchema.parse(sources);
 delete initial.paymentSources;initial.sourceFactsConfirmed=null;
 for(const owner of initial.owners)owner.payments={sourceReference:'',allCurrentPaymentsReviewedConfirmed:null,estimatedPaymentsStatus:'',extensionPaymentsStatus:'',priorCreditStatus:'',originalReceipts:[],priorReturnStatus:'',priorReturnSourceReference:''};
 initial.timing={...initial.timing,sourceReference:'',asOfDate:'',filingExtension:''};
 for(const row of initial.dispositions){row.sourceReference='';row.refundRequested='';row.nextYearCreditRequested='';row.remainingPayment={status:'',sourceReference:''};}
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paMarriedOrdinarySources:initial};
 return{state,input:native.input,expected,target:structuredClone(target)};
}
