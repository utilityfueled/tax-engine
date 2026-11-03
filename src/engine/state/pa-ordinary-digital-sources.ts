/** Actual capital digital sources; spec/state/pa-ordinary-digital-sources.yaml. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';import {bytesToHex} from '@noble/hashes/utils.js';
import {Form1099DASchema,type TaxYearInput} from '@/models/inputs.js';
import {PAOrdinaryDigitalSourcesSchema} from '@/models/pa-ordinary-digital-sources.js';
import {W2StateLocalSourcesSchema} from '@/models/w2-state-local.js';
import type {PAScheduleDResult} from './pa-schedule-d.js';
import type {PAResidencyStatus} from '@/models/pa-residency.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {calculateDigitalAssetStateSources} from './digital-asset-sources.js';
import {calculateForm1099DASources} from '@/engine/forms/form-1099-da-sources.js';
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from './pa-ordinary-source-precision.js';
import {AuditTrail} from '@/utils/audit.js';
const fail=(s:string):never=>{throw new Error('PA ordinary original digital sources: '+s);};
const ref=(s:string)=>{if(!s.trim())fail('actual source reference is required');};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(v)??'null';}
export interface PAOrdinaryDigitalSourcesResult{rawGainOrLoss:Decimal;reportedGainOrLoss:Decimal;paWithholding:Decimal;stateWithholding:Array<{state:string;amount:Decimal}>;scheduleD?:PAScheduleDResult;sourceCommitment:string;lines:CalculatedLine[];}
/** Residency is the parent derived source result, never the mailing address. */
export function calculatePAOrdinaryDigitalSources(input:TaxYearInput,raw:unknown,residency:{status:PAResidencyStatus}):PAOrdinaryDigitalSourcesResult{
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input.form1099DA,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(v:unknown):Decimal=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('actual nonnegative source amount is missing or invalid');const n=new Money(v);if(!n.isFinite())return fail('nonfinite original amount');return n;};
 const originals=input.form1099DA??[];
 const zero=()=>new Decimal(0);
 if(raw===undefined&&!originals.length)return {rawGainOrLoss:zero(),reportedGainOrLoss:zero(),paWithholding:zero(),stateWithholding:[],sourceCommitment:'',lines:[]};
 const source=PAOrdinaryDigitalSourcesSchema.parse(raw),year=input.taxpayer.taxYear;
 if(year!==2025||source.sourceTaxYear!==year||source.sourceFactsConfirmed!==true||source.allOriginalDigitalStatementsIncludedConfirmed!==true||source.noOtherCapitalAdjustmentsConfirmed!==true)return fail('complete actual2025 source confirmation required');ref(source.sourceReference);
 if(residency.status!=='resident'||input.taxpayer.spouse||['married_filing_jointly','married_filing_separately'].includes(input.taxpayer.filingStatus))return fail('part-year/nonresident/spouse allocation requires its actual source successor');
 if(source.statements.length!==originals.length)return fail('every current original must be included exactly once');
 if(!originals.length)return {rawGainOrLoss:zero(),reportedGainOrLoss:zero(),paWithholding:zero(),stateWithholding:[],sourceCommitment:bytesToHex(sha256(new TextEncoder().encode(stable({year,raw})))),lines:[]};
 const indices=new Set<number>();
 for(const row of source.statements){ref(row.sourceReference);const i=row.originalIndex;
  if(i===null||i<0||i>=originals.length||indices.has(i)||row.sourceFactsConfirmed!==true)return fail('complete unique current original indices and confirmations required');indices.add(i);
  const current=originals[i],parsed=Form1099DASchema.safeParse(current);
  if(!parsed.success||stable(parsed.data)!==stable(current)||current.accountHolder!=='primary'||current.taxYear!==year||stable(row.original)!==stable(current))return fail('current canonical original owner/year/content differs from private snapshot');
 }
 // Existing source validators independently require original federal boxes and PA
 // basis facts; their converted view never replaces the canonical originals.
 calculateDigitalAssetStateSources(input,'PA');
 const actual=calculateForm1099DASources(input);
 if(!actual.sourceFactsComplete)return fail('actual original DA sources are incomplete');
 let gain=new Money(0),paWithholding=new Money(0);const stateWithholding:Array<{state:string;amount:Decimal}>=[];
 const stateSchema=W2StateLocalSourcesSchema.shape.stateRows.element.shape.state;
 for(const [index,form] of originals.entries()){
  for(const transaction of form.transactions){
   if(transaction.assetOrigin!=='purchase'||transaction.transactionType!=='sale'||transaction.capitalAssetConfirmed!==true||transaction.ordinaryIncome!==false||transaction.onlyCashProceeds!==true||transaction.nftOrCollectible!==false)return fail('nonordinary asset origin or disposition requires its own actual method');
   gain=gain.plus(amount(transaction.proceeds)).minus(amount(transaction.paCostBasis));
  }
  const row=source.statements.find(r=>r.originalIndex===index);if(!row)return fail('missing actual source row');
  const states=actual.stateWithholding.filter(r=>r.statementIndex===index);
  const positivePA=states.some(r=>r.state==='PA'&&amount(r.stateWithheld).gt(0));
  if(positivePA&&(row.actualPaymentToPAConfirmed!==true||row.notRefundedByPayerConfirmed!==true))return fail('actual positive PA remittance and no-payer-refund evidence required');
  for(const state of states){if(!stateSchema.safeParse(state.state).success)return fail('unknown actual withholding jurisdiction');const n=amount(state.stateWithheld);stateWithholding.push({state:state.state,amount:publicOrdinaryMoney(n)});if(state.state==='PA')paWithholding=paWithholding.plus(n);}
 }
 const reported=gain.toDecimalPlaces(0,Decimal.ROUND_HALF_UP),commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ordinary-digital-v1',year,owner:input.taxpayer.primary,originals,raw}))));
 const audit=new AuditTrail();audit.record('PA-Ordinary-Digital-Sources','source','Private original capital source commitment',zero(),'SHA256 binds actual DA statements and separately confirmed PA basis',{sourceCommitment:commitment});audit.record('PA-Ordinary-Digital-Sources','raw','Actual signed original PA capital result',publicOrdinaryMoney(gain),'Exact proceeds minus actual PA adjusted basis, summed once with local Decimal arithmetic');audit.record('PA-Ordinary-Digital-Sources','withholding','Actual PA digital withholding',publicOrdinaryMoney(paWithholding),'Only actual PA original rows, with remittance evidence; no federal or other-state duplicate credit');
 const dAudit=new AuditTrail();dAudit.record('PA-Schedule-D','digital-assets','Actual digital asset question',new Decimal(1),'Actual direct digital disposition requires Yes');for(const line of ['1','3','12','12-taxpayer','12-pa40'])dAudit.record('PA-Schedule-D',line,'Actual direct digital capital class',publicOrdinaryMoney(reported),'Actual full-year primary-owned PA capital proceeds minus adjusted basis, aggregate class reported once');
 const scheduleD:PAScheduleDResult={digitalAssetQuestionYes:true,line1:publicOrdinaryMoney(reported),line2:zero(),line3:publicOrdinaryMoney(reported),line4:zero(),line5:zero(),line6:zero(),line7:zero(),line8:zero(),line9:zero(),line10:zero(),line11:zero(),line12:publicOrdinaryMoney(reported),taxpayerLine12:publicOrdinaryMoney(reported),spouseLine12:zero(),reportableNetGainOrLoss:publicOrdinaryMoney(reported),likeKindExchanges:[],lines:publicOrdinaryLines(dAudit.getLines())};
 return {rawGainOrLoss:publicOrdinaryMoney(gain),reportedGainOrLoss:publicOrdinaryMoney(reported),paWithholding:publicOrdinaryMoney(paWithholding),stateWithholding,scheduleD,sourceCommitment:commitment,lines:publicOrdinaryLines([...audit.getLines(),...dAudit.getLines()])};
}
