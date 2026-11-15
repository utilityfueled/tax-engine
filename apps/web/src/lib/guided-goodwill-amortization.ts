import type {Form4562Input, ScheduleCSourceFacts} from '@/models/inputs';
import {Form4562Schema} from '@/models/inputs';
import {calculateForm4562} from '@/engine/forms/form-4562';
import type {BusinessSourceData} from './guided-business-facts';
import {parseGuidedCurrency} from './guided-currency';

export const goodwillRowQuestions = {
  acquiredGoodwillForThisBusinessConfirmed:'Does the purchase allocation identify actual acquired goodwill for this business?',
  armsLengthTaxableCashPurchaseAfter1993Confirmed:'Do original records establish an arm’s-length taxable cash purchase after 1993?',
  noSelfCreatedRelatedPartyAntiChurningForeignLeaseOrDispositionConfirmed:'Do original records exclude self-created goodwill, related parties, anti-churning, foreign use, leasing and any disposition?',
  fullBusinessUseConfirmed:'Was this goodwill used entirely in this business?',
  noOtherBasisAdjustmentsConfirmed:'Do complete basis records establish no other basis adjustments or contingent purchase amounts?',
} as const;
export const goodwillCollectionQuestions = {
  fullCalendarYearConfirmed:'Do actual records cover the full calendar tax year?',
  allAssetsForThisScheduleCConfirmed:'Does this complete inventory include every amortizable asset for this Schedule C?',
  notDeductedElsewhereConfirmed:'Are goodwill costs excluded from every other expense or deduction?',
  noOtherDepreciationOrAmortizationConfirmed:'Do actual records establish no other depreciation or amortization for this business or another activity?',
} as const;
type Answers<K extends string> = Partial<Record<K,boolean|null>>;
export interface GuidedGoodwillRow extends Answers<keyof typeof goodwillRowQuestions> {
  sourceReference?:string;description?:string;basis?:string;acquisitionDate?:string;businessStartDate?:string;startMonth?:string;
}
export interface GuidedGoodwillDraft extends Answers<keyof typeof goodwillCollectionQuestions> {
  sourceTaxYear?:string;sourceReference?:string;remainingOtherExpenses?:string;remainingOtherExpenseSourceReference?:string;
  rows?:GuidedGoodwillRow[];sourceFactsConfirmed?:boolean|null;originalCollection?:unknown;
}
function fail(message:string):never{throw new Error(`Actual acquired-goodwill originals: ${message}`);}
function text(v:string|undefined,label:string):string{if(typeof v!=='string'||!v.trim()||v.length>500)fail(`${label} is unknown or invalid`);return v;}
function money(v:string|undefined,label:string):string{if(typeof v!=='string'||!v.trim())fail(`${label} is unknown`);const n=parseGuidedCurrency(v);if(n.isNegative())fail(`${label} must be nonnegative`);return n.toFixed();}
function date(v:string|undefined,label:string):string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail(`${label} must be an actual calendar date`);return v;}
function stable(v:unknown):unknown{return Array.isArray(v)?v.map(stable):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,stable(x)])):v;}
const value=(v:unknown)=>JSON.stringify(stable(v));
function keys(v:unknown,allowed:Set<string>):void{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.has(k)))fail('unsupported source fields require separate review');}
const rowKeys=new Set(['sourceReference','description','basis','acquisitionDate','businessStartDate','startMonth',...Object.keys(goodwillRowQuestions)]);
const draftKeys=new Set(['sourceTaxYear','sourceReference','remainingOtherExpenses','remainingOtherExpenseSourceReference','rows','sourceFactsConfirmed','originalCollection',...Object.keys(goodwillCollectionQuestions)]);
function collection(d:GuidedGoodwillDraft,f:BusinessSourceData){
 keys(d,draftKeys);
 if(d.sourceTaxYear!=='2025')fail('only actual current2025 sources are supported by this collector');
 const year=2025;
 if(!['primary','spouse'].includes(f.accountHolder??'')||f.accountingMethod!=='cash'||!/^\d{6}$/.test(f.businessCode??'')||!f.activityDescription?.trim())fail('actual owner and cash business identity are incomplete');
 const source=f.scheduleCSourceFacts;
 if(!source||source.accountHolder!==f.accountHolder||source.sourceTaxYear!==year||!source.ownerName?.trim())fail('actual owner, year and complete Schedule C packet are required');
 if(source.amortization||source.depreciation||source.passengerFirstYear||f.macrsAssets||f.passengerSources||f.depreciationMethod==='assets'||f.depreciationMethod==='passenger')fail('reconcile competing saved amortization, depreciation or passenger sources');
 if(!['manual',undefined].includes(f.depreciationMethod)||!parseGuidedCurrency(money(f.depreciation,'separate depreciation')).isZero())fail('actual separate depreciation must be known zero');
 for(const k of Object.keys(goodwillCollectionQuestions) as Array<keyof typeof goodwillCollectionQuestions>)if(d[k]!==true)fail('complete actual inventory and absence confirmations are required');
 if(!Array.isArray(d.rows)||d.rows.length<1||d.rows.length>100)fail('complete actual inventory is unknown or unsupported');
 const refs=new Set<string>(),identities=new Set<string>();let businessStart:string|undefined;
 const rows=d.rows.map((r,assetIndex)=>{
  keys(r,rowKeys);
  for(const k of Object.keys(goodwillRowQuestions) as Array<keyof typeof goodwillRowQuestions>)if(r[k]!==true)fail('complete acquired-goodwill eligibility and basis records are required');
  const reference=text(r.sourceReference,'asset original reference');if(refs.has(reference.trim()))fail('duplicate asset original reference');refs.add(reference.trim());
  const description=text(r.description,'actual goodwill description'),basis=money(r.basis,'actual acquired basis'),acquired=date(r.acquisitionDate,'acquisition date'),started=date(r.businessStartDate,'business-start date');
  if(acquired<'1994-01-01'||(businessStart!==undefined&&businessStart!==started))fail('acquisition or one actual business-start history is unsupported');businessStart=started;
  const later=acquired>started?acquired:started;
  if(later.slice(0,4)!==d.sourceTaxYear||r.startMonth!==later.slice(0,7))fail('actual current start month must match the later acquisition or business-start month');
  const originalAsset={description,amortizableAmount:basis,dateAmortizationBegins:r.startMonth,codeSection:'197' as const};
  const id=value([description.trim().replace(/\s+/g,' ').toLowerCase(),basis,r.startMonth]);if(identities.has(id))fail('indistinguishable goodwill original is duplicated');identities.add(id);
  return {assetIndex,sourceReference:reference,sourceFactsConfirmed:true,accountHolder:f.accountHolder as 'primary'|'spouse',originalAsset,acquisitionDate:acquired,businessStartDate:started,...Object.fromEntries(Object.keys(goodwillRowQuestions).filter(k=>k!=='noOtherBasisAdjustmentsConfirmed').map(k=>[k,true]))};
 });
 const packet={sourceTaxYear:year,sourceReference:text(d.sourceReference,'complete inventory reference'),sourceFactsConfirmed:true,fullCalendarYearConfirmed:true,allAssetsForThisScheduleCConfirmed:true,notDeductedElsewhereConfirmed:true,remainingOtherExpenses:money(d.remainingOtherExpenses,'remaining other expenses'),remainingOtherExpenseSourceReference:text(d.remainingOtherExpenseSourceReference,'remaining expense ledger reference'),rows};
 const business={accountHolder:f.accountHolder,activityDescription:f.activityDescription,businessCode:f.businessCode,businessName:f.businessName,ein:f.ein,accountingMethod:f.accountingMethod,depreciation:money(f.depreciation,'separate depreciation'),source:{...source,sourceFactsConfirmed:undefined}};
 const original={business,packet,extra:{noOtherDepreciationOrAmortizationConfirmed:d.noOtherDepreciationOrAmortizationConfirmed,rows:d.rows.map(r=>({noOtherBasisAdjustmentsConfirmed:r.noOtherBasisAdjustmentsConfirmed}))}};
 return {year,packet,original};
}
/** Capture only visibly supplied source fields; no engine result supplies an original. */
export function confirmGuidedGoodwill(d:GuidedGoodwillDraft,f:BusinessSourceData):GuidedGoodwillDraft{const c=collection(d,f);return {...d,sourceFactsConfirmed:true,originalCollection:structuredClone(c.original)};}
export function buildGuidedGoodwill(f:BusinessSourceData|undefined,returnYear:number|null|undefined,remainingOtherExpenses:string|undefined,otherActivityPresent=false):{form4562:Form4562Input;amortization:NonNullable<ScheduleCSourceFacts['amortization']>;total:ReturnType<typeof calculateForm4562>['line44']}|undefined{
 const d=f?.goodwillAmortization;if(!d)return;
 const c=collection(d,f);
 if(c.year!==returnYear||otherActivityPresent)fail('current return year or other activity requires a separate source method');
 if(d.sourceFactsConfirmed!==true||value(d.originalCollection)!==value(c.original))fail('captured original inventory, owner or business changed; reconfirm actual records');
 if(f.scheduleCSourceFacts?.sourceFactsConfirmed!==true||!parseGuidedCurrency(money(remainingOtherExpenses,'current remaining other expenses')).eq(c.packet.remainingOtherExpenses))fail('reconcile the current complete Schedule C packet and remaining expense ledger');
 const form4562=Form4562Schema.parse({taxYear:c.year,amortizableAssets:c.packet.rows.map(r=>r.originalAsset),currentYearAmortization:'0',priorYearAmortization:'0',section179ExpenseDeduction:'0',specialDepreciationAllowance:'0',macrsCurrentYearGdsDepreciation:'0',listedPropertyDepreciation:'0'});
 return {form4562,amortization:c.packet,total:calculateForm4562(form4562,c.year).line44};
}
export function guidedGoodwillErrors(f:BusinessSourceData|undefined,year:number|null|undefined,remaining:string|undefined):Record<string,string>{try{buildGuidedGoodwill(f,year,remaining);return{};}catch(error){return {goodwillAmortization:error instanceof Error?error.message:'Reconcile actual acquired-goodwill originals.'};}}
