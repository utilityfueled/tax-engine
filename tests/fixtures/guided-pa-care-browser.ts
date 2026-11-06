/** Fictional original source records only; no calculation result/cash/source approval injected. */
import {guidedPAOrdinaryPanelFixture,required} from './guided-pa-ordinary-panels';
import {paOrdinaryCareFixture} from './pa-ordinary-care-sources';
import {completeDependent} from '../guided-interview/complete-facts';
import {TaxYearInputSchema} from '@/models/inputs';
import {emptyCreditsData,buildSectionRoute} from '@/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {snapshotPAOrdinaryReturnCompletionOriginals} from '@/lib/guided-pa-ordinary-return-completion';
export function guidedPACareBrowserFixture(){
 const panel=guidedPAOrdinaryPanelFixture(),actual=paOrdinaryCareFixture(),state=panel.state,care=required(actual.input.dependentCare);
 const personal=required(state.sectionData['personal-info']),child=required(actual.input.taxpayer.dependents[0]);
 Object.assign(personal,{dependentCount:'1',dependents:[{...completeDependent,...child,monthsLivedWithYou:'12'}]});
 const w=required(state.sectionData['income-w2']?.entries[0]);Object.assign(w,{wages:'100000',socialSecurityWages:'100000',socialSecurityWithheld:'6200',medicareWages:'100000',medicareWithheld:'1450',stateWages:'100000',stateWithheld:'3074'});
 const dependentCare={...structuredClone(care),expenses:'3000',qualifyingIndividuals:'1',providers:structuredClone(care.providers),qualifyingPersons:structuredClone(care.qualifyingPersons)};
 state.sectionData.credits={...structuredClone(emptyCreditsData),dependentCare};
 // Build only current canonical original sources. No calculate/preview/result call.
 delete state.sectionData['state-return'];const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Complete fictional federal source originals required');const input=TaxYearInputSchema.parse(raw);
 const residency=confirmGuidedPAResidencySources(input,actual.input.paResidencySources),sourceInput={...input,paResidencySources:residency},facts=confirmGuidedPAOrdinaryReturnFacts(sourceInput,actual.facts);
 const completion={...structuredClone(actual.sources),sourceFactsConfirmed:null,originalFederalSources:snapshotPAOrdinaryReturnCompletionOriginals(sourceInput),care:{status:'unknown' as const,sourceReference:'',allCarePaymentSourcesReviewedConfirmed:null,allEmployerBenefitsIncludedConfirmed:null,originalCarePayments:[]}};
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:residency,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};
 // Provider/person details are entered through actual Credits UI, never seeded.
 state.sectionData.credits.dependentCare={...dependentCare,providers:[],qualifyingPersons:[],sourceFactsConfirmed:null};
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(row=>row.id==='credits');if(index<0)throw Error('Actual Credits route required');state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.map(row=>row.id);
 return{state,actual};
}
