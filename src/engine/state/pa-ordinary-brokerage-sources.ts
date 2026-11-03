/** Source replay; spec/state/pa-ordinary-brokerage-sources.yaml. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {Form1099BSchema,type TaxYearInput} from '@/models/inputs.js';
import {PAOrdinaryBrokerageSourcesSchema} from '@/models/pa-ordinary-brokerage-sources.js';
import type {PAResidencyStatus} from '@/models/pa-residency.js';
import type {CalculatedLine} from '@/models/outputs.js';
import type {PAScheduleDResult} from './pa-schedule-d.js';
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from './pa-ordinary-source-precision.js';
import {AuditTrail} from '@/utils/audit.js';
const fail=(message:string):never=>{throw new Error('PA ordinary brokerage sources: '+message);};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(v)??'null';}
function ref(v:string):void{if(!v.trim())fail('actual source reference is required');}
function date(v:string,year?:number):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||(year!==undefined&&!v.startsWith(year+'-')))return fail('actual date must be in the selected source year');const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)return fail('actual source date is impossible');return v;}
/** Free statement labels cannot establish a second economic original. */
function economic(v:unknown,key=''):unknown{if(Array.isArray(v))return v.map(row=>economic(row));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['sourceId','accountReference'].includes(k)).map(([k,v])=>[k,economic(v,k)]));if(typeof v==='string'){if(/tin|ssn/i.test(key))return v.replace(/\D/g,'');if(/^-?\d+(\.\d+)?$/.test(v))return new Decimal(v).toFixed();return v.trim().toUpperCase();}return v;}
/** Known actual accounts distinguish originals; free display/statement labels never do. */
function statementIdentity(current:TaxYearInput['form1099B'][number]):string{
 const suppliedTIN=current.payerTin?.trim()??'',normalizedTIN=suppliedTIN.replace(/[-\s]/g,'');
 const knownTIN=/^\d{9}$/.test(normalizedTIN)?normalizedTIN:undefined;
 const actualAccount=knownTIN===undefined?undefined:current.accountReference?.trim()||undefined;
 const financial=Object.fromEntries(Object.entries(current).filter(([key])=>!['sourceId','accountReference','broker','payerTin'].includes(key)));
 // Unknown payer/account identity stays conservative; never manufacture it from a statement label.
 return stable({payerTIN:knownTIN??null,actualAccount:actualAccount??null,original:economic(financial)});
}
export interface PAOrdinaryBrokerageSourcesResult{rawGainOrLoss:Decimal;reportedGainOrLoss:Decimal;excludedNonPAGainOrLoss:Decimal;paWithholding:Decimal;stateWithholding:Array<{form:'1099-INT'|'1099-DIV'|'1099-B';originalIndex:number;state:string;amount:Decimal}>;scheduleD?:PAScheduleDResult;sourceCommitment:string;lines:CalculatedLine[];}
/** Parent supplies actual derived residency periods, never payer or mailing state. */
export function calculatePAOrdinaryBrokerageSources(input:TaxYearInput,raw:unknown,residency:{status:PAResidencyStatus;residentPeriods:Array<{from:string;through:string}>}):PAOrdinaryBrokerageSourcesResult{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(v:unknown):Decimal=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('actual nonnegative original/source amount is unknown');const n=new Money(v);if(!n.isFinite())return fail('actual source amount is nonfinite');return n;};
 const zero=()=>new Decimal(0),originals=input.form1099B??[];
 if(raw===undefined&&!originals.length)return {rawGainOrLoss:zero(),reportedGainOrLoss:zero(),excludedNonPAGainOrLoss:zero(),paWithholding:zero(),stateWithholding:[],sourceCommitment:'',lines:[]};
 const source=PAOrdinaryBrokerageSourcesSchema.parse(raw),year=input.taxpayer.taxYear,t=input.taxpayer.primary;
 if(year!==2025||source.sourceTaxYear!==year||source.sourceFactsConfirmed!==true||source.allOriginalStatementsIncludedConfirmed!==true||source.noOtherCapitalAdjustmentsConfirmed!==true)return fail('complete actual2025 source year and scope confirmations required');ref(source.sourceReference);
 if(source.owner.accountHolder!=='primary'||input.taxpayer.spouse||['married_filing_jointly','married_filing_separately'].includes(input.taxpayer.filingStatus)||stable(source.owner.originalTaxpayer)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))return fail('actual current primary owner identity is missing or stale');
 let last='';for(const p of residency.residentPeriods){date(p.from,year);date(p.through,year);if(p.from>p.through||p.from<=last)return fail('actual resident periods overlap or are invalid');last=p.through;}
 if((residency.status==='resident'&&(residency.residentPeriods.length!==1||residency.residentPeriods[0].from!==year+'-01-01'||last!==year+'-12-31'))||(residency.status==='nonresident'&&residency.residentPeriods.length)||(residency.status==='part_year'&&!residency.residentPeriods.length))return fail('actual derived residency status and periods disagree');
 const residentAt=(v:string)=>residency.residentPeriods.some(p=>p.from<=v&&v<=p.through);
 if(source.statements.length!==originals.length)return fail('complete original statement coverage is required');
 const seen=new Set<number>(),identities=new Set<string>(),references=new Set<string>();let included=new Money(0),excluded=new Money(0);
 for(const row of source.statements){ref(row.sourceReference);const index=row.originalIndex;
  if(index===null||index<0||index>=originals.length||seen.has(index)||references.has(row.sourceReference.trim()))return fail('unique complete original statement indices and references required');seen.add(index);references.add(row.sourceReference.trim());
  const current=originals[index],parsed=Form1099BSchema.strict().safeParse(current);
  if(!parsed.success||stable(parsed.data)!==stable(current)||row.sourceTaxYear!==year||row.sourceFactsConfirmed!==true||row.currentUncorrectedNonvoidOriginalConfirmed!==true||row.allOriginalBoxesKnownConfirmed!==true||current.taxYear!==year||current.accountHolder!=='primary'||stable(row.original)!==stable(current))return fail('actual current original owner/year/status/content is missing or stale');
  ref(current.broker);ref(current.sourceId??'');amount(current.federalWithheld);amount(current.stateWithheld);if(current.withholdingOnlyOpenShortSale!==undefined)return fail('actual open short-sale original needs its separate method');
  const identity=statementIdentity(current);if(identities.has(identity))return fail('duplicate economic original statements');identities.add(identity);
  if(row.transactions.length!==current.transactions.length||!current.transactions.length)return fail('complete actual original transaction coverage required');
  const txIndices=new Set<number>(),txIdentities=new Set<string>(),txRefs=new Set<string>();
  for(const tx of row.transactions){ref(tx.sourceReference);ref(tx.securityId);ref(tx.acquisitionSourceReference);ref(tx.proceedsSourceReference);ref(tx.paBasisSourceReference);const i=tx.transactionIndex;
   if(i===null||i<0||i>=current.transactions.length||txIndices.has(i)||txRefs.has(tx.sourceReference.trim()))return fail('unique actual original transaction indices and sources required');txIndices.add(i);txRefs.add(tx.sourceReference.trim());
   const original=current.transactions[i],key=stable(economic(original));if(txIdentities.has(key))return fail('duplicate economic original transactions');txIdentities.add(key);
   if(stable(tx.originalTransaction)!==stable(original)||tx.sourceFactsConfirmed!==true||tx.ordinaryPersonalInvestmentSecurityConfirmed!==true||tx.notBusinessOrOperatingCapitalConfirmed!==true||tx.noGiftInheritanceCompensationOrReorganizationConfirmed!==true||tx.noSpecialAdjustmentOrDeferredMethodConfirmed!==true||tx.paBasisFactsConfirmed!==true||tx.allSaleExpensesIncludedConfirmed!==true)return fail('actual current transaction classification/basis/source qualifications require confirmation');
   ref(original.description);if(original.digitalAsset!==false||original.washSale!==false||!amount(original.washSaleDisallowed).isZero()||!amount(original.adjustments).isZero()||original.qofInclusion===true||original.adjustmentCodes!==undefined||(original.sourceDocumentType!==undefined&&original.sourceDocumentType!=='1099-b'))return fail('actual digital/wash/QOF/adjusted original requires its separate source method');
   const acquired=date(original.dateAcquired),sold=date(original.dateSold,year),paid=date(tx.paidOn,year);if(acquired>sold||paid<sold)return fail('actual acquisition/sale/receipt dates are inconsistent');
   if(residentAt(sold)!==residentAt(paid))return fail('cross-period actual settlement receipt requires its source successor');
   const proceeds=amount(tx.grossProceeds),basis=amount(tx.paAdjustedBasis),costs=amount(tx.saleExpenses);if(!proceeds.eq(amount(original.proceeds)))return fail('actual proceeds source differs from current original');amount(original.costBasis);
   if(tx.classification==='zero_reported_position'){
    if(tx.noEconomicDisposalConfirmed!==true||tx.allReportedAmountsKnownZeroConfirmed!==true||!proceeds.isZero()||!basis.isZero()||!costs.isZero()||!amount(original.costBasis).isZero()||!amount(current.federalWithheld).isZero())return fail('zero-only reported position requires actual no-disposal explanation and all original amounts known zero');
   }else if(tx.classification!=='ordinary_security_sale'||tx.noEconomicDisposalConfirmed!==false||tx.allReportedAmountsKnownZeroConfirmed!==false)return fail('actual ordinary sale classification is incomplete or contradictory');
   const gain=proceeds.minus(costs).minus(basis);if(residentAt(sold))included=included.plus(gain);else excluded=excluded.plus(gain);
  }
 }
 const currentWithholding=[...input.form1099Int.map((original,originalIndex)=>({form:'1099-INT' as const,originalIndex,original})),...input.form1099Div.map((original,originalIndex)=>({form:'1099-DIV' as const,originalIndex,original})),...originals.map((original,originalIndex)=>({form:'1099-B' as const,originalIndex,original}))];
 if(source.withholdingOriginals.length!==currentWithholding.length)return fail('complete actual investment withholding original coverage required');
 const paymentKeys=new Set<string>(),paymentRefs=new Set<string>();const stateWithholding:PAOrdinaryBrokerageSourcesResult['stateWithholding']=[];let withholding=new Money(0);
 for(const row of source.withholdingOriginals){ref(row.sourceReference);const key=row.form+':'+row.originalIndex,current=currentWithholding.find(p=>p.form===row.form&&p.originalIndex===row.originalIndex);
  if(!current||row.originalIndex===null||paymentKeys.has(key)||paymentRefs.has(row.sourceReference.trim()))return fail('duplicate or missing actual withholding original');paymentKeys.add(key);paymentRefs.add(row.sourceReference.trim());
  const original=current.original,n=amount(row.amount);if(row.sourceTaxYear!==year||row.sourceFactsConfirmed!==true||row.actualPaymentToStateConfirmed!==true||row.notRefundedByPayerConfirmed!==true||original.accountHolder!=='primary'||(original.taxYear!==undefined&&original.taxYear!==year)||stable(row.original)!==stable(original)||row.state!==(original.state??'')||!n.eq(amount(original.stateWithheld)))return fail('actual withholding remittance original/state/amount or no-refund proof differs');
  if((row.state===''&&!n.isZero())||(row.state!==''&&!/^[A-Z]{2}$/.test(row.state)))return fail('actual withholding jurisdiction is missing or invalid');
  stateWithholding.push({form:row.form,originalIndex:row.originalIndex,state:row.state,amount:publicOrdinaryMoney(n)});if(row.form==='1099-B'&&row.state==='PA')withholding=withholding.plus(n);
 }
 const reported=included.toDecimalPlaces(0,Decimal.ROUND_HALF_UP),commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ordinary-brokerage-v1',owner:t,year,originals,raw,residency}))));
 const audit=new AuditTrail();audit.record('PA-Ordinary-Brokerage-Sources','source','Private actual securities source commitment',zero(),'SHA256 binds current original securities, actual PA basis, remittances and residency periods',{sourceCommitment:commitment});audit.record('PA-Ordinary-Brokerage-Sources','raw','Actual signed PA personal security gain',publicOrdinaryMoney(included),'Exact same-owner included original proceeds less documented expenses and PA basis');audit.record('PA-Ordinary-Brokerage-Sources','outside','Actual outside-period security result',publicOrdinaryMoney(excluded),'Separately retained signed class result; never an offset against another income class');audit.record('PA-Ordinary-Brokerage-Sources','withholding','Actual PA original brokerage withholding',publicOrdinaryMoney(withholding),'Current B originals once; INT and DIV remain in their existing once-only paths');
 const dAudit=new AuditTrail();for(const line of ['1','3','12','12-taxpayer','12-pa40'])dAudit.record('PA-Schedule-D',line,'Actual ordinary security class',publicOrdinaryMoney(reported),'Actual included same-owner capital class, aggregated then rounded once');
 const scheduleD:PAScheduleDResult={digitalAssetQuestionYes:false,line1:publicOrdinaryMoney(reported),line2:zero(),line3:publicOrdinaryMoney(reported),line4:zero(),line5:zero(),line6:zero(),line7:zero(),line8:zero(),line9:zero(),line10:zero(),line11:zero(),line12:publicOrdinaryMoney(reported),taxpayerLine12:publicOrdinaryMoney(reported),spouseLine12:zero(),reportableNetGainOrLoss:publicOrdinaryMoney(reported),likeKindExchanges:[],lines:publicOrdinaryLines(dAudit.getLines())};
 return {rawGainOrLoss:publicOrdinaryMoney(included),reportedGainOrLoss:publicOrdinaryMoney(reported),excludedNonPAGainOrLoss:publicOrdinaryMoney(excluded),paWithholding:publicOrdinaryMoney(withholding),stateWithholding,...(originals.length?{scheduleD}:{}),sourceCommitment:commitment,lines:publicOrdinaryLines([...audit.getLines(),...dAudit.getLines()])};
}
