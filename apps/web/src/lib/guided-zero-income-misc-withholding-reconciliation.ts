/** Saved finite MISC claims identify existing originals; they never add cash. */
import Decimal from 'decimal.js';
import type {TaxYearInput,Form1099Misc} from '@/models/inputs';
import {ordinarySourcePrecision} from '@/engine/state/pa-ordinary-source-precision';
import type {GuidedFlowState,StateReturnData} from './guided-interview-flow';
import {buildGuidedZeroIncomeMiscSources} from './guided-zero-income-misc-sources';
import {buildGuidedPAResidencySources} from './guided-pa-residency-facts';
import {buildGuidedOhioResidencyFacts} from './guided-ohio-residency-facts';
import {buildGuidedOhioPaymentFacts} from './guided-ohio-payment-facts';
import {statePaymentFactErrors} from './guided-state-facts';
import {parseGuidedCurrency} from './guided-currency';
type SavedClaim=NonNullable<StateReturnData['additionalStateWithholdingEntries']>[number];
const normalized=(value:string)=>value.trim().replace(/\s+/g,' ').toUpperCase();
const digits=(value:string)=>value.replace(/\D/g,'');
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export function reconcileGuidedZeroIncomeMiscWithholding(input:TaxYearInput,state:GuidedFlowState,code:string,claims?:ReadonlyArray<SavedClaim>):{matchedOriginalIndices:number[];matchedAmount:Decimal}{
 const fail=(detail:string):never=>{throw Error('Actual zero-income MISC saved-claim reconciliation: '+detail);};
 const data=state.sectionData['state-return'],rows=claims??data?.additionalStateWithholdingEntries??[];
 if(!rows.length)return {matchedOriginalIndices:[],matchedAmount:new Decimal(0)};
 if((code!=='PA'&&code!=='OH')||state.segmentation.stateCode!==code||state.taxYear!==2025||input.taxpayer.taxYear!==2025||!data)return fail('actual matching supported return year and state required');
 if(Object.keys(statePaymentFactErrors(data,2025,code)).length)return fail('saved source identity and exact total must reconcile');
 // Replays only. A caller-provided packet or a read cannot confirm an original.
 if(code==='PA'){
  const current=buildGuidedPAResidencySources(input,data.paResidencySources);
  if(!input.paResidencySources||stable(current)!==stable(input.paResidencySources))return fail('actual current canonical PA source packet required');
 }else{
  const residency=buildGuidedOhioResidencyFacts(data.ohioResidency,input),payments=buildGuidedOhioPaymentFacts(data.ohioPayments,input);
  if(!input.ohioResidency||!input.ohioPayments||stable(residency)!==stable(input.ohioResidency)||stable(payments)!==stable(input.ohioPayments))return fail('actual current canonical Ohio residency and payment packets required');
 }
 const native=buildGuidedZeroIncomeMiscSources(state),proofs=data.zeroIncomeMiscSources;
 if(!proofs||!native.length||proofs.length!==native.length)return fail('explicit current finite MISC originals and remittance records required');
 native.forEach((original,index)=>{
  const proof=proofs[index],person=original.accountHolder==='primary'?input.taxpayer.primary:original.accountHolder==='spouse'?input.taxpayer.spouse:undefined;
  if(!person||normalized(proof.recipientFirstName)!==normalized(person.firstName)||normalized(proof.recipientLastName)!==normalized(person.lastName)||digits(proof.recipientSsn)!==digits(person.ssn))return fail('actual original recipient does not match current canonical taxpayer');
 });
 return reconcileGuidedZeroIncomeMiscOriginalClaims(input.form1099Misc,state,code,rows);
}

/** Federal source reconciliation only. Does not qualify a state return or replace canonical packet replay. */
export function reconcileGuidedZeroIncomeMiscOriginalClaims(originals:ReadonlyArray<Form1099Misc>,state:GuidedFlowState,code:string,claims?:ReadonlyArray<SavedClaim>):{matchedOriginalIndices:number[];matchedAmount:Decimal}{
 const fail=(detail:string):never=>{throw Error('Actual zero-income MISC original-claim reconciliation: '+detail);};
 const data=state.sectionData['state-return'],rows=claims??data?.additionalStateWithholdingEntries??[];
 const Money=Decimal.clone({precision:ordinarySourcePrecision(originals,state,rows),rounding:Decimal.ROUND_HALF_UP});
 if(!rows.length)return {matchedOriginalIndices:[],matchedAmount:new Decimal(0)};
 if((code!=='PA'&&code!=='OH')||state.segmentation.stateCode!==code||state.taxYear!==2025||!data)return fail('actual matching supported return year and state required');
 if(Object.keys(statePaymentFactErrors(data,2025,code)).length)return fail('saved source identity and exact total must reconcile');
 const native=buildGuidedZeroIncomeMiscSources(state),proofs=data.zeroIncomeMiscSources;
 if(!proofs||!native.length||proofs.length!==native.length)return fail('explicit current finite MISC originals and remittance records required');
 const eligible=new Set<number>();
 native.forEach((original)=>{
  const matches=originals.flatMap((candidate,i)=>stable(candidate)===stable(original)?[i]:[]);
  if(matches.length!==1||eligible.has(matches[0]))return fail('each confirmed original must match exactly one current canonical original');
  eligible.add(matches[0]);
 });
 const amount=(value:string|undefined):Decimal=>{
  if(value===undefined||!value.trim())return fail('actual original amount is unknown');
  const parsed=new Money(parseGuidedCurrency(value));if(!parsed.isFinite()||parsed.lt(0))return fail('actual nonnegative source amount required');return parsed;
 };
 const used=new Set<number>(),matchedOriginalIndices:number[]=[];let matched=new Money(0);
 for(const claim of rows){
  if(claim.documentType!=='1099-MISC'||claim.state!==code||claim.taxYear!=='2025'||!claim.payer.trim())return fail('only actual matching finite MISC saved claims may reconcile');
  const claimed=amount(claim.amount),candidates:number[]=[];
  originals.forEach((original,index)=>{
   if(normalized(original.payer)!==normalized(claim.payer)||original.state!==code)return;
   if(original.taxYear!==2025||!original.accountHolder||!original.sourceId?.trim()||!/^\d{9}$/.test(original.payerTin?.replace(/-/g,'')??'')||!original.accountReference?.trim())return fail('actual original owner year payer and account identity is unknown');
   if(amount(original.stateWithheld).eq(claimed))candidates.push(index);
  });
  if(!claimed.gt(0)||candidates.length!==1||!eligible.has(candidates[0])||used.has(candidates[0]))return fail('saved claim is unmatched ambiguous or already assigned');
  const index=candidates[0];used.add(index);matchedOriginalIndices.push(index);matched=matched.plus(claimed);
 }
 return {matchedOriginalIndices,matchedAmount:new Decimal(matched)};
}
