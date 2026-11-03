/** FICTIONAL actual source records. Literal oracles precede any native outputs. */
import type {TaxYearInput} from '@/models/inputs';
import type {OhioResidencyDraft} from '@/lib/guided-ohio-residency-facts';
import type {OhioPaymentDraft} from '@/lib/guided-ohio-payment-facts';
import {startCompleteInterview} from '../guided-interview/complete-facts';
import {ohioResidentCreditFixture} from './oh-resident-credit-sources';
import {ohioResidentCreditTransactionsFixture} from './oh-resident-credit-transactions';
export const residentCreditConfirmLabel='Confirm actual Virginia return and completed account sources';
export const residentCreditAddLabel='Add actual Ohio resident credit source records';
export type ResidentCreditNativeCase='ordinary'|'distinct'|'cents'|'cap'|'zero';
export function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Explicit fictional original required');return value;}
export function recordAt(value:unknown,...path:Array<string|number>):Record<string,unknown>{for(const key of path){if(!value||typeof value!=='object')throw Error('Actual fictional source path required');value=Reflect.get(value,key);}if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Actual fictional source record required');return value as Record<string,unknown>;}
function entered(value:unknown,key=''):unknown{if(Array.isArray(value))return value.map(item=>entered(item));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,entered(v,k)]));return (key==='taxYear'||key==='sourceTaxYear')&&typeof value==='number'?String(value):value;}
function undefinedPaths(value:unknown,path:Array<string|number>=[]):Array<Array<string|number>>{if(!value||typeof value!=='object')return[];return Object.keys(value).flatMap(key=>{const part=Array.isArray(value)?Number(key):key,child=Reflect.get(value,key),next=[...path,part];return child===undefined?[next]:undefinedPaths(child,next);});}
/** Explicit fictional completed cap account; original old constructor needs an existing refund receipt. */
function capResidentCreditOriginal(){
 const original=ohioResidentCreditTransactionsFixture('500.00','1000.00','700.00','1000.00');
 // These are independently authored original tax/credit/account facts, never a calculated native output.
 original.source.filedReturn.incomeTaxBeforeCredits='3000';
 original.source.filedReturn.netIncomeTax='1500.00';
 original.source.completedAccount.netIncomeTax='1500.00';
 return original;
}
export function guidedResidentCreditFixture(kind:ResidentCreditNativeCase='ordinary'){
 const original=kind==='zero'?ohioResidentCreditFixture('60000','0','2500'):kind==='ordinary'?ohioResidentCreditFixture():kind==='cents'?ohioResidentCreditTransactionsFixture('250.25','1000.50','700.00','500.50'):kind==='cap'?capResidentCreditOriginal():ohioResidentCreditTransactionsFixture();
 const {ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...federalOriginals}=original.input;
 const input:TaxYearInput=structuredClone(federalOriginals),source=structuredClone(original.source);
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 const personal=required(state.sectionData['personal-info']);Object.assign(personal,{firstName:'Robin',lastName:'ResidentCredit',ssn:'900-71-0412',dateOfBirth:input.taxpayer.primary.dateOfBirth,stateResidency:'full-year',state:'OH'});
 const draft:Record<string,unknown>={...recordAt(entered(source)),sourceFactsConfirmed:true,originalW2:structuredClone(source.originalW2),originalFederalSources:structuredClone(federalOriginals),originalResidentCreditSourcePacket:structuredClone(source),originalW2UndefinedPaths:undefinedPaths(source.originalW2),paymentsReviewed:true,refundsReviewed:true};
 const {residentCreditSources:_credit,...parent}=original.facts;
 const residency={...structuredClone(parent),taxYear:'2025',originalFederalSources:structuredClone(federalOriginals),owners:parent.owners.map(owner=>({...structuredClone(owner),stateAdditions:[],stateDeductions:[]}))} as unknown as OhioResidencyDraft;
 Reflect.set(residency,'residentCreditSources',draft);
 const payments={...structuredClone(original.payments),taxYear:'2025',originalFederalSources:structuredClone(federalOriginals),specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}} as unknown as OhioPaymentDraft;
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:residency,ohioPayments:payments};
 const expected=kind==='zero'?{credit:'0',tax:'2323',refund:'177'}:kind==='cents'?{credit:'1001',tax:'1322',refund:'678'}:kind==='cap'?{credit:'1394',tax:'929',refund:'1071'}:{credit:'1000',tax:'1323',refund:'677'};
 return{kind,state,input,draft,residency,payments,source,expected};
}
export type ResidentCreditNativeField=[label:string,path:Array<string|number>,value:string];
const words:Record<string,string>={sourceTaxYear:'source year',sourceReference:'source reference',accountHolder:'owner',originalTaxpayer:'original person',firstName:'first name',lastName:'last name',ssn:'SSN',allIncomeOriginalsIncludedConfirmed:'all income originals included',noOtherIncomeOrAdjustmentsConfirmed:'no other income or adjustments',noSpecialCompensationConfirmed:'no special compensation',taxDeductedInFederalAgi:'tax deducted in federal adjusted gross income',employerEntityOriginal:'employer record',sourceId:'record ID',documentDate:'document date',employerName:'employer name',employerTin:'employer EIN',entityType:'employer type',serviceRows:'service',servicePeriodFrom:'service begins',servicePeriodTo:'service ends',paymentDate:'payment date',serviceState:'service state',wages:'actual wages',filedReturn:'filed return',taxYear:'tax year',stateCode:'state',form:'form',filingStatus:'filing status',returnKind:'return kind',periodFrom:'period begins',periodTo:'period ends',filedDate:'actual filing date',federalAgi:'federal adjusted gross income',incomeTaxedByVirginia:'income taxed by Virginia',incomeTaxBeforeCredits:'tax before credits',nonrefundableCredits:'nonrefundable credits',netIncomeTax:'net income tax',withholding:'withholding',estimatedPayments:'estimated payments',balancePayments:'balance payments',refund:'refund',outgoingCredit:'outgoing credit',otherTaxes:'other taxes',penalties:'penalties',interest:'interest',completedReturnAndCreditWorksheetsReference:'completed return and credit worksheet reference',completedAccount:'completed account',statementDate:'statement date',unpaidTax:'unpaid tax',unappliedPayments:'unapplied payments',allPaymentsAndRefundsIncludedConfirmed:'all payments and refunds included',noPendingChangesOrRefundClaimsConfirmed:'no pending changes or refund claims',payments:'payment',refunds:'received refund',kind:'record type',date:'actual date',amount:'actual amount',transactionOriginals:'transaction originals',bankTransferOriginal:'bank transfer',agencyPostingOriginal:'agency posting',purpose:'tax purpose',taxPeriodEnd:'tax period end',achTraceNumber:'ACH credit trace number',settlementDate:'settlement date',status:'status',accountSourceReference:'account source reference',postingDate:'posting date',postingId:'posting ID'};
export function residentCreditNativeFields(f:ReturnType<typeof guidedResidentCreditFixture>):ResidentCreditNativeField[]{
 const result:ResidentCreditNativeField[]=[];
 function walk(value:unknown,path:Array<string|number>):void{
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,[...path,index]));return;}
  if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value))walk(child,[...path,key]);return;}
  if(value===undefined||value===null)return;
  const label='Virginia '+path.map(part=>typeof part==='number'?String(part+1):required(words[part])).join(' ');
  result.push([label,path,String(value)]);
 }
 for(const[key,value]of Object.entries(f.source))if(!['sourceFactsConfirmed','originalW2'].includes(key))walk(value,[key]);
 return result;
}
