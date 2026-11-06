/** Finite PA Bulletin2009-02 IV.A and gross ordinary interest source classification.
 * Spec: state/pa-personal-debt-foreign-sources.yaml. No federal exclusion is imported. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {PAPersonalDebtAndForeignBankSourcesSchema} from '@/models/pa-personal-debt-foreign-sources.js';
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from './pa-ordinary-source-precision.js';
import {AuditTrail} from '@/utils/audit.js';
const fail=(message:string):never=>{throw new Error('PA personal debt/foreign bank sources: '+message);};
function ref(value:unknown):string{if(typeof value!=='string'||!value.trim())return fail('actual source reference or identity is missing');return value.trim();}
function present<T>(value:T|undefined):T{if(value===undefined)return fail('actual retained original source is missing');return value;}
function stable(value:unknown):string{if(Array.isArray(value))return'['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function date(value:string,year:number):void{const stamp=Date.parse(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!value.startsWith(year+'-')||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value)fail('actual original current-year calendar date is missing or impossible');}
export interface PAPersonalDebtAndForeignBankSourcesResult{
 methodVersion:'pa-personal-debt-foreign-v1';personalDischargedAmount:Decimal;paTaxableDebtIncome:Decimal;spDebtEligibilityIncome:Decimal;foreignTaxNotDeducted:Decimal;sourceCommitment:string;lines:CalculatedLine[];
}
export function calculatePAPersonalDebtAndForeignBankSources(input:TaxYearInput,raw:unknown):PAPersonalDebtAndForeignBankSourcesResult{
 const parsed=PAPersonalDebtAndForeignBankSourcesSchema.safeParse(raw);if(!parsed.success)return fail('complete actual personal discharge and foreign bank source packet shape is required');const packet=parsed.data,year=input.taxpayer.taxYear;
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 function amount(value:unknown):Decimal{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative source amount is unknown');const n=new Money(value);if(!n.isFinite())return fail('source amount is nonfinite');return n;}
 const current=input.taxpayer.primary,identity={firstName:current.firstName,lastName:current.lastName,ssn:current.ssn};
 function header(row:{sourceTaxYear:number|null;sourceReference:string;sourceFactsConfirmed:boolean|null;owner:typeof identity}):void{
  if(![2025,2026].includes(year)||row.sourceTaxYear!==year||row.sourceFactsConfirmed!==true||!/^\d{3}-?\d{2}-?\d{4}$/.test(current.ssn)||stable(row.owner)!==stable(identity)||input.taxpayer.spouse||['married_filing_jointly','married_filing_separately'].includes(input.taxpayer.filingStatus))fail('confirm actual current primary owner/year sources; other ownership needs its separate method');ref(row.sourceReference);
 }
 const discharges=packet.personalDebtDischarges??[],foreign=packet.foreignBankTaxSources??[];
 if(discharges.length!==input.form1099C.length)return fail('every actual original1099C needs complete personal debt source coverage exactly once');
 const indices=new Set<number>(),economicDebts=new Set<string>();let discharged=new Money(0);
 for(const row of discharges){
  header(row);const index=row.originalIndex;if(index===null||indices.has(index)||index<0||!input.form1099C[index])return fail('actual discharge original index is missing or duplicated');indices.add(index);const original=present(input.form1099C[index]);
  if(stable(row.original)!==stable(original))return fail('actual personal discharge original changed; explicit source revalidation required');
  const st=row.statement,q=row.qualification;ref(st.sourceReference);ref(st.statementId);ref(st.accountReference);if(!/^\d{2}-?\d{7}$/.test(st.creditorTin))return fail('actual creditor TIN is missing');date(st.dischargedOn,year);
  if(st.originalTaxYear!==year||!/^([A-H])$/.test(st.eventCode)||st.eventCode!==original.identifiableEventCode||original.personallyLiable!==true||!amount(original.fmvOfProperty).isZero())return fail('actual original event/year/personal recourse/property classification requires its separate method');
  const key=st.creditorTin.replace(/\D/g,'')+'|'+st.accountReference.trim()+'|'+st.dischargedOn;if(economicDebts.has(key))return fail('duplicate actual personal debt discharge event');economicDebts.add(key);
  for(const value of [q.useSourceReference,q.legalSourceReference,q.deductionSourceReference,q.relationshipSourceReference,q.propertySourceReference])ref(value);
  for(const answer of [q.legallyDischargedConfirmed,q.noResidualGuarantyPaymentConfirmed,q.allCancelledChargesIncludedConfirmed,q.purelyPersonalLivingUseConfirmed,q.noBusinessRentalInvestmentUseOrSecurityConfirmed,q.noCurrentOrPriorPADeductionOffsetOrBasisConfirmed,q.noEmploymentOrServiceConsiderationConfirmed,q.noPropertyTransferConfirmed,q.noCashPropertyOrNewBorrowingAtDischargeConfirmed])if(answer!==true)return fail('actual finite purely personal discharge source classification is unknown or requires its separate method');
  const principal=amount(st.principalCancelled),interest=amount(st.interestCancelled),fees=amount(st.feesCancelled),total=principal.plus(interest).plus(fees);
  if(!total.gt(0)||!total.eq(amount(original.amountDischarged))||!interest.eq(amount(original.interestIncluded)))return fail('complete cancelled charges and included interest do not reconcile actual original');
  // Existing federal original metadata may not be replaced by contradictory PA evidence.
  let retainedUnsecured=false;
  if(q.noCollateralOfAnyKindConfirmed===false)return fail('actual personal collateral requires its separate method');
  if(input.form982NolSources!==undefined){const federal=input.form982NolSources.debts?.filter(debt=>debt.sourceId==='form1099C:'+index);if(federal?.length!==1)return fail('retained federal debt original linkage is incomplete');const debt=present(federal[0]);
   // Reconcile retained facts only when present; absent optional metadata is unknown.
   const normalizedName=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
   if((debt.accountHolder!==undefined&&debt.accountHolder!=='primary')||
    (debt.debtorName!==undefined&&normalizedName(debt.debtorName)!==normalizedName(current.firstName+' '+current.lastName))||
    (debt.debtorSsnLast4!==undefined&&debt.debtorSsnLast4!==current.ssn.replace(/\D/g,'').slice(-4)))return fail('retained actual federal debtor identity contradicts current primary');
   if(debt.unsecuredPersonalDebtConfirmed===false||debt.noPropertyTransferConfirmed===false||
    (debt.personalDebt?.sourceFactsConfirmed===true&&debt.personalDebt.proceedsUse!==undefined&&debt.personalDebt.proceedsUse!=='personal_living_expenses'))return fail('retained actual federal security transfer or proceeds use contradicts finite personal unsecured method');
   const retainedCharges=debt.personalDebt;
   if(retainedCharges?.sourceFactsConfirmed===true&&
    ((retainedCharges.actualDischargedAmount!==undefined&&!amount(retainedCharges.actualDischargedAmount).eq(total))||
     (retainedCharges.actualDischargedInterest!==undefined&&!amount(retainedCharges.actualDischargedInterest).eq(interest))))return fail('retained confirmed actual discharge amounts contradict current original complete charges');
   if((debt.personallyLiable!==undefined&&debt.personallyLiable!==original.personallyLiable)||
    (debt.fmvOfProperty!==undefined&&!amount(debt.fmvOfProperty).eq(amount(original.fmvOfProperty))))return fail('retained current original debt boxes disagree with actual1099C');
   if(debt.sourceFactsConfirmed!==true||debt.sourceTaxYear!==year||debt.statementId!==st.statementId||debt.creditorTin?.replace(/\D/g,'')!==st.creditorTin.replace(/\D/g,'')||debt.accountReference!==st.accountReference||debt.dischargeDate!==st.dischargedOn||debt.identifiableEventCode!==st.eventCode||debt.creditor!==original.creditor||!amount(debt.amountDischarged).eq(total)||!amount(debt.interestIncluded).eq(interest))return fail('PA personal debt evidence contradicts retained actual federal original metadata');
   retainedUnsecured=debt.unsecuredPersonalDebtConfirmed===true;
  }
  if(q.noCollateralOfAnyKindConfirmed!==true&&!retainedUnsecured)return fail('actual no collateral of any kind qualification is unknown; finite unsecured method requires actual proof');
  discharged=discharged.plus(total);
 }
 const required=input.form1099Int.flatMap((original,index)=>amount(original.foreignTaxPaid).gt(0)?[index]:[]),foreignIndices=new Set<number>(),receipts=new Set<string>();let tax=new Money(0);
 if(foreign.length!==required.length)return fail('every positive original foreign bank tax needs actual original receipt coverage exactly once');
 for(const row of foreign){
  header(row);const index=row.originalIndex;if(index===null||foreignIndices.has(index)||!required.includes(index))return fail('actual foreign bank source index is missing or duplicated');foreignIndices.add(index);const original=present(input.form1099Int[index]);
  if(stable(row.original)!==stable(original)||row.originalTaxYear!==year||(original.taxYear!==undefined&&original.taxYear!==year)||original.accountHolder!=='primary')return fail('foreign bank actual current original owner/year/amount changed');
  const country=ref(row.foreignCountry);if(country!==original.foreignCountry?.trim()||row.jurisdictionKind!=='foreign_country'||row.ordinaryPersonalInterestOnlyConfirmed!==true||row.allForeignTaxReceiptsIncludedConfirmed!==true||!row.payments.length)return fail('actual foreign country and ordinary personal bank tax source classification is unknown');
  ref(original.accountReference);ref(original.payerTin);let paid=new Money(0);
  for(const payment of row.payments){ref(payment.sourceReference);const number=ref(payment.receiptNumber);date(payment.paidOn,year);const key=country+'|'+number;if(receipts.has(key)||payment.currency!=='USD'||payment.country!==country)return fail('foreign bank original payment receipt is duplicated or requires currency/jurisdiction successor');receipts.add(key);paid=paid.plus(amount(payment.amount));}
  if(!paid.eq(amount(original.foreignTaxPaid)))return fail('actual original foreign tax receipts do not reconcile originalBox6');tax=tax.plus(paid);
 }
 const commitment=bytesToHex(sha256(new TextEncoder().encode(stable({year,owner:identity,form1099C:input.form1099C,form1099Int:input.form1099Int,federalDebts:input.form982NolSources?.debts,packet}))));
 const audit=new AuditTrail();audit.record('PA-Personal-Debt-Sources','nonincome','Purely personal unsecured debt cancelled',discharged,'Complete actual personal-use nonemployment nonproperty debt; PA Bulletin2009-02 IV.A, not federal insolvency');audit.record('PA-Personal-Debt-Sources','SP-exclusion','Debt cancellation cash/property eligibility inclusion',new Money(0),'No cash/property received; PA Tax Forgiveness eligibility exclusion');audit.record('PA-Foreign-Bank-Sources','tax-not-deducted','Foreign bank tax retained without PA deduction or credit',tax,'Gross ordinary interest remains taxable; foreign country is outside current PA resident-credit jurisdiction');
 return{methodVersion:'pa-personal-debt-foreign-v1',personalDischargedAmount:publicOrdinaryMoney(discharged),paTaxableDebtIncome:new Decimal(0),spDebtEligibilityIncome:new Decimal(0),foreignTaxNotDeducted:publicOrdinaryMoney(tax),sourceCommitment:commitment,lines:publicOrdinaryLines(audit.getLines())};
}
