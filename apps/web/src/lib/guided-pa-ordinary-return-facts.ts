import type {TaxYearInput} from '@/models/inputs';
import {PAOrdinaryReturnFactsSchema,type PAOrdinaryReturnFacts} from '@/models/pa-ordinary-return-facts';
import {calculatePAOrdinaryReturnFacts,snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
/** Empty private draft: no source amount, year, date or answer is inferred. */
export function emptyGuidedPAOrdinaryReturnFacts():PAOrdinaryReturnFacts{
 const category=()=>({status:'' as const,sourceReference:'',entries:[]});
 const categories={'2':category(),'3':category(),'4':category(),'5':category(),'7':category(),'8':category(),'9':category(),'10':category()};
 return {sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,owner:{accountHolder:''},filing:{choice:'',maritalStatus:'',aliveEntireYear:null,finalReturnReason:'',noPATaxableIncomeNextYearConfirmed:null,claimedAsDependentOnAnotherReturn:null,dependentChildren:[],sourceReference:'',factsConfirmed:null},payments:{allPaymentsIncludedConfirmed:null,rows:[],priorReturn:{status:'',sourceReference:''},priorCredit:{status:'',sourceReference:''}},timing:{kind:'',date:'',asOfDate:'',filingExtension:'',paymentExtension:'',returnKind:'',remainingTaxPayment:{status:'',sourceReference:''}},useTax:{status:'',sourceReference:''},sp:{categories,allWorldwideSourcesCompleteConfirmed:null},disposition:{kind:'',sourceReference:'',refundRequested:'',nextYearCreditRequested:'',donations:[]}};
}
export function updateGuidedPAOrdinaryReturnFacts(data:PAOrdinaryReturnFacts,patch:Partial<PAOrdinaryReturnFacts>):PAOrdinaryReturnFacts{return {...data,...patch,sourceFactsConfirmed:null};}
/** Only this explicit confirmation action replaces privately retained originals. */
export function confirmGuidedPAOrdinaryReturnFacts(input:TaxYearInput,draft:unknown):PAOrdinaryReturnFacts{
 const data=PAOrdinaryReturnFactsSchema.parse(draft);const t=data.owner.accountHolder==='primary'?input.taxpayer.primary:data.owner.accountHolder==='spouse'?input.taxpayer.spouse:undefined;if(!t)throw new Error('Select actual return owner before confirming PA records');
 const candidate:PAOrdinaryReturnFacts={...data,sourceFactsConfirmed:true,owner:{accountHolder:data.owner.accountHolder,originalTaxpayer:{firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}},originalFederalSources:snapshotPAOrdinaryReturnOriginals(input),filing:{...data.filing,dependentChildren:data.filing.dependentChildren.map(child=>({...child,originalFederalDependent:child.originalIndex===null?undefined:structuredClone(input.taxpayer.dependents[child.originalIndex])}))}};
 calculatePAOrdinaryReturnFacts(input,candidate);return candidate;
}
/** Fresh replay on reads validates source identity; it never refreshes stale originals. */
export function buildGuidedPAOrdinaryReturnFacts(input:TaxYearInput,draft:unknown):PAOrdinaryReturnFacts{const data=PAOrdinaryReturnFactsSchema.parse(draft);calculatePAOrdinaryReturnFacts(input,data);return data;}
