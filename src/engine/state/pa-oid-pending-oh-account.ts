/** Actual credited pending OH account; no refund entitlement or Ohio return origination. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {PAOIDPendingOHAccountSchema} from '@/models/pa-oid-pending-oh-account.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateForm1099OID} from '@/engine/forms/form-1099-oid.js';
import {calculatePAResidencySources} from './pa-residency-sources.js';
import {snapshotPAOrdinaryReturnOriginals} from './pa-ordinary-return-facts.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
const fail=(detail:string):never=>{throw Error('PA pending Ohio OID account: '+detail);};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(v)??'null';}
const normalize=(v:string)=>v.trim().replace(/\s+/g,' ').toUpperCase();
const ssn=(v:string)=>v.replace(/\D/g,'');
const ref=(v:string)=>{if(!v.trim())fail('actual original reference or receipt identity is missing');};
function date(v:string):void{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('actual account date is unknown');const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail('actual account date is impossible');}
export interface PAOIDPendingOHAccountResult{state:'OH';status:'outstanding_credit';actualWithholding:Decimal;actualNetRemittances:Decimal;actualRefundsReceived:Decimal;outstandingOverpayment:Decimal;actualTaxLiability:Decimal;qualifiedSameIncome:Decimal;paCredit:Decimal;sourceCommitment:string;filingEligible:false;lines:CalculatedLine[]}
export function calculatePAOIDPendingOHAccount(input:TaxYearInput,raw:unknown,asOf:string):PAOIDPendingOHAccountResult{
 const parsed=PAOIDPendingOHAccountSchema.safeParse(raw);if(!parsed.success)return fail('complete actual pending account source shape is unknown');const p=parsed.data,y=input.taxpayer.taxYear,t=input.taxpayer.primary;
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(v:unknown):Decimal=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('actual nonnegative amount is unknown');const n=new Money(v);return n.isFinite()?n:fail('actual source amount is not finite');};
 const whole=(v:Decimal)=>v.toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
 date(asOf);if(y!==2025||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse)return fail('actual2025 single-owner pending method required');
 const owner=(r:{state:string;sourceTaxYear:number|null;accountName:string;accountSsn:string;sourceReference:string})=>{ref(r.sourceReference);if(r.state!=='OH'||r.sourceTaxYear!==y||normalize(r.accountName)!==normalize(t.firstName+' '+t.lastName)||!/^\d{9}$/.test(ssn(r.accountSsn))||ssn(r.accountSsn)!==ssn(t.ssn))fail('actual account owner/year/state is stale or unknown');};
 owner(p);if(p.sourceFactsConfirmed!==true)fail('actual complete pending account confirmation required');
 const residency=input.paResidencySources;if(!residency)return fail('actual complete nonOH domicile and personal OID sources required');
 // Reuse actual allocation/source validation; a mailing address is never domicile proof.
 calculatePAResidencySources(input,residency);
 if(residency.residency.factsConfirmed!==true||!residency.residency.domicilePeriods.length)return fail('actual full-year nonOH domicile history required');let next=y+'-01-01';
 for(const period of residency.residency.domicilePeriods){date(period.from);date(period.through);if(period.from!==next||period.through<period.from||!period.from.startsWith(y+'-')||!period.through.startsWith(y+'-')||normalize(period.state)==='OH')fail('actual full-year nonOH domicile calendar is incomplete or contradictory');next=new Date(Date.parse(period.through+'T00:00:00Z')+86400000).toISOString().slice(0,10);}
 if(next!==(y+1)+'-01-01')fail('actual full-year nonOH domicile calendar is incomplete');
 const originals=snapshotPAOrdinaryReturnOriginals(input);
 // All current non-OID document families must be genuinely empty in this finite
 // investment-only method. This also catches withholding in nested multistate rows.
 for(const [key,value]of Object.entries(originals))if(Array.isArray(value)&&key!=='form1099OID'&&key!=='taxpayer'&&value.length)fail('additional actual document/withholding family requires its complete account method');
 if(!input.form1099OID.length||!residency.oidAndMiscSources||residency.oidAndMiscSources.oid.some(row=>row.personalInvestmentOnlyConfirmed!==true||row.notNomineeOrTrustConfirmed!==true||row.classification!=='ordinary_taxable'))fail('complete personal nonbusiness ordinary OID original sources required');
 const federal=calculateFederalTax(input),oid=calculateForm1099OID(input.form1099OID,y);
 if(!new Money(federal.totalIncome).eq(oid.taxableInterest)||!new Money(federal.agi).eq(federal.totalIncome))fail('additional income or adjustments require their actual Ohio source method');
 const filed=p.filedReturn;owner(filed);ref(filed.returnId);date(filed.filedOn);
 if(filed.returnType!=='IT-1040'||filed.returnKind!=='original'||filed.filingStatus!=='single'||filed.residency!=='nonresident'||filed.filedOn<=y+'-12-31'||filed.filedOn>asOf||filed.allIncomeClassesAndAdjustmentsReviewedConfirmed!==true||filed.allNonpaymentCreditsAndUseTaxReviewedConfirmed!==true||filed.fullYearNonOHResidentConfirmed!==true||filed.noOHBusinessOrOtherSourceIncomeConfirmed!==true||filed.personalNonbusinessIntangiblesOnlyConfirmed!==true)fail('actual complete filed original nonresident Ohio history required');
 if(stable(filed.originalFederalSources)!==stable(originals)||!amount(filed.exactFederalAdjustedGrossIncome).eq(federal.agi)||!amount(filed.reportedFederalAdjustedGrossIncome).eq(whole(new Money(federal.agi))))fail('actual immutable filed raw federal originals or reported AGI differs from the current source');
 for(const v of [filed.ohioSourceIncome,filed.finalTaxLiability,filed.withholdingReported,filed.refundRequested])if(!amount(v).isZero())fail('actual nonzero Ohio allocation/liability or printed withholding/refund requires its source method');
 const expected=new Map<string,{original:TaxYearInput['form1099OID'][number];amount:Decimal}>();let totalWithholding=new Money(0);
 input.form1099OID.forEach((original,originalIndex)=>{if(original.taxYear!==y||original.accountHolder!=='primary')fail('actual current OID owner/year is unknown');(original.stateWithholding??[]).forEach((r,stateRowIndex)=>{if(normalize(r.state)==='OH'&&amount(r.stateWithheld).gt(0)){const a=amount(r.stateWithheld);expected.set(originalIndex+':'+stateRowIndex,{original,amount:a});totalWithholding=totalWithholding.plus(a);}});});
 if(!expected.size||p.payments.length!==expected.size)fail('complete actual current Ohio OID remittance coverage required');
 const ids=new Set<string>(),indices=new Set<string>();let paid=new Money(0);
 for(const payment of p.payments){owner(payment);ref(payment.confirmationNumber);date(payment.date);const key=payment.originalIndex+':'+payment.stateRowIndex,e=expected.get(key),id=normalize(payment.confirmationNumber);
  if(!e||indices.has(key)||ids.has(id)||payment.form!=='1099-OID'||payment.date<y+'-01-01'||payment.date>y+'-12-31'||payment.date>filed.filedOn||stable(payment.original)!==stable(e.original)||!amount(payment.amount).eq(e.amount))fail('actual original remittance identity/date/amount is missing stale or duplicated');indices.add(key);ids.add(id);
  for(const flag of ['actualPaymentToStateConfirmed','taxpayerBeneficialOwnerConfirmed','taxpayerAccountCreditConfirmed','noPayerRefundReimbursementOrRecourseConfirmed']as const)if(payment[flag]!==true)fail('actual credited taxpayer-owned remittance and no payer reimbursement proof required');paid=paid.plus(amount(payment.amount));
 }
 if(!whole(paid).eq(amount(filed.withholdingReported)))fail('actual filed printed withholding differs from whole original source total');
 const a=p.account;owner(a);date(a.completeThroughDate);
 if(a.completeThroughDate!==asOf||a.status!=='outstanding_credit'||a.actualAgencyStatementConfirmed!==true||a.allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed!==true||a.noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed!==true)fail('actual complete current Ohio agency account statement required');
 if(p.refunds.length||p.offsets.length||p.transfers.length||p.writeoffs.length)fail('actual refund/offset/transfer/writeoff needs its separate source method');
 for(const v of [a.refundsActuallyReceivedReported,a.offsetsReported,a.transfersReported,a.writeoffsOrForfeituresReported,a.taxLiabilityReported,a.unpaidTaxReported])if(!amount(v).isZero())fail('actual pending zero-liability account has contradictory cash/events');
 if(!paid.eq(totalWithholding)||!paid.eq(amount(a.grossTaxPaymentsReported))||!paid.eq(amount(a.netTaxPaymentsReported))||!paid.eq(amount(a.overpaymentOutstandingReported)))fail('actual complete account balances do not reconcile exact original cash');
 const sourceCommitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-oid-pending-oh-v1',year:y,asOf,originals,residency,packet:p}))));
 const zero=new Decimal(0),publicPaid=publicOrdinaryMoney(paid);
 return {state:'OH',status:'outstanding_credit',actualWithholding:publicPaid,actualNetRemittances:publicOrdinaryMoney(paid),actualRefundsReceived:zero,outstandingOverpayment:publicOrdinaryMoney(paid),actualTaxLiability:new Decimal(0),qualifiedSameIncome:new Decimal(0),paCredit:new Decimal(0),sourceCommitment,filingEligible:false,lines:[{form:'PA-OID-Pending-OH',line:'outstanding',description:'Actual unrefunded Ohio OID remittance; zero PA credit',value:publicOrdinaryMoney(paid),formula:'Actual credited cash remains outstanding; actual nonOH personal-interest allocation and Ohio liability0 imply PAcredit0, not a received refund',inputs:{sourceCommitment}}]};
}
