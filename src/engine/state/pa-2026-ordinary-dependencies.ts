import {PA2026EicChildInventorySchema,type PA2026EicChildInventory} from '@/models/pa-2026-eic-child-inventory.js';
import {snapshotPAOrdinaryReturnOriginals} from './pa-ordinary-return-facts.js';
/** Limited state-only dependency proof. Spec: state/pa-2026-ordinary-draft.yaml. */
import Decimal from 'decimal.js';
import {roundDollar} from '@/utils/decimal.js';
import {StandardDeductionFactsSchema,type TaxYearInput} from '@/models/inputs.js';
import {FEDERAL_2026_INDEXED} from '@/models/federal-2026-indexed.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import type {PAOrdinaryReturnCompletionSources} from '@/models/pa-ordinary-return-completion.js';
import type {PAOrdinaryReturnProjection} from './pa-ordinary-return-facts.js';
import type {PAResidencySourcesResult} from './pa-residency-sources.js';
import {ordinarySourcePrecision,publicOrdinaryMoney} from './pa-ordinary-source-precision.js';
export interface PA2026OrdinaryDependencyProof {
 methodVersion:'pa-2026-ordinary-dependencies-v1';ordinaryWages:Decimal;
 maximumCompletedEitcPhaseout:Decimal;federalEarnedIncomeCredit:Decimal;careCredit:Decimal;
 confirmedChildlessCompletedEitcPhaseout?:Decimal;reportedWageAgi?:Decimal;
}
const fail=(detail:string):never=>{throw new Error('PA2026 ordinary draft dependency sources: '+detail);};
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
/** Documentary review inputs; neither PA/SP child count nor empty normalized dependents establish these facts. */
export function snapshotPA2026EicChildReview(data:PA2026EicChildInventory):Record<string,unknown>{return structuredClone({sourceTaxYear:data.sourceTaxYear,sourceReference:data.sourceReference,allPotentialQualifyingChildrenReviewedConfirmed:data.allPotentialQualifyingChildrenReviewedConfirmed,noQualifyingEitcChildrenConfirmed:data.noQualifyingEitcChildrenConfirmed,candidateChildren:data.candidateChildren});}
/** Pure currentness validation shared by native capture replay and the actual state-only dependency. */
export function validatePA2026EicChildInventory(input:TaxYearInput,raw:unknown,requireConfirmation=true):PA2026EicChildInventory{
 const data=PA2026EicChildInventorySchema.parse(raw),t=input.taxpayer.primary;
 if(input.taxpayer.taxYear!==2026||data.sourceTaxYear!==2026||input.taxpayer.filingStatus!=='single'||input.taxpayer.spouse)fail('no-child sources require the actual2026 single owner');
 if(!data.sourceReference.trim()||data.allPotentialQualifyingChildrenReviewedConfirmed!==true||data.noQualifyingEitcChildrenConfirmed!==true||data.candidateChildren.length)fail('complete actual no-EIC-child inventory is required; unknown is not none');
 if(!Array.isArray(input.taxpayer.dependents)||input.taxpayer.dependents.length)fail('retained actual dependents require their separate source method');
 if(!t.firstName.trim()||!t.lastName.trim()||!/^\d{3}-?\d{2}-?\d{4}$/.test(t.ssn)||stable(data.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))fail('actual no-child source owner changed or is unknown');
 if(stable(data.originalFederalSources)!==stable(snapshotPAOrdinaryReturnOriginals(input)))fail('actual no-child original snapshot is stale; explicitly recapture');
 if(stable(data.originalPAResidencySources)!==stable(input.paResidencySources))fail('actual no-child PA original snapshot is stale; explicitly recapture');
 if(stable(data.capturedReview)!==stable(snapshotPA2026EicChildReview(data)))fail('actual no-child review changed after capture; explicitly recapture');
 if(requireConfirmation&&data.sourceFactsConfirmed!==true)fail('confirm the actual no-child inventory after capture');
 return data;
}
/** Call only after the existing complete ordinary/residency source replay. No federal result is manufactured. */
export function calculatePA2026OrdinaryDependencies(input:TaxYearInput,p:PAOrdinaryReturnProjection,sources:PAOrdinaryReturnCompletionSources,income:PAResidencySourcesResult):PA2026OrdinaryDependencyProof {
 if(input.taxpayer.taxYear!==2026||p.taxYear!==2026)fail('the separately typed draft requires actual2026 sources');
 if(input.taxpayer.filingStatus!=='single'||p.facts.filing.maritalStatus!=='unmarried'||p.facts.filing.aliveEntireYear!==true)fail('only actual single living unmarried owners are supported');
 // Empty document arrays are normalization only. They never establish the complete
 // none facts: those are independently replayed from the confirmed source packets.
 const roots=new Set(['taxpayer','w2s','paResidencySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources','standardDeductionFacts','deductionElection']);
 const emptyDocumentRoots=new Set(['form1099Int','form1099Div','form1099B','form1099DA','form1099Nec','form1099Misc','form1099G','form1099OID','formW2G','form1099K','form1099C','form1099Q','form1099R','form1099SA','formSSA1099','formRRB1099','paScheduleGLStatements','paScheduleJStatements','paPassThroughStatements','scheduleK1','scheduleK1Form1041','form1098','form1098E','form1095A','donations','rentalProperties','savingsBondRedemptions','form6252','form8814','homeSales','form8824']);
 for(const[key,value]of Object.entries(input))if(!roots.has(key)&&value!==undefined&&!(emptyDocumentRoots.has(key)&&Array.isArray(value)&&value.length===0))fail('retained unsupported original or federal dependency: '+key);
 if(input.standardDeductionFacts!==undefined&&!StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts).success)fail('retained standard-deduction context is unsupported');
 if(input.deductionElection!==undefined&&!['automatic','standard','itemized','nonitemized'].includes(input.deductionElection))fail('retained deduction election is unknown');
 const r=PAResidencySourcesSchema.parse(input.paResidencySources);
 const allowed=new Set(['sourceTaxYear','sourceReference','sourceFactsConfirmed','owner','residency','wages','interest','otherPAIncomeClassesConfirmedNone','otherPAAdjustmentsConfirmedNone']);
 for(const[key,value]of Object.entries(r))if(!allowed.has(key)&&value!==undefined&&!(Array.isArray(value)&&value.length===0))fail('specialized residency originals require their actual successor: '+key);
 if(!input.w2s.length||r.interest.length||r.otherPAIncomeClassesConfirmedNone!==true||r.otherPAAdjustmentsConfirmedNone!==true)fail('complete wage-only original coverage is required');
 const Money=Decimal.clone({precision:ordinarySourcePrecision(input,p,sources),rounding:Decimal.ROUND_HALF_UP});
 const amount=(raw:unknown):Decimal=>{if(typeof raw!=='string'||!/^\d+(\.\d+)?$/.test(raw))return fail('actual wage/benefit amount is unknown');const n=new Money(raw);return n.isFinite()?n:fail('actual wage amount is nonfinite');};
 let wages=new Money(0);
 for(const w of input.w2s){wages=wages.plus(amount(w.wages));if(!amount(w.box10DependentCareBenefits).isZero())fail('actual employer benefits require their source method');}
 const care=sources.care;
 if(care.status!=='no_qualifying_expenses'||care.allCarePaymentSourcesReviewedConfirmed!==true||care.allEmployerBenefitsIncludedConfirmed!==true||care.originalCarePayments.length||care.careSources!==undefined)fail('complete actual no-care/no-benefit originals are required');
 if(Object.values(p.facts.sp.categories).some(row=>row.status!=='known_none'||row.entries.length))fail('other worldwide SP income requires its actual successor');
 if(sources.otherStateTaxes.status!=='none_paid'||p.facts.payments.rows.length||p.facts.payments.priorCredit.status!=='none'||!p.useTax.isZero())fail('only actual withholding-covered ordinary sources are supported');
 if(p.timing.date>'2027-04-15'||p.timing.filingExtension!=='none'||p.timing.paymentExtension!=='none')fail('late or extended timing requires its actual successor');
 if(roundDollar(p.paWithholding).lt(income.taxBeforeCredits))fail('reported PA withholding must cover fresh PA tax without an unsourced interest dependency');
 const child=sources.eitcChildInventory===undefined?undefined:validatePA2026EicChildInventory(input,sources.eitcChildInventory);
 const eitc=FEDERAL_2026_INDEXED.eitc;
 const maximum=Money.max(...Object.values(eitc.completedPhaseOutSingleHoH),...Object.values(eitc.completedPhaseOutMFJ));
 const reportedWageAgi=roundDollar(wages),childlessCutoff=new Money(eitc.completedPhaseOutSingleHoH[0]);
 if(child){if(wages.lt(childlessCutoff)||reportedWageAgi.lt(childlessCutoff))fail('actual no-child wage income is below the finite completed EIC phaseout source boundary');}
 else if(!wages.gt(maximum))fail('actual wage income does not prove completed EIC phaseout for every child count and filing table');
 return {methodVersion:'pa-2026-ordinary-dependencies-v1',ordinaryWages:publicOrdinaryMoney(wages),maximumCompletedEitcPhaseout:publicOrdinaryMoney(maximum),federalEarnedIncomeCredit:new Decimal(0),careCredit:new Decimal(0),...(child?{confirmedChildlessCompletedEitcPhaseout:publicOrdinaryMoney(childlessCutoff),reportedWageAgi:publicOrdinaryMoney(reportedWageAgi)}:{})};
}
