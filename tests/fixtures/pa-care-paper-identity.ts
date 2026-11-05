/** Explicit fictional documentary choices; no production inference/defaults. */
import type {TaxYearInput} from '@/models/inputs.js';

export function paCarePaperIdentityFixture(
  input:TaxYearInput,
  kinds:{providers:Array<'ssn'|'fein'|'itin'>;persons:Array<'ssn'|'itin'|'atin'>},
){
  const care=input.dependentCare;
  if(!care?.providers||!care.qualifyingPersons||kinds.providers.length!==care.providers.length||kinds.persons.length!==care.qualifyingPersons.length)throw Error('Explicit fictional documentary choices required for every actual row');
  return {
    sourceTaxYear:input.taxpayer.taxYear,
    sourceReference:'Fictional reviewed provider W9 and qualifying child identity documents',
    sourceFactsConfirmed:true,
    providers:care.providers.map((provider,providerIndex)=>{
      const identifierKind=kinds.providers[providerIndex];
      if(!identifierKind)throw Error('Explicit fictional provider kind required');
      return {providerIndex,sourceReference:`Fictional provider ${providerIndex+1} original W9`,originalAvailableConfirmed:true,identifierKind,originalProvider:structuredClone(provider)};
    }),
    qualifyingPersons:care.qualifyingPersons.map((person,qualifyingPersonIndex)=>{
      const originalDependentIndex=input.taxpayer.dependents.findIndex(dependent=>dependent.ssn.replace(/\D/g,'')===person.taxId?.replace(/\D/g,''));
      if(originalDependentIndex<0)throw Error('Actual fictional dependent identity required');
      const identifierKind=kinds.persons[qualifyingPersonIndex];
      if(!identifierKind)throw Error('Explicit fictional person kind required');
      return {qualifyingPersonIndex,originalDependentIndex,sourceReference:`Fictional qualifying person ${qualifyingPersonIndex+1} original identity document`,originalAvailableConfirmed:true,identifierKind,originalQualifyingPerson:structuredClone(person),originalFederalDependent:structuredClone(input.taxpayer.dependents[originalDependentIndex])};
    }),
  };
}
