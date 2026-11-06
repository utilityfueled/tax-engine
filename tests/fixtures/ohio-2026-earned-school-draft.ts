/** Fictional actual original documents; independent literal outputs are in the spec tests. */
import {ohio2026SchoolFixture,rebindOhio2026School} from './ohio-2026-school.js';
import {ohio2026OrdinaryFixture} from './oh-2026-ordinary-return.js';
export function ohio2026EarnedSchoolDraftFixture(wages='50000',schoolWithholding='625.25',stateWithholding='1000') {
 const school=ohio2026SchoolFixture(wages,schoolWithholding),ordinary=ohio2026OrdinaryFixture('full_year_resident',wages);
 const {noTaxingSchoolDistrictResidencyConfirmed:_noSchool,...ordinarySources}=ordinary.sources;
 const input=school.input,person=input.taxpayer.primary;const w2=input.w2s[0];if(!w2?.stateLocalSources?.stateRows[0])throw Error('Fictional actual original state row required');w2.stateTaxWithheld=stateWithholding;w2.stateLocalSources.stateRows[0].withheld=stateWithholding;
 const sources={...ordinarySources,methodId:'oh-2026-earned-school-employee-draft-v1' as const,schoolSources:school.sources,
 schoolPaymentSources:{taxYear:2026 as const,sourceReference:'PRIVATE-SD-COMPLETE-SOURCE',sourceFactsConfirmed:true as const,originalTaxInput:{},originalSchoolSources:{},
 owner:{accountHolder:'primary' as const,originalTaxpayer:structuredClone(person)},districtCode:'0302',roundingElection:'whole_dollars' as const,roundingElectionConfirmed:true as const,
 payments:{sourceReference:'PRIVATE-SD-PAYMENTS',allCurrentAndPriorPaymentsIncludedConfirmed:true as const,withholdingTreatment:'equal_quarters' as const,paymentRows:[],
 account:{sourceReference:'PRIVATE-SD-ACCOUNT',accountName:person.firstName+' '+person.lastName,accountSsn:person.ssn,taxYear:2026,returnType:'sd100' as const,asOfDate:'2027-03-01',completeAccountConfirmed:true as const,estimatedPaymentsCredited:'0',priorCreditApplied:'0'},
 priorReturn:{status:'no_return' as const,sourceReference:'PRIVATE-SD-NO-PRIOR'},priorCreditCarryforward:{status:'none' as const,sourceReference:'PRIVATE-SD-NO-CARRY'},remainingTaxPayment:{status:'no_remaining_tax' as const,sourceReference:'PRIVATE-SD-COVERED',sourceFactsConfirmed:true as const},
 currentTiming:{kind:'expected' as const,expectedDate:'2027-04-15',asOfDate:'2027-03-01'},filingExtension:{kind:'none' as const},paymentExtension:{kind:'none' as const},returnKind:'original' as const,specialMethod:'regular' as const,refundDisposition:{sourceReference:'PRIVATE-SD-OUTGOING',outgoingCarryforward:'0'}}}};
 const p={input,sources};rebindOhio2026EarnedSchoolDraft(p);return p;
}
export function rebindOhio2026EarnedSchoolDraft(p:ReturnType<typeof ohio2026EarnedSchoolDraftFixture>){
 rebindOhio2026School({input:p.input,sources:p.sources.schoolSources});const{ohioResidency:_r,ohioPayments:_p,...originals}=p.input;
 p.sources.originalFederalSources=structuredClone(originals);if(!p.input.ohioPayments)throw Error('Fictional actual state payment required');p.input.ohioPayments.originalFederalSources=structuredClone(originals);
 p.sources.schoolSources.originalTaxInput=structuredClone(p.input);p.sources.schoolPaymentSources.originalTaxInput=structuredClone(p.input);p.sources.schoolPaymentSources.originalSchoolSources=structuredClone(p.sources.schoolSources);
}
