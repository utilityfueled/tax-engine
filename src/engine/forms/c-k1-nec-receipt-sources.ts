/** Actual ordinary NEC receipt/business sources; spec k1-form461-classification.yaml nec-*.
 * Source validation and receipt reconciliation only; canonical ScheduleC computes net income. */
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {Form1099NecSchema,type TaxYearInput} from '@/models/inputs.js';
import {d,sum} from '@/utils/decimal.js';
import {AuditTrail} from '@/utils/audit.js';

type SourceInput=Pick<TaxYearInput,'form1099Nec'|'qbiLossSources'>&{taxpayer:Pick<TaxYearInput['taxpayer'],'taxYear'>;scheduleC?:Pick<NonNullable<TaxYearInput['scheduleC']>,'grossReceipts'|'accountHolder'>};
function stable(value:unknown):unknown {
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,stable(v)]));
 return value;
}
function digest(value:unknown){return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));}
const amountKeys=new Set(['nonemployeeCompensation','federalWithheld','stateWithheld','stateIncome','cashTips','qualifiedOvertimeCompensation']);
function semantic(original:Record<string,unknown>){
 const values:Record<string,unknown>={...original,payerTin:typeof original.payerTin==='string'?original.payerTin:'',state:typeof original.state==='string'?original.state:'',
  treasuryTippedOccupationCodes:Array.isArray(original.treasuryTippedOccupationCodes)?[...new Set(original.treasuryTippedOccupationCodes)].sort():[]};
 for(const key of amountKeys)if(values[key]===undefined)values[key]='0';
 // These supplemental fields are not boxes on the 2025 paper NEC and cannot distinguish two such originals.
 // The private raw source digest below still binds every supplied value exactly.
 if(original.taxYear===2025)for(const key of ['cashTips','qualifiedOvertimeCompensation','treasuryTippedOccupationCodes'])delete values[key];
 return Object.fromEntries(Object.entries(values).filter(([,v])=>v!==undefined).map(([key,value])=>[key,
 amountKeys.has(key)&&typeof value==='string'?d(value).toFixed():key==='payer'&&typeof value==='string'?value.trim().replace(/\s+/g,' ').toLowerCase():key==='payerTin'&&typeof value==='string'?value.replace(/[^a-zA-Z0-9*]/g,'').toLowerCase():key==='state'&&typeof value==='string'?value.trim().toUpperCase():value]));
}
export function calculateCK1NecReceiptSources(input:SourceInput){
 const proof=input.qbiLossSources?.form461Classification?.scheduleCSource,packet=proof?.necReceipts;
 const actual=input.form1099Nec;
 if(packet===undefined){if(actual.some(row=>!d(row.nonemployeeCompensation).isZero()))throw new Error('Nonzero NEC requires actual complete C business receipt linkage');return undefined;}
 const year=input.taxpayer.taxYear;
 if(input.qbiLossSources?.form461Classification?.method!=='profitable_ordinary_c_and_k1'||!input.scheduleC
   ||packet.sourceTaxYear!==year||!packet.sourceReference?.trim()||packet.sourceFactsConfirmed!==true
   ||packet.allNecSourcesIncluded!==true||packet.noDuplicateStatementsConfirmed!==true
   ||!packet.otherGrossSourceReference?.trim()||typeof packet.otherGrossReceiptsNotOnNec!=='string'
   ||!/^\d+(\.\d+)?$/.test(packet.otherGrossReceiptsNotOnNec)||!Array.isArray(packet.rows)||packet.rows.length!==actual.length) {
  throw new Error('NEC receipts require actual current complete confirmed original and other-gross sources');
 }
 const seen=new Set<number>(),references=new Set<string>(),originals=new Set<string>();
 for(const row of packet.rows){
  const match=/^form1099Nec:(0|[1-9]\d*)$/.exec(row.necSourceId??''),index=match?Number(match[1]):-1,original=actual[index];
  if(!Number.isSafeInteger(index)||!original||seen.has(index)||!row.sourceReference?.trim()||references.has(row.sourceReference.trim())
    ||row.sourceTaxYear!==year||original.taxYear!==year||row.sourceFactsConfirmed!==true||row.sameBusinessConfirmed!==true
    ||row.includedOnceConfirmed!==true||row.currentOriginalNoCorrectionsOrVoidsConfirmed!==true||row.allUnmodeledBoxesZeroOrBlankConfirmed!==true
    ||original.accountHolder!==input.scheduleC.accountHolder||!original.accountHolder||!original.payer.trim()
    ||!d(original.nonemployeeCompensation).isFinite()||d(original.nonemployeeCompensation).lt(0)||!row.original) {
   throw new Error('NEC receipt linkage requires unique current ordinary uncorrected originals and actual same-business included-once proof');
  }
  // These original fields must be actual supplied facts before parsing optionalDecimal defaults.
  for(const field of ['taxYear','accountHolder','payer','nonemployeeCompensation','federalWithheld','stateWithheld']) {
   if(!Object.hasOwn(row.original,field)||row.original[field]===undefined||row.original[field]===null||row.original[field]==='')throw new Error('NEC original snapshot cannot infer missing year owner or monetary zero source facts');
  }
  for(const field of amountKeys){
   const value=original[field as keyof typeof original];
   if(value!==undefined&&(typeof value!=='string'||!d(value).isFinite()||d(value).lt(0)))throw new Error('Actual current original NEC monetary sources must be nonnegative; correction amounts need their separate method');
  }
  const parsed=Form1099NecSchema.safeParse(row.original);
  if(!parsed.success||digest(row.original)!==digest(parsed.data)||digest(parsed.data)!==digest(original))throw new Error('NEC original source snapshot is stale or conflicting');
  const hasTin=Boolean(original.payerTin?.trim());
  if(!(row.payerTinStatus==='reported'?hasTin&&/^[\d\s-]+$/.test(original.payerTin??'')&&/^\d{9}$/.test((original.payerTin??'').replace(/[\s-]/g,'')):row.payerTinStatus==='blank_original'&&!hasTin))throw new Error('NEC payer TIN original status is unknown or conflicting');
  const fingerprint=digest(semantic(original));
  if(originals.has(fingerprint))throw new Error('Duplicate semantic NEC originals require their actual distinct source method');
  originals.add(fingerprint);seen.add(index);references.add(row.sourceReference.trim());
 }
 const gross=sum(...actual.map(row=>d(row.nonemployeeCompensation))).plus(packet.otherGrossReceiptsNotOnNec);
 if(typeof input.scheduleC.grossReceipts!=='string'||!/^\d+(\.\d+)?$/.test(input.scheduleC.grossReceipts)||!gross.eq(input.scheduleC.grossReceipts))throw new Error('NEC plus actual other receipts must reconcile exactly to C gross; differences need their actual explanation method');
 const sourceCommitment=digest({taxYear:year,scheduleC:input.scheduleC,sourceProof:proof,originals:actual});
 const audit=new AuditTrail();audit.record('Form461','nec-receipt-source','Actual ordinary NEC receipt source binding',d(0),'Private complete original receipt source commitment; no raw references or payer TIN rendered',{sourceCommitment});
 return {grossReceipts:gross,sourceCommitment,lines:audit.getLines()};
}
