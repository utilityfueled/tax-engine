/** Visible-original parity with the existing finite WorksheetE method; no tax math. */
import type {z} from 'zod';
import {Form8962MarriedThirdFamilySchema} from '@/models/form-8962-shared-policy';
import type {PremiumTaxCreditData} from './guided-premium-tax-credit-facts';
import type {FilingStatus,PersonalInfoData} from './guided-interview-flow';
import type {SharedPolicyAllocationData} from './guided-shared-policy';
import {guidedSourceValuesChanged} from './guided-source-confirmation';
import {parseGuidedCurrency} from './guided-currency';
type Canonical=z.infer<typeof Form8962MarriedThirdFamilySchema>;
type Editable<T>=T extends boolean?boolean|null:T extends number?string:T extends (infer E)[]?Editable<E>[]:T extends object?{[K in keyof T]:Editable<T[K]>}:T;
export type MarriedThirdFamilyOriginals=Editable<Canonical>;
interface ContextSnapshot { taxYear:number|null|undefined;filingStatus:FilingStatus|null|undefined;household:unknown;policies:unknown;shared:unknown;facts:unknown;originals:unknown }
export type MarriedThirdFamilyData=MarriedThirdFamilyOriginals&{confirmedContext?:ContextSnapshot};
function context(data:PremiumTaxCreditData,taxYear:number|null|undefined,filingStatus:FilingStatus|null|undefined,personal:PersonalInfoData|undefined):ContextSnapshot{
 const packet=data.sharedPolicyAllocations,draft=packet?.marriedThirdFamily;
 const shared=packet===undefined?undefined:Object.fromEntries(Object.entries(packet).filter(([key])=>key!=='marriedThirdFamily'));
 const originals=draft===undefined?undefined:Object.fromEntries(Object.entries(draft).filter(([key])=>key!=='confirmedContext'));
 return structuredClone({taxYear,filingStatus,household:personal===undefined?undefined:{firstName:personal.firstName,middleName:personal.middleName,lastName:personal.lastName,ssn:personal.ssn,spouse:personal.spouse,dependentCount:personal.dependentCount,dependents:personal.dependents,standardDeductionFacts:personal.standardDeductionFacts},policies:data.policies,shared,originals,
 facts:{sourceTaxYear:data.sourceTaxYear,taxFamilySize:data.taxFamilySize,canBeClaimedAsDependent:data.canBeClaimedAsDependent,marriedFilingSeparatelyExceptionConfirmed:data.marriedFilingSeparatelyExceptionConfirmed,alternativeMarriageCalculationElected:data.alternativeMarriageCalculationElected,selfEmployedHealthInsuranceCoordinationRequired:data.selfEmployedHealthInsuranceCoordinationRequired,qsehraAffected:data.qsehraAffected,lawfulPresenceReconciliationRequired:data.lawfulPresenceReconciliationRequired}});
}
/** Confirmation snapshots and derived reconciliation rows are metadata, not new originals. */
export function marriedThirdFamilyOriginalsChanged(previous:PremiumTaxCreditData|undefined,next:PremiumTaxCreditData):boolean{
 return previous===undefined||guidedSourceValuesChanged(context(previous,undefined,undefined,undefined),context(next,undefined,undefined,undefined));
}
export function confirmMarriedThirdFamilySources(data:PremiumTaxCreditData,taxYear:number|null|undefined,filingStatus:FilingStatus|null|undefined,personal:PersonalInfoData|undefined):MarriedThirdFamilyData{
 const draft=data.sharedPolicyAllocations?.marriedThirdFamily;
 if(!draft||!personal||!personal.spouse||filingStatus!=='mfs'||(taxYear!==2025&&taxYear!==2026))throw Error('Complete the actual separate-return household, year and Worksheet E originals before confirming.');
 return {...structuredClone(draft),sourceFactsConfirmed:true,confirmedContext:context(data,taxYear,filingStatus,personal)};
}
function knownBool(value:boolean|null|undefined){return typeof value==='boolean'?value:undefined;}
function integer(value:string|undefined,label:string,pattern:RegExp):number|undefined{if(value===undefined)return undefined;if(!pattern.test(value))throw Error(`Enter the actual ${label}.`);return Number(value);}
function amount(value:string|undefined):string|undefined{if(value===undefined)return undefined;if(!value.trim())throw Error('Enter each original Worksheet E amount, including zero when known.');const parsed=parseGuidedCurrency(value);if(parsed.lt(0))throw Error('Original Worksheet E amounts cannot be negative.');return parsed.toFixed();}
function ssn(value:string|undefined){if(value!==undefined&&!/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value))throw Error('Enter the complete original Worksheet E SSN.');return value;}
/** Only untouched placeholders are omitted; any actually entered competing fact rejects. */
export function assertMarriedThirdFamilyMethod(packet:SharedPolicyAllocationData){
 if(packet.noAdvanceCoverageFamilies!==undefined||packet.overlappingCoverage!==undefined||packet.spouseName!==undefined||packet.spouseSsn!==undefined)throw Error('Worksheet E needs its separate three-family source method without another allocation.');
 for(const policy of packet.policies){
  if(policy.noAdvanceAllocation!==undefined||policy.defaultAllocation!==undefined||policy.coveredFamilyAssignments.some(row=>row.family!=='')||policy.monthlyAllocations.some(row=>row.fraction.trim()!=='')||policy.separateReturn?.ownCoverageFamilySlcsp.some(row=>row.slcsp.trim()!=='')||policy.agreementReference.trim()!==''||policy.agreementConfirmed!=null||policy.noCurrentYearMarriageOrDivorceConfirmed!=null||policy.originalSlcspCorrectConfirmed!=null||policy.separateReturn?.benchmarkAboveReportedReference!==undefined)throw Error('Reconcile the entered competing two-family agreement or benchmark sources before using Worksheet E.');
 }
}
export function convertMarriedThirdFamilySources(data:PremiumTaxCreditData,taxYear:number|null|undefined,filingStatus:FilingStatus|null|undefined,personal:PersonalInfoData|undefined):Canonical|undefined{
 const draft=data.sharedPolicyAllocations?.marriedThirdFamily;if(draft===undefined)return undefined;
 if(!draft.confirmedContext||guidedSourceValuesChanged(draft.confirmedContext,context(data,taxYear,filingStatus,personal)))throw Error('Confirm complete Worksheet E originals after the last source or household edit.');
 const{confirmedContext,...originals}=structuredClone(draft);void confirmedContext;
 ssn(personal?.ssn);ssn(personal?.spouse?.ssn);ssn(data.sharedPolicyAllocations?.primarySsn);for(const policy of data.sharedPolicyAllocations?.policies??[])ssn(policy.otherTaxpayerSsn);for(const policy of data.policies){ssn(policy.recipientSsn);for(const person of policy.coveredIndividuals??[])ssn(person.ssn);}
 const result={...originals,sourceTaxYear:integer(originals.sourceTaxYear,'Worksheet E four-digit source year',/^\d{4}$/),sourceFactsConfirmed:knownBool(originals.sourceFactsConfirmed),noOtherAllocationsRequiredConfirmed:knownBool(originals.noOtherAllocationsRequiredConfirmed),allAgreementsAndCoverageMonthsIncludedConfirmed:knownBool(originals.allAgreementsAndCoverageMonthsIncludedConfirmed),
  families:originals.families?.map(family=>({...family,sourceTaxYear:integer(family.sourceTaxYear,'family four-digit source year',/^\d{4}$/),taxpayerSsn:ssn(family.taxpayerSsn),allTaxFamilyMembersIncludedConfirmed:knownBool(family.allTaxFamilyMembersIncludedConfirmed),dependents:family.dependents?.map(person=>({...person,ssn:ssn(person.ssn)}))})),
  coverageFamilyAssignments:originals.coverageFamilyAssignments?.map(row=>({...row,ssn:ssn(row.ssn)})),monthlySources:originals.monthlySources?.map(row=>({...row,month:integer(row.month,'actual month1 through12',/^(?:[1-9]|1[0-2])$/),primaryBenchmark:amount(row.primaryBenchmark),spouseBenchmark:amount(row.spouseBenchmark),primaryAgreementConfirmed:knownBool(row.primaryAgreementConfirmed),spouseAgreementConfirmed:knownBool(row.spouseAgreementConfirmed)}))};
 return Form8962MarriedThirdFamilySchema.parse(result);
}
