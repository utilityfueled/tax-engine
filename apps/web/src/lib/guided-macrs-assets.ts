/** Native original records, not an election/eligibility calculator. */
import Decimal from 'decimal.js';
import {DepreciableAssetSchema,Form4562Schema,type DepreciableAsset,type Form4562Input,type ScheduleCSourceFacts} from '@/models/inputs';
import {calculateForm4562} from '@/engine/forms/form-4562';
import type {BusinessSourceData} from './guided-business-facts';

export interface GuidedMacrsAssetRow {
  assetReference?:string; description?:string; grossCostBasis?:string; businessUsePercentage?:string;
  placedInServiceDate?:string; recoveryPeriod?:string; method?:string;
  section179BusinessDeduction?:string; bonusBusinessDeduction?:string;
  grossBasisSourceReference?:string; businessUseSourceReference?:string; section179SourceReference?:string; bonusSourceReference?:string;
  bonusZeroTreatment?:'not_eligible'|'elected_out'|''; bonusTreatmentSourceReference?:string;
  ordinaryNonlistedConfirmed?:boolean|null; nonpassengerConfirmed?:boolean|null; noDispositionConfirmed?:boolean|null;
  constantBusinessUseConfirmed?:boolean|null; noHistoryConfirmed?:boolean|null;
  noOtherBasisAdjustmentsConfirmed?:boolean|null; noConversionOrCarryoverBasisConfirmed?:boolean|null;
  section179NotElectedConfirmed?:boolean|null; sourceFactsConfirmed?:boolean|null;
  originalAsset?:DepreciableAsset;
}
export interface GuidedMacrsAssetsDraft {
  sourceTaxYear?:string; sourceReference?:string;
  fullCalendarYearConfirmed?:boolean|null; allAssetsForThisBusinessConfirmed?:boolean|null;
  noOtherActivityAssetsConfirmed?:boolean|null; noOtherDepreciationOrAmortizationConfirmed?:boolean|null;
  notDeductedElsewhereConfirmed?:boolean|null; sourceFactsConfirmed?:boolean|null;
  rows?:GuidedMacrsAssetRow[];
  originalBusiness?:Record<string,unknown>;
  originalCollection?:unknown;
}
export const macrsRowQuestions = {
  ordinaryNonlistedConfirmed:'Is this ordinary property outside listed-property rules?',
  nonpassengerConfirmed:'Do the actual classification records establish this is not a passenger automobile?',
  noDispositionConfirmed:'Was this property retained throughout the remainder of the tax year?',
  constantBusinessUseConfirmed:'Do actual records establish constant business use throughout its service period?',
  noHistoryConfirmed:'Is this a first-year asset with no prior depreciation history?',
  noOtherBasisAdjustmentsConfirmed:'Do actual basis records exclude all other basis adjustments?',
  noConversionOrCarryoverBasisConfirmed:'Do actual records exclude conversion and carryover basis?',
  section179NotElectedConfirmed:'Does the completed worksheet establish no section179 election for this asset?',
} as const;
export const macrsCollectionQuestions = {
  fullCalendarYearConfirmed:'Do the actual records cover the full calendar tax year?',
  allAssetsForThisBusinessConfirmed:'Does this complete inventory contain every asset for this Schedule C?',
  noOtherActivityAssetsConfirmed:'Do actual records establish no other activity or owner has property requiring a combined convention test?',
  noOtherDepreciationOrAmortizationConfirmed:'Do actual records establish no other depreciation or amortization deductions?',
  notDeductedElsewhereConfirmed:'Are these costs excluded from every other deduction?',
} as const;
export function macrsSourceValue(value:unknown):string {
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,stable(x)])):v;
  return JSON.stringify(stable(value));
}
function fail(reason:string):never {throw new Error(`Actual first-year asset records: ${reason}`);}
function reference(v:string|undefined,label:string):string {if(!v?.trim()||v.length>500)return fail(`${label} is unknown or invalid`);return v;}
function money(v:string|undefined,label:string):string {if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v)||!new Decimal(v).isFinite())return fail(`${label} must be an actual nonnegative amount`);return v;}
function year(v:string|undefined):number {if(typeof v!=='string'||!/^\d{4}$/.test(v)||![2025,2026].includes(Number(v)))return fail('the actual supported source year is unknown');return Number(v);}
function businessOriginal(f:BusinessSourceData):Record<string,unknown>{
  if(!['primary','spouse'].includes(f.accountHolder??'')||!f.activityDescription?.trim()||!/^\d{6}$/.test(f.businessCode??'')||f.accountingMethod!=='cash')fail('actual owner and cash business identity are incomplete');
  const s=f.scheduleCSourceFacts;
  if(!s||!s.ownerName?.trim()||s.accountHolder!==f.accountHolder)fail('complete actual Schedule C owner originals are required');
  reference(s.sourceReference,'business reference');
  return {accountHolder:f.accountHolder,principalBusinessActivity:f.activityDescription,businessCode:f.businessCode,businessName:f.businessName,ein:f.ein,accountingMethod:f.accountingMethod,ownerName:s.ownerName,businessSourceReference:s.sourceReference};
}
const rowKeys = new Set(['assetReference','description','grossCostBasis','businessUsePercentage','placedInServiceDate','recoveryPeriod','method','section179BusinessDeduction','bonusBusinessDeduction','grossBasisSourceReference','businessUseSourceReference','section179SourceReference','bonusSourceReference','bonusZeroTreatment','bonusTreatmentSourceReference','sourceFactsConfirmed','originalAsset',...Object.keys(macrsRowQuestions)]);
const collectionKeys = new Set(['sourceTaxYear','sourceReference','sourceFactsConfirmed','rows','originalBusiness','originalCollection',...Object.keys(macrsCollectionQuestions)]);
function supportedKeys(value:unknown,keys:Set<string>):void {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.has(key)))fail('the saved source record has unsupported facts requiring review');
}
/** Pure candidate reconstruction used only to compare against an explicitly captured original. */
function currentAsset(row:GuidedMacrsAssetRow,sourceYear:number,calendar:boolean|null|undefined):DepreciableAsset {
  supportedKeys(row,rowKeys);
  for(const k of Object.keys(macrsRowQuestions) as Array<keyof typeof macrsRowQuestions>)if(row[k]!==true)fail('complete actual ordinary asset qualifications are required');
  if(calendar!==true)fail('actual full calendar year is unknown');
  const sourceReference=reference(row.assetReference,'unique asset reference');reference(row.description,'asset description');
  const gross=money(row.grossCostBasis,'gross basis'),use=money(row.businessUsePercentage,'business use');
  if(new Decimal(use).gt(100)||!new Decimal(use).eq(String(Number(use))))fail('business percentage is outside the exact supported range');
  const section179=money(row.section179BusinessDeduction,'actual section179'),bonus=money(row.bonusBusinessDeduction,'actual bonus');
  if(!new Decimal(section179).isZero()||!new Decimal(bonus).isZero())fail('positive section179 or bonus requires its separate eligibility and election method');
  if(!['not_eligible','elected_out'].includes(row.bonusZeroTreatment??''))fail('the actual zero-bonus treatment is unknown');
  reference(row.bonusTreatmentSourceReference,'zero-bonus treatment record');
  if(row.method!=='200DB'||!['3','5','7','10'].includes(row.recoveryPeriod??''))fail('actual GDS200DB class is unsupported or unknown');
  if(!row.placedInServiceDate||Number(row.placedInServiceDate.slice(0,4))!==sourceYear)fail('the actual full service date must be in the source year');
  const asset={description:row.description,costBasis:new Decimal(gross).minus(section179).toString(),placedInServiceDate:row.placedInServiceDate,recoveryPeriod:row.recoveryPeriod,method:row.method,disposedDuringYear:false,isListedProperty:false,isPassengerAutomobile:false,businessUsePercentage:Number(use),firstYearBonusEligible:false};
  const parsed=DepreciableAssetSchema.safeParse({...asset,basisSources:{version:'macrs-basis-v1',system:'GDS',sourceTaxYear:sourceYear,sourceReference,
    grossBasisSourceReference:reference(row.grossBasisSourceReference,'gross basis source'),businessUseSourceReference:reference(row.businessUseSourceReference,'actual use log'),section179SourceReference:reference(row.section179SourceReference,'zero179 worksheet'),bonusSourceReference:reference(row.bonusSourceReference,'zero-bonus worksheet'),
    confirmed:true,calendarYear:true,usePattern:'constant_business_only',changedUseDuringYear:false,noOtherBasisAdjustmentsConfirmed:true,noConversionOrCarryoverBasisConfirmed:true,legacyCostBasisMeaning:'gross_basis_less_business_section179_before_bonus',grossCostBasis:gross,businessUsePercentage:use,section179BusinessDeduction:section179,bonusBusinessDeduction:bonus,assetSnapshot:asset}});
  if(!parsed.success)fail('actual asset date or basis originals are invalid');
  return parsed.data;
}
export function confirmGuidedMacrsAsset(row:GuidedMacrsAssetRow,draft:GuidedMacrsAssetsDraft):GuidedMacrsAssetRow {
  return {...row,originalAsset:currentAsset(row,year(draft.sourceTaxYear),draft.fullCalendarYearConfirmed),sourceFactsConfirmed:true};
}
function collection(d:GuidedMacrsAssetsDraft,f:BusinessSourceData){
  supportedKeys(d,collectionKeys);
  const sourceYear=year(d.sourceTaxYear);reference(d.sourceReference,'complete inventory reference');
  for(const k of Object.keys(macrsCollectionQuestions) as Array<keyof typeof macrsCollectionQuestions>)if(d[k]!==true)fail('complete actual inventory and absence-of-other-property records are required');
  if(!Array.isArray(d.rows)||!d.rows.length)fail('the complete asset inventory is unknown');
  if(!new Decimal(money(f.depreciation,'separate scalar depreciation')).isZero())fail('reconcile the separate scalar depreciation to actual zero before using assets');
  const ids=new Set<string>();
  const rows=d.rows.map((row,index)=>{
    const id=reference(row.assetReference,'unique asset reference');if(ids.has(id))fail('an original asset is duplicated');ids.add(id);
    const current=currentAsset(row,sourceYear,d.fullCalendarYearConfirmed);
    if(row.sourceFactsConfirmed!==true||!row.originalAsset||macrsSourceValue(current)!==macrsSourceValue(row.originalAsset))fail('an actual asset original is missing or changed');
    return {assetIndex:index,assetReference:id,accountHolder:f.accountHolder as 'primary'|'spouse',bonusZeroTreatment:row.bonusZeroTreatment as 'not_eligible'|'elected_out',bonusTreatmentSourceReference:reference(row.bonusTreatmentSourceReference,'zero-bonus treatment'),originalAsset:structuredClone(row.originalAsset)};
  });
  return {sourceYear,rows,business:businessOriginal(f),original:{sourceTaxYear:d.sourceTaxYear,sourceReference:d.sourceReference,...Object.fromEntries(Object.keys(macrsCollectionQuestions).map(key=>[key,d[key as keyof GuidedMacrsAssetsDraft]])),rows}};
}
export function confirmGuidedMacrsCollection(d:GuidedMacrsAssetsDraft,f:BusinessSourceData):GuidedMacrsAssetsDraft {
  const c=collection(d,f);return {...d,originalBusiness:structuredClone(c.business),originalCollection:structuredClone(c.original),sourceFactsConfirmed:true};
}
export function buildGuidedMacrsAssets(f:BusinessSourceData|undefined,returnYear:number|null|undefined,otherActivityPresent=false):{form4562:Form4562Input;depreciation:NonNullable<ScheduleCSourceFacts['depreciation']>;total:Decimal}|undefined {
  if(f?.depreciationMethod==='manual'||(!f?.depreciationMethod&&!f?.macrsAssets))return undefined;
  if(f?.depreciationMethod!=='assets')fail('the actual depreciation method is unknown');
  const d=f.macrsAssets;if(!d)fail('actual asset inventory is unknown');
  if(otherActivityPresent)fail('other activities require a separate combined asset method');
  const c=collection(d,f);
  if(c.sourceYear!==returnYear||f.scheduleCSourceFacts?.sourceTaxYear!==returnYear)fail('the current return and actual source years differ');
  if(d.sourceFactsConfirmed!==true||macrsSourceValue(c.business)!==macrsSourceValue(d.originalBusiness)||macrsSourceValue(c.original)!==macrsSourceValue(d.originalCollection))fail('the confirmed inventory owner business or original collection changed');
  const form4562:Form4562Input=Form4562Schema.parse({taxYear:c.sourceYear,assets:c.rows.map(r=>r.originalAsset),section179ExpenseDeduction:'0',specialDepreciationAllowance:'0'});
  const depreciation={sourceTaxYear:c.sourceYear,sourceReference:d.sourceReference,sourceFactsConfirmed:true,fullCalendarYearConfirmed:true,allAssetsForThisBusinessConfirmed:true,noOtherActivityAssetsConfirmed:true,noOtherDepreciationOrAmortizationConfirmed:true,notDeductedElsewhereConfirmed:true,originalBusiness:structuredClone(c.business),rows:c.rows};
  return {form4562,depreciation,total:calculateForm4562(form4562,c.sourceYear).line22};
}
export function guidedMacrsFactErrors(f:BusinessSourceData|undefined,returnYear:number|null|undefined):Record<string,string>{try{buildGuidedMacrsAssets(f,returnYear);return{};}catch{return{macrsAssets:'Complete and reconfirm the actual first-year asset inventory, current owner, year and separate deduction records.'};}}
/** UI only: a source-year amount is not return-year or whole-return qualification. */
export function guidedMacrsDisplayAmount(f:BusinessSourceData|undefined):string|undefined{try{return buildGuidedMacrsAssets(f,f?.macrsAssets?.sourceTaxYear?Number(f.macrsAssets.sourceTaxYear):undefined)?.total.toString();}catch{return undefined;}}
