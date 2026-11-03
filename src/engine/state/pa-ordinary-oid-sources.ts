/** Pure finite original method: spec/state/pa-ordinary-oid-sources.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Form1099MiscSchema,Form1099OIDSchema,type TaxYearInput } from '@/models/inputs.js';
import { PAOrdinaryOIDSourcesSchema,type PAOrdinaryOIDSources } from '@/models/pa-ordinary-oid-sources.js';
import { W2StateLocalSourcesSchema } from '@/models/w2-state-local.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
const fail=(detail:string):never=>{throw new Error('PA ordinary investment sources: '+detail);};
const ref=(value:string)=>{if(!value.trim())fail('complete actual original reference is required');};
/** Enough exact places for every admitted nonnegative source term and sum carry. */
function sourcePrecision(...sources:unknown[]):number{
 let integerDigits=1,fractionalDigits=0,terms=0;
 function visit(value:unknown):void{
  if(typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)){
   const [integer,fraction='']=value.split('.');
   integerDigits=Math.max(integerDigits,integer.replace(/^0+/,'').length);
   fractionalDigits=Math.max(fractionalDigits,fraction.length);terms+=1;
  }else if(Array.isArray(value)){for(const child of value)visit(child);}
  else if(value&&typeof value==='object'){for(const child of Object.values(value))visit(child);}
 }
 for(const source of sources)visit(source);
 // Every original/accrual term appears in these sources; extra places cover carry
 // in chained totals and duplicate source representations without changing bounds.
 return Math.max(20,integerDigits+fractionalDigits+String(terms+1).length+3);
}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function day(value:string,year?:number):number{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||(year!==undefined&&!value.startsWith(year+'-')))return fail('actual date must belong to the selected tax year');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)return fail('actual date is impossible');return n;}
type Period={from:string;through:string};
type OriginalRow=PAOrdinaryOIDSources['oid'][number]|PAOrdinaryOIDSources['miscWithholding'][number];
export interface PAOrdinaryOIDSourcesResult{
 taxableInterest:Decimal;excludedNonresidentInterest:Decimal;worldwideExemptInterest:Decimal;paWithholding:Decimal;
 stateWithholding:Array<{state:string;amount:Decimal}>;sourceCommitment:string;lines:CalculatedLine[];
}
/** residentPeriods must be derived by calculatePAResidencySources, never mailing-address inference. */
export function calculatePAOrdinaryOIDSources(input:TaxYearInput,rawSources:unknown,residentPeriods:ReadonlyArray<Period>):PAOrdinaryOIDSourcesResult{
 const parsed=PAOrdinaryOIDSourcesSchema.safeParse(rawSources);if(!parsed.success)return fail('actual source packet shape is incomplete or unsupported');
 const source=parsed.data,y=input.taxpayer.taxYear,t=input.taxpayer.primary;
 const Money=Decimal.clone({precision:sourcePrecision(input.form1099OID,input.form1099Misc,source),rounding:Decimal.ROUND_HALF_UP});
 function amount(value:unknown):Decimal{if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value))return fail('actual nonnegative amount is missing; known zero must be explicit');return new Money(value);}
 function publicMoney(value:Decimal):Decimal{return new Decimal(value.toFixed());}
 function confirmWithholding(row:OriginalRow,positivePA:boolean):void{
  const proof=row.withholdingConfirmation;ref(proof.sourceReference);
  if(typeof proof.actualPaymentToPAConfirmed!=='boolean'||typeof proof.notRefundedByPayerConfirmed!=='boolean'||
   (positivePA&&(proof.actualPaymentToPAConfirmed!==true||proof.notRefundedByPayerConfirmed!==true)))return fail('actual withholding remittance and no-payer-refund confirmation required');
 }

 if(![2025,2026].includes(y)||source.sourceTaxYear!==y||source.sourceFactsConfirmed!==true)return fail('confirm actual selected source year');ref(source.sourceReference);
 if(source.owner.accountHolder!=='primary'||input.taxpayer.spouse||['married_filing_jointly','married_filing_separately'].includes(input.taxpayer.filingStatus)||stable(source.owner.originalTaxpayer)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))return fail('actual current single-owner identity is required');
 const checked=residentPeriods.map(p=>({from:day(p.from,y),through:day(p.through,y)}));let prior=-Infinity;
 for(const p of checked){if(p.from>p.through||p.from<=prior)return fail('validated resident periods must be ordered and disjoint');prior=p.through;}
 let taxableInterest=new Money(0),excludedNonresidentInterest=new Money(0),worldwideExemptInterest=new Money(0),paWithholding=new Money(0);
 const stateWithholding:Array<{state:string;amount:Decimal}>=[];
 const stateSchema=W2StateLocalSourcesSchema.shape.stateRows.element.shape.state;
 function withheld(state:unknown,value:unknown){const n=amount(value);if(typeof state!=='string'||(!stateSchema.safeParse(state).success)||(n.gt(0)&&!state))return fail('actual withholding state must be a known printed US state or DC');if(state)stateWithholding.push({state,amount:n});if(state==='PA')paWithholding=paWithholding.plus(n);}
 function coverage(rows:OriginalRow[],originals:unknown[]){
  if(rows.length!==originals.length)return fail('every actual current original needs exactly one source row, including known zero originals');
  const indices=new Set<number>(),identities=new Set<string>();
  for(const row of rows){const index=row.originalIndex;ref(row.sourceReference);
   if(index===null||index<0||index>=originals.length||indices.has(index))return fail('source original indices must be unique and complete');indices.add(index);
   if(row.sourceTaxYear!==y||row.sourceFactsConfirmed!==true||row.currentUncorrectedNonvoidOriginalConfirmed!==true||row.allOriginalBoxesKnownConfirmed!==true||!row.original)return fail('actual original year/status/all-box confirmations required');
   const current=originals[index] as Record<string,unknown>;if(current.taxYear!==y||current.accountHolder!=='primary'||!current.sourceId||stable(row.original)!==stable(current))return fail('current original owner/year/content identity differs from confirmed source');
   const identity=stable(Object.fromEntries(Object.entries(current).filter(([key])=>key!=='sourceId')));
   if(identities.has(identity))return fail('duplicate semantic original cannot be established by a different source row');identities.add(identity);
  }
 }
 if(!Array.isArray(input.form1099OID)||!Array.isArray(input.form1099Misc))return fail('complete canonical original arrays required');
 coverage(source.oid,input.form1099OID);coverage(source.miscWithholding,input.form1099Misc);
 for(const row of source.oid){
  const form=input.form1099OID[row.originalIndex as number],parsedOriginal=Form1099OIDSchema.safeParse(form);
  if(!parsedOriginal.success||Object.keys(form).some(key=>!(key in parsedOriginal.data))||form.sourceFactsComplete!==true||form.sourceFactsConfirmed!==true||form.recipientAmountsConfirmed!==true)return fail('complete original recipient federal facts and supported original fields must be explicit');
  if(form.specifiedPrivateActivityBond===true)return fail('private-activity classification contradicts the supported ordinary OID instrument');
  if(row.personalInvestmentOnlyConfirmed!==true||row.notNomineeOrTrustConfirmed!==true)return fail('actual nonbusiness personal legal-owner classification required');
  const instrument=row.instrument;ref(instrument.sourceReference);ref(instrument.securityId);ref(instrument.issuerName);
  const issued=day(instrument.issuedOn),maturity=day(instrument.maturesOn);
  if(issued>maturity||issued>day(y+'-12-31',y)||maturity<day(y+'-01-01',y)||instrument.directLegalOwnershipConfirmed!==true||instrument.stripped!==false||instrument.guaranteedAgencyOnly!==false)return fail('actual direct nonstripped investment instrument identity and dates required');
  const treasury=row.classification==='direct_us_treasury';
  if(treasury?(instrument.usTreasuryDirectObligationConfirmed!==true||form.obligationType!=='treasury'):(row.classification!=='ordinary_taxable'||instrument.usTreasuryDirectObligationConfirmed!==false||form.obligationType!=='taxable'))return fail('actual statutory PA classification must reconcile the current original instrument');
  if(form.inflationIndexed!==false||form.oidReportedNetOfAcquisitionPremium!==false||form.interestReportedNetOfBondPremium!==false||form.recipientAdjustments!==undefined||form.bondPremiumWorksheet!==undefined||form.tipsDeflationFacts!==undefined||form.marketDiscountElection===true||form.bondPremiumElection===true)return fail('recipient/basis/inflation/election facts require their separate actual method');
  for(const key of ['earlyWithdrawalPenalty','marketDiscount','acquisitionPremium','investmentExpenses','bondPremium','taxExemptOID'] as const)if(!amount(form[key]).isZero())return fail('premium/market/penalty/exempt original boxes need their actual successor method');
  if(form.taxExemptBondPremium!==undefined&&!amount(form.taxExemptBondPremium).isZero())return fail('historical tax-exempt-premium original requires reconciliation');
  const ordinary=amount(form.originalIssueDiscount),treasuryOID=amount(form.treasuryOID),coupon=amount(form.otherPeriodicInterest);amount(form.federalWithheld);
  if((treasury&&!ordinary.isZero())||(!treasury&&!treasuryOID.isZero()))return fail('same-source ordinary and Treasury OID categories contradict actual classification');
  if(!row.accruals.length)return fail('actual dated accrual/credit ledger is required');
  let totalOID=new Money(0),totalCoupon=new Money(0),last=-Infinity;const refs=new Set<string>();
  for(const accrual of row.accruals){ref(accrual.sourceReference);if(refs.has(accrual.sourceReference.trim()))return fail('duplicate actual accrual identity');refs.add(accrual.sourceReference.trim());
   const from=day(accrual.from,y),through=day(accrual.through,y);if(from>through||from<=last||from<issued||through>maturity)return fail('actual accrual periods must be ordered, disjoint and within the original instrument dates');last=through;
   const oid=amount(accrual.oid),paid=amount(accrual.coupon),gross=oid.plus(paid);totalOID=totalOID.plus(oid);totalCoupon=totalCoupon.plus(paid);
   if(treasury)worldwideExemptInterest=worldwideExemptInterest.plus(gross);
   else{const inside=checked.some(p=>from>=p.from&&through<=p.through),overlap=checked.some(p=>from<=p.through&&through>=p.from);
    if(overlap&&!inside)return fail('cross-resident-period accrual requires actual allocation original; no day-ratio inference');
    if(inside)taxableInterest=taxableInterest.plus(gross);else excludedNonresidentInterest=excludedNonresidentInterest.plus(gross);
   }
  }
  if(!totalOID.eq(ordinary.plus(treasuryOID))||!totalCoupon.eq(coupon))return fail('actual accrual ledger must exactly reconcile original recipient OID and coupon separately');
  if(!Array.isArray(form.stateWithholding))return fail('actual original state rows including known none required');const states=new Set<string>();
  for(const state of form.stateWithholding){if(states.has(state.state))return fail('duplicate original OID state row');states.add(state.state);withheld(state.state,state.stateWithheld);}
  confirmWithholding(row,form.stateWithholding.some(state=>state.state==='PA'&&amount(state.stateWithheld).gt(0)));
 }
 for(const row of source.miscWithholding){
  const form=input.form1099Misc[row.originalIndex as number];if(!Form1099MiscSchema.strict().safeParse(form).success||row.allIncomeBoxesKnownZeroConfirmed!==true||form.sourceFormRevision!==(y===2025?'2025-04':'2026-12'))return fail('actual complete zero-income MISC source revision required');
  for(const key of ['rents','royalties','otherIncome','federalWithheld','fishingBoatProceeds','medicalPayments','substitutePayments','cropInsurance','grossAttorneyProceeds','fishPurchasedForResale','section409ADeferrals','excessGoldenParachute','nonqualifiedDeferredComp','stateIncome'] as const)if(!amount(form[key]).isZero())return fail('positive or unknown MISC income needs its actual PA class source method');
  if(form.directSales!==false||form.fatcaFilingRequirement!==false||(form.cashTips!==undefined&&!amount(form.cashTips).isZero())||(form.qualifiedOvertimeCompensation!==undefined&&!amount(form.qualifiedOvertimeCompensation).isZero())||form.treasuryTippedOccupationCodes?.length)return fail('nonordinary MISC indicator needs its actual source method');
  if(typeof form.state!=='string'||typeof form.payerStateId!=='string')return fail('actual MISC state and original payer identifier status are required');withheld(form.state,form.stateWithheld);confirmWithholding(row,form.state==='PA'&&amount(form.stateWithheld).gt(0));
 }
 const commitment=bytesToHex(sha256(new TextEncoder().encode(stable({version:'pa-ordinary-oid-sources-v1',year:y,owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},oid:input.form1099OID,misc:input.form1099Misc,residentPeriods,rawSources}))));
 const publicTotals={taxableInterest:publicMoney(taxableInterest),excludedNonresidentInterest:publicMoney(excludedNonresidentInterest),worldwideExemptInterest:publicMoney(worldwideExemptInterest),paWithholding:publicMoney(paWithholding)};
 const audit=new AuditTrail();for(const [line,value] of Object.entries(publicTotals))audit.record('PA-Ordinary-OID-Sources',line,'Source-bound personal investment total',value,'Exact actual original and dated source replay; no source identifiers in audit text',{sourceCommitment:commitment});
 return {...publicTotals,stateWithholding:stateWithholding.map(row=>({state:row.state,amount:publicMoney(row.amount)})),sourceCommitment:commitment,lines:audit.getLines()};
}
