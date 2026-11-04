/** Separately authored FICTIONAL physical-review original; not a user-data default. */
import {ohioReturnHeaderFixture,enteredOhioHeaderDraft,requiredHeader} from './oh-return-header-sources';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioResidentCreditSources} from '@/lib/guided-ohio-resident-credit-sources';
import {confirmGuidedOhioReturnHeaderSources,buildGuidedOhioReturnHeaderSources} from '@/lib/guided-ohio-return-header-sources';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
export function ohioReturnHeaderPublicReviewFixture(){
 const original=ohioReturnHeaderFixture(),native=structuredClone(original.native),input=native.input;
 const w2=requiredHeader(input.w2s[0]);
 const ohio=requiredHeader(requiredHeader(w2.stateLocalSources).stateRows.find(row=>row.state==='OH'));
 // Independently supplied documentary supplement, preserving every original amount/person/period.
 ohio.employerStateIDStatus='reported';ohio.employerStateID='07100412';
 const parent=confirmGuidedOhioResidencyFacts(input,native.residency);
 const payments=confirmGuidedOhioPaymentFacts(input,native.payments);
 const credit=confirmGuidedOhioResidentCreditSources(input,requiredHeader(native.residency.residentCreditSources),parent,payments);
 const residency={...parent,residentCreditSources:credit};
 const data=requiredHeader(native.state.sectionData['state-return']);
 native.state.sectionData['state-return']={...data,ohioResidency:residency,ohioPayments:payments};
 const headerDraft=confirmGuidedOhioReturnHeaderSources(input,enteredOhioHeaderDraft(),residency,payments);
 const header=buildGuidedOhioReturnHeaderSources(input,headerDraft,residency,payments);
 const canonical=buildGuidedStateOriginals(input,native.state);
 const facts=requiredHeader(canonical.ohioResidency),paid=requiredHeader(canonical.ohioPayments);
 return{...original,input:canonical,facts,source:requiredHeader(facts.residentCreditSources),payments:paid,header};
}
