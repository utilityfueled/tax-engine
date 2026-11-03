import Decimal from 'decimal.js';
import {z} from 'zod';
import {Form1099MiscSchema,type Form1099Misc} from '@/models/inputs';
import type {GuidedFlowState} from './guided-interview-flow';
import {isActualDate} from './guided-required-facts';

export const zeroIncomeMiscAmounts={
  rents:'Box 1 rents',royalties:'Box 2 royalties',otherIncome:'Box 3 other income',
  federalWithheld:'Box 4 federal withholding',fishingBoatProceeds:'Box 5 fishing boat proceeds',
  medicalPayments:'Box 6 medical payments',substitutePayments:'Box 8 substitute payments',
  cropInsurance:'Box 9 crop insurance',grossAttorneyProceeds:'Box 10 attorney proceeds',
  fishPurchasedForResale:'Box 11 fish purchased for resale',section409ADeferrals:'Box 12 section 409A deferrals',
  nonqualifiedDeferredComp:'Box 15 nonqualified deferred compensation',stateWithheld:'Box 16 state withholding',stateIncome:'Box 18 state income',
} as const;
export const zeroIncomeMiscFacts={
  directSales:'Box 7 direct sales apply',fatcaFilingRequirement:'FATCA filing requirement applies',
  legacyAndNewerCompensationAbsentConfirmed:'No legacy or newer-revision compensation amounts apply',
  currentOriginalConfirmed:'This is the actual current original',corrected:'Corrected original',void:'Void original',
  allOriginalBoxesKnownConfirmed:'Every original box has been checked, including actual zero or blank boxes',
} as const;
export const zeroIncomeMiscText={sourceId:'original identifier',accountReference:'original account reference',sourceTaxYear:'original tax year',payer:'payer name',payerTin:'payer TIN',recipientFirstName:'recipient first name including middle initial',recipientLastName:'recipient last name',payerStateId:'Box 17 payer state identifier'} as const;
export const zeroIncomeMiscReceiptText={sourceReference:'actual remittance record reference',confirmationNumber:'actual remittance confirmation',sourceTaxYear:'actual remittance tax year',state:'actual remittance state',payerTin:'actual remittance payer TIN',accountReference:'actual remittance account reference',recipientSsn:'actual remittance recipient SSN',paidDate:'actual remittance paid date',sourceAsOfDate:'actual remittance record asof date',amountPaid:'actual remittance amount'} as const;
const nullableFact=z.boolean().nullable();
const receiptSchema=z.object({sourceReference:z.string(),confirmationNumber:z.string(),sourceTaxYear:z.string(),state:z.string(),payerTin:z.string(),accountReference:z.string(),recipientSsn:z.string(),paidDate:z.string(),sourceAsOfDate:z.string(),amountPaid:z.string(),actuallyRemittedConfirmed:nullableFact,notRefundedByPayerConfirmed:nullableFact}).strict();
const draftSchema=z.object({
  sourceId:z.string(),accountReference:z.string(),sourceTaxYear:z.string(),sourceFormRevision:z.string(),payer:z.string(),payerTin:z.string(),accountHolder:z.enum(['','primary','spouse']),recipientFirstName:z.string(),recipientLastName:z.string(),recipientSsn:z.string(),
  rents:z.string(),royalties:z.string(),otherIncome:z.string(),federalWithheld:z.string(),fishingBoatProceeds:z.string(),medicalPayments:z.string(),substitutePayments:z.string(),cropInsurance:z.string(),grossAttorneyProceeds:z.string(),fishPurchasedForResale:z.string(),section409ADeferrals:z.string(),nonqualifiedDeferredComp:z.string(),stateWithheld:z.string(),stateIncome:z.string(),
  stateTaxReporting:z.enum(['','none','single','multiple']),state:z.string(),payerStateId:z.string(),directSales:nullableFact,fatcaFilingRequirement:nullableFact,legacyAndNewerCompensationAbsentConfirmed:nullableFact,currentOriginalConfirmed:nullableFact,corrected:nullableFact,void:nullableFact,allOriginalBoxesKnownConfirmed:nullableFact,
  remittance:receiptSchema,sourceFactsConfirmed:nullableFact,confirmedOriginal:z.record(z.string(),z.unknown()).optional(),
}).strict();
export type ZeroIncomeMiscSourceDraft=z.infer<typeof draftSchema>;
export function emptyZeroIncomeMiscSource():ZeroIncomeMiscSourceDraft{
  return {sourceId:'',accountReference:'',sourceTaxYear:'',sourceFormRevision:'',payer:'',payerTin:'',accountHolder:'',recipientFirstName:'',recipientLastName:'',recipientSsn:'',rents:'',royalties:'',otherIncome:'',federalWithheld:'',fishingBoatProceeds:'',medicalPayments:'',substitutePayments:'',cropInsurance:'',grossAttorneyProceeds:'',fishPurchasedForResale:'',section409ADeferrals:'',nonqualifiedDeferredComp:'',stateWithheld:'',stateIncome:'',stateTaxReporting:'',state:'',payerStateId:'',directSales:null,fatcaFilingRequirement:null,legacyAndNewerCompensationAbsentConfirmed:null,currentOriginalConfirmed:null,corrected:null,void:null,allOriginalBoxesKnownConfirmed:null,remittance:{sourceReference:'',confirmationNumber:'',sourceTaxYear:'',state:'',payerTin:'',accountReference:'',recipientSsn:'',paidDate:'',sourceAsOfDate:'',amountPaid:'',actuallyRemittedConfirmed:null,notRefundedByPayerConfirmed:null},sourceFactsConfirmed:null};
}
export function updateZeroIncomeMiscSource(row:ZeroIncomeMiscSourceDraft,patch:Partial<ZeroIncomeMiscSourceDraft>):ZeroIncomeMiscSourceDraft{return {...row,...patch,sourceFactsConfirmed:null};}
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const fail=(reason:string):never=>{throw Error(`Actual zero-income MISC source: ${reason}.`);};
const text=(v:string)=>v.trim()||fail('complete every original identity and remittance record field');
const identity=(v:string)=>text(v).replace(/\s+/g,' ').toUpperCase();
const tin=(v:string)=>{const result=text(v).replaceAll('-','');return /^\d{9}$/.test(result)?result:fail('enter the actual nine-digit source TIN');};
function money(v:string):string{const raw=v.trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw))fail('enter every actual money amount, including known zero');const clean=raw.replaceAll(',','');if(!new Decimal(clean).isFinite())fail('enter finite actual money amounts');return clean;}
function sourceFields(row:ZeroIncomeMiscSourceDraft){const {sourceFactsConfirmed:_confirmed,confirmedOriginal:_snapshot,...original}=row;return original;}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function parse(value:unknown){const parsed=draftSchema.safeParse(value);return parsed.success?parsed.data:fail('complete the actual supported original fields without scalar overrides');}
function original(row:ZeroIncomeMiscSourceDraft,year:number|null|undefined,status:string|null|undefined):Form1099Misc{
  if(year!==2025||row.sourceTaxYear!=='2025'||row.sourceFormRevision!=='2025-04')fail('this source method requires the actual matching 2025 original and April2025 revision');
  if(!status||!row.accountHolder||(row.accountHolder==='spouse'&&status!=='mfj'))fail('select an actual eligible original recipient owner');
  text(row.recipientFirstName);text(row.recipientLastName);tin(row.recipientSsn);
  if(row.currentOriginalConfirmed!==true||row.corrected!==false||row.void!==false||row.allOriginalBoxesKnownConfirmed!==true)fail('confirm current uncorrected nonvoid original status and every original box');
  if(row.directSales!==false||row.fatcaFilingRequirement!==false||row.legacyAndNewerCompensationAbsentConfirmed!==true)fail('other applicable or unknown original facts require their separate source method');
  const amounts=Object.fromEntries(Object.keys(zeroIncomeMiscAmounts).map(key=>[key,money(row[key as keyof typeof zeroIncomeMiscAmounts])]));
  for(const [key,amount] of Object.entries(amounts))if(key!=='stateWithheld'&&!new Decimal(amount).isZero())fail('positive income or federal withholding needs its separate actual income source method');
  const state=identity(row.state);if(row.stateTaxReporting!=='single'||!states.has(state)||!new Decimal(amounts.stateWithheld).gt(0))fail('enter one actual original state row and positive state withholding');
  const receipt=row.remittance;
  if(receipt.actuallyRemittedConfirmed!==true||receipt.notRefundedByPayerConfirmed!==true)fail('confirm actual remittance and no payer refund from the original records');
  text(receipt.sourceReference);text(receipt.confirmationNumber);
  if(receipt.sourceTaxYear!==row.sourceTaxYear||identity(receipt.state)!==state||tin(receipt.payerTin)!==tin(row.payerTin)||identity(receipt.accountReference)!==identity(row.accountReference)||tin(receipt.recipientSsn)!==tin(row.recipientSsn)||!new Decimal(money(receipt.amountPaid)).eq(amounts.stateWithheld))fail('reconcile actual remittance year state payer account recipient and exact original withholding');
  if(!isActualDate(receipt.paidDate)||!isActualDate(receipt.sourceAsOfDate)||receipt.paidDate<'2025-01-01'||receipt.sourceAsOfDate<'2025-01-01'||receipt.paidDate>receipt.sourceAsOfDate)fail('enter actual valid paid and asof dates with payment already made');
  return Form1099MiscSchema.parse({taxYear:year,sourceId:text(row.sourceId),accountReference:text(row.accountReference),sourceFormRevision:'2025-04',payer:text(row.payer),payerTin:tin(row.payerTin),accountHolder:row.accountHolder,...amounts,directSales:false,fatcaFilingRequirement:false,excessGoldenParachute:'0',state,payerStateId:text(row.payerStateId)});
}
/** Explicit action binds only supplied originals; current taxpayer reconciliation occurs on replay. */
export function confirmZeroIncomeMiscSource(value:unknown,year:number|null|undefined,status:string|null|undefined):ZeroIncomeMiscSourceDraft{const row=parse(value);original(row,year,status);return {...structuredClone(row),sourceFactsConfirmed:true,confirmedOriginal:structuredClone(sourceFields(row))};}
/** Append actual originals once; generic ledger claims never create or replace source records. */
export function buildGuidedZeroIncomeMiscSources(state:GuidedFlowState,existing:Form1099Misc[]=[]):Form1099Misc[]{
  const rows=state.sectionData['state-return']?.zeroIncomeMiscSources;
  if(rows===undefined)return existing;
  if(!Array.isArray(rows))fail('enter the actual original source rows');
  if(!rows.length)return existing;
  const receipts=new Set<string>();
  const added=rows.map(value=>{
    const row=parse(value),result=original(row,state.taxYear,state.segmentation.filingStatus);
    if(row.sourceFactsConfirmed!==true||stable(row.confirmedOriginal)!==stable(sourceFields(row)))fail('explicitly reconfirm originals after the last edit; retained source snapshot is missing or stale');
    const recipient=row.accountHolder==='primary'?state.sectionData['personal-info']:state.sectionData['personal-info']?.spouse;
    const given=recipient&&'middleName'in recipient?[recipient.firstName,recipient.middleName?.trim().replace(/[^A-Za-z]/g,'').charAt(0).toUpperCase()].filter(Boolean).join(' '):recipient?.firstName;
    if(!recipient||!given||identity(given)!==identity(row.recipientFirstName)||identity(recipient.lastName)!==identity(row.recipientLastName)||tin(recipient.ssn)!==tin(row.recipientSsn))fail('actual entered recipient does not match the current selected taxpayer');
    const confirmation=identity(row.remittance.confirmationNumber);if(receipts.has(confirmation))fail('duplicate actual remittance confirmation');receipts.add(confirmation);return result;
  });
  const ids=new Set<string>(),originals=new Set<string>();
  for(const row of [...existing,...added]){
    if(!row.sourceId||!row.payerTin||!row.accountReference||!row.accountHolder||row.taxYear===undefined)fail('reconcile actual identity of every retained original before appending another source');
    const sourceId=row.sourceId??fail('actual original source identifier is missing');
    const payerTin=row.payerTin??fail('actual original payer TIN is missing');
    const accountReference=row.accountReference??fail('actual original account reference is missing');
    const id=identity(sourceId),key=stable([row.taxYear,row.accountHolder,tin(payerTin),identity(accountReference)]);
    if(ids.has(id)||originals.has(key))fail('duplicate original source or payer account year owner across original routes');ids.add(id);originals.add(key);
  }
  return [...existing,...added];
}
export function zeroIncomeMiscSourceFactErrors(state:GuidedFlowState):Record<string,string>{try{buildGuidedZeroIncomeMiscSources(state);return {};}catch{return {'zero-income-misc-sources':'Complete and explicitly confirm the actual zero-income MISC originals and matching remittance records.'};}}
