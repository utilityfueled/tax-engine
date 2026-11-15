/** Typed originals for two existing finite Form2555 methods; no tax calculation. */
import type {z} from 'zod';
import {Form2555MixedCapitalServicesSchema} from '@/models/form-2555-mixed-capital-services';
import {Form2555AllForeignCapitalLossSchema} from '@/models/form-2555-all-foreign-capital-loss';
import type {ForeignIncomeData} from './guided-foreign-income';
import {guidedSourceValuesChanged} from './guided-source-confirmation';
type Mixed=z.infer<typeof Form2555MixedCapitalServicesSchema>;
type Loss=z.infer<typeof Form2555AllForeignCapitalLossSchema>;
type Draft<T>={[K in keyof T]?:T[K] extends boolean?boolean|null:T[K] extends number?string:T[K]}&{confirmedOriginals?:unknown};
export type MixedCapitalOriginals=Draft<Mixed>;
export type AllForeignCapitalLossOriginals=Draft<Loss>;
export type ForeignCapitalMethod='mixedCapitalServices'|'allForeignCapitalLoss';
export const foreignCapitalTitles={mixedCapitalServices:'Mixed-location capital service originals',allForeignCapitalLoss:'All-foreign capital-loss originals'}as const;
export function capitalFieldLabel(key:string):string{return key.replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase()).replace(/W2/g,'W-2').replace(/Ubia/g,'UBIA').replace(/\b(?:Qbi|Eci|Ebl|Nol)\b/gi,word=>word.toUpperCase());}
/** Canonical fields only; confirmation is an explicit action, never a fact default. */
export const foreignCapitalFields={mixedCapitalServices:Object.keys(Form2555MixedCapitalServicesSchema.shape).filter(key=>key!=='sourceFactsConfirmed'),allForeignCapitalLoss:Object.keys(Form2555AllForeignCapitalLossSchema.shape).filter(key=>key!=='sourceFactsConfirmed')}as const;
const booleanFields=new Set(['allCurrentBusinessSourcesIncluded','locationSeparatedServiceFeesOnlyConfirmed','taxpayerForeignServicesInQualifyingPeriodConfirmed','noForeignEciOrRecharacterizationConfirmed','noPriorServicesOrExpenseHistoryConfirmed','allExpensesDirectlyAttributedConfirmed','reasonableAllowancesConfirmed','allGrossForeignServiceFeesConfirmed','taxpayerServicesInQualifyingPeriodConfirmed','activeAllAtRiskConfirmed','currentCashSuppliesPaidAndUsedConfirmed','noOtherExpenseOrPriorBusinessHistoryConfirmed','actualValidExclusionElectionConfirmed','noOtherActivityOrLossSourceConfirmed']);
export function capitalFieldKind(key:string):'boolean'|'owner'|'method'|'text'{return booleanFields.has(key)?'boolean':key==='accountHolder'?'owner':key==='allocationMethod'?'method':'text';}
/** Only local confirmation metadata is excluded. Every original value remains bound. */
function originals(value:unknown):unknown{if(Array.isArray(value))return value.map(originals);if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='confirmedOriginals'&&key!=='sourceFactsConfirmed').map(([key,entry])=>[key,originals(entry)]));return value;}
export function foreignCapitalOriginalsChanged(before:ForeignIncomeData,after:ForeignIncomeData):boolean{return guidedSourceValuesChanged(originals(before),originals(after));}
export function invalidateForeignCapitalOriginals(data:ForeignIncomeData):ForeignIncomeData{return {...data,sources:data.sources.map(row=>({...row,...(row.mixedCapitalServices?{mixedCapitalServices:{...row.mixedCapitalServices,sourceFactsConfirmed:null}}:{}),...(row.allForeignCapitalLoss?{allForeignCapitalLoss:{...row.allForeignCapitalLoss,sourceFactsConfirmed:null}}:{})}))};}
export function confirmForeignCapitalOriginals(data:ForeignIncomeData,index:number,method:ForeignCapitalMethod):MixedCapitalOriginals|AllForeignCapitalLossOriginals{
 const row=data.sources[index],draft=row?.[method];if(!draft||row.sourceId!=='scheduleC'||data.businessCapitalMaterialIncomeProducing!==true)throw Error('Select the actual capital-and-services Schedule C source before confirming originals.');
 if(row.mixedCapitalServices&&row.allForeignCapitalLoss)throw Error('Use only the one actual capital source method; reconcile competing originals.');
 return {...structuredClone(draft),sourceFactsConfirmed:true,confirmedOriginals:structuredClone(originals(data))};
}
export function convertForeignCapitalOriginals(data:ForeignIncomeData,index:number,method:'mixedCapitalServices'):Mixed|undefined;
export function convertForeignCapitalOriginals(data:ForeignIncomeData,index:number,method:'allForeignCapitalLoss'):Loss|undefined;
export function convertForeignCapitalOriginals(data:ForeignIncomeData,index:number,method:ForeignCapitalMethod):Mixed|Loss|undefined{
 const row=data.sources[index],draft=row?.[method];if(draft===undefined)return undefined;
 if(row.sourceId!=='scheduleC'||data.businessCapitalMaterialIncomeProducing!==true||row.mixedCapitalServices&&row.allForeignCapitalLoss)throw Error('Reconcile the actual single capital-and-services Schedule C method.');
 if(!draft.confirmedOriginals||guidedSourceValuesChanged(draft.confirmedOriginals,originals(data)))throw Error('Confirm complete capital originals after the last foreign-source edit.');
 const {confirmedOriginals,...facts}=structuredClone(draft);void confirmedOriginals;
 if(typeof facts.taxYear!=='string'||!/^\d{4}$/.test(facts.taxYear))throw Error('Enter the actual four-digit capital source year.');
 const raw={...facts,taxYear:Number(facts.taxYear)};
 return method==='mixedCapitalServices'?Form2555MixedCapitalServicesSchema.parse(raw):Form2555AllForeignCapitalLossSchema.parse(raw);
}
