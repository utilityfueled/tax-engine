/** Pure current care source replay. Spec: state/pa-ordinary-care-sources.yaml. */
import Decimal from 'decimal.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {TaxReturnResult} from '@/models/outputs.js';
import type {PAOrdinaryReturnCompletionSources} from '@/models/pa-ordinary-return-completion.js';
import {PACompletionOriginalRecordSchema} from '@/models/pa-ordinary-return-completion.js';
import {PAOrdinaryCareSourcesSchema} from '@/models/pa-care-sources.js';
import type {PAResidencySourcesResult} from './pa-residency-sources.js';
import {calculateScheduleDC,type ScheduleDCResult} from './pa-schedule-dc.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
const fail=(detail:string):never=>{throw new Error('PA actual care sources: '+detail);};
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const identity=(s:string)=>s.trim().replace(/\s+/g,' ').toUpperCase();
const tin=(s:string)=>s.replace(/\D/g,'');
const ref=(s:string)=>{if(!s.trim())return fail('actual original reference is missing');};
function day(s:string,y:number,asOf:string):void{const n=Date.parse(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s||!s.startsWith(y+'-')||s>asOf)return fail('actual paid/incurred date must be in the current tax year and not future');}
export function calculatePAOrdinaryCareSources(input:TaxYearInput,care:PAOrdinaryReturnCompletionSources['care'],income:PAResidencySourcesResult,federal:TaxReturnResult,asOf:string):ScheduleDCResult|undefined{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,care),rounding:Decimal.ROUND_HALF_UP});
 const money=(value:unknown):Decimal=>{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative amount is missing; known zero must be explicit');const n=new Money(value);if(!n.isFinite())return fail('actual amount is nonfinite');return n;};
 ref(care.sourceReference);
 if(care.allCarePaymentSourcesReviewedConfirmed!==true||care.allEmployerBenefitsIncludedConfirmed!==true)return fail('complete actual payment and employer-benefit source review is required');
 if(care.status==='no_qualifying_expenses'){
  if(care.careSources!==undefined||care.originalCarePayments.length||input.dependentCare!==undefined||input.dependentCareBenefits!==undefined||input.w2s.some(w=>!money(w.box10DependentCareBenefits).isZero())||federal.form2441?.credit.gt(0))return fail('no-expense status contradicts retained care or benefit originals');
  return undefined;
 }
 if(care.status!=='actual_expenses')return fail('actual care status is unknown');
 const parsed=PAOrdinaryCareSourcesSchema.safeParse(care.careSources);if(!parsed.success)return fail('complete actual care source packet is required');const source=parsed.data,y=input.taxpayer.taxYear,c=input.dependentCare,t=input.taxpayer.primary;
 if(source.sourceTaxYear!==y||source.sourceFactsConfirmed!==true)return fail('confirm the actual current-year care originals');ref(source.sourceReference);
 if(!c||stable(source.originalDependentCare)!==stable(c))return fail('current care originals differ from the retained snapshot');
 if(income.residencyStatus!=='resident'||input.taxpayer.spouse||input.taxpayer.filingStatus!=='single')return fail('first care method requires actual single full-year resident originals');
 if(c.sourceFactsConfirmed!==true||c.eligibilityConfirmed!==true||c.receivedBenefits!==false||c.usesDeemedIncome!==false||input.dependentCareBenefits!==undefined||input.w2s.some(w=>!money(w.box10DependentCareBenefits).isZero())||!money(c.excludedDependentCareBenefits).isZero()||!money(c.priorYearExpenseCredit).isZero())return fail('actual eligibility, known zero benefits/prior credit and ordinary earned income are required');
 if(!c.providers||!c.qualifyingPersons||!c.providers.length||!c.qualifyingPersons.length||c.qualifyingIndividuals!==c.qualifyingPersons.length||!source.payments.length)return fail('complete actual providers, qualifying persons and paid receipts are required');
 const wages=input.w2s.reduce((sum,w)=>sum.plus(money(w.wages)),new Money(0));
 // This first earned-income worksheet is W2-only. Never silently discard SE,
 // excluded wages, taxable benefits or other earned-income adjustments.
 if(input.scheduleC!==undefined||input.scheduleF!==undefined||input.form1099Nec.length||!federal.otherIncome.isZero()||!federal.adjustmentsToIncome.isZero()||!federal.totalWages.eq(wages)||!money(c.primaryEarnedIncome).eq(wages))return fail('actual W2-only earned-income worksheet must reconcile fresh federal wages and adjustments');
 // Every counted person must qualify, including a genuine second person with
 // zero assigned expenses. Such a person may lawfully increase the expense cap.
 const countedPersons=new Set<string>();
 for(const person of c.qualifyingPersons){
  if(person.identifierType!=='tax_id'||!person.taxId||!/^\d{9}$/.test(tin(person.taxId??''))||person.over12Disabled||person.qualifyingPersonConfirmed!==true)return fail('every counted qualifying person requires actual ordinary eligibility');
  const id=tin(person.taxId??'');if(countedPersons.has(id))return fail('duplicate counted qualifying-person identity');countedPersons.add(id);
  const dependent=input.taxpayer.dependents.filter(d=>tin(d.ssn)===id);
  if(dependent.length!==1)return fail('every counted qualifying person needs matching actual dependent originals');
  const d=dependent[0],birth=Date.parse(d.dateOfBirth+'T00:00:00Z');
  if(d.monthsLivedWithYou!==12||identity(d.firstName+' '+d.lastName)!==identity(person.firstName+' '+person.lastName)||!/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth)||!Number.isFinite(birth)||new Date(birth).toISOString().slice(0,10)!==d.dateOfBirth||d.dateOfBirth<`${y-12}-01-01`||d.dateOfBirth>`${y}-12-31`)return fail('every counted person needs actual full-year under13 dependent proof');
  money(person.qualifiedExpenses);
 }
 const providerIdentities=new Set<string>(),excludedProviders=new Set([tin(t.ssn),...input.taxpayer.dependents.map(d=>tin(d.ssn))]);
 for(const provider of c.providers){
  ref(provider.name);ref(provider.address);
  if(provider.identifierType!=='tin'||!provider.taxId||!/^\d{9}$/.test(tin(provider.taxId??''))||provider.householdEmployee)return fail('actual ordinary non-household provider identity is required');
  const id=tin(provider.taxId??'');if(excludedProviders.has(id)||providerIdentities.has(id))return fail('care provider cannot be the claimant, a claimed dependent or a duplicate provider identity');providerIdentities.add(id);money(provider.amountPaid);
 }
 const providerTotals=c.providers.map(()=>new Money(0)),personTotals=c.qualifyingPersons.map(()=>new Money(0)),seen=new Set<string>(),refs=new Set<string>();
 for(const row of source.payments){
  ref(row.sourceReference);const pi=row.providerIndex,qi=row.qualifyingPersonIndex;
  if(row.originalAvailableConfirmed!==true||row.employmentRelatedConfirmed!==true||row.notClaimedOnAnotherReturnConfirmed!==true||pi===null||qi===null||pi<0||qi<0||pi>=c.providers.length||qi>=c.qualifyingPersons.length)return fail('actual available work-related receipt and provider/person assignment are required');
  for(const d of [row.paidOn,row.serviceFrom,row.serviceThrough])day(d,y,asOf);if(row.serviceFrom>row.serviceThrough)return fail('actual service period is reversed');
  const provider=c.providers[pi],person=c.qualifyingPersons[qi],original=row.originalReceipt,amount=money(row.amount);ref(original.receiptNumber);
  const dependent=input.taxpayer.dependents.find(d=>tin(d.ssn)===tin(person.taxId??''));
  if(!dependent||dependent.dateOfBirth>row.serviceFrom)return fail('actual service cannot predate qualifying-person birth');
  if(original.date!==row.paidOn||!money(original.amount).eq(amount)||identity(original.providerName)!==identity(provider.name)||tin(original.providerTin)!==tin(provider.taxId??'')||identity(original.qualifyingPersonName)!==identity(person.firstName+' '+person.lastName)||tin(original.qualifyingPersonTin)!==tin(person.taxId??''))return fail('actual receipt date, amount, provider or qualifying-person identity differs');
  const key=tin(provider.taxId??'')+'|'+identity(original.receiptNumber);if(seen.has(key)||refs.has(row.sourceReference))return fail('duplicate actual care receipt or source identity');seen.add(key);refs.add(row.sourceReference);
  const metadata=care.originalCarePayments.filter(m=>m.sourceReference===row.sourceReference);if(metadata.length!==1)return fail('each actual care receipt requires exactly one matching reviewed document record');
  const record=PACompletionOriginalRecordSchema.safeParse(metadata[0]);if(!record.success)return fail('actual care document metadata is incomplete');const m=record.data;
  if(m.recordKind!=='care_payment'||m.sourceTaxYear!==y||m.originalAvailableConfirmed!==true||m.recordDate!==row.paidOn||identity(m.issuerName)!==identity(provider.name)||identity(m.recipientName)!==identity(t.firstName+' '+t.lastName)||tin(m.recipientTin)!==tin(t.ssn))return fail('actual receipt metadata owner, issuer, year or date differs');ref(m.documentName);
  providerTotals[pi]=providerTotals[pi].plus(amount);personTotals[qi]=personTotals[qi].plus(amount);
 }
 if(refs.size!==care.originalCarePayments.length||providerTotals.some((n,i)=>!n.eq(money(c.providers?.[i].amountPaid)))||personTotals.some((n,i)=>!n.eq(money(c.qualifyingPersons?.[i].qualifiedExpenses)))||!providerTotals.reduce((s,n)=>s.plus(n),new Money(0)).eq(money(c.expenses)))return fail('complete original provider/person/expense totals must reconcile exactly once');
 const form=federal.form2441,tentative=form?.lines.find(l=>l.line==='9a')?.value,limit=publicOrdinaryMoney(Money.max(new Money(federal.totalTaxBeforeCredits).minus(federal.foreignTaxCredit),0));
 if(!form||!tentative||!form.credit.eq(tentative)||limit.lt(tentative)||!tentative.gt(0))return fail('actual positive federal9a and nonbinding credit-limit worksheet are required');
 return calculateScheduleDC({taxYear:y,qualifyingPersons:c.qualifyingIndividuals,paTaxableIncome:income.totalOrdinaryPATaxableIncome,federalCredit:form.credit,
  ...(y===2026?{source2022Conformity:{sourceTaxYear:y,sourceReference:source.sourceReference,sourceFactsConfirmed:true,residentIndividualEligibilityConfirmed:true,eligibilityUnder2022Section21Confirmed:true,currentYearExpensesOnlyConfirmed:true,actualEarnedIncomeOnlyConfirmed:true,expensesNotClaimedOnAnotherReturnConfirmed:true,
   federal:{taxYear:y,filingStatus:input.taxpayer.filingStatus,eligibilityConfirmed:true,earnedIncomeFactsVerified:true,careExpenses:publicOrdinaryMoney(money(c.expenses)),qualifyingIndividuals:c.qualifyingIndividuals,earnedIncome:publicOrdinaryMoney(money(c.primaryEarnedIncome)),agi:federal.agi,excludedDependentCareBenefits:publicOrdinaryMoney(money(c.excludedDependentCareBenefits)),priorYearExpenseCredit:publicOrdinaryMoney(money(c.priorYearExpenseCredit)),taxLiabilityLimit:limit}}}:{})});
}
