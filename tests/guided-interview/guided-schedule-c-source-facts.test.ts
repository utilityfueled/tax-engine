// Spec: spec/federal/schedule-c.yaml#E-source-facts.
import {expect,it} from 'vitest';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {updateSectionData} from '@/lib/guided-interview-flow';
import {completeBusinessSection,startCompleteInterview} from './complete-facts';
import {scheduleCSourceFacts} from '../fixtures/schedule-c-source-facts';
it('preserves actual interest and business address source facts and invalidates edits',()=>{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:[],stateCode:null});const source=structuredClone(scheduleCSourceFacts);source.ownerName='Jordan Example';state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:'40000',expenses:{...completeBusinessSection.expenses,otherExpenses:'500'},businessFacts:{...completeBusinessSection.businessFacts,businessName:'Sample Source Works',ein:'23-4567890',businessInterest:'1000',scheduleCSourceFacts:source}};
 const before=JSON.stringify(state),input=buildTaxInputFromGuidedData(state);expect(input).not.toBeNull();expect(input!.scheduleC!.expenses!.businessInterest).toBe('1000');expect(input!.scheduleC!.sourceFacts!.address!.street).toBe('450 Source Road');expect(JSON.stringify(state)).toBe(before);
 const raw=structuredClone(state.sectionData['income-self-employment']!);raw.businessFacts!.businessInterest='1000.01';const edited=updateSectionData(state,'income-self-employment',raw);expect(edited.sectionData['income-self-employment']!.businessFacts!.scheduleCSourceFacts!.sourceFactsConfirmed).not.toBe(true);expect(buildTaxInputFromGuidedData(edited)).toBeNull();
 const personal=updateSectionData(state,'personal-info',{...state.sectionData['personal-info']!,addressLine1:'Changed actual home'});expect(personal.sectionData['income-self-employment']!.businessFacts!.scheduleCSourceFacts!.sourceFactsConfirmed).not.toBe(true);
});
