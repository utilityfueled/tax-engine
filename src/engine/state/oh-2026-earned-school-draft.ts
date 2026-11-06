/** Spec: state/oh-2026-earned-school-draft.yaml. Finite draft, no final form qualification. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {AuditTrail} from '@/utils/audit.js';
import type {CalculatedLine} from '@/models/outputs.js';
import type {TaxYearInput} from '@/models/inputs.js';
import {Ohio2026EarnedSchoolDraftSourcesSchema} from '@/models/ohio-2026-earned-school-draft.js';
import {calculateOhio2026EarnedSchoolEmployeeSource} from './oh-2026-ordinary-source.js';
import {calculateOhio2026ReturnDraft,type Ohio2026ReturnDraftResult} from './oh-2026-return-draft.js';
import {calculateOhio2026SchoolSource,readOhio2026SchoolSource} from './oh-2026-school-source.js';
const Exact=Decimal.clone({precision:128,rounding:Decimal.ROUND_HALF_UP});
function fail(label:string):never{throw Error('Ohio2026 earned-school draft: '+label);}
function stable(v:unknown):unknown{if(Decimal.isDecimal(v))return v.toString();if(Array.isArray(v))return v.map(stable);if(v!==null&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return v;}
const same=(a:unknown,b:unknown)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const cash=(v:string)=>new Exact(v);
const whole=(v:Decimal)=>v.toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
const tin=(v:string)=>v.replace(/\D/g,'');
const name=(v:string)=>v.replace(/\s+/g,'').toUpperCase();
function day(v:string){const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail('valid actual calendar date required');return n;}
export interface Ohio2026EarnedSchoolDraftResult{
 taxYear:2026;ruleVersion:'oh-2026-earned-school-employee-draft-v1';calculationStatus:'incomplete';reviewStatus:'independent-review-pending';filingQualified:false;sourceCommitment:string;
 state:Ohio2026ReturnDraftResult;
 school:{districtCode:string;taxBase:'earned';rate:Decimal;rawCompensation:Decimal;rawTaxLevy:Decimal;rawWithholding:Decimal;reportedTaxBase:Decimal;taxBeforeCredits:Decimal;seniorCredit:Decimal;incomeTax:Decimal;withholding:Decimal;estimatedPayments:Decimal;priorCreditApplied:Decimal;underpaymentPenalty:Decimal;latePaymentInterest:Decimal;amountDue:Decimal;refund:Decimal;externalAccountSettlement:null;roundingElection:'whole_dollars'};
 lines:CalculatedLine[];limitations:string[];
}
export function calculateOhio2026EarnedSchoolDraft(input:TaxYearInput,raw:unknown):Ohio2026EarnedSchoolDraftResult{
 const parsed=Ohio2026EarnedSchoolDraftSourcesSchema.safeParse(raw);if(!parsed.success)fail('complete confirmed separate school and state originals required');const s=parsed.data;
 const context=calculateOhio2026EarnedSchoolEmployeeSource(input,raw);
 const schoolContext=calculateOhio2026SchoolSource(input,s.schoolSources),actual=readOhio2026SchoolSource(schoolContext,input,s.schoolSources);
 const proof=s.schoolPaymentSources,p=proof.payments,person=input.taxpayer.primary;
 if(!same(proof.originalTaxInput,input)||!same(proof.originalSchoolSources,s.schoolSources)||!same(proof.owner.originalTaxpayer,person)||proof.districtCode!==actual.districtCode)fail('current complete school payment originals owner district or input differs');
 if(p.paymentRows.length||p.priorReturn.status!=='no_return'||p.priorCreditCarryforward.status!=='none'||!cash(p.account.estimatedPaymentsCredited).isZero()||!cash(p.account.priorCreditApplied).isZero()||!cash(p.refundDisposition.outgoingCarryforward).isZero())fail('separate actual no estimates prior return carry or election required');
 if(p.account.taxYear!==2026||p.account.returnType!=='sd100'||name(p.account.accountName)!==name(person.firstName+' '+person.lastName)||tin(p.account.accountSsn)!==tin(person.ssn))fail('actual school account owner year type differs');
 const timing=p.currentTiming,valuation=timing.kind==='filed'?timing.filedDate:timing.expectedDate;
 for(const date of [timing.asOfDate,valuation,p.account.asOfDate])day(date);
 if(timing.asOfDate<'2027-01-01'||timing.asOfDate>'2027-04-15'||valuation<'2027-01-01'||valuation>'2027-04-15'||p.account.asOfDate!==timing.asOfDate||timing.kind==='filed'&&valuation>timing.asOfDate||timing.kind==='expected'&&valuation<timing.asOfDate)fail('actual timely complete school filing and account chronology required');
 const state=calculateOhio2026ReturnDraft(input,raw,context);
 if(state.actualBalancePayment)fail('separate state and school withholding coverage only; actual balance method not composed');
 const rawCompensation=cash(actual.residentCompensation),rate=cash(actual.rate),rawTaxLevy=rawCompensation.times(rate),rawWithholding=cash(actual.schoolWithholding);
 const reportedTaxBase=whole(rawCompensation),taxBeforeCredits=whole(reportedTaxBase.times(rate)),withholding=whole(rawWithholding);
 if(rawWithholding.lt(rawTaxLevy)||withholding.lt(taxBeforeCredits))fail('actual raw and reported school withholding must separately cover school tax');
 // Both separate obligations are covered; no IT1040/school cross-account offset.
 if(new Exact(state.withholding.toString()).lt(state.incomeTax.toString()))fail('actual state withholding must separately cover state tax');
 const zero=()=>new Exact('0');
 const audit=new AuditTrail();
 for(const[line,label,value,formula]of[
 ['school-earned-base','Source-qualified reported earned base',reportedTaxBase,'Sum actual full-year resident ordinary wages; explicit whole-dollar election, no personal exemption deduction; RC5748.01(E)(2) and5703.055'],
 ['school-tax','Earned-school tax after known no senior credit',taxBeforeCredits,'Reported earned base times exact annual earned-district rate, whole-dollar HALF_UP; actual under65 owner, RC5748.06'],
 ['school-withholding','School withholding only',withholding,'Aggregate source-qualified original school rows once then whole-dollar election; never OH state row withholding'],
 ['school-installment-penalty','Covered school installment obligation',zero(),'Separate equal-quarter state and school compensation withholding cover each current liability; complete no estimate/prior/carry originals, RC5747.09'],
 ['school-late-interest','No late unpaid school balance',zero(),'Complete timely chronology and withholding-covered current school liability; no unknown payment-date default'],
 ['school-amount-due','No uncovered reported school tax',zero(),'Reported school withholding covers reported school liability separately from IT1040'],
 ['school-refund','Reported school overpayment',withholding.minus(taxBeforeCredits),'Reported school withholding minus school tax; actual zero outgoing carry and other payments; no external settlement observation'],
 ]as const)audit.record('OH2026 earned-school draft',line,label,value,formula);

 return {taxYear:2026,ruleVersion:'oh-2026-earned-school-employee-draft-v1',calculationStatus:'incomplete',reviewStatus:'independent-review-pending',filingQualified:false,
 sourceCommitment:bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable({input,sources:raw}))))),state,
 school:{districtCode:actual.districtCode,taxBase:'earned',rate,rawCompensation,rawTaxLevy,rawWithholding,reportedTaxBase,taxBeforeCredits,seniorCredit:zero(),incomeTax:taxBeforeCredits,withholding,estimatedPayments:zero(),priorCreditApplied:zero(),underpaymentPenalty:zero(),latePaymentInterest:zero(),amountDue:zero(),refund:withholding.minus(taxBeforeCredits),externalAccountSettlement:null,roundingElection:'whole_dollars'},
 lines:[...state.lines,...audit.getLines()],limitations:['Finite single full-year under65 ordinary wages in one actual earned district; complete separate state and school withholding coverage only.','School report arithmetic uses explicit statutory whole-dollar election; raw originals remain intact. No final2026 SD100 form identity or line-number assertion.','Actual external account settlement is unobserved. Other payments, carryovers, elections, traditional districts, multiple districts, part-year/nonresident, business and credit methods require separate actual source proofs.','Draft remains incomplete; full federal2026, final physical forms, independent human review and filing qualification remain unavailable.']};
}
