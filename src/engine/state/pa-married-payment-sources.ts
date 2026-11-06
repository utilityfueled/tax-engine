/** Spec: spec/state/pa-married-payment-sources.yaml. Pure2025 individual M accounts. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources.js';
import {ordinarySourcePrecision} from './pa-ordinary-source-precision.js';
type Owner='primary'|'spouse';
export interface PAMarriedOwnerPayments {estimatedPayments:Decimal;extensionPayment:Decimal;creditFromPriorYear:Decimal;quarterlyEstimatedPayments:[Decimal,Decimal,Decimal,Decimal]}
const fail=(detail:string):never=>{throw new Error('PA married payment sources: '+detail);};
const normalize=(v:string)=>v.trim().replace(/\s+/gu,' ').toUpperCase();
const ssn=(v:string)=>v.replace(/[-\s]/gu,'');
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}';return JSON.stringify(v)??'null';}
function day(v:string):string{if(!/^\d{4}-\d{2}-\d{2}$/u.test(v))return fail('actual calendar date missing');const t=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==v)return fail('actual calendar date impossible');return v;}
/** No prior-SP, safe-harbor, joint-account transfer or dated-interest qualification. */
export function calculatePAMarriedPaymentSources(input:TaxYearInput,sources:PAMarriedOrdinarySources):Map<Owner,PAMarriedOwnerPayments>{
 const packet=sources.paymentSources;if(packet===undefined)return fail('supplemental actual payment originals missing');
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,sources),rounding:Decimal.ROUND_HALF_UP});
 const zero=()=>new Money(0),ref=(v:string)=>{if(!v.trim())fail('actual source reference missing');};
 const amount=(v:string)=>{if(!/^\d+(\.\d+)?$/u.test(v))return fail('actual nonnegative amount unknown or malformed');const n=new Money(v);if(!n.isFinite())return fail('nonfinite amount');return n;};
 const y=input.taxpayer.taxYear,asOf=day(sources.timing.asOfDate),due=['2025-04-15','2025-06-16','2025-09-15','2026-01-15'];
 if(y!==2025||packet.sourceTaxYear!==y||sources.filingMode!=='M'||packet.sourceFactsConfirmed!==true||packet.accounts.length!==2)return fail('complete original2025 separate individual accounts required; joint/draft-year method unavailable');ref(packet.sourceReference);
 const seen=new Set<Owner>(),out=new Map<Owner,PAMarriedOwnerPayments>();let hasExtension=false;
 for(const row of packet.accounts){
  const tag=row.accountHolder;if(tag!=='primary'&&tag!=='spouse')return fail('actual payment owner unknown');if(seen.has(tag))return fail('duplicate actual payment owner');seen.add(tag);ref(row.sourceReference);
  const person=tag==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!person)return fail('actual spouse original missing');
  const owner=sources.owners.find(o=>o.accountHolder===tag);if(!owner)return fail('actual source owner missing');
  const checkIdentity=(record:{accountName:string;accountSsn:string;taxYear:number|null;returnType:string},year:number)=>{if(normalize(record.accountName)!==normalize(person.firstName+' '+person.lastName)||ssn(record.accountSsn)!==ssn(person.ssn)||record.taxYear!==year||record.returnType!=='PA-40')fail('original payment account owner/name/year/form mismatch');};
  const account=row.originalAccount;checkIdentity(account,y);
  if(account.filingStatus!=='M'||account.accountKind!=='individual'||day(account.asOfDate)!==asOf||account.allPaymentsCompleteConfirmed!==true||account.noTransfersOffsetsRefundsOrAdjustmentsConfirmed!==true)return fail('actual complete unchanged individual account is unknown; joint/transfer/adjustment successor required');
  const originals=row.receipts.map(r=>r.original),inventory=(rows:unknown[])=>rows.map(stable).sort();
  if(stable(inventory(originals))!==stable(inventory(account.receipts))||stable(inventory(originals))!==stable(inventory(owner.payments.originalReceipts)))return fail('actual posted and retained receipt inventories differ');
  const result:PAMarriedOwnerPayments={estimatedPayments:zero(),extensionPayment:zero(),creditFromPriorYear:zero(),quarterlyEstimatedPayments:[zero(),zero(),zero(),zero()]};
  const refs=new Set<string>(),confirmations=new Set<string>();let estimateCount=0,extensionCount=0;
  for(const receipt of row.receipts){ref(receipt.sourceReference);const reference=normalize(receipt.sourceReference),o=receipt.original;checkIdentity(o,y);const confirmation=normalize(o.confirmationNumber);if(!confirmation)return fail('actual receipt confirmation missing');if(refs.has(reference)||confirmations.has(confirmation))return fail('duplicate actual receipt original or reference');refs.add(reference);confirmations.add(confirmation);
   const paid=day(o.date),cash=amount(o.amount);if(paid>asOf)return fail('actual receipt is after account asOf');
   if(o.kind==='estimated'){
    const period=receipt.intendedInstallment;if(period===null||period<1||period>4)return fail('actual estimated installment missing');const previous=period===1?'2025-01-01':due[period-2];if(paid>due[period-1]||(period===1?paid<previous:paid<=previous))return fail('actual estimate outside intended published period; dated-payment successor required');
    result.estimatedPayments=result.estimatedPayments.plus(cash);result.quarterlyEstimatedPayments[period-1]=result.quarterlyEstimatedPayments[period-1].plus(cash);estimateCount++;
   }else if(o.kind==='extension'){
    if(receipt.intendedInstallment!==null||paid!=='2026-04-15')return fail('actual extension requires original April15 receipt with no installment allocation');result.extensionPayment=result.extensionPayment.plus(cash);extensionCount++;hasExtension=true;
   }else return fail('actual receipt kind unsupported; balance/transfer successor required');
  }
  const prior=row.priorCredit;ref(prior.sourceReference);const available=amount(account.availablePriorCredit);
  if(prior.status==='known_none'){
   if(prior.originalPriorReturn!==undefined||!available.isZero()||account.priorCreditAppliedOn!==null)return fail('known-none prior credit conflicts with actual originals');
  }else if(prior.status==='actual_credit'){
   const original=prior.originalPriorReturn;if(!original)return fail('actual prior return election missing');checkIdentity(original,y-1);
   if(original.filingStatus!=='M'||day(original.filedOn)<'2025-01-01'||original.filedOn>asOf||original.filedOn>'2025-04-15'||original.filedOn>(account.priorCreditAppliedOn??'')||owner.payments.priorReturnStatus!=='actual_return'||day(account.priorCreditAppliedOn??'')!=='2025-04-15')return fail('actual same-owner prior separate return and timely posted carryover required');
   const elected=amount(original.creditElected);if(!elected.eq(available))return fail('actual prior election exceeds or differs from unchanged posted available credit');result.creditFromPriorYear=elected;result.quarterlyEstimatedPayments[0]=result.quarterlyEstimatedPayments[0].plus(elected);
  }else return fail('actual prior credit status unknown');
  const recorded=owner.payments;
  if(recorded.allCurrentPaymentsReviewedConfirmed!==true||recorded.estimatedPaymentsStatus!==(estimateCount?'actual_receipts':'known_none')||recorded.extensionPaymentsStatus!==(extensionCount?'actual_receipts':'known_none')||recorded.priorCreditStatus!==(prior.status==='actual_credit'?'actual_credit':'known_none')||!['no_return','not_used','actual_return'].includes(recorded.priorReturnStatus)||!recorded.priorReturnSourceReference.trim())return fail('retained actual payment/prior statuses conflict with original account');
  out.set(tag,result);
 }
 if(sources.timing.filingExtension!==(hasExtension?'actual_extension':'none'))return fail('actual extension request status conflicts with receipts');
 return out;
}
