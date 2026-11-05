/** Pure two-owner ordinary PA household composition. Spec: state/pa-married-ordinary-return.yaml. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {PAMarriedOrdinarySourcesSchema,type PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources.js';
import {W2Schema,type TaxYearInput} from '@/models/inputs.js';
import type {CalculatedLine} from '@/models/outputs.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {AuditTrail} from '@/utils/audit.js';
import {roundDollar} from '@/utils/decimal.js';
import {ordinarySourcePrecision,publicOrdinaryMoney,publicOrdinaryLines} from './pa-ordinary-source-precision.js';
import {calculatePA40,type PA40Input,type PA40Result} from './pa-40.js';
import {calculateScheduleSP,type ScheduleSPResult} from './pa-schedule-sp.js';
import {calculateREV1630,type REV1630Result} from './pa-rev-1630.js';
import {calculatePAWorkingPennsylvaniansTaxCredit,type PAWorkingPennsylvaniansTaxCreditResult} from './pa-working-pennsylvanians-tax-credit.js';
import {calculatePAMarriedDependentSources,calculatePAMarriedCareSources} from './pa-married-dependent-care-sources.js';
import type {ScheduleDCResult} from './pa-schedule-dc.js';
type Owner='primary'|'spouse';
type ReturnOwner=Owner|'joint';
const fail=(detail:string):never=>{throw new Error('PA married ordinary sources: '+detail);};
const ref=(value:string):void=>{if(!value.trim())fail('actual source reference is missing');};
const ssn=(value:string)=>value.replace(/[-\s]/gu,'');
const normalized=(value:string)=>value.trim().replace(/\s+/gu,' ').toUpperCase();
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function day(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return fail('actual calendar date is missing');const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)return fail('actual calendar date is impossible');return value;}
/** Bind all actual household originals; only this packet is excluded to avoid self-reference. */
export function snapshotPAMarriedOrdinaryOriginals(input:TaxYearInput):Record<string,unknown>{return structuredClone(Object.fromEntries(Object.entries(input).filter(([key])=>key!=='paMarriedOrdinarySources')));}
export interface PAMarriedOrdinaryReturnProjection{
 accountHolder:ReturnOwner;filingChoice:'J'|'M';schoolDistrictCode:string;schoolDistrictName:string;
 pa40:PA40Result;scheduleSP:ScheduleSPResult;scheduleDC?:ScheduleDCResult;rev1630:REV1630Result;workingCredit:PAWorkingPennsylvaniansTaxCreditResult;
 refundDisposition:{refund:Decimal;nextYearCredit:Decimal;donations:Array<{code:string;amount:Decimal}>};
 wptcProcessing:{stage:'department-processing-reference';credit:Decimal;creditAppliedToTaxDue:Decimal;additionalOverpaymentBeforePenalties:Decimal;remainingTaxDueBeforePenalties:Decimal};
 penaltyCode:'E'|null;
}
export interface PAMarriedOrdinaryReturnResult{
 methodVersion:'pa-married-ordinary-return-v1';taxYear:number;filingMode:'J'|'M';sourceCommitment:string;
 federal:{filingStatus:TaxYearInput['taxpayer']['filingStatus'];adjustedGrossIncome:Decimal;earnedIncomeCredit:Decimal};
 perOwner:Array<{accountHolder:Owner;rawCompensation:Decimal;rawPAWithholding:Decimal;reportedCompensation:Decimal;reportedPAWithholding:Decimal;spOtherIncome:Decimal;actualPAServiceCompensation:Decimal}>;
 returns:PAMarriedOrdinaryReturnProjection[];localBoundary:{status:'separate_return_required';jurisdictions:string[]};
 readiness:{filingEligible:false;formStatus:'actual_2025_review_only'|'draft_2026_review_only';blockers:string[]};lines:CalculatedLine[];
}
/** Actual original statement identity after schema defaults, never free index/reference identity. */
function semantic(value:unknown,key=''):unknown{
 if(Array.isArray(value))return value.map(child=>semantic(child));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&v!==''&&!(Array.isArray(v)&&v.length===0)).map(([k,v])=>[k,semantic(v,k)]));
 if(typeof value==='string'){
  if(/ein|ssn/iu.test(key))return value.replace(/[-\s]/gu,'');
  if(/^-?\d+(\.\d+)?$/u.test(value))return new Decimal(value).toString();
  return normalized(value);
 }
 return value;
}
export function calculatePAMarriedOrdinaryReturn(input:TaxYearInput,raw:unknown):PAMarriedOrdinaryReturnResult{
 const parsed=PAMarriedOrdinarySourcesSchema.safeParse(raw);if(!parsed.success)return fail('complete actual source packet shape is missing or unsupported');
 if(input.paMarriedOrdinarySources!==undefined&&stable(input.paMarriedOrdinarySources)!==stable(raw))return fail('attached canonical source packet conflicts with supplied actual source facts');
 const sources=parsed.data,y=input.taxpayer.taxYear,mode=sources.filingMode;
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,raw),rounding:Decimal.ROUND_HALF_UP});
 function amount(value:unknown):Decimal{if(typeof value!=='string'||!/^\d+(\.\d+)?$/u.test(value))return fail('actual nonnegative source amount is unknown, negative or invalid; known zero must be explicit');const n=new Money(value);if(!n.isFinite())return fail('nonfinite source amount');return n;}
 function whole(value:string):Decimal{const n=amount(value);if(!n.isInteger())return fail('actual printed request amount must be a whole dollar');return n;}
 const zero=()=>new Money(0),sum=(values:Decimal[])=>values.reduce((a,b)=>a.plus(b),zero());
 if(![2025,2026].includes(y)||sources.sourceTaxYear!==y||sources.sourceFactsConfirmed!==true||!['J','M'].includes(mode))return fail('confirm actual selected-year J or M household sources');ref(sources.sourceReference);
 if(stable(sources.originalFederalSources)!==stable(snapshotPAMarriedOrdinaryOriginals(input)))return fail('original household snapshot changed; reconfirm actual sources');
 if(input.taxpayer.filingStatus!=='married_filing_jointly'||!input.taxpayer.spouse)return fail('first household method requires actual joint federal originals and both original spouses');
 const people={primary:input.taxpayer.primary,spouse:input.taxpayer.spouse};
 if(!/^\d{9}$/u.test(ssn(people.primary.ssn))||!/^\d{9}$/u.test(ssn(people.spouse.ssn))||ssn(people.primary.ssn)===ssn(people.spouse.ssn))return fail('actual household owners must have distinct complete identities');
 if(input.taxpayer.livedWithSpouseAtAnyTimeDuringYear===false||(input.taxpayer.stateResidency!==undefined&&input.taxpayer.stateResidency!=='full-year'))return fail('actual canonical marital/residency facts contradict the living fullresident household');
 const dependentCount=calculatePAMarriedDependentSources(input,sources);
 const start=`${y}-01-01`,end=`${y}-12-31`;
 const daysInYear=(Date.parse(`${y+1}-01-01T00:00:00Z`)-Date.parse(start+'T00:00:00Z'))/86400000;
 if(sources.owners.length!==2)return fail('exactly two current owner sources required');
 const owners=new Map<Owner,PAMarriedOrdinarySources['owners'][number]>();
 for(const row of sources.owners){
  const tag=row.accountHolder;if(tag!=='primary'&&tag!=='spouse')return fail('actual owner selection is unknown');if(owners.has(tag))return fail('duplicate actual owner source');
  const person=people[tag];if(stable(row.originalTaxpayer)!==stable({firstName:person.firstName,lastName:person.lastName,ssn:person.ssn}))return fail('actual original owner identity is stale');ref(row.sourceReference);
  if(row.factsConfirmed!==true||row.aliveEntireYear!==true||row.marriedAndLivedTogetherEntireYearConfirmed!==true||row.claimedAsDependentOnAnotherReturn!==false||day(row.taxYearFrom)!==start||day(row.taxYearThrough)!==end||day(row.cohabitationFrom)!==start||day(row.cohabitationThrough)!==end)return fail('actual living cohabiting calendar household and dependency facts are incomplete; separated/deceased method unavailable');
  if(row.individualSupportDhsLiability===null||row.individualCourtObligation===null)return fail('actual individual support/DHS/court liability is unknown');
  if(mode==='J'&&(row.individualSupportDhsLiability!==false||row.individualCourtObligation!==false))return fail('actual support/DHS/court liability requires separate PA returns');
  const r=row.residency;ref(r.sourceReference);
  if(r.factsConfirmed!==true||r.domicileState!=='PA'||day(r.domicileFrom)!==start||day(r.domicileThrough)!==end||day(r.paAbodeFrom)!==start||day(r.paAbodeThrough)!==end||r.actualDaysInPA===null||r.actualDaysInPA<=30||r.actualDaysInPA>daysInYear||!/^\d{5}$/u.test(r.dec31SchoolDistrictCode)||r.dec31SchoolDistrictCode==='99999'||!r.dec31SchoolDistrictName.trim())return fail('actual full-year PA domicile/abode/day/school sources are incomplete; mixed residency needs its successor');
  const pay=row.payments;ref(pay.sourceReference);ref(pay.priorReturnSourceReference);
  if(pay.allCurrentPaymentsReviewedConfirmed!==true||pay.estimatedPaymentsStatus!=='known_none'||pay.extensionPaymentsStatus!=='known_none'||pay.priorCreditStatus!=='known_none'||pay.originalReceipts.length||!['no_return','not_used','actual_return'].includes(pay.priorReturnStatus))return fail('actual complete payment history unknown or requires original account/transfer successor');
  owners.set(tag,row);
 }
 const primary=owners.get('primary'),spouse=owners.get('spouse');if(!primary||!spouse)return fail('both actual owner source packets required');
 if(mode==='J'&&(primary.residency.dec31SchoolDistrictCode!==spouse.residency.dec31SchoolDistrictCode||normalized(primary.residency.dec31SchoolDistrictName)!==normalized(spouse.residency.dec31SchoolDistrictName)))return fail('cohabiting original joint household school sources disagree');
 const coverage=sources.coverage;ref(coverage.sourceReference);
 for(const [key,value] of Object.entries(coverage))if(key.endsWith('Confirmed')&&!['allDependentSourcesKnownNoneConfirmed','allCareExpensesAndEmployerBenefitsKnownNoneConfirmed'].includes(key)&&value!==true)return fail('actual complete income/expense/credit/worldwide source review is unknown');
 const localNames=new Set<string>();if(!coverage.localJurisdictions.length)return fail('actual local residence/work obligations are missing');for(const local of coverage.localJurisdictions){ref(local.name);ref(local.sourceReference);const id=normalized(local.name);if(local.separateReturnRequired!==true||localNames.has(id))return fail('actual separate local obligation is unknown or duplicate');localNames.add(id);}
 for(const key of ['form1099Int','form1099Div','form1099B','form1099Nec','form1099Misc','form1099OID','form1099R','form1099DA','scheduleK1','formW2G','form1099G','form1099K','form1099Q','form1099SA','formSSA1099','formRRB1099','rentalProperties','homeSales','savingsBondRedemptions','scheduleK1Form1041','paPassThroughStatements','paScheduleJStatements','paScheduleGLStatements','form6252','form8824','form1095A','donations','form1098'] as const){
  const value=input[key];if(value!==undefined&&(!Array.isArray(value)||value.length))return fail('retained additional income/expense/credit originals require their actual source successor');
 }
 if(input.scheduleF!==undefined||input.cryptoIncome!==undefined||input.form4797!==undefined||input.form6781!==undefined||input.dependentCareBenefits!==undefined)return fail('retained business/benefit sources require their actual successor');
 if(input.dependentCare!==undefined&&sources.care?.status!=='actual_expenses')return fail('retained care originals require their complete actual married source packet');
 const permittedBlocks=new Set(['taxpayer','w2s','eic','standardDeductionFacts','deductionElection','paMarriedOrdinarySources','dependentCare']);
 for(const [key,value] of Object.entries(input))if(value!==undefined&&!permittedBlocks.has(key)&&!(Array.isArray(value)&&value.length===0))return fail('retained '+key+' sources require their actual married-source successor');
 // Legacy scalar state overrides are not actual married return source proof.
 if(input.paResidentReturn!==undefined||input.paNonresidentReturn!==undefined)return fail('retained legacy PA scalar requires its actual married-source reconciliation');
 const timing=sources.timing;ref(timing.sourceReference);const asOf=day(timing.asOfDate),filing=day(timing.filingDate);
 if(asOf<end||filing<`${y+1}-01-01`||filing>`${y+1}-04-15`||timing.returnKind!=='original'||timing.filingExtension!=='none'||timing.paymentExtension!=='none'||(timing.kind!=='filed'&&timing.kind!=='expected')||(timing.kind==='filed'?filing>asOf:filing<asOf))return fail('actual or expected timely original filing sources are incomplete; other dated method unavailable');
 const aggregates=new Map<Owner,{raw:Decimal;wh:Decimal;paServices:Decimal;sp:Decimal}>([['primary',{raw:zero(),wh:zero(),paServices:zero(),sp:zero()}],['spouse',{raw:zero(),wh:zero(),paServices:zero(),sp:zero()}]]);
 const aggregate=(tag:Owner)=>{const a=aggregates.get(tag);if(!a)return fail('actual owner aggregate missing');return a;};
 if(!Array.isArray(input.w2s)||!input.w2s.length||sources.wages.length!==input.w2s.length)return fail('complete W2 source coverage, including known zero, is required');
 const indices=new Set<number>(),identities=new Set<string>(),references=new Set<string>();
 for(const row of sources.wages){
  const index=row.originalIndex,tag=row.accountHolder;if(index===null||index<0||index>=input.w2s.length||indices.has(index)||(tag!=='primary'&&tag!=='spouse'))return fail('unique complete actual wage index/owner coverage required');indices.add(index);ref(row.sourceReference);if(references.has(normalized(row.sourceReference)))return fail('duplicate actual source reference');references.add(normalized(row.sourceReference));
  const w=input.w2s[index],originalWithoutRows=Object.fromEntries(Object.entries(w).filter(([key])=>key!=='stateLocalSources'));
  const checked=W2Schema.strict().safeParse(originalWithoutRows);if(!checked.success||stable(row.original)!==stable(w)||row.sourceTaxYear!==y||w.taxYear!==y||w.accountHolder!==tag||ssn(row.originalRecipientSsn)!==ssn(people[tag].ssn))return fail('actual current original wage owner/year/identity or snapshot is stale');
  if(row.sourceFactsConfirmed!==true||row.currentUncorrectedNonvoidOriginalConfirmed!==true||row.allOriginalBoxesKnownConfirmed!==true||row.ordinaryCashCompensationOnlyConfirmed!==true||row.noPAFederalCompensationDifferencesConfirmed!==true)return fail('actual current original wage status and ordinary classification are unknown');
  const id=stable(semantic(checked.data));if(identities.has(id))return fail('indistinguishable duplicate same-owner original W2s cannot be proved by index/reference');identities.add(id);
  const required=['wages','federalWithheld','socialSecurityWages','socialSecurityTips','allocatedTips','socialSecurityWithheld','medicareWages','medicareWithheld','box10DependentCareBenefits','stateTaxWithheld','stateWages','localWages','localTaxWithheld'] as const;
  for(const key of required)amount(w[key]);
  for(const key of ['box12CodeW','box12CodeD','box12CodeE','box12CodeF','box12CodeG','box12CodeH','box12CodeS','box12CodeT','box12CodeTP','box12CodeTT','box10DependentCareBenefits','allocatedTips','socialSecurityTips'] as const)if(w[key]!==undefined&&!amount(w[key]).isZero())return fail('nonordinary actual wage difference/benefit source requires its successor');
  if(w.militaryService?.activeDuty===true)return fail('actual military wage source requires its successor');
  let wh=amount(w.stateTaxWithheld);if(w.stateLocalSources!==undefined){const state=calculateW2StateLocalSources(input,index,w.stateLocalSources);if(state.stateRows.some(s=>s.state!=='PA')||state.localRows.some(l=>l.withheld.gt(0)))return fail('actual other-state/local withholding needs its source successor');wh=sum(state.stateRows.map(s=>new Money(s.withheld)));if(!sum(state.stateRows.map(s=>new Money(s.wages))).eq(amount(w.wages)))return fail('actual PA printed state wages differ from complete ordinary wage originals');}
  else if(w.state!=='PA'||!amount(w.stateWages).eq(amount(w.wages))||!amount(w.localTaxWithheld).isZero())return fail('actual PA wage/withholding rows need complete source reconciliation');
  if(!row.payroll.length)return fail('actual dated ordinary payroll originals missing');let gross=zero(),pa=zero();const payrollRefs=new Set<string>();
  for(const p of row.payroll){ref(p.sourceReference);const key=normalized(p.sourceReference);if(payrollRefs.has(key))return fail('duplicate payroll source reference');payrollRefs.add(key);const date=day(p.paidOn),from=day(p.serviceFrom),through=day(p.serviceThrough);if(date<start||date>end||from<start||through>end||from>through||date<through)return fail('actual dated cash payroll requires its cross-year/deferred source successor');const g=amount(p.grossCompensation),a=amount(p.paServicesCompensation),outside=amount(p.outsidePAServicesCompensation);if(!a.plus(outside).eq(g)||!outside.isZero())return fail('first ordinary fullresident source needs actual PA-only service payroll; other-state sources require their successor');gross=gross.plus(g);pa=pa.plus(a);}
  if(!gross.eq(amount(w.wages)))return fail('actual source payroll gross does not reconcile original Box1');const a=aggregate(tag);a.raw=a.raw.plus(gross);a.wh=a.wh.plus(wh);a.paServices=a.paServices.plus(pa);
 }
 const gifts=new Set<string>(),giftOriginals=new Set<string>();
 for(const tag of ['primary','spouse'] as const){const person=owners.get(tag);if(!person)return fail('actual owner source missing');ref(person.sp.sourceReference);if(person.sp.allWorldwideSourcesCompleteConfirmed!==true)return fail('complete actual worldwide owner SP sources required');
  for(const [line,category] of Object.entries(person.sp.categories)){ref(category.sourceReference);if(category.status==='known_none'){if(category.entries.length)return fail('known-none actual SP category contradicts retained originals');continue;}
   if(category.status!=='entries'||!category.entries.length||line!=='5')return fail('unknown or unsupported actual worldwide SP category requires its source successor');let exact=zero();
   for(const entry of category.entries){ref(entry.sourceReference);const original=entry.original,key=normalized(entry.sourceReference);const originalKey=stable(semantic(original));if(gifts.has(key)||giftOriginals.has(originalKey))return fail('duplicate actual gift source');gifts.add(key);giftOriginals.add(originalKey);if(day(entry.date)<start||day(entry.date)>end||entry.date!==original.date||!amount(entry.amount).eq(amount(original.amount))||original.kind!=='outside_household_gift'||original.donorInHousehold!==false||!original.donorName.trim()||ssn(original.recipientSsn)!==ssn(people[tag].ssn)||entry.notElsewhereConfirmed!==true)return fail('actual outside-household SP gift original identity/date/classification/amount is inconsistent');exact=exact.plus(amount(entry.amount));}
   aggregate(tag).sp=aggregate(tag).sp.plus(exact);
  }
 }
 // Compute the actual federal household exactly once. No synthetic filing status or source reassignment.
 const federal=calculateFederalTax(input),rawTotal=sum([...aggregates.values()].map(a=>a.raw));
 if(!federal.agi.eq(rawTotal))return fail('actual federal income/adjustments contradict the complete wages-only household source method');
 if(mode==='M'&&federal.earnedIncomeCredit.gt(0))return fail('positive actual joint federal EIC needs the separate-PA greater-tax and both-eligible source successor');
 const scheduleDC=calculatePAMarriedCareSources(input,sources,federal,asOf);
 const tags:ReturnOwner[]=mode==='J'?['joint']:['primary','spouse'];if(sources.dispositions.length!==tags.length)return fail('exact actual return disposition coverage is required');
 const dispositionMap=new Map<ReturnOwner,PAMarriedOrdinarySources['dispositions'][number]>();for(const d of sources.dispositions){const tag=d.accountHolder;if(!tags.includes(tag as ReturnOwner)||tag===''||dispositionMap.has(tag))return fail('unknown/duplicate actual return disposition');ref(d.sourceReference);dispositionMap.set(tag,d);}
 const ownerTotals=(tag:Owner)=>aggregate(tag),reportedComp=(tag:Owner)=>roundDollar(ownerTotals(tag).raw);
 const jointSp=mode==='J'?roundDollar(rawTotal).plus(roundDollar(sum([...aggregates.values()].map(a=>a.sp)))):sum((['primary','spouse'] as const).map(tag=>reportedComp(tag).plus(roundDollar(ownerTotals(tag).sp))));
 const returns:PAMarriedOrdinaryReturnProjection[]=[];
 for(const tag of tags){const own=tag==='joint'?{raw:rawTotal,wh:sum([...aggregates.values()].map(a=>a.wh)),sp:sum([...aggregates.values()].map(a=>a.sp)),paServices:sum([...aggregates.values()].map(a=>a.paServices))}:ownerTotals(tag);const compensation=roundDollar(own.raw),withheld=roundDollar(own.wh);
  const base:PA40Input={taxYear:y,compensation,unreimbursedExpenses:zero(),interest:zero(),dividends:zero(),netBusinessIncome:zero(),netGainOrLoss:zero(),netRentalIncome:zero(),estateTrustIncome:zero(),gamblingIncome:zero(),otherDeductions:zero(),taxForgivenessEligibilityIncome:jointSp,useTax:zero(),stateWithholding:withheld,creditFromPriorYear:zero(),estimatedPayments:zero(),extensionPayment:zero(),nonresidentTaxWithheld:zero(),refundableCredits:zero(),taxForgivenessCredit:zero(),residentCredit:zero(),otherCredits:zero(),underpaymentPenalty:zero(),lateFilingOrPaymentPenalty:zero(),latePaymentInterest:zero()};
  const before=calculatePA40(base),ownExtra=tag==='joint'?jointSp.minus(compensation):roundDollar(ownerTotals(tag).sp);
  const sp=calculateScheduleSP({taxYear:y,filingCategory:'married',dependents:dependentCount,paTaxableIncome:before.totalPATaxableIncome,nontaxableIncome:ownExtra,additionalEligibilityIncome:tag==='joint'?zero():jointSp.minus(before.totalPATaxableIncome).minus(ownExtra),taxLiability:before.taxLiability,taxPaidToOtherStates:zero()});
  const rev=calculateREV1630({taxYear:y,taxLiability:before.taxLiability,withholdingAndCredits:new Money(before.stateWithholding).plus(sp.taxForgivenessCredit).plus(scheduleDC?.credit??zero()),quarterlyEstimatedPayments:[zero(),zero(),zero(),zero()]});
  // The prior100percentSP exemption is independent of filing history. This
  // packet has no prior eligibility worksheet: no_return cannot establish false.
  if(rev.penaltyRequired)return fail('actual prior exemption/forgiveness eligibility source history is required before a positive penalty; prior-SP worksheet successor unavailable');
  const pa40=calculatePA40({...base,taxForgivenessCredit:sp.taxForgivenessCredit,otherCredits:scheduleDC?.credit??zero(),underpaymentPenalty:rev.totalInterest}),d=dispositionMap.get(tag);if(!d)return fail('actual output return source election is missing');
  const refund=whole(d.refundRequested),credit=whole(d.nextYearCreditRequested),codes=new Set<string>();if(d.donations.length>5)return fail('actual donation election exceeds five printed rows');const donations=d.donations.map(row=>{if(!['A','B','C','D','E','F','G','I','J'].includes(row.code)||codes.has(row.code))return fail('unsupported or duplicate actual donation election');codes.add(row.code);const amount=whole(row.amount);if(!amount.gt(0))return fail('actual donation must be positive');return {code:row.code,amount:publicOrdinaryMoney(amount)};});
  if(!refund.plus(credit).plus(sum(donations.map(v=>v.amount))).eq(pa40.netOverpayment))return fail('actual per-return refund/credit/donation election does not reconcile fresh printed overpayment');
  const remaining=d.remainingPayment;ref(remaining.sourceReference);if(pa40.taxDue.isZero()){if(remaining.status!=='no_remaining_tax'||remaining.date!==undefined||remaining.amountAppliedToTax!==undefined||remaining.original!==undefined)return fail('actual zero principal requires explicit no-remaining-tax source');}
  else if(remaining.status!=='expected_payment'||remaining.original!==undefined||day(remaining.date)!==`${y+1}-04-15`||day(remaining.date)<asOf||!amount(remaining.amountAppliedToTax).eq(pa40.taxDue))return fail('actual remaining principal needs explicit source-supported expected April15 amount/date; other payments need actual-account successor');
  const wptc=calculatePAWorkingPennsylvaniansTaxCredit({taxYear:y,paEarnedIncome:own.paServices,federalEarnedIncomeCredit:federal.earnedIncomeCredit,isClaimedAsDependentOnAnotherFederalReturn:false}),applied=Decimal.min(wptc.credit,pa40.taxDue);
  const school=tag==='spouse'?spouse.residency:primary.residency;
  returns.push({accountHolder:tag,filingChoice:mode as 'J'|'M',schoolDistrictCode:school.dec31SchoolDistrictCode,schoolDistrictName:school.dec31SchoolDistrictName,pa40,scheduleSP:sp,...(scheduleDC?{scheduleDC}:{}),rev1630:rev,workingCredit:wptc,refundDisposition:{refund:publicOrdinaryMoney(refund),nextYearCredit:publicOrdinaryMoney(credit),donations},wptcProcessing:{stage:'department-processing-reference',credit:publicOrdinaryMoney(wptc.credit),creditAppliedToTaxDue:publicOrdinaryMoney(applied),additionalOverpaymentBeforePenalties:publicOrdinaryMoney(Money.max(0,new Money(wptc.credit).minus(pa40.taxDue))),remainingTaxDueBeforePenalties:publicOrdinaryMoney(Money.max(0,new Money(pa40.taxDue).minus(wptc.credit)))},penaltyCode:rev.totalInterest.gt(0)?'E':null});
 }
 if(mode==='M'&&returns.some(r=>r.pa40.netOverpayment.gt(0))&&returns.some(r=>r.pa40.taxDue.gt(0)))return fail('opposing separate-owner excess/deficit requires actual117.2 account/request source successor; no invented settled cross-offset');
 const commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-married-ordinary-return-v1',originals:snapshotPAMarriedOrdinaryOriginals(input),sources:raw}))));
 const audit=new AuditTrail();audit.record('PA-Married-Ordinary','source','Complete two-owner original commitment',zero(),'Stable SHA256 binds raw household originals and actual source packet',{sourceCommitment:commitment});
 for(const r of returns){for(const line of [...r.pa40.lines,...r.scheduleSP.lines,...(r.scheduleDC?.lines??[]),...r.rev1630.lines,...r.workingCredit.lines])audit.record(line.form,`${r.accountHolder}:${line.line}`,line.description,line.value,line.formula,line.inputs);}
 return {methodVersion:'pa-married-ordinary-return-v1',taxYear:y,filingMode:mode as 'J'|'M',sourceCommitment:commitment,federal:{filingStatus:input.taxpayer.filingStatus,adjustedGrossIncome:publicOrdinaryMoney(federal.agi),earnedIncomeCredit:publicOrdinaryMoney(federal.earnedIncomeCredit)},perOwner:(['primary','spouse'] as const).map(tag=>{const a=ownerTotals(tag);return {accountHolder:tag,rawCompensation:publicOrdinaryMoney(a.raw),rawPAWithholding:publicOrdinaryMoney(a.wh),reportedCompensation:publicOrdinaryMoney(reportedComp(tag)),reportedPAWithholding:publicOrdinaryMoney(roundDollar(a.wh)),spOtherIncome:publicOrdinaryMoney(roundDollar(a.sp)),actualPAServiceCompensation:publicOrdinaryMoney(a.paServices)};}),returns,localBoundary:{status:'separate_return_required',jurisdictions:coverage.localJurisdictions.map(l=>l.name)},readiness:{filingEligible:false,formStatus:y===2025?'actual_2025_review_only':'draft_2026_review_only',blockers:['review-only-not-qualified-for-filing','married-native-and-public-export-integration-pending','separate-local-return-required',...(y===2026?['final-2026-forms-unqualified']:[]),...(federal.earnedIncomeCredit.gt(0)?['filed-federal1040-copy-required-for-department-processing']:[])]},lines:publicOrdinaryLines(audit.getLines())};
}
