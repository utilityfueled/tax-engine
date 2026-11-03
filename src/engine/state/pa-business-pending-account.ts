/** Finite actual pending zero-business account. Spec: state/pa-business-pending-account.yaml. */
import Decimal from 'decimal.js';
import {PABusinessPendingAccountSourcesSchema} from '@/models/pa-business-pending-account.js';
import {PAOrdinaryBusinessSourceSchema} from '@/models/pa-ordinary-business-sources.js';
import {BusinessExpensesSchema,Form1099NecSchema,type TaxYearInput} from '@/models/inputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
const fail=(detail:string):never=>{throw Error('PA business pending NY account: '+detail);};
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(v)??'null';}
function ref(v:string):void{if(!v.trim())fail('actual source reference or receipt identity is missing');}
function date(v:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return fail('actual account date is unknown');const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)return fail('actual account date is impossible');return v;}
const normalize=(v:string)=>v.trim().replace(/\s+/g,' ').toUpperCase(),ssn=(v:string)=>v.replace(/\D/g,'');
export interface PABusinessPendingAccountResult{state:'NY';actualWithholding:Decimal;actualNetRemittances:Decimal;actualRefundsReceived:Decimal;outstandingOverpayment:Decimal;actualTaxLiability:Decimal;qualifiedSameIncome:Decimal;paCredit:Decimal;status:'outstanding_overpayment';sourceCommitment:string;filingEligible:false;lines:CalculatedLine[];}
export function calculatePABusinessPendingAccountSources(input:TaxYearInput,raw:unknown,asOf:string):PABusinessPendingAccountResult{
 const parsed=PABusinessPendingAccountSourcesSchema.safeParse(raw);if(!parsed.success)return fail('complete actual pending account source shape is unknown');const p=parsed.data,y=input.taxpayer.taxYear,t=input.taxpayer.primary;
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 const amount=(v:unknown):Decimal=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))return fail('actual nonnegative source amount is unknown');const n=new Money(v);return n.isFinite()?n:fail('actual source amount is nonfinite');};
 date(asOf);if(y!==2025||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse)return fail('actual2025 single-owner pending method required');
 const owner=(row:{state:string;sourceTaxYear:number|null;accountName:string;accountSsn:string;sourceReference:string})=>{ref(row.sourceReference);if(row.state!=='NY'||row.sourceTaxYear!==y||normalize(row.accountName)!==normalize(t.firstName+' '+t.lastName)||!/^\d{9}$/.test(ssn(row.accountSsn))||ssn(row.accountSsn)!==ssn(t.ssn))fail('actual pending account owner/year/state is missing or stale');};
 owner(p);if(p.sourceFactsConfirmed!==true)return fail('actual complete pending account confirmation required');
 const r=input.paResidencySources;if(!r||r.sourceTaxYear!==y||r.sourceFactsConfirmed!==true||r.residency.factsConfirmed!==true||!r.residency.domicilePeriods.length||r.residency.domicilePeriods.some(row=>!/^[A-Z]{2}$/.test(row.state)||normalize(row.state)==='NY'))return fail('actual complete full-year nonNY domicile source required');
 let next=y+'-01-01';for(const row of r.residency.domicilePeriods){date(row.from);date(row.through);if(row.from!==next||row.through<row.from||!row.from.startsWith(y+'-')||!row.through.startsWith(y+'-'))return fail('actual complete nonNY domicile calendar is missing or inconsistent');next=new Date(Date.parse(row.through+'T00:00:00Z')+86400000).toISOString().slice(0,10);}if(next!==(y+1)+'-01-01')return fail('actual full-year nonNY domicile calendar is incomplete');
 if(r.businesses?.length!==1)return fail('one complete actual zero business source required');const bp=PAOrdinaryBusinessSourceSchema.safeParse(r.businesses[0]);if(!bp.success)return fail('complete actual business source shape required');const b=bp.data,c=input.scheduleC;
 if(!c||b.sourceFactsConfirmed!==true||b.sourceTaxYear!==y||b.owner.accountHolder!=='primary'||stable(b.owner.originalTaxpayer)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn})||stable(b.originalScheduleC)!==stable(c)||stable(b.pendingNYAccountSources)!==stable(p))return fail('current original business/account binding is missing or stale');
 if(c.accountingMethod!=='cash'||b.manualCashbook.status!=='known_none'||b.incomeReceipts.length||b.customerRefunds.length||b.expenseReceipts.length||b.expenseRefunds.length||!b.allocation.locations.length||b.allocation.locations.some(row=>normalize(row.state)==='NY'))return fail('pending method requires complete zero-income books and noNY operations');
 for(const key of ['commercialEnterpriseConfirmed','cashMethodConsistentConfirmed','allIncomeAndExpenseSourcesCompleteConfirmed','noInventoryCOGSConfirmed','noOtherBusinessIncomeConfirmed','noHomeOfficeOrOtherAdjustmentsConfirmed']as const)if(b[key]!==true)fail('actual zero business complete source qualification required');
 for(const v of [c.grossReceipts,c.returnsAndAllowances,c.costOfGoodsSold,c.otherIncome])if(!amount(v).isZero())fail('pending method requires actual zero business income and costs');
 for(const key of Object.keys(BusinessExpensesSchema.shape)as Array<keyof NonNullable<typeof c.expenses>>){if(!amount(c.expenses?.[key]).isZero()||b.expenseCategories[key]?.status!=='known_none')fail('actual zero business complete cost classifications required');ref(b.expenseCategories[key].sourceReference);}
 const additionalNY=(state:unknown,value:unknown)=>{if(typeof state==='string'&&normalize(state)==='NY'&&amount(value).gt(0))fail('additional actual NY withholding original requires its complete account source method');};
 for(const o of [...input.form1099Int,...input.form1099Div,...input.form1099B,...input.form1099Misc,...(input.form1099R??[]),...input.form1099G,...input.form1099K,...input.formW2G])additionalNY(o.state,o.stateWithheld);
 for(const o of input.form1099R??[])additionalNY(o.state,o.stateTaxWithheld);
 for(const o of input.form1099OID)for(const row of o.stateWithholding??[])additionalNY(row.state,row.stateWithheld);
 for(const o of input.form1099DA){additionalNY(o.state,o.stateWithheld);for(const row of o.stateWithholding??[])additionalNY(row.state,row.stateWithheld);}
 for(const [i,o]of input.w2s.entries()){if(o.stateLocalSources===undefined)additionalNY(o.state,o.stateTaxWithheld);else for(const row of calculateW2StateLocalSources(input,i,o.stateLocalSources).stateRows)if(row.state==='NY'&&row.withheld.gt(0))fail('additional actual NY W2 withholding requires its account method');}
 const filed=p.filedReturn;owner(filed);ref(filed.returnId);date(filed.filedOn);
 if(filed.returnType!=='IT-203'||filed.returnKind!=='original'||filed.filingStatus!=='single'||filed.residency!=='nonresident'||filed.filedOn<=y+'-12-31'||filed.filedOn>asOf||filed.allIncomeClassesAndAdjustmentsReviewedConfirmed!==true||filed.allNonpaymentCreditsReviewedConfirmed!==true||filed.fullYearNonNYResidentConfirmed!==true||filed.noNYBusinessOrOtherSourceIncomeConfirmed!==true)return fail('actual complete filed original nonNY return source required');
 for(const v of [filed.newYorkSourceIncome,filed.taxBeforeCredits,filed.nonpaymentCredits,filed.finalTaxLiability,filed.withholdingReported,filed.refundRequested])if(!amount(v).isZero())return fail('actual zero NY source liability and no NEC formcredit/refund required');
 if(!amount(filed.federalAdjustedGrossIncome).eq(calculateFederalTax(input).agi))return fail('actual filed federal AGI contradicts current original calculation');
 const expected=new Map<number,TaxYearInput['form1099Nec'][number]>();
 for(const [i,o]of input.form1099Nec.entries()){
  if(!Form1099NecSchema.strict().safeParse(o).success||o.accountHolder!=='primary'||o.taxYear!==y||!amount(o.nonemployeeCompensation).isZero()||!amount(o.stateIncome).isZero())return fail('actual current owner/year zero-income NEC original required');
  if(normalize(o.state??'')==='NY'&&amount(o.stateWithheld).gt(0))expected.set(i,o);
 }
 if(!expected.size||p.payments.length!==expected.size)return fail('complete actual NY payment original coverage required');
 const ids=new Set<string>(),indices=new Set<number>();let paid=new Money(0);
 for(const payment of p.payments){owner(payment);ref(payment.confirmationNumber);ref(payment.payerErrorExplanation);date(payment.date);const i=payment.originalIndex,o=i===null?undefined:expected.get(i);
  if(i===null||!o||indices.has(i)||ids.has(normalize(payment.confirmationNumber)))return fail('duplicate or missing actual payment original/receipt identity');indices.add(i);ids.add(normalize(payment.confirmationNumber));
  if(payment.form!=='1099-NEC'||payment.date<y+'-01-01'||payment.date>y+'-12-31'||payment.date>filed.filedOn||stable(payment.original)!==stable(o)||!amount(payment.amount).eq(amount(o.stateWithheld)))return fail('actual linked NEC remittance original/date/amount is stale');
  for(const key of ['actualPaymentToStateConfirmed','taxpayerBeneficialOwnerConfirmed','taxpayerAccountCreditConfirmed','noPayerRefundReimbursementOrRecourseConfirmed','notTaxableCompensationConfirmed']as const)if(payment[key]!==true)fail('actual credited beneficial owner remittance and payer-error source proof required');paid=paid.plus(amount(payment.amount));
 }
 const a=p.account;owner(a);date(a.completeThroughDate);
 if(a.completeThroughDate!==asOf||a.status!=='outstanding_overpayment'||a.actualAgencyStatementConfirmed!==true||a.allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed!==true||a.noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed!==true)return fail('actual complete current agency account history required');
 if(p.refunds.length||p.offsets.length||p.transfers.length||p.writeoffs.length)return fail('pending account received refund/offset/transfer/writeoff requires its actual successor');
 for(const v of [a.refundsActuallyReceivedReported,a.offsetsReported,a.transfersReported,a.writeoffsOrForfeituresReported,a.taxLiabilityReported,a.unpaidTaxReported])if(!amount(v).isZero())return fail('pending account actual refund/liability/events contradict outstanding zero-liability method');
 if(!paid.eq(amount(a.grossTaxPaymentsReported))||!paid.eq(amount(a.netTaxPaymentsReported))||!paid.eq(amount(a.overpaymentOutstandingReported)))return fail('actual pending account cash balances do not reconcile original remittances');
 const sourceCommitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-business-pending-account-v1',year:y,owner:t,asOf,packet:p,business:b,currentOriginals:input}))));
 const zero=new Decimal(0),actual=publicOrdinaryMoney(paid);
 return {state:'NY',actualWithholding:actual,actualNetRemittances:publicOrdinaryMoney(paid),actualRefundsReceived:zero,outstandingOverpayment:publicOrdinaryMoney(paid),actualTaxLiability:new Decimal(0),qualifiedSameIncome:new Decimal(0),paCredit:new Decimal(0),status:'outstanding_overpayment',sourceCommitment,filingEligible:false,lines:[{form:'PA-Business-Pending-Account',line:'outstanding',description:'Actual outstanding other-state remittance; mandatory zero PA credit',value:publicOrdinaryMoney(paid),formula:'Actual credited remittances minus actually received refunds, offsets and transfers; zero qualified same-income/liability implies zero PA credit',inputs:{state:'NY',sourceCommitment}}]};
}
