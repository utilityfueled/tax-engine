/** Web-only historical source validation before exact strict canonical B projection. */
import {z} from 'zod';
import Decimal from 'decimal.js';
import {TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {PARoyaltyTaxRefundSourcesSchema,type PARoyaltyTaxRefundSources} from '@/models/pa-royalty-tax-refund-sources';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts';
import {calculatePARoyaltyTaxRefundSources} from '@/engine/state/pa-royalty-tax-refund-sources';
import {calculatePAOrdinaryRoyaltySources} from '@/engine/state/pa-ordinary-royalty-sources';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {ordinarySourcePrecision} from '@/engine/state/pa-ordinary-source-precision';
import {calculateFederalTax} from '@/engine/federal';
import {buildGuidedRoyaltySources,type RoyaltyIncomeData} from './guided-royalty-sources';
import {startInterview} from './guided-interview-flow';
const answer=z.boolean().nullable(),original=z.record(z.string(),z.unknown()),owner=PARoyaltyTaxRefundSourcesSchema.shape.owner;
const use=PARoyaltyTaxRefundSourcesSchema.shape.statements.element.shape.copyrightUse;
const account=PARoyaltyTaxRefundSourcesSchema.shape.account;
const history=z.object({sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,owner,
 originalFederalSources:original,returnId:z.string(),filedOn:z.string(),filedFederalAGI:z.string(),filedFederalRoyaltyNet:z.string(),filedMichiganSourceIncome:z.string(),
 originalGuidedPropertySources:z.custom<RoyaltyIncomeData>(value=>value!==null&&typeof value==='object'&&!Array.isArray(value)),originalCopyrightUse:use,allFiledOriginalIncomeAndExpenseSourcesReviewedConfirmed:answer}).strict();
const correction=z.object({sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,owner,reviewedOn:z.string(),returnId:z.string(),
 originalFiledFederalAGI:z.string(),currentFederalAGI:z.string(),actualAdditionalExpense:z.string(),originalLegalReceipt:original,correctedLegalReceipt:original,originalCopyrightUse:use,currentCopyrightUse:use,
 allOriginalAndCorrectedIncomeExpensesAndUsesReviewedConfirmed:answer,michiganTaxableIncomeEffect:z.string(),michiganTaxEffect:z.string(),
 amendmentReview:z.object({sourceReference:z.string(),reviewedOn:z.string(),allFederalAndMichiganAdjustmentsReviewedConfirmed:answer,determination:z.string(),noMichiganAmendmentRequiredConfirmed:answer}).strict(),completeAccountAfterReview:account}).strict();
export const GuidedPARoyaltyTaxRefundSourcesSchema=PARoyaltyTaxRefundSourcesSchema.extend({filedFederalHistory:history.optional(),historicalExpenseCorrection:correction.optional()}).strict();
export type GuidedPARoyaltyTaxRefundSources=z.infer<typeof GuidedPARoyaltyTaxRefundSourcesSchema>;
function fail(message:string):never{throw new Error('PA MI royalty history: '+message);}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
function reference(value:string):void{if(!value.trim())fail('actual complete documentary source reference required');}
function day(value:string):void{const ms=Date.parse(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)fail('actual calendar date required');}
/** Project only the two explicitly validated web history fields; no broad stripping. */
function canonical(source:GuidedPARoyaltyTaxRefundSources):PARoyaltyTaxRefundSources{const {filedFederalHistory:_history,historicalExpenseCorrection:_correction,...packet}=source;return PARoyaltyTaxRefundSourcesSchema.parse(packet);}
function validateHistory(input:TaxYearInput,rawFacts:unknown,source:GuidedPARoyaltyTaxRefundSources):void{
 const h=source.filedFederalHistory,c=source.historicalExpenseCorrection;
 if(!h)fail('actual filed federal history is required; imported legacy web records remain unknown until independently reconciled');
 const t=input.taxpayer.primary,actualOwner={firstName:t.firstName,lastName:t.lastName,ssn:t.ssn};
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,rawFacts,source),rounding:Decimal.ROUND_HALF_UP});
 const money=(value:unknown):Decimal=>{if(typeof value!=='string'||!/^\d+(\.\d{1,2})?$/.test(value))return fail('actual nonnegative original amount required');const n=new Money(value);if(!n.isFinite())return fail('actual finite amount required');return n;};
 const same=(a:unknown,b:unknown,message:string):void=>{if(stable(a)!==stable(b))fail(message);};
 const facts=PAOrdinaryReturnFactsSchema.parse(rawFacts);reference(h.sourceReference);day(h.filedOn);
 if(input.taxpayer.taxYear!==2025||h.sourceTaxYear!==2025||h.sourceFactsConfirmed!==true||h.allFiledOriginalIncomeAndExpenseSourcesReviewedConfirmed!==true||h.returnId!==source.filedReturn.returnId||h.filedOn!==source.filedReturn.filedOn)fail('complete actual historical filed return binding required');same(h.owner,actualOwner,'historical owner changed');
 const old=TaxYearInputSchema.parse(h.originalFederalSources);same(snapshotPAOrdinaryReturnOriginals(old),h.originalFederalSources,'historical complete canonical original shape differs');
 const {royaltyPropertySources:oldProperties,...oldOther}=snapshotPAOrdinaryReturnOriginals(old),{royaltyPropertySources:currentProperties,...currentOther}=snapshotPAOrdinaryReturnOriginals(input);
 same(oldOther,currentOther,'historical non-expense federal original changed; actual successor required');
 if(!old.royaltyPropertySources||!input.royaltyPropertySources||!input.paResidencySources?.royaltySources||source.statements.length!==1||old.royaltyPropertySources.properties?.length!==1||input.royaltyPropertySources.properties?.length!==1)fail('finite single copyright history requires exact complete property originals');
 const selected=source.statements[0];if(!selected)fail('actual copyright use original required');same(h.originalCopyrightUse,selected.copyrightUse,'historical copyright utilization changed');
 const historyFlow=startInterview({filingStatus:'single',incomeTypes:['royalties'],lifeEvents:[],stateCode:'PA'},2025);historyFlow.sectionData['income-royalties']=h.originalGuidedPropertySources;
 const mapped=buildGuidedRoyaltySources(historyFlow);same(mapped.royaltyPropertySources,oldProperties,'historical guided property originals differ from filed canonical originals');same(mapped.form1099Misc,old.form1099Misc,'historical guided MISC originals differ from filed originals');
 // Internal validation projection binds the same retained historical originals; no saved
 // confirmation or history is replaced. Current MISC/owner originals were proven identical above.
 calculatePAOrdinaryRoyaltySources(old,{...input.paResidencySources.royaltySources,originalPropertySources:old.royaltyPropertySources},{status:'resident'});
 const expectedIncome=(originalInput:TaxYearInput):Decimal=>{
  const properties=originalInput.royaltyPropertySources?.properties;if(!properties||properties.length!==1) return fail('complete finite copyright originals required');
  let total=new Money(0);for(const w of originalInput.w2s)total=total.plus(money(w.wages));for(const m of originalInput.form1099Misc)total=total.plus(money(m.royalties));
  const expenses=properties[0]?.expenses;if(!expenses)fail('complete actual paid expense originals required');for(const expense of expenses)total=total.minus(money(expense.amountPaid));
  const federal=calculateFederalTax(originalInput);
  // Do not silently trust a lossy legacy consumer, other income, or adjustments. This
  // finite source proof independently conserves every W2/copyright cent before rounding.
  if(!new Money(federal.totalIncome.toFixed()).eq(total)||!new Money(federal.agi.toFixed()).eq(total))fail('actual federal total/AGI differs from exact finite W2 and copyright originals; source successor required');return total;
 };
 const oldAGI=expectedIncome(old),currentAGI=expectedIncome(input),printed=(n:Decimal)=>n.toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
 let oldRoyalty=new Money(0);for(const m of old.form1099Misc)oldRoyalty=oldRoyalty.plus(money(m.royalties));for(const expense of old.royaltyPropertySources.properties?.[0]?.expenses??[])oldRoyalty=oldRoyalty.minus(money(expense.amountPaid));
 if(!money(h.filedFederalAGI).eq(printed(oldAGI))||!money(h.filedFederalRoyaltyNet).eq(printed(oldRoyalty))||!money(h.filedMichiganSourceIncome).isZero())fail('actual filed federal AGI/royalty and zero-MI history do not reconcile');
 if(stable(oldProperties)===stable(currentProperties)){if(c)fail('retained expense correction contradicts unchanged current originals');return;}
 if(!c)fail('actual changed expense needs explicit historical correction reconciliation');reference(c.sourceReference);day(c.reviewedOn);same(c.owner,actualOwner,'actual correction owner changed');
 if(c.sourceTaxYear!==2025||c.sourceFactsConfirmed!==true||c.allOriginalAndCorrectedIncomeExpensesAndUsesReviewedConfirmed!==true||c.returnId!==h.returnId||c.reviewedOn<h.filedOn||c.reviewedOn>facts.timing.asOfDate)fail('complete current actual correction identity/year/date/review required');
 same(c.originalCopyrightUse,h.originalCopyrightUse,'original copyright use changed');same(c.currentCopyrightUse,selected.copyrightUse,'current economic use changed');same(c.originalCopyrightUse,c.currentCopyrightUse,'copyright use changed; actual MI successor required');
 if(!money(c.originalFiledFederalAGI).eq(printed(oldAGI))||!money(c.currentFederalAGI).eq(printed(currentAGI))||!money(c.michiganTaxableIncomeEffect).isZero()||!money(c.michiganTaxEffect).isZero())fail('actual original/current AGI and zero MI effects do not reconcile');
 const oldProperty=old.royaltyPropertySources.properties?.[0],currentProperty=input.royaltyPropertySources.properties?.[0];if(!oldProperty||!currentProperty)fail('actual original/current property required');
 const oldExpenses=oldProperty.expenses,currentExpenses=currentProperty.expenses,oldPA=oldProperty.paTreatment,currentPA=currentProperty.paTreatment;
 if(!oldExpenses||!currentExpenses||!oldPA?.expenses||!currentPA?.expenses||oldExpenses.length!==currentExpenses.length||oldPA.expenses.length!==currentPA.expenses.length)fail('complete same current and historical expense/PA copies required');
 const {expenses:_oldExpenses,paTreatment:_oldPA,...oldRest}=oldProperty,{expenses:_newExpenses,paTreatment:_newPA,...currentRest}=currentProperty;same(oldRest,currentRest,'non-expense property original changed');
 const {expenses:_opa,...oldPARest}=oldPA,{expenses:_npa,...currentPARest}=currentPA;same(oldPARest,currentPARest,'historical PA source classification changed');
 let changed=0,delta=new Money(0);
 for(let index=0;index<oldExpenses.length;index++){
  const before=oldExpenses[index],after=currentExpenses[index],beforePA=oldPA.expenses[index],afterPA=currentPA.expenses[index];if(!before||!after||!beforePA||!afterPA)fail('actual original/current receipt missing');
  if(stable(before)===stable(after)){same(beforePA,afterPA,'PA expense copy differs without actual receipt correction');continue;}
  changed++;if(before.category!=='legal-professional'||after.category!=='legal-professional')fail('finite correction requires actual current-year legal receipt');
  const {amountPaid:_before,...beforeMetadata}=before,{amountPaid:_after,...afterMetadata}=after;same(beforeMetadata,afterMetadata,'actual expense source/date/classification changed');
  same(c.originalLegalReceipt,before,'actual old legal receipt differs');same(c.correctedLegalReceipt,after,'actual current legal receipt differs');
  const {amountPaid:_bpa,...beforePAMetadata}=beforePA,{amountPaid:_apa,...afterPAMetadata}=afterPA;same(beforePAMetadata,afterPAMetadata,'PA expense source classification changed');
  if(!money(beforePA.amountPaid).eq(money(before.amountPaid))||!money(afterPA.amountPaid).eq(money(after.amountPaid)))fail('actual PA expense copies differ');
  delta=delta.plus(money(after.amountPaid).minus(money(before.amountPaid)));
 }
 if(changed!==1||!delta.gt(0)||!money(c.actualAdditionalExpense).eq(delta)||!oldAGI.minus(currentAGI).eq(delta))fail('one actual paid legal expense increase must conserve original/current federal cents');
 const review=c.amendmentReview;reference(review.sourceReference);day(review.reviewedOn);
 if(review.reviewedOn!==c.reviewedOn||review.allFederalAndMichiganAdjustmentsReviewedConfirmed!==true||review.determination!=='no_michigan_taxable_income_change'||review.noMichiganAmendmentRequiredConfirmed!==true)fail('actual fully reviewed zero-MI-effect amendment determination required');
 same(c.completeAccountAfterReview,source.account,'complete current actual account after correction differs');if(source.account.completeThroughDate<c.reviewedOn)fail('actual account predates correction review');
}
/** Replay only: preserve every private documentary record in saved web state. */
export function buildGuidedPARoyaltyTaxRefundSources(input:TaxYearInput,facts:unknown,raw:unknown):PARoyaltyTaxRefundSources{
 const source=GuidedPARoyaltyTaxRefundSourcesSchema.parse(raw);validateHistory(input,facts,source);const packet=canonical(source);calculatePARoyaltyTaxRefundSources(input,facts,packet);return packet;
}
/** Explicit action binds current snapshot fields only; never rewrites filed/agency records. */
export function confirmGuidedPARoyaltyTaxRefundSources(input:TaxYearInput,facts:unknown,raw:unknown):GuidedPARoyaltyTaxRefundSources{
 const source=GuidedPARoyaltyTaxRefundSourcesSchema.parse(raw),actualFacts=PAOrdinaryReturnFactsSchema.parse(facts),t=input.taxpayer.primary;
 const candidate={...source,sourceFactsConfirmed:true,owner:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn},originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),originalPAResidencySources:structuredClone(input.paResidencySources),originalPAFacts:structuredClone(actualFacts),statements:source.statements.map(row=>({...row,originalStatement:row.originalIndex===null?undefined:structuredClone(input.form1099Misc[row.originalIndex])}))};
 buildGuidedPARoyaltyTaxRefundSources(input,facts,candidate);return GuidedPARoyaltyTaxRefundSourcesSchema.parse(candidate);
}
