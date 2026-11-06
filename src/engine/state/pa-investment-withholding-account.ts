/** Bounded original-account replay, not a New York return calculation. */
import Decimal from 'decimal.js';
import {z} from 'zod';
import {PAInvestmentWithholdingAccountSchema} from '@/models/pa-investment-withholding-account.js';
import {Form1099BSchema,type TaxYearInput} from '@/models/inputs.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
const fail=(message:string):never=>{throw new Error('PA actual NY investment withholding account: '+message);};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(v)??'null';}
function ref(v:string):void{if(!v.trim())fail('actual source reference or receipt identity is missing');}
function date(v:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return fail('actual account date is unknown');const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)return fail('actual account date is impossible');return v;}
export interface PAInvestmentWithholdingAccountResult{state:'NY';grossWithholding:Decimal;receivedRefunds:Decimal;netTaxPayments:Decimal;residentCredit:Decimal;sourceCommitment:string;}
/** Replay a separately allowed erroneous-payment claim; never calculate an NY form credit. */
export function calculatePAInvestmentWithholdingAccount(input:TaxYearInput,raw:unknown,asOf:string):PAInvestmentWithholdingAccountResult[]{
 const source=z.array(PAInvestmentWithholdingAccountSchema).parse(raw),year=input.taxpayer.taxYear,t=input.taxpayer.primary;
 if(!source.length)return [];
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(v:unknown):Decimal=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('actual original amount is unknown');const n=new Money(v);if(!n.isFinite())return fail('nonfinite actual amount');return n;};
 date(asOf);if(year!==2025||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse||source.length!==1)return fail('actual2025 single-owner settled NY method required');
 // This complete-account method covers B originals only. Known other NY
 // remittances cannot be erased by a separately asserted zero account balance.
 const additionalNY=(state:unknown,value:unknown)=>{if(typeof state==='string'&&state.trim().toUpperCase()==='NY'&&amount(value).gt(0))fail('additional actual NY withholding original requires its complete account source method');};
 for(const original of [...input.form1099Int,...input.form1099Div,...input.form1099Nec,...input.form1099Misc,...(input.form1099R??[]),...input.form1099G,...input.form1099K,...input.formW2G])additionalNY(original.state,original.stateWithheld);
 for(const original of input.form1099R??[])additionalNY(original.state,original.stateTaxWithheld);
 for(const original of input.form1099OID)for(const row of original.stateWithholding??[])additionalNY(row.state,row.stateWithheld);
 for(const original of input.form1099DA){additionalNY(original.state,original.stateWithheld);for(const row of original.stateWithholding??[])additionalNY(row.state,row.stateWithheld);}
 for(const [index,original] of input.w2s.entries()){if(original.stateLocalSources===undefined)additionalNY(original.state,original.stateTaxWithheld);else for(const row of calculateW2StateLocalSources(input,index,original.stateLocalSources).stateRows)if(row.state==='NY'&&row.withheld.gt(0))fail('additional actual NY W2 withholding requires its complete account source method');}
 const normalize=(v:string)=>v.trim().replace(/\s+/g,' ').toUpperCase(),ssn=(v:string)=>v.replace(/\D/g,'');
 const owner=(row:{state:string;sourceTaxYear:number|null;accountName:string;accountSsn:string;sourceReference:string})=>{ref(row.sourceReference);if(row.state!=='NY'||row.sourceTaxYear!==year||normalize(row.accountName)!==normalize(t.firstName+' '+t.lastName)||!/^\d{9}$/.test(ssn(row.accountSsn))||ssn(row.accountSsn)!==ssn(t.ssn))fail('actual account source owner/year/state is stale or missing');};
 const results:PAInvestmentWithholdingAccountResult[]=[];
 for(const packet of source){owner(packet);if(packet.sourceFactsConfirmed!==true)return fail('actual complete account source confirmation required');
  const filed=packet.filedReturn;owner(filed);ref(filed.returnId);date(filed.filedOn);
  if(filed.returnType!=='IT-203'||filed.returnKind!=='original'||filed.filingStatus!=='single'||filed.residency!=='nonresident'||filed.filedOn<=year+'-12-31'||filed.filedOn>asOf||filed.allIncomeClassesAndAdjustmentsReviewedConfirmed!==true||filed.allNonpaymentCreditsReviewedConfirmed!==true||filed.personalNonbusinessIntangiblesOnlyConfirmed!==true||filed.noOtherNYSourceIncomeConfirmed!==true)return fail('complete actual filed original nonresident return/income review required');
  for(const value of [filed.newYorkSourceIncome,filed.taxBeforeCredits,filed.nonpaymentCredits,filed.finalTaxLiability])if(!amount(value).isZero())return fail('actual nonzero NY income/liability/credit requires its separate return method');
  if(!amount(filed.federalIncome).eq(calculateFederalTax(input).agi))return fail('actual filed federal income contradicts the current original return');
  if(!amount(filed.withholdingReported).isZero()||!amount(filed.refundRequested).isZero())return fail('actual B withholding cannot establish a filed IT203 form withholding credit or refund');
  const claim=packet.erroneousPaymentClaim;owner(claim);ref(claim.claimId);date(claim.submittedOn);
  if(claim.kind!=='erroneous_income_tax_payment'||claim.actualWrittenClaimSubmittedConfirmed!==true||claim.notClaimedAsReturnWithholdingConfirmed!==true||normalize(claim.returnId)!==normalize(filed.returnId)||claim.submittedOn<filed.filedOn||claim.submittedOn>asOf)return fail('actual separately submitted written erroneous-payment claim and filed return linkage required');
  const determination=packet.agencyDetermination;owner(determination);ref(determination.determinationId);ref(determination.commissionerCertificateReference);ref(determination.comptrollerApprovalReference);date(determination.issuedOn);
  if(determination.disposition!=='allowed_erroneous_income_tax_payment'||determination.actualAgencyDeterminationConfirmed!==true||determination.actualCommissionerCertificationConfirmed!==true||determination.actualComptrollerApprovalConfirmed!==true||normalize(determination.claimId)!==normalize(claim.claimId)||normalize(determination.returnId)!==normalize(filed.returnId)||determination.issuedOn<claim.submittedOn||determination.issuedOn>asOf||!amount(determination.taxLiabilityDetermined).isZero())return fail('actual issued commissioner certificate and comptroller approval of the linked claim required');
  const account=packet.account;owner(account);date(account.completeThroughDate);
  if(account.completeThroughDate!==asOf||account.allPaymentsRefundsTransfersOffsetsReviewedConfirmed!==true||account.noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed!==true||account.noTransfersOrOffsetsConfirmed!==true)return fail('actual complete current account history and offsets/transfer review required');
  for(const value of [account.netTaxPaymentsReported,account.unpaidTaxReported,account.overpaymentOutstandingReported])if(!amount(value).isZero())return fail('actual account is not fully settled with zero net tax payments and balances');
  const expected=input.form1099B.flatMap((original,originalIndex)=>original.state==='NY'&&amount(original.stateWithheld).gt(0)?[{original,originalIndex}]:[]);
  if(!expected.length||packet.payments.length!==expected.length)return fail('complete actual current NY withholding original payment coverage required');
  const indices=new Set<number>(),ids=new Set<string>();let gross=new Money(0),refunds=new Money(0),latestPayment='';
  for(const payment of packet.payments){owner(payment);ref(payment.confirmationNumber);date(payment.date);const i=payment.originalIndex,current=expected.find(row=>row.originalIndex===i);
   if(i===null||!current||indices.has(i)||ids.has(normalize(payment.confirmationNumber))||payment.form!=='1099-B'||payment.actualPaymentToStateConfirmed!==true||payment.date<year+'-01-01'||payment.date>year+'-12-31'||payment.date>filed.filedOn)return fail('actual original withholding payment source/date is invalid or duplicated');indices.add(i);ids.add(normalize(payment.confirmationNumber));
   if(!Form1099BSchema.strict().safeParse(current.original).success||current.original.taxYear!==year||current.original.accountHolder!=='primary'||stable(payment.original)!==stable(current.original)||!amount(payment.amount).eq(amount(current.original.stateWithheld)))return fail('actual linked withholding original owner/year/amount is stale');
   gross=gross.plus(amount(payment.amount));if(payment.date>latestPayment)latestPayment=payment.date;
  }
  const claimedIds=claim.paymentConfirmationNumbers.map(value=>{ref(value);return normalize(value);});
  if(claimedIds.length!==ids.size||new Set(claimedIds).size!==claimedIds.length||claimedIds.some(value=>!ids.has(value)))return fail('actual written claim must link each complete original payment exactly once');
  if(!gross.eq(amount(claim.amountClaimed))||!gross.eq(amount(determination.principalPaymentAllowed))||!gross.eq(amount(determination.principalOverpaymentAllowed))||!gross.eq(amount(determination.refundPrincipalAuthorized)))return fail('actual allowed claim principal does not reconcile original source payments');
  if(!packet.refunds.length)return fail('actual received refund originals are required; a refund request is not payment');
  for(const refund of packet.refunds){owner(refund);ref(refund.confirmationNumber);date(refund.date);
   if(ids.has(normalize(refund.confirmationNumber)))return fail('duplicate actual refund receipt identity');
   if(refund.kind!=='received_refund'||refund.actualReceiptConfirmed!==true||refund.actualPrincipalInterestAllocationConfirmed!==true||normalize(refund.claimId)!==normalize(claim.claimId)||normalize(refund.determinationId)!==normalize(determination.determinationId)||refund.date<determination.issuedOn||refund.date<latestPayment||refund.date>asOf)return fail('actual refund receipt/date, agency linkage or principal allocation is invalid');
   ids.add(normalize(refund.confirmationNumber));const principal=amount(refund.principalAmount),interest=amount(refund.interestAmount),total=amount(refund.amount);
   if(!principal.gt(0)||!principal.plus(interest).eq(total))return fail('actual received refund principal and known interest must reconcile the original receipt total');refunds=refunds.plus(principal);
  }
  if(!refunds.eq(gross)||!gross.minus(refunds).eq(amount(account.netTaxPaymentsReported)))return fail('actual refunds and current net account balance do not reconcile gross withholding');
  const sourceCommitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ny-allowed-erroneous-payment-investment-v2',year,owner:t,asOf,originals:input.form1099B,packet}))));
  results.push({state:'NY',grossWithholding:publicOrdinaryMoney(gross),receivedRefunds:publicOrdinaryMoney(refunds),netTaxPayments:new Decimal(0),residentCredit:new Decimal(0),sourceCommitment});
 }
 return results;
}
